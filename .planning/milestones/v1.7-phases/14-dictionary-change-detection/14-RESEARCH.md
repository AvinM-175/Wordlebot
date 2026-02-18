# Phase 14: Dictionary Change Detection Infrastructure - Research

**Researched:** 2026-02-15
**Domain:** Chrome Extension MV3 — chrome.storage.local cache schema extension + bundle URL pre-check in dictionary.js
**Confidence:** HIGH

---

## Summary

Phase 14 is a focused, self-contained change to `dictionary.js` and `dictExtractor.js`. It delivers three things: (1) `bundleUrl` stored in the `wordlebot_dict` cache entry after every successful extraction, (2) a fast O(1) URL equality check in `loadFromCache()` that serves cached words immediately when the URL matches, and (3) preservation of the 30-day timer as the fallback path when no URL can be determined. No other files are modified in this phase — `content.js` wiring for the background update check is Phase 15's job.

The central architectural challenge is the blocker identified in STATE.md: `findBundleUrl()` is currently a private function inside `dictExtractor.js`'s IIFE and is only called inside `extract()`. For the URL pre-check to work in `loadFromCache()`, which runs before extraction, `findBundleUrl()` must be callable independently. The solution is to export it from `dictExtractor` as a second public API function, then call it from `dictionary.js`'s `loadFromCache()`. This requires passing the discovered URL into `loadFromCache()` or calling `findBundleUrl()` from inside `loadDictionary()` before delegating to `loadFromCache()`.

The existing storage schema for `wordlebot_dict` is `{ words, fingerprint, extractedAt, bundledFingerprint, source }`. Phase 14 adds one field: `bundleUrl`. The `saveToCache()` function receives the extraction result, which already includes `bundleUrl` from `dictExtractor.extract()` (line 455: `bundleUrl: sourceUrl`). The only required change to `saveToCache()` is to write this value through to storage.

**Primary recommendation:** Export `findBundleUrl()` from `dictExtractor` as `window.WordleBot.dictExtractor.findBundleUrl`, call it at the start of `loadDictionary()` before `loadFromCache()`, pass the discovered URL into `loadFromCache()`, and compare it against `cacheData.bundleUrl`. Store `bundleUrl` in `saveToCache()`. Keep the 30-day timer as the fallback when URL is null.

---

## Standard Stack

### Core
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| `chrome.storage.local` | Chrome 88+ (MV3) | Persist `bundleUrl` in `wordlebot_dict` cache entry | Already in use throughout the codebase; the canonical state store; already permitted via `"storage"` in manifest |
| `performance.getEntriesByType('resource')` | Web API (built-in) | Discover current bundle URL synchronously before extraction | Already Strategy 1 in `dictExtractor.findBundleUrl()` — proven to work in this extension context |

### Supporting
| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| `window.WordleBot` namespace | N/A | Cross-module communication between `dictExtractor.js` and `dictionary.js` | Used throughout; how all modules expose their APIs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Export `findBundleUrl()` from dictExtractor | Duplicate the logic in dictionary.js | Duplication violates the existing "dictExtractor owns URL discovery" separation; export is cleaner |
| Call `findBundleUrl()` before `loadFromCache()` | Call it inside `loadFromCache()` | Either works; calling before avoids an async call inside what is currently a sync-read function; preference is before for clarity |
| Store only the URL hash (SHA-256 of URL string) | Store the full URL string | Full URL is more debuggable and URL strings are short (~100 chars); no benefit to hashing |

**Installation:** No new packages. Zero npm install required. All APIs are already in the codebase.

---

## Architecture Patterns

### Current `wordlebot_dict` Cache Schema (v1.5)

```javascript
// Current schema (dictionary.js saveToCache(), line 199-209)
{
  words: [...],              // string[] of 5-letter words
  fingerprint: "abc123...", // SHA-256 of sorted+joined word array
  extractedAt: 1234567890,  // timestamp (ms)
  bundledFingerprint: "...", // SHA-256 of bundled NYTWordleList.txt
  source: "extracted"        // "extracted" | "bundled"
}
```

