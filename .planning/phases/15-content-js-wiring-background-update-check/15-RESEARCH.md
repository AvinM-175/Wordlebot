# Phase 15: Content.js Wiring — Background Update Check - Research

**Researched:** 2026-02-17
**Domain:** Chrome Extension MV3 — stale-while-revalidate background dictionary refresh wired into content.js
**Confidence:** HIGH

---

## Summary

Phase 15 wires the background update check into `content.js`. The infrastructure built in Phase 14 (bundle URL stored in `wordlebot_dict`, O(1) URL pre-check in `loadFromCache`) already handles DICT-01 and DICT-04. What remains is the "serve stale, refresh in background" behavior after a cache hit, covering four requirements:

- **DICT-02:** Compare stored bundle URL against current URL on fresh cache load (the URL mismatch path already triggers extraction via Phase 14; DICT-02 is now about triggering background extraction even on a URL *match* — to detect same-URL content changes)
- **DICT-03:** When bundle URL changed (or extraction shows different content), re-extract and rebuild caches
- **DICT-05:** After serving cached dictionary, start a background extraction check that does NOT block suggestions
- **DICT-06:** If background extraction finds a fingerprint mismatch (same URL, different content), rebuild caches and re-render

The key architectural addition is a new `checkForUpdate(cachedResult)` function in `dictionary.js` that runs a background extraction and returns either null (no change) or a new DictionaryResult (dictionary changed). `content.js` calls this asynchronously after returning the cached dictionary to the rendering pipeline, then rebuilds and re-renders only if `checkForUpdate` returns a new result.

The distinction between URL-change and fingerprint-mismatch triggers is important: Phase 14 already handles URL-change as a cache invalidation (the cache miss forces extraction before suggestions are shown). Phase 15 handles the case where the URL *matches* but the bundle content changed (same filename, different content), which requires a background content check after serving the cached words.

**Primary recommendation:** Add `checkForUpdate(cachedResult)` to `dictionary.js` and export it as `window.WordleBot.checkForUpdate`. In `content.js`, after `loadDictionaryAndCaches()` returns with a cache-hit result, call `checkForUpdate(loadResult.dictResult)` as a fire-and-forget `.then()` chain (not `await`). If it resolves with a new result, call `clearCaches()`, rebuild, and call `processBoardState` again with the updated dictionary.

---

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| `window.WordleBot.loadDictionary` | N/A | Already-exported orchestrator for dictionary loading | Phase 15 calls it with `forceRefresh=true` after detecting a change |
| `window.WordleBot.dictExtractor.extract` | N/A | Full extraction pipeline | Already called by `tryExtractionWithRetry` inside `dictionary.js`; no new direct calls needed |
| `chrome.storage.local` | Chrome 88+ (MV3) | Read/write `wordlebot_dict` and `wordlebot_cache` | Already in use throughout; `clearCaches()` in `content.js` already handles both keys |
| `Promise.then()` (non-await) | ES6 | Background, non-blocking async call | The correct idiom for fire-and-forget; ensures suggestions render immediately |

### Supporting

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| `crypto.subtle.digest` | Web Crypto API | SHA-256 fingerprint comparison inside `checkForUpdate` | Already used in `computeFingerprint()` inside `dictionary.js`; `checkForUpdate` reuses the same function |
| `window.WordleBot.clearCaches` | N/A | Clear all computational caches before rebuild | Already implemented in `content.js` (lines 55-85); call it when `checkForUpdate` returns a new result |
| `requestIdleCallback` / `setTimeout(cb, 0)` | Web API | Already used for Stage 2 deferred init in content.js | Background update runs after idle init already scheduled — no additional idle scheduling needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Promise.then()` fire-and-forget | `await checkForUpdate()` before suggestions | Blocking awaiting defeats the "immediate suggestions from cache" requirement — never block the suggestion pipeline on the background check |
| Re-using `loadDictionaryAndCaches(true)` after update | Inline rebuild in `content.js` | `loadDictionaryAndCaches(true)` handles forceRebuild correctly; cleaner to call existing function than duplicate rebuild logic |
| `checkForUpdate()` in `dictionary.js` | Inline background extraction in `content.js` | dictionary.js owns all extraction + fingerprint logic; keeping it there preserves module boundaries and testability |

**Installation:** No new packages. Zero npm install required.

---

## Architecture Patterns

### Recommended Project Structure (no changes)

```
src/
├── dictExtractor.js    # Unchanged — pure extraction module
├── dictionary.js       # ADD: checkForUpdate() function + export
├── content.js          # ADD: fire-and-forget background check call + re-render path
└── (all other files)   # Unchanged
```

### Pattern 1: Stale-While-Revalidate (checkForUpdate)

**What:** Return cached data immediately, then in the background attempt extraction. If fingerprint differs, update and re-render.

**When to use:** `loadDictionary()` returns with `source === 'cached'` (cache hit). This is the only case that needs a background check — if extraction ran in the foreground (stale timer, URL mismatch, forceRefresh), the dictionary is already fresh.

**Implementation in `dictionary.js` — new function:**

```javascript
// Source: Based on ARCHITECTURE.md Pattern 1 research, verified against current dictionary.js structure
/**
 * Background update check — run after cache fast path to detect same-URL content changes.
 *
 * Extracts live dictionary, computes fingerprint, compares against cachedResult.fingerprint.
 * Returns new DictionaryResult if dictionary changed, null if unchanged or extraction failed.
 *
 * DICT-05: Non-blocking — caller must NOT await this inline.
 * DICT-06: Returns new result when fingerprint differs (same URL, new content).
 *
 * @param {Object} cachedResult - The DictionaryResult returned from the cache fast path.
 * @returns {Promise<Object|null>} New DictionaryResult or null.
 */
async function checkForUpdate(cachedResult) {
  var extractionResult = await tryExtractionWithRetry();
  if (!extractionResult) {
    console.log('[WordleBot] Background check: extraction failed, keeping cached dictionary');
    return null;
  }

  var fp = await computeFingerprint(extractionResult.words);
  if (fp === cachedResult.fingerprint) {
    console.log('[WordleBot] Background check: fingerprint match, dictionary unchanged');
    return null;
  }

  // Fingerprint differs: dictionary content changed (same URL, new content — DICT-06)
  var newResult = {
    words: extractionResult.words,
    source: 'extracted',
    freshness: 'fresh',
    fingerprint: fp,
    bundleUrl: extractionResult.bundleUrl
  };

  var bundledFp = await getBundledFingerprint();
  await saveToCache(newResult, bundledFp);

  console.log('[WordleBot] Background check: fingerprint mismatch — dictionary updated (' +
    cachedResult.fingerprint.substring(0, 8) + ' -> ' + fp.substring(0, 8) + ')');

  return newResult;
}

// Export
window.WordleBot.checkForUpdate = checkForUpdate;
```

### Pattern 2: Fire-and-Forget Call in content.js

**What:** After `loadDictionaryAndCaches()` returns a cache-hit result, launch the background check using `.then()` — do NOT block the suggestion pipeline.

**When to use:** Only when `loadResult.dictResult.source === 'cached'`. When source is `'extracted'` or `'bundled'`, the dictionary is already fresh — no background check needed.

**Implementation in `content.js` — modify `backgroundInit`:**

```javascript
// Source: Based on ARCHITECTURE.md data flow diagram + verified content.js structure (lines 237-432)

// Load dictionary and build/restore caches
var loadResult = await loadDictionaryAndCaches(false);
TIMING.t_dict_loaded = performance.now();
console.log('[WordleBot] Dictionary + caches ready: ' + (TIMING.t_dict_loaded - TIMING.t_start).toFixed(0) + 'ms');

// Show dictionary source indicator in panel footer
showSourceIndicator(loadResult.dictResult);

// DICT-05: Non-blocking background update check when dictionary came from cache
if (loadResult.dictResult.source === 'cached') {
  window.WordleBot.checkForUpdate(loadResult.dictResult).then(function(newResult) {
    if (!newResult) return;

    // DICT-06: Fingerprint mismatch detected — rebuild and re-render
    console.log('[WordleBot] Background update: rebuilding caches and re-rendering suggestions');
    clearCaches().then(function() {
      loadDictionaryAndCaches(true).then(function(reloadResult) {
        showSourceIndicator(reloadResult.dictResult);
        var currentState = window.WordleBot.readBoardState();
        if (currentState && !isComputing) {
          processBoardState(currentState, false);
        }
      }).catch(function(err) {
        console.warn('[WordleBot] Background rebuild failed: ' + err.message);
      });
    }).catch(function(err) {
      console.warn('[WordleBot] Background clearCaches failed: ' + err.message);
    });
  }).catch(function(err) {
    console.warn('[WordleBot] Background update check failed: ' + err.message);
  });
}