### Target `wordlebot_dict` Cache Schema (Phase 14)

```javascript
// After Phase 14 (one new field)
{
  words: [...],
  fingerprint: "abc123...",
  extractedAt: 1234567890,
  bundledFingerprint: "...",
  source: "extracted",
  bundleUrl: "https://www.nytimes.com/games-assets/v2/wordle.abc123.js"  // NEW
}
```

`bundleUrl` is the URL of the JS file that contained the word arrays. It comes from `dictExtractor.extract()`'s return value (field `bundleUrl: sourceUrl`, line 455 of dictExtractor.js). It is `null` when extraction fails or when no URL was identifiable.

### Pattern 1: Export `findBundleUrl` from dictExtractor

**What:** Add `findBundleUrl` to the exported public API of `dictExtractor`, so `dictionary.js` can call it independently of `extract()`.

**When to use:** Whenever a caller needs the bundle URL without triggering full extraction (word array fetching and parsing). In Phase 14, this is `loadDictionary()` calling it before `loadFromCache()` to get the current URL for comparison.

**Example:**
```javascript
// dictExtractor.js — change the export at the bottom (currently line 473-475)
// BEFORE:
window.WordleBot.dictExtractor = {
  extract: extract
};

// AFTER:
window.WordleBot.dictExtractor = {
  extract: extract,
  findBundleUrl: findBundleUrl  // expose for pre-extraction URL check
};
```

No changes needed to `findBundleUrl()` itself — the function is already correct and self-contained.

### Pattern 2: URL Pre-Check in loadFromCache()

**What:** Before the 30-day staleness check, compare the stored `bundleUrl` in the cache entry against the current bundle URL discovered at page load. If they differ, treat the cache as stale and return null (triggering extraction). If they match, bypass the 30-day check and return the cached result as fresh.

**When to use:** Every `loadFromCache()` call that receives a non-null `currentBundleUrl`.

**Example:**
```javascript
// dictionary.js — modified loadFromCache() signature and body

async function loadFromCache(currentBundledFp, currentBundleUrl) {
  // ... existing structure validation and bundledFingerprint check ...

  // NEW: URL pre-check (O(1), runs before 30-day timer check)
  if (currentBundleUrl !== null && cacheData.bundleUrl) {
    if (cacheData.bundleUrl !== currentBundleUrl) {
      console.log('[WordleBot] Bundle URL changed -- cache invalidated (URL mismatch)');
      return null;  // force extraction
    }
    // URL matches: cache is fresh regardless of age
    console.log('[WordleBot] Bundle URL matches -- cache fresh (URL match)');
    var result = {
      words: cacheData.words,
      source: 'cached',
      freshness: 'fresh',
      fingerprint: cacheData.fingerprint
    };
    return result;
  }

  // FALLBACK: No URL available -- use 30-day timer (unchanged behavior)
  var age = Date.now() - cacheData.extractedAt;
  var isStale = age > THIRTY_DAYS_MS;
  // ... rest of existing staleness logic unchanged ...
}
```