// Board state processing pipeline continues here (unblocked)...
```

### Pattern 3: Distinguishing URL-Change vs Fingerprint-Mismatch in Console Logs

**What:** The success criterion 4 requires the console log distinguish the trigger type. Phase 14 already logs "Bundle URL changed" when a URL mismatch invalidates the cache. Phase 15 adds the background fingerprint-mismatch log.

**Log taxonomy (complete, from both phases):**

| Situation | Log Message | Phase |
|-----------|-------------|-------|
| URL changed, cache invalidated | `[WordleBot] Bundle URL changed -- cache invalidated (new bundle: HASH.js)` | Phase 14 |
| URL matched, cache served fresh | `[WordleBot] Dictionary loaded from cache (N words, URL match, fingerprint: XXXXXXXX)` | Phase 14 |
| 30-day timer fallback | `[WordleBot] Cache is stale (N days old)` | Phase 14 |
| Background check: no change | `[WordleBot] Background check: fingerprint match, dictionary unchanged` | Phase 15 |
| Background check: changed | `[WordleBot] Background check: fingerprint mismatch — dictionary updated (OLD -> NEW)` | Phase 15 |
| Background rebuild triggered | `[WordleBot] Background update: rebuilding caches and re-rendering suggestions` | Phase 15 |

### Recommended Call Flow (Phase 15 complete)

```
content.js backgroundInit()
  |
  v
loadDictionaryAndCaches(false)
  ├─ if cache hit (source='cached'): return cached immediately  <-- fast path
  └─ if cache miss: extract, build, return                      <-- slow path

  |
  v (after loadDictionaryAndCaches returns)
showSourceIndicator(loadResult.dictResult)

  |
  v (non-blocking, ONLY when source='cached')
checkForUpdate(loadResult.dictResult).then(...)
  ├─ extraction fails -> log + return null -> no action
  ├─ fingerprint match -> log + return null -> no action
  └─ fingerprint mismatch -> log + return newResult
       |
       v
     clearCaches()
       .then(loadDictionaryAndCaches(true))
         .then(showSourceIndicator + processBoardState)

  |
  v (continues in parallel — NOT awaiting background check)
waitForBoard()
processBoardState(initialState, true)   <-- immediate, from cache
startObserver()
```

### Anti-Patterns to Avoid

- **Awaiting `checkForUpdate` before rendering suggestions:** The requirement is that suggestions appear immediately from cache. Using `await` on the background check blocks the entire `backgroundInit` until extraction completes (12+ seconds with retry). Never await the background check.

- **Running `checkForUpdate` when source is `'extracted'` or `'bundled'`:** If extraction ran in the foreground (stale cache, URL mismatch, forceRefresh), the dictionary is already fresh. `checkForUpdate` would immediately re-extract the bundle that was just fetched moments ago, wasting one full extraction cycle.

- **Calling `checkForUpdate` from inside `loadDictionaryAndCaches`:** `loadDictionaryAndCaches` is the synchronous-feeling orchestrator in `content.js`. Background behavior belongs at the call site in `backgroundInit`, not buried inside the loading function where callers cannot control it.

- **Using `isComputing` flag before `processBoardState` in the re-render path:** The background re-render fires after the initial suggestions have already been computed. At this point `isComputing` should be `false`. Check it before calling `processBoardState` as a guard, but don't skip re-render entirely — the user should get updated suggestions when the dictionary changes.

- **Adding a persistent "Dictionary updated" UI indicator:** Research notes (PITFALLS.md) warn that persistent indicators make users think something is broken. Log it to console only. The suggestions will silently re-render with the updated dictionary.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 fingerprint computation | New hash function | `computeFingerprint()` already in `dictionary.js` | Sort-normalization invariant is baked in; duplicating breaks the invariant guarantee |
| Background extraction | Custom `fetch` + word parsing in `content.js` | `tryExtractionWithRetry()` inside `dictionary.js` via `checkForUpdate()` | Full extraction pipeline with retry, disambiguation, validation already built |
| Cache write after update | Inline `chrome.storage.local.set` in `content.js` | `saveToCache()` inside `dictionary.js` | Schema-correct, handles bundled fingerprint, logs correctly |
| Cache clear before rebuild | Inline key removal | `clearCaches()` in `content.js` | Already handles both `wordlebot_dict` and `wordlebot_cache`, plus in-memory entropy/freq/constraint caches |
| Rebuild computation | Inline freq+entropy init | `loadDictionaryAndCaches(true)` in `content.js` | Already handles forceRebuild path, cache persistence, logging |

**Key insight:** All the infrastructure exists. Phase 15 is almost entirely wiring calls together, not building new logic. The only new function is `checkForUpdate()` in `dictionary.js`, and even that is thin orchestration over existing private functions (`tryExtractionWithRetry`, `computeFingerprint`, `saveToCache`, `getBundledFingerprint`).

---

## Common Pitfalls

### Pitfall 1: Background Check Runs Even When Source is Not 'cached'

**What goes wrong:** If `checkForUpdate` is called when `loadResult.dictResult.source === 'extracted'` (the URL changed and extraction ran in the foreground), the background check immediately re-extracts the same bundle that was just fetched, triggering two extractions in sequence.

**Why it happens:** The guard on `source === 'cached'` is easy to omit during implementation. Without it, `checkForUpdate` fires on every page load regardless of how the dictionary was loaded.

**How to avoid:** The fire-and-forget call in `content.js` must be gated: `if (loadResult.dictResult.source === 'cached') { checkForUpdate(...).then(...) }`. This is the only condition that requires a background content check.

**Warning signs:** Console shows "Background check: fingerprint match, dictionary unchanged" immediately after "Dictionary extracted" — two extractions per load.

---

### Pitfall 2: checkForUpdate Called with Bundled Fallback Result

**What goes wrong:** If `loadResult.dictResult.source === 'bundled'` (live extraction failed, bundled fallback used), calling `checkForUpdate` would try to extract again, which already failed. After the retry delay, it fails again and logs a confusing error.

**Why it happens:** Same missing guard as Pitfall 1 — not checking source type before calling.

**How to avoid:** The `source === 'cached'` guard naturally excludes `'bundled'` since bundled source is only returned when extraction failed. Explicit check: `if (loadResult.dictResult.source === 'cached')`.

**Warning signs:** "Background check: extraction failed, keeping cached dictionary" in console immediately after "Using bundled fallback dictionary" — indicates unnecessary retry after known failure.

---

### Pitfall 3: Re-Render Race with processBoardState

**What goes wrong:** The background check resolves and triggers `processBoardState` while the initial `processBoardState` (from the fast path) is still computing (e.g., entropy ranking in progress). Both calls run concurrently, both modify `window.WordleBot.lastSuggestions`, and the panel renders twice in quick succession.

**Why it happens:** `isComputing` is checked inside `processBoardState` to skip concurrent calls. If the background re-render fires while initial compute is running, the guard throws it away — correct behavior, but the dictionary update is silently lost.

**How to avoid:** The background check latency (extraction = 500ms-12s) makes simultaneous execution unlikely but not impossible on slow connections. Check `isComputing` at the re-render call site: if already computing when the background update arrives, defer the re-render by scheduling it after the current compute completes. The simplest approach: if `isComputing` is true when `checkForUpdate` resolves, just call `processBoardState` from a brief `setTimeout(cb, 500)` — enough time for the initial compute to finish.

**Warning signs:** `loadDictionaryAndCaches(true)` completes but suggestions in panel still show old words; console shows re-render was skipped because `isComputing` was true.

---

### Pitfall 4: tryExtractionWithRetry Returns Object, Not Array

**What goes wrong:** In Phase 14, `tryExtraction()` was changed to return `{ words, bundleUrl }` instead of a bare word array. The `tryExtractionWithRetry()` pass-through correctly returns the same object. Inside `checkForUpdate()`, if the code treats the return as `extractedWords` (an array) instead of `extractionResult.words`, the `computeFingerprint` call receives an object and the hash will be wrong.

**Why it happens:** The Phase 14 change to `tryExtraction()` return type is non-obvious. A developer writing `checkForUpdate()` who doesn't notice that `tryExtractionWithRetry()` now returns `{ words, bundleUrl }` will write `computeFingerprint(extractionResult)` instead of `computeFingerprint(extractionResult.words)`.

**How to avoid:** In `checkForUpdate()`, always destructure: `var extractionResult = await tryExtractionWithRetry(); if (!extractionResult) return null; var fp = await computeFingerprint(extractionResult.words);`. Never pass the whole result object to `computeFingerprint`.

**Warning signs:** `computeFingerprint` receives `[object Object]` — fingerprint never matches, background check triggers rebuild on every cached page load.

---

### Pitfall 5: clearCaches Clears wordlebot_dict, Requiring Re-Extraction

**What goes wrong:** `clearCaches()` in `content.js` removes both `wordlebot_dict` and `wordlebot_cache`. After the background `checkForUpdate` saves the new dictionary to `wordlebot_dict`, if `clearCaches()` then removes it, the subsequent `loadDictionaryAndCaches(true)` call has no cache to read from and must re-extract. This is correct behavior but may confuse implementors who expect `loadDictionaryAndCaches(true)` to use the newly saved entry.

**Why it happens:** `forceRebuild=true` passed to `loadDictionaryAndCaches` bypasses cache entirely and calls `loadDictionary(forceRefresh=true)` which skips `loadFromCache()`. So even if `wordlebot_dict` were preserved, it wouldn't be used. The extraction happens again regardless.

**How to avoid:** Accept that the background update path runs two extractions: one inside `checkForUpdate()` (to detect the change) and one inside `loadDictionaryAndCaches(true)` (to rebuild computational caches). This is correct — the second extraction is cheap because the bundle is already in the browser cache. Document this in the code: `// clearCaches removes wordlebot_dict; loadDictionaryAndCaches(true) will re-extract (browser cache makes it fast)`.