The check is conditional: if `currentBundleUrl` is null (findBundleUrl failed or returned an array that couldn't be resolved to a single primary URL), fall through to the existing 30-day timer. This satisfies DICT-07.

### Pattern 3: Store bundleUrl in saveToCache()

**What:** Pass the `bundleUrl` from the extraction result through to the cache entry.

**When to use:** Every successful extraction that produces a non-null `bundleUrl`.

**Example:**
```javascript
// dictionary.js — modified saveToCache()

async function saveToCache(dictResult, bundledFp) {
  try {
    var entry = {
      words: dictResult.words,
      fingerprint: dictResult.fingerprint,
      extractedAt: Date.now(),
      bundledFingerprint: bundledFp,
      source: dictResult.source,
      bundleUrl: dictResult.bundleUrl || null  // NEW: may be null if extraction found no URL
    };
    // ... rest unchanged ...
  }
}
```

`dictResult.bundleUrl` is already set by `dictExtractor.extract()` — it is `sourceUrl` (the first URL that yielded word arrays). When extraction returns successfully, this is non-null. When the extension falls back to bundled words, `dictResult.bundleUrl` is undefined/null, which is fine — stored as `null`.

### Pattern 4: Call findBundleUrl() before loadFromCache() in loadDictionary()

**What:** In `loadDictionary()`, call `window.WordleBot.dictExtractor.findBundleUrl()` to get the current URL, then pass it to `loadFromCache()`.

**When to use:** Every `loadDictionary()` call (both fresh and forceRefresh paths).

**Example:**
```javascript
// dictionary.js — modified loadDictionary()

async function loadDictionary(forceRefresh) {
  var staleCache = null;

  // Step A: Get bundled fingerprint (memoized)
  var bundledFp = await getBundledFingerprint();

  // Step A2: Discover current bundle URL for pre-check (NEW)
  // findBundleUrl() uses performance.getEntriesByType('resource') -- synchronous,
  // no network call. Returns string, string[], or null.
  var currentBundleUrl = null;
  if (window.WordleBot.dictExtractor && window.WordleBot.dictExtractor.findBundleUrl) {
    try {
      var urlResult = await window.WordleBot.dictExtractor.findBundleUrl();
      // Normalize: use primary URL (first entry if array, or direct string)
      if (typeof urlResult === 'string') {
        currentBundleUrl = urlResult;
      } else if (Array.isArray(urlResult) && urlResult.length > 0) {
        currentBundleUrl = urlResult[0];  // first URL is the most likely bundle
      }
    } catch (e) {
      console.warn('[WordleBot] findBundleUrl() threw in pre-check: ' + e.message);
    }
  }

  // Step B: Try cache fast path (unless forceRefresh)
  if (!forceRefresh) {
    var cached = await loadFromCache(bundledFp, currentBundleUrl);  // pass URL
    // ... rest of existing flow unchanged ...
  }
  // ...
}
```

Note: `findBundleUrl()` Strategy 1 uses `performance.getEntriesByType('resource')` which is synchronous. The `async` wrapper exists for Strategies 2-4. On the NYT Wordle page, the bundle is always in the performance timing list because the page loaded it — Strategy 1 will succeed almost always. The `await` is retained for correctness (the function signature is async) but adds negligible latency.

### Anti-Patterns to Avoid

- **Calling findBundleUrl() inside loadFromCache():** `loadFromCache` is already called from `loadDictionary` with the bundled fingerprint passed in. Adding another async call inside it deepens the call chain unnecessarily. Keep all pre-extraction calls in `loadDictionary()` and pass results down.
- **Treating a null bundleUrl as a cache miss:** When `findBundleUrl()` returns null (rare edge case), `currentBundleUrl` is null. The correct behavior is to fall through to the 30-day timer — the existing fallback — not to force extraction. Only a URL mismatch (both non-null and not equal) triggers extraction.
- **Overwriting bundleUrl on stale-cache fallback:** When extraction fails and stale cache is used (the `staleCache` path in `loadDictionary()`), do NOT update `bundleUrl` in storage. The stale cache represents the last known-good state; its `bundleUrl` is still valid for the next comparison.
- **Storing bundleUrl on bundled fallback:** When the dictionary falls back to the bundled NYTWordleList.txt, `bundleUrl` should remain `null` in the cache entry. There is no NYT bundle URL for the offline fallback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundle URL discovery | Custom Performance API scan in dictionary.js | `dictExtractor.findBundleUrl()` (export it) | Already handles 4 strategies, normalizes URLs, deduplicates; reimplementing creates two sources of truth |
| URL string comparison | URL parsing / normalization library | Direct `===` equality on strings | Bundle URLs are already normalized to full absolute URLs in `findBundleUrl()` via `new URL(src, document.location.href).href`; string equality is correct |
| Bundle content hashing for Phase 14 | SHA-256 of bundle text | Not needed in Phase 14 | Phase 14 only needs URL comparison (O(1)); content hashing is a Phase 15 concern if needed at all |

**Key insight:** Phase 14 is purely about the URL as a signal — the webpack content hash in the URL filename (`wordle.[a-f0-9]+.js`) is itself a change signal. No content hashing is needed in Phase 14. Full extraction + SHA-256 word-array fingerprinting happens in the extraction path as it always has.

---

## Common Pitfalls

### Pitfall 1: findBundleUrl() Returns an Array, Not a String

**What goes wrong:** `findBundleUrl()` can return a `string`, `string[]`, or `null`. Strategy 1 (Performance API) returns an array when multiple game-assets JS files are found. Strategy 2 returns a string for known patterns, or may fall through to Strategy 4 which returns an array. If the caller of `findBundleUrl()` does a naive `=== cachedUrl` comparison without normalizing, it will compare an array reference to a string and always get false (URL "changed" on every load), forcing extraction every time.

**Why it happens:** The return type of `findBundleUrl()` is intentionally flexible to handle multi-chunk NYT bundles. The extraction path (`extract()`) normalizes it immediately with `var urls = typeof bundleUrl === 'string' ? [bundleUrl] : bundleUrl`. The pre-check path needs the same normalization.

**How to avoid:** After calling `findBundleUrl()`, normalize with: if string use directly, if array use `urlResult[0]` (the first entry is placed at front by the "wordle.* or main.* gets unshifted" logic in Strategy 1). This gives the primary bundle URL for comparison.

**Warning signs:** Console logs show "Bundle URL changed" on every page load even when the NYT bundle hasn't changed; extraction runs on every load for users with fresh caches.

### Pitfall 2: bundleUrl Not Present in Old Cache Entries

**What goes wrong:** Users who have a `wordlebot_dict` entry from before Phase 14 will have no `bundleUrl` field in their stored entry. When `loadFromCache()` checks `cacheData.bundleUrl`, it gets `undefined`. If the comparison logic treats `undefined !== currentBundleUrl` as a mismatch, every pre-Phase-14 user gets forced extraction on their first load after the update — a noisy but not catastrophic behavior.

**Why it happens:** Schema migration is not performed in this codebase. Old entries stay until they are overwritten by a new extraction.

**How to avoid:** In `loadFromCache()`, treat `!cacheData.bundleUrl` (null, undefined, or empty string) as "URL unknown" and fall through to the 30-day timer, just as if `currentBundleUrl` were null. Only trigger URL mismatch when BOTH the stored URL and the current URL are non-null and unequal.

```javascript
// Correct comparison guard
if (currentBundleUrl !== null && cacheData.bundleUrl) {
  if (cacheData.bundleUrl !== currentBundleUrl) {
    // mismatch — stale
  } else {
    // match — fresh
  }
  // (return from here)
}
// If either is falsy: fall through to 30-day timer
```

**Warning signs:** "Bundle URL changed" logged for all users after the Phase 14 update ships; first page load after update forces extraction for everyone.

### Pitfall 3: Fingerprint Sort-Normalization Invariant Must Be Maintained

**What goes wrong:** `computeFingerprint()` sorts words before hashing (existing code, dictionary.js line 38: `words.slice().sort().join('\n')`). If any code added in Phase 14 computes or stores a fingerprint from an unsorted array, fingerprints will never match between extraction paths, causing perpetual cache rebuilds.

**Why it happens:** Phase 14 doesn't add new fingerprint computation, but modifying `saveToCache()` and `loadFromCache()` creates opportunities to accidentally touch the fingerprint logic.

**How to avoid:** Phase 14 does NOT change fingerprint computation. The `fingerprint` field in the cache entry is computed and stored by the existing extraction path, unchanged. Phase 14 only adds `bundleUrl`. Do not add any new fingerprint-related code.

**Warning signs:** `wordlebot_cache` rebuilt on every page load; "Dictionary fingerprint changed" logged on every load.

### Pitfall 4: forceRefresh Path Should Skip URL Pre-Check But Still Store bundleUrl

**What goes wrong:** When `forceRefresh=true` (Shift+Click hard refresh), the cache is intentionally bypassed. If `findBundleUrl()` is also skipped in this path (e.g., by early-returning before Step A2), then after a hard refresh the new cache entry has `bundleUrl: null`, breaking URL-based staleness detection for subsequent loads.

**Why it happens:** It's tempting to skip the URL discovery in the `forceRefresh` path since the cache is being bypassed anyway. But the URL is needed for saving, not for checking.

**How to avoid:** Always call `findBundleUrl()` at the start of `loadDictionary()` regardless of `forceRefresh`. The URL is used for two things: (1) comparison in `loadFromCache()` (skipped on forceRefresh, fine), and (2) storing in `saveToCache()` after successful extraction (always needed). Alternatively, the URL comes back in the extraction result from `dictExtractor.extract()` — that's the `dictResult.bundleUrl` path which `saveToCache()` uses. Since `extract()` calls `findBundleUrl()` internally, the `bundleUrl` in the extraction result is always populated. The pre-check call in `loadDictionary()` is for the pre-extraction comparison only.

**Warning signs:** After a Shift+Click refresh, subsequent page loads fall back to the 30-day timer instead of using URL comparison; console shows no "Bundle URL matches -- cache fresh" messages.

### Pitfall 5: Content Fingerprint vs. Bundle URL — Phase Boundary

**What goes wrong:** The ARCHITECTURE.md research describes a full `checkForUpdate()` function in `dictionary.js` that re-extracts the dictionary in the background after a cache hit and compares SHA-256 fingerprints. This is Phase 15 scope. If the Phase 14 planner includes `checkForUpdate()` implementation, the phase will be larger than intended and overlaps Phase 15.

**Why it happens:** The research documents describe the full v1.7 dictionary detection system; Phase 14 is only the infrastructure layer (store URL, compare URL). The background re-extraction is Phase 15.

**How to avoid:** Phase 14 delivers exactly three behaviors matching the success criteria:
1. After extraction: `wordlebot_dict` includes `bundleUrl`
2. On cache hit with URL match: serve cache, no extraction (DICT-04)
3. No URL available: fall through to 30-day timer (DICT-07)

Phase 14 does NOT implement: background re-extraction after cache hit, fingerprint comparison after background extraction, re-rendering after dictionary update. Those are DICT-02, DICT-03, DICT-05, DICT-06 (Phase 15).

---

## Code Examples

Verified patterns from direct codebase reading:

### Current dictExtractor Export (lines 473-475 of dictExtractor.js)
```javascript
// Source: C:/WordleBot/src/dictExtractor.js lines 473-475
window.WordleBot.dictExtractor = {
  extract: extract
};
// findBundleUrl is private — NOT exported
```

### Current saveToCache() (lines 199-216 of dictionary.js)
```javascript
// Source: C:/WordleBot/src/dictionary.js lines 198-216
async function saveToCache(dictResult, bundledFp) {
  try {
    var entry = {
      words: dictResult.words,
      fingerprint: dictResult.fingerprint,
      extractedAt: Date.now(),
      bundledFingerprint: bundledFp,
      source: dictResult.source
      // bundleUrl NOT stored currently
    };
    var storageObj = {};
    storageObj[CACHE_KEY] = entry;
    await chrome.storage.local.set(storageObj);
  } catch (e) {
    console.warn('[WordleBot] Cache save failed: ' + e.message);
  }
}
```

### Current loadFromCache() staleness check (lines 165-185 of dictionary.js)
```javascript
// Source: C:/WordleBot/src/dictionary.js lines 165-185
// Check staleness (Decision #5: 30-day window)
var age = Date.now() - cacheData.extractedAt;
var isStale = age > THIRTY_DAYS_MS;

if (isStale) {
  var days = Math.floor(age / 86400000);
  console.log('[WordleBot] Cache is stale (' + days + ' days old)');
}

var result = {
  words: cacheData.words,
  source: 'cached',
  freshness: isStale ? 'stale' : 'fresh',
  fingerprint: cacheData.fingerprint
};
// Returns result with freshness='stale' when old — caller decides whether to extract
```

### Target loadFromCache() after Phase 14
```javascript
// After Phase 14 change (illustrative — planner should use this structure)
async function loadFromCache(currentBundledFp, currentBundleUrl) {
  try {
    var stored = await chrome.storage.local.get(CACHE_KEY);
    var cacheData = stored[CACHE_KEY];

    if (!cacheData || !Array.isArray(cacheData.words) || !cacheData.fingerprint || !cacheData.extractedAt) {
      return null;
    }

    // Check bundled fingerprint (existing — extension update detection)
    if (cacheData.bundledFingerprint !== currentBundledFp) {
      console.log('[WordleBot] Bundled dictionary changed -- cache invalidated');
      return null;
    }

    // NEW: Bundle URL pre-check (O(1) staleness signal)
    if (currentBundleUrl !== null && cacheData.bundleUrl) {
      if (cacheData.bundleUrl !== currentBundleUrl) {
        console.log('[WordleBot] Bundle URL changed -- cache invalidated (new bundle: ' +
          currentBundleUrl.split('/').pop() + ')');
        return null;  // force extraction
      }
      // URL match: cache is definitively fresh — skip 30-day check
      var freshResult = {
        words: cacheData.words,
        source: 'cached',
        freshness: 'fresh',
        fingerprint: cacheData.fingerprint
      };
      console.log('[WordleBot] Dictionary loaded from cache (' +
        freshResult.words.length + ' words, URL match, fingerprint: ' +
        freshResult.fingerprint.substring(0, 8) + ')');
      return freshResult;
    }

    // FALLBACK: No URL available -- use 30-day timer (DICT-07)
    var age = Date.now() - cacheData.extractedAt;
    var isStale = age > THIRTY_DAYS_MS;

    if (isStale) {
      var days = Math.floor(age / 86400000);
      console.log('[WordleBot] Cache is stale (' + days + ' days old, no URL to compare)');
    }

    var result = {
      words: cacheData.words,
      source: 'cached',
      freshness: isStale ? 'stale' : 'fresh',
      fingerprint: cacheData.fingerprint
    };
    console.log('[WordleBot] Dictionary loaded from cache (' +
      result.words.length + ' words, ' + result.freshness +
      ', fingerprint: ' + result.fingerprint.substring(0, 8) + ')');
    return result;
  } catch (e) {
    console.warn('[WordleBot] Cache read failed: ' + e.message);
    return null;
  }
}
```

### extractResult structure returned by dictExtractor.extract()
```javascript
// Source: C:/WordleBot/src/dictExtractor.js lines 455-463
// On success, extract() returns:
return {
  success: true,
  solutions: arrays.solutions,
  guesses: arrays.guesses,
  allWords: arrays.allWords,
  source: arrays.combined ? 'extracted_combined' : 'extracted_split',
  bundleUrl: sourceUrl,  // <-- already here; just needs to flow through to saveToCache()
  error: null
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 30-day timer only | URL pre-check + 30-day fallback | Phase 14 | Cache stays valid for as long as the NYT bundle URL is unchanged; no unnecessary re-extractions on 30-day boundary |
| bundleUrl not stored | bundleUrl stored in `wordlebot_dict` | Phase 14 | Enables comparison on next page load |
| findBundleUrl() private | findBundleUrl() exported from dictExtractor | Phase 14 | Callable before full extraction for pre-check |

**Deprecated/outdated after Phase 14:**
- The 30-day timer is NOT removed — it is demoted to fallback. When `currentBundleUrl` is null or `cacheData.bundleUrl` is null/absent, the timer is the only staleness signal available. This is DICT-07.

---

## Open Questions

1. **findBundleUrl() return type normalization in loadDictionary()**
   - What we know: `findBundleUrl()` returns `string | string[] | null`. When it returns an array (Strategy 1), `urlResult[0]` is the primary bundle URL (wordle.*.js or main.*.js is unshifted to position 0).
   - What's unclear: In the rare case where the array has multiple items and none match `wordle.*` or `main.*` patterns, `urlResult[0]` is just the first game-assets URL found. Is this stable enough for URL comparison?
   - Recommendation: Use `urlResult[0]` for the pre-check. If it is not a reliable primary URL, the comparison still works — if the URL at position 0 changes, extraction is triggered. False positives (spurious extraction on bundle order change) are low risk. If this proves unstable, the fallback to 30-day timer kicks in automatically (both pre-check URLs must be non-null for URL comparison to run).

2. **What to do if findBundleUrl() finds the URL but cacheData has no bundleUrl (pre-Phase-14 cache entries)**
   - What we know: Old cache entries have no `bundleUrl` field. Per Pitfall 2, the correct behavior is to fall through to the 30-day timer.
   - What's unclear: Should we silently migrate by calling extraction, saving with bundleUrl, and returning the result? Or just fall through?
   - Recommendation: Fall through to 30-day timer. If the cache is < 30 days old, it will be served as fresh with a stale-but-valid response. The next time extraction runs (after 30 days or after a natural URL change), the new cache entry will include `bundleUrl`. No migration logic needed — the system self-heals on next extraction.

3. **Should the success criteria "no extraction runs" for URL match be verified with a console log?**
   - What we know: Success criterion 2 requires that when bundle URL matches, cached words are served and no extraction runs.
   - What's unclear: How to verify this during testing without adding a test harness.
   - Recommendation: The console.log in `loadFromCache()` ("Bundle URL matches -- cache fresh (URL match)") serves as the verification signal. Absence of "Dictionary extracted" in the console after the URL-match log confirms no extraction ran. Document this in the verification plan.

---

## Sources

### Primary (HIGH confidence)
- `C:/WordleBot/src/dictionary.js` (lines 150-216) — Direct reading of `loadFromCache()` and `saveToCache()` — confirmed `bundleUrl` is not stored, 30-day timer is the staleness check
- `C:/WordleBot/src/dictExtractor.js` (lines 28-112, 473-475) — Direct reading of `findBundleUrl()` as private function, export block confirming only `extract` is exported, return value of `extract()` confirming `bundleUrl: sourceUrl` is already in the result
- `C:/WordleBot/manifest.json` — Direct reading confirms no background service worker; `"storage"` permission already granted; `chrome.storage.local` is available
- `C:/WordleBot/.planning/research/FEATURES.md` — Feature dependency graph confirming `bundleUrl` not currently persisted; `performance.getEntriesByType('resource')` confirmed synchronous; Phase 14 scope definition
- `C:/WordleBot/.planning/research/ARCHITECTURE.md` — Data flow diagrams, `saveToCache()` schema, build order rationale
- `C:/WordleBot/.planning/research/PITFALLS.md` — Pitfall 4 (fingerprint sort-normalization), Pitfall 5 (hash computed on main thread)
- `C:/WordleBot/.planning/REQUIREMENTS.md` — DICT-01, DICT-04, DICT-07 scope confirmed for Phase 14
- `C:/WordleBot/.planning/STATE.md` — Blocker confirmed: "findBundleUrl() currently called inside dictExtractor.extract()"
- `C:/WordleBot/.planning/research/SUMMARY.md` — Overall confidence assessment; open gaps documented

### Secondary (MEDIUM confidence)
- `C:/WordleBot/.planning/research/STACK.md` — Confirmed no new libraries needed; `performance.getEntriesByType` is synchronous; Chrome 88+ compatibility
- Chrome Extension MV3 `chrome.storage.local` API (training knowledge, January 2025) — async `get`/`set` with Promise API; already proven in codebase

### Tertiary (LOW confidence)
- None — all claims are grounded in direct codebase reading.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs directly observed in working codebase code
- Architecture: HIGH — based on direct reading of all relevant source files; changes are additive and minimal
- Pitfalls: HIGH — Pitfalls 1-3 grounded in direct code observation; Pitfall 4-5 are edge cases with clear mitigations

**Research date:** 2026-02-15
**Valid until:** Stable — Chrome Extension MV3 APIs are stable; NYT bundle URL pattern already proven in production (findBundleUrl() Strategy 1). Valid indefinitely unless NYT changes their bundle naming convention.