**Warning signs:** N/A — this is expected behavior, not a bug.

---

### Pitfall 6: forceRebuild Path in loadDictionaryAndCaches vs forceRefresh in loadDictionary

**What goes wrong:** `loadDictionaryAndCaches(forceRebuild)` in `content.js` passes `forceRebuild` to `window.WordleBot.loadDictionary(forceRebuild)`. When called with `true`, `loadDictionary` skips `loadFromCache` and calls `tryExtractionWithRetry`. This is correct. However, if the background update re-render calls `loadDictionaryAndCaches(false)` (not `true`), the cache (just saved by `checkForUpdate`) will be read back, fingerprint will match the computational cache, and NO rebuild will happen — the old computational caches (freq tables, entropy) persist, mismatched with the new word list.

**Why it happens:** Using `false` instead of `true` in the background re-render call is a natural mistake when copying the initial `loadDictionaryAndCaches(false)` call.

**How to avoid:** The background re-render MUST call `loadDictionaryAndCaches(true)`. The `clearCaches()` call before it removes `wordlebot_cache`, so even `loadDictionaryAndCaches(false)` would rebuild the computational cache (no fingerprint match). But calling with `true` is more explicit and correct — it forces full extraction regardless of cache state.

**Warning signs:** Console shows "Computational cache reused" after a background update; suggestions computed from old freq tables with new word list.

---

## Code Examples

Verified patterns from direct codebase reading:

### checkForUpdate — New Function in dictionary.js

```javascript
// Place after tryExtractionWithRetry() definition and before loadDictionary()
// All called functions (tryExtractionWithRetry, computeFingerprint, saveToCache,
// getBundledFingerprint) are private to the dictionary.js IIFE — no import needed.

async function checkForUpdate(cachedResult) {
  var extractionResult = await tryExtractionWithRetry();
  if (!extractionResult) {
    console.log('[WordleBot] Background check: extraction failed, keeping cached dictionary');
    return null;
  }

  var fp = await computeFingerprint(extractionResult.words);
  if (fp === cachedResult.fingerprint) {
    console.log('[WordleBot] Background check: fingerprint match, dictionary unchanged');
    return null;
  }

  var newResult = {
    words: extractionResult.words,
    source: 'extracted',
    freshness: 'fresh',
    fingerprint: fp,
    bundleUrl: extractionResult.bundleUrl
  };

  var bundledFp = await getBundledFingerprint();
  await saveToCache(newResult, bundledFp);

  console.log('[WordleBot] Background check: fingerprint mismatch -- dictionary updated (' +
    cachedResult.fingerprint.substring(0, 8) + ' -> ' + fp.substring(0, 8) + ')');

  return newResult;
}
```

### Export addition at the bottom of dictionary.js IIFE

```javascript
// Existing export:
window.WordleBot.loadDictionary = loadDictionary;

// New export for Phase 15:
window.WordleBot.checkForUpdate = checkForUpdate;
```

### Fire-and-forget call in content.js backgroundInit

```javascript
// After loadDictionaryAndCaches(false) and showSourceIndicator — BEFORE waitForBoard()
// Gate on source === 'cached' to avoid re-extraction after foreground extraction already ran
if (loadResult.dictResult.source === 'cached') {
  window.WordleBot.checkForUpdate(loadResult.dictResult).then(function(newResult) {
    if (!newResult) return;  // No change
    console.log('[WordleBot] Background update: rebuilding caches and re-rendering suggestions');
    clearCaches().then(function() {
      return loadDictionaryAndCaches(true);
    }).then(function(reloadResult) {
      showSourceIndicator(reloadResult.dictResult);
      var currentState = window.WordleBot.readBoardState();
      if (currentState && !isComputing) {
        processBoardState(currentState, false);
      }
    }).catch(function(err) {
      console.warn('[WordleBot] Background rebuild failed: ' + err.message);
    });
  }).catch(function(err) {
    console.warn('[WordleBot] Background update check failed: ' + err.message);
  });
}
```

### tryExtractionWithRetry return type (Phase 14 verified — object, not array)

```javascript
// From dictionary.js (verified in 14-01-VERIFICATION.md line 25):
// tryExtraction() returns { words: result.allWords, bundleUrl: result.bundleUrl || null }
// tryExtractionWithRetry() passes through the same object unchanged

// Therefore in checkForUpdate():
var extractionResult = await tryExtractionWithRetry();
// extractionResult is { words: string[], bundleUrl: string|null } or null
// NOT a string[] — always use extractionResult.words
```

### Verified dictionary.js private functions available to checkForUpdate

```javascript
// All these are inside the same IIFE as checkForUpdate — no export needed:
// - tryExtractionWithRetry() -- lines 129-140 (Phase 14 verified: returns {words, bundleUrl})
// - computeFingerprint(words) -- lines 37-48 (sorts before hashing, sorts+joins with '\n')
// - getBundledFingerprint() -- lines 77-86 (memoized, also loads bundled words)
// - saveToCache(dictResult, bundledFp) -- lines 225-244 (stores bundleUrl in entry)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 30-day timer only (expired cache = re-extract) | URL pre-check (Phase 14) + background fingerprint check (Phase 15) | Phase 14-15 | Cache stays valid indefinitely while bundle URL unchanged; content changes detected in background |
| No background check | checkForUpdate fires after cache hit | Phase 15 | Same-URL content changes detected silently, suggestions re-render with updated dictionary |
| User must Shift+Click to get updated dictionary | Automatic background detection | Phase 15 | Fully automatic; no user action required |
| "Updated" detection blocks suggestions | Fire-and-forget `.then()` chain | Phase 15 | Zero latency impact on suggestion rendering |

**Deprecated/outdated after Phase 15:**
- The 30-day timer remains as a fallback (DICT-07 — Phase 14 decision). It is not removed. It only fires when both `currentBundleUrl` and `cacheData.bundleUrl` are null (pre-Phase-14 cache entries or unusual cases where URL discovery fails).

---

## Open Questions

1. **What happens if `processBoardState` is called during the background re-render before isComputing is cleared?**
   - What we know: `isComputing` guard at line 250-253 of content.js skips concurrent calls. If the background re-render fires while initial compute is in progress, `processBoardState(currentState, false)` is silently skipped.
   - What's unclear: How long the initial compute takes vs typical background check latency.
   - Recommendation: Background check requires network round-trip (extraction) + SHA-256 computation — minimum 200ms on fast connections, typically 500ms-2s. Initial compute (entropy ranking) runs in an off-thread worker. Race is unlikely but possible. Guard with `isComputing` check at re-render site is sufficient; a retry via `setTimeout(cb, 500)` can be added if testing reveals the race occurs.

2. **Should the re-render call `processBoardState` with `isInitial=true` or `false`?**
   - What we know: `isInitial=true` skips the fade-in animation (used for first render). `isInitial=false` applies the fade animation (used for board state changes).
   - What's unclear: Whether a background dictionary update should visually fade in (treating it like a board state change) or appear instantly (treating it as a transparent refresh).
   - Recommendation: Use `isInitial=false` — the fade-in communicates that something changed, which is appropriate when the dictionary updated in the background. The user is already looking at suggestions; a subtle fade-in signals a refresh rather than a jarring instant replacement.

3. **Does `loadDictionaryAndCaches(true)` inside the background re-render call `findBundleUrl` again?**
   - What we know: `loadDictionary(forceRefresh=true)` in dictionary.js always runs Step A2 (findBundleUrl call before loadFromCache, per Phase 14 design). With `forceRefresh=true`, Step B (cache) is skipped, and Step C (extraction) runs. The findBundleUrl call in Step A2 is redundant on the forceRefresh path (the URL is already known from the extraction result in checkForUpdate), but it is harmless.
   - What's unclear: Performance impact of a second findBundleUrl call. findBundleUrl Strategy 1 (Performance API) is O(resources) synchronous scan — negligible.
   - Recommendation: Accept the minor redundancy. The code is simpler and more correct.

---

## Sources

### Primary (HIGH confidence)

- `C:/WordleBot/src/content.js` — Direct reading of `loadDictionaryAndCaches()`, `clearCaches()`, `processBoardState()`, `backgroundInit()` init flow, `isComputing` flag (lines 154-432)
- `C:/WordleBot/src/dictionary.js` — Direct reading of `tryExtraction()`, `tryExtractionWithRetry()`, `computeFingerprint()`, `getBundledFingerprint()`, `saveToCache()`, `loadDictionary()`, export block (lines 1-349, verified Phase 14 complete)
- `C:/WordleBot/.planning/phases/14-dictionary-change-detection/14-01-VERIFICATION.md` — Confirmed `tryExtraction()` returns `{ words, bundleUrl }` object (not array); confirmed `saveToCache` stores `bundleUrl`; confirmed `checkForUpdate` does not exist yet
- `C:/WordleBot/.planning/research/ARCHITECTURE.md` — Pattern 1 (stale-while-revalidate), data flow diagram, `checkForUpdate()` prototype, Component Responsibilities table
- `C:/WordleBot/.planning/REQUIREMENTS.md` — DICT-02, DICT-03, DICT-05, DICT-06 definitions and traceability
- `C:/WordleBot/.planning/ROADMAP.md` — Phase 15 success criteria, dependency on Phase 14
- `C:/WordleBot/.planning/research/PITFALLS.md` — Pitfalls 3-6 directly relevant to Phase 15 implementation

### Secondary (MEDIUM confidence)

- `C:/WordleBot/.planning/research/FEATURES.md` — Feature analysis confirming "no slowdown on daily use" requirement, anti-feature analysis (blocking SHA-256 on every load is wrong)
- `C:/WordleBot/.planning/codebase/CONVENTIONS.md` — Confirmed ES5 style (`var`, `function`, `.then()` chains not async/await in content.js), IIFE pattern, `window.WordleBot` namespace
- `C:/WordleBot/.planning/STATE.md` — Current project state confirms "ready to plan Phase 15"

### Tertiary (LOW confidence)

- None — all claims are grounded in direct codebase reading or planning documents.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs directly observed in working codebase code
- Architecture: HIGH — `checkForUpdate` design comes directly from ARCHITECTURE.md research doc written against the actual codebase; wiring pattern derived from existing `backgroundInit` structure in content.js
- Pitfalls: HIGH — Pitfalls 1-3 derived from direct code analysis; Pitfall 4 is a Phase 14 API change confirmed in verification; Pitfalls 5-6 derived from direct reading of `clearCaches()` and `loadDictionaryAndCaches()` logic

**Research date:** 2026-02-17
**Valid until:** Stable — no external dependencies; NYT bundle structure and Chrome Extension MV3 APIs are stable. Valid until Phase 15 is planned and executed. After that, superseded by Phase 16 research.
