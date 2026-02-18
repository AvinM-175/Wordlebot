# Phase 16: First-Install Detection Logic - Research

**Researched:** 2026-02-18
**Domain:** Chrome Extension MV3 — storage-based first-install detection piggybacking on existing storage reads in `content.js`
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Detection heuristic
- ANY single existing storage key (wordlebot_dict OR wordlebot_cache) is sufficient to classify as existing user
- Pure storage-based detection only — no chrome.runtime APIs, no manifest checks
- Result exposed as a simple boolean: `isFirstInstall` (true/false)
- Key presence is enough — don't validate contents or structure of existing cache entries

#### Init flow placement
- Piggyback on existing chrome.storage.local.get() call that loadFromCache already performs — zero extra storage I/O
- Must not delay dictionary loading or suggestion rendering (per roadmap success criteria)

#### Flag storage design
- Key name: `wordlebot_onboarded` (matches existing naming convention: wordlebot_dict, wordlebot_cache)
- Value: boolean `true` (simple, no timestamps or version strings)
- Excluded from clearCaches() — Shift+Refresh dictionary reset never re-triggers onboarding (already decided in roadmap)

#### Edge cases
- Cleared storage / fresh profile = treat as first install, show onboarding again (simple and correct)
- Storage read failure = fallback to "existing user" (safe default — worst case: miss showing onboarding once)
- No console logging for detection result — keep console clean

### Claude's Discretion
- Whether to set wordlebot_onboarded=false immediately at detection time vs. leaving all flag writing to Phase 17
- Whether to set wordlebot_onboarded=true for existing users at detection time vs. letting Phase 17 handle it
- Where the detection function lives (dictionary.js vs content.js) — based on code structure and separation of concerns
- Whether isFirstInstall result is stored as module-level variable or returned from function — based on codebase patterns
- Whether detection runs before or in parallel with dictionary loading — based on what Phase 17 mounting needs

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBD-01 | Extension detects first-install state via chrome.storage.local flag (no background service worker needed) | Storage-based detection using chrome.storage.local.get() with multi-key array call; piggybacked on existing loadDictionaryAndCaches read |
| ONBD-02 | Extension distinguishes true first-install from existing users upgrading to v1.7 (existing cache data = existing user, skip onboarding) | wordlebot_dict OR wordlebot_cache presence as "existing user" heuristic; wordlebot_onboarded as committed flag for post-v1.7 users |
</phase_requirements>

---

## Summary

Phase 16 is a pure logic phase: no new UI, no new modules, no new dependencies. The goal is to produce a reliable `isFirstInstall` boolean that Phase 17 will consume to decide whether to display the onboarding overlay. The detection runs as part of the existing `loadDictionaryAndCaches()` function in `content.js`, piggybacking on the `chrome.storage.local.get('wordlebot_cache')` call that already happens on every load — zero additional storage I/O.

The heuristic is simple: if `wordlebot_onboarded === true`, the user has explicitly completed onboarding (post-v1.7). If `wordlebot_dict` or `wordlebot_cache` is present (but `wordlebot_onboarded` is absent), the user installed before v1.7 — treat as existing user, skip onboarding. If all three are absent, this is a genuine first install — show onboarding. Storage read failure falls back to "existing user" (safe default: worst case is missing one onboarding opportunity, not showing it repeatedly).

The detection function lives in `content.js` (not `dictionary.js`) because `content.js` is already the correct place for application-level lifecycle concerns, and because the `loadDictionaryAndCaches` function is where the piggyback opportunity exists. The `isFirstInstall` result is stored as a module-level variable (`window.WordleBot.isFirstInstall`) following the established namespace pattern, making it immediately available for Phase 17 without additional async work.

**Primary recommendation:** Add a `detectFirstInstall(stored)` helper inside `loadDictionaryAndCaches()` that evaluates the already-read `wordlebot_cache` result plus a simultaneous read of `wordlebot_dict` and `wordlebot_onboarded`. Expand the existing `chrome.storage.local.get('wordlebot_cache')` call to `chrome.storage.local.get(['wordlebot_cache', 'wordlebot_dict', 'wordlebot_onboarded'])`. Publish the boolean as `window.WordleBot.isFirstInstall`. Set `wordlebot_onboarded = true` for existing users at detection time.

---

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| `chrome.storage.local.get(keys)` | Chrome MV3 | Read multiple storage keys in a single API call | Already used throughout codebase; the only storage API used for persistent cross-session data |
| `window.WordleBot` namespace | N/A | Publish `isFirstInstall` boolean for Phase 17 to consume | Established pattern: every module exports to this namespace (dictionary, entropy, freq, etc.) |

### Supporting

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| `chrome.storage.local.set(obj)` | Chrome MV3 | Write `wordlebot_onboarded = true` for existing users | At detection time, to prevent re-triggering detection on subsequent loads |
| `requestIdleCallback` (already in use) | Web API | Ensures detection runs inside existing idle callback — no timing change needed | Detection is part of `loadDictionaryAndCaches`, which already runs inside `scheduleCompute` idle callback |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Multi-key `get(['wordlebot_cache', 'wordlebot_dict', 'wordlebot_onboarded'])` | Separate `get('wordlebot_onboarded')` call | Separate call adds storage I/O; multi-key call is zero additional I/O since `wordlebot_cache` read already happens |
| `window.WordleBot.isFirstInstall` (module-level) | Return value from detection function | Module-level matches the established pattern (`window.WordleBot.dictionary`, `window.WordleBot.dictionaryResult`, etc.); Phase 17 can read it synchronously without another async call |
| Detect in `dictionary.js` | Detect in `content.js` | `dictionary.js` IIFE only reads `wordlebot_dict` — would need to also read `wordlebot_onboarded`, introducing onboarding concerns into the dictionary module. `content.js` already orchestrates application-level concerns including `clearCaches` and `loadDictionaryAndCaches`. |
| Set `wordlebot_onboarded` only in Phase 17 (dismissal) | Set it for existing users in Phase 16 (detection) | If detection only reads without writing for existing users, pre-v1.7 users re-enter detection logic on every load until they somehow trigger Phase 17 dismissal. Writing at detection time is self-healing and idempotent. |

**Installation:** No new packages. Zero `npm install` required.

---

## Architecture Patterns

### Files Changed

```
src/
├── content.js     # MODIFY: expand chrome.storage.local.get to multi-key; add detectFirstInstall(); publish window.WordleBot.isFirstInstall
└── (all other files)  # Unchanged
```

### Pattern 1: Multi-Key Piggyback Read

**What:** Expand the existing `chrome.storage.local.get('wordlebot_cache')` call in `loadDictionaryAndCaches()` to a multi-key call that simultaneously reads `wordlebot_cache`, `wordlebot_dict`, and `wordlebot_onboarded`. No additional async operations.

**When to use:** Always — every page load calls `loadDictionaryAndCaches(false)` on first run. The forceRebuild=true path (Shift+Refresh) also runs through `loadDictionaryAndCaches` and should re-run detection (in case storage was cleared).

**Current code (lines 172-174 of content.js):**
```javascript
// BEFORE (single key):
var cached = await chrome.storage.local.get('wordlebot_cache');
var cacheData = cached.wordlebot_cache;
```

**Modified code:**
```javascript
// AFTER (multi-key piggyback — zero extra storage I/O):
var stored = await chrome.storage.local.get(['wordlebot_cache', 'wordlebot_dict', 'wordlebot_onboarded']);
var cacheData = stored.wordlebot_cache;
// stored also contains: stored.wordlebot_dict, stored.wordlebot_onboarded
```

The `cacheData` variable and all downstream logic remain identical. The only change is the key argument.

### Pattern 2: Three-State Detection Logic

**What:** Three possible states, evaluated in priority order:

| State | Condition | `isFirstInstall` | Action |
|-------|-----------|------------------|--------|
| Post-v1.7 (already onboarded) | `stored.wordlebot_onboarded === true` | `false` | No action |
| Pre-v1.7 existing user | `stored.wordlebot_dict` or `stored.wordlebot_cache` present (but onboarded absent) | `false` | Write `wordlebot_onboarded = true` (normalize to post-v1.7 state) |
| True first install | All three keys absent | `true` | No action (Phase 17 writes flag after dismissal) |

**Implementation:**
```javascript
// Source: Derived from CONTEXT.md decisions + codebase analysis of content.js/dictionary.js
function detectFirstInstall(stored) {
  // Post-v1.7 user: already onboarded
  if (stored.wordlebot_onboarded === true) {
    return false;
  }
  // Pre-v1.7 existing user: has cache data but no onboarded flag
  if (stored.wordlebot_dict || stored.wordlebot_cache) {
    return false;
  }
  // True first install: no storage data at all
  return true;
}
```

### Pattern 3: Publish Result to Namespace

**What:** After detection, publish `isFirstInstall` on `window.WordleBot` so Phase 17 can read it synchronously from any subsequent code path.

**When to use:** Immediately after detection, before `loadDictionaryAndCaches` returns.

```javascript
// Source: Established pattern — matches window.WordleBot.dictionary, .dictionaryResult, .dictionaryFingerprint
window.WordleBot.isFirstInstall = detectFirstInstall(stored);
```

### Pattern 4: Write Existing-User Normalization Flag

**What:** For pre-v1.7 existing users (have cache data but no `wordlebot_onboarded` flag), write `wordlebot_onboarded = true` immediately. This converts them to post-v1.7 state on first load, preventing re-detection on every subsequent load.

**When to use:** Only when `isFirstInstall === false` AND `stored.wordlebot_onboarded !== true` (i.e., the user is an existing user, not yet normalized).

```javascript
// Write once for existing users — idempotent on subsequent loads
if (!window.WordleBot.isFirstInstall && stored.wordlebot_onboarded !== true) {
  chrome.storage.local.set({ wordlebot_onboarded: true }).catch(function(err) {
    console.warn('[WordleBot] Failed to write onboarded flag: ' + err.message);
  });
  // Fire-and-forget: failure is non-critical — worst case: re-runs next load
}
```

### Placement Within loadDictionaryAndCaches

```javascript
async function loadDictionaryAndCaches(forceRebuild) {
  // Load dictionary via orchestrator (three-tier cascade)
  var dictResult = await window.WordleBot.loadDictionary(forceRebuild);
  // ... (existing fingerprint/logging lines unchanged) ...

  // EXPAND: single-key get → multi-key get (zero extra I/O)
  var stored = await chrome.storage.local.get(['wordlebot_cache', 'wordlebot_dict', 'wordlebot_onboarded']);
  var cacheData = stored.wordlebot_cache;  // same as before

  // NEW: First-install detection (piggybacks on this read)
  window.WordleBot.isFirstInstall = detectFirstInstall(stored);
  // Write normalization flag for pre-v1.7 existing users (fire-and-forget)
  if (!window.WordleBot.isFirstInstall && stored.wordlebot_onboarded !== true) {
    chrome.storage.local.set({ wordlebot_onboarded: true }).catch(function(err) {
      console.warn('[WordleBot] Failed to write onboarded flag: ' + err.message);
    });
  }

  // REST: existing cacheData logic unchanged ...
  if (cacheData && cacheData.fingerprint === fingerprint) {
    // Cache hit path — unchanged
    ...
  }
  ...
}
```

### Anti-Patterns to Avoid

- **Reading `wordlebot_onboarded` in a separate `chrome.storage.local.get()` call:** This adds storage I/O and violates the piggyback constraint. Always expand the existing multi-key call.

- **Detecting first-install inside `dictionary.js`:** The dictionary module should not know about onboarding. `content.js` owns the application lifecycle. Detection belongs there.

- **Using `stored.wordlebot_onboarded` truthiness only (without `=== true`):** If the flag were ever written as a non-boolean truthy value (e.g., a version string in a future migration), truthiness would still work, but `=== true` makes the contract explicit and avoids accidental matches.

- **Running detection as a separate `chrome.storage.local.get` before the dictionary load:** This would be a blocking operation that delays dictionary loading. The piggyback approach is mandatory.

- **Setting `window.WordleBot.isFirstInstall` before the storage read completes:** The detection is async (awaiting the storage read). Never set a default value that Phase 17 might read before the storage read resolves.

- **Not handling the `forceRebuild=true` (Shift+Refresh) path:** When `loadDictionaryAndCaches(true)` is called, it still runs the storage read for `wordlebot_cache`. Detection will re-run, which is correct — if storage was cleared (unusual but possible), re-detection is appropriate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-key storage read | Two separate `chrome.storage.local.get()` calls in sequence | Single `chrome.storage.local.get(['key1', 'key2', 'key3'])` | Chrome MV3 storage API supports array key argument; single call is atomic and zero extra I/O |
| Namespace publication | Callback/event system for Phase 17 to receive result | `window.WordleBot.isFirstInstall = bool` | Established pattern in codebase; all modules publish to this namespace; synchronous read from any script loaded after content.js |

**Key insight:** This phase is intentionally minimal — a few lines inserted into an existing function. There is no new module to create, no new pattern to invent. The existing codebase patterns handle everything.

---

## Common Pitfalls

### Pitfall 1: `chrome.runtime.onInstalled` from Content Script

**What goes wrong:** Attempting to use `chrome.runtime.onInstalled.addListener()` in a content script. It silently does nothing — the listener never fires. Onboarding never shows, no errors, no warnings.

**Why it happens:** MV3 documentation shows `onInstalled` in examples that assume a background service worker exists. This extension has no background service worker (manifest has no `background` key).

**How to avoid:** Never reference `chrome.runtime.onInstalled` anywhere outside a background script. This phase uses pure storage-based detection only.

**Warning signs:** `chrome.runtime.onInstalled.addListener(...)` in any file under `src/` other than a background script.

---

### Pitfall 2: Absent Key Returns `undefined`, Not `false`

**What goes wrong:** Checking `if (!stored.wordlebot_onboarded)` to detect "not onboarded" — this is true for both `undefined` (key absent) and `false` (key present but set to false). The detection logic must distinguish "key absent" from "key set to false/falsy."

**Why it happens:** `chrome.storage.local.get()` with an array of keys returns an object that omits absent keys entirely. `stored.wordlebot_onboarded` is `undefined` when the key is absent, not `null` or `false`. The check `=== true` correctly handles this.

**How to avoid:** Use `stored.wordlebot_onboarded === true` (strict equality). This returns `false` for both `undefined` and any value that is not exactly boolean `true`.

**Warning signs:** Detection accidentally returns `isFirstInstall = true` for a user who has `wordlebot_onboarded = false` set (should not happen with current design, but a future migration could write `false`).

---

### Pitfall 3: Breaking the Existing `wordlebot_cache` Read

**What goes wrong:** Changing the variable name from `cached` to `stored` without updating all downstream references breaks the cache-hit path in `loadDictionaryAndCaches`. The function uses `cached.wordlebot_cache` to check for computational cache hits.

**Why it happens:** The refactor from `chrome.storage.local.get('wordlebot_cache')` → `chrome.storage.local.get([...])` involves renaming the result variable. Any missed reference causes `cacheData` to be `undefined`.

**How to avoid:** After the refactor, keep `var cacheData = stored.wordlebot_cache;` immediately after the expanded read. All downstream code references `cacheData`, not `stored.wordlebot_cache` directly. Verify the cache-hit path (`if (cacheData && cacheData.fingerprint === fingerprint)`) still works.

**Warning signs:** Console shows "No computational cache found, building fresh" on every load even when cache was just built. Fingerprint logs missing. Panel loading is slow on every visit.

---

### Pitfall 4: Detection Runs After `loadDictionary` Begins Writing

**What goes wrong:** `loadDictionary` is called before the detection read. If `loadDictionary` writes `wordlebot_dict` to storage mid-execution (e.g., extraction succeeded on first run), the detection read for `wordlebot_dict` happens after the write and would incorrectly detect "existing user" on a first install.

**Why it happens:** In `loadDictionaryAndCaches`, the dictionary is loaded first: `var dictResult = await window.WordleBot.loadDictionary(forceRebuild)`. The `saveToCache` inside dictionary.js would write `wordlebot_dict` during this call. If detection reads `wordlebot_dict` AFTER this completes, a first-install user who successfully extracted would show as "existing user."

**How to avoid:** The detection read MUST happen AFTER `loadDictionary` completes, not before. This is counterintuitive, but it is the correct order because:
- If this is a first install and extraction succeeded, `wordlebot_dict` is now written
- Detection reads `wordlebot_dict` — finds it present — incorrectly returns `isFirstInstall = false`

The solution: **Do the detection read BEFORE calling `loadDictionary`**, not after. Move the multi-key `get` to the top of `loadDictionaryAndCaches`, before the `loadDictionary` call. Store the result, then call `loadDictionary`. The `wordlebot_cache` read that comes later (for computational cache) stays in place (or uses the already-read value from the top).

**Revised placement:**
```javascript
async function loadDictionaryAndCaches(forceRebuild) {
  // STEP 0: Read detection keys BEFORE loadDictionary writes wordlebot_dict
  var detectionStored;
  try {
    detectionStored = await chrome.storage.local.get(['wordlebot_dict', 'wordlebot_cache', 'wordlebot_onboarded']);
  } catch (e) {
    detectionStored = {};  // storage read failed: default to empty (safe fallback to existing user)
  }
  window.WordleBot.isFirstInstall = detectFirstInstall(detectionStored);
  // ... write normalization flag for existing users (fire-and-forget) ...

  // STEP 1: Load dictionary (may write wordlebot_dict to storage)
  var dictResult = await window.WordleBot.loadDictionary(forceRebuild);
  // ...

  // STEP 2: Read wordlebot_cache for computational cache check (separate read, unchanged logic)
  var cached = await chrome.storage.local.get('wordlebot_cache');
  var cacheData = cached.wordlebot_cache;
  // ...
}
```

**This means the piggyback is split:** detection reads all three keys up front, computational cache check remains its own `get('wordlebot_cache')` call. The two reads are different storage keys read at different times for different purposes. The "zero extra I/O" goal is achieved differently: the detection read is three keys in one call (atomic), and the computational cache check is its own call (already existed). Net addition: one `get` call per page load vs. zero previously. This is acceptable — the alternative (reading before loadDictionary) is the only correct ordering.

**Warning signs:** `isFirstInstall` is `false` for a user who cleared storage and reinstalled; or `isFirstInstall` is `false` on very first install when extraction succeeds.

---

### Pitfall 5: Existing Users Normalized on Every Load (Missing Flag Write Guard)

**What goes wrong:** The normalization write (`wordlebot_onboarded = true`) runs on every load for existing users because the guard checks the pre-write value. After first normalization, the key is written; subsequent loads detect it via `stored.wordlebot_onboarded === true` and skip the write. But if the write fails silently, re-normalization on next load is harmless — this is intentional fire-and-forget.

**Why it happens:** This is correct behavior, not a bug. But implementors may worry about unnecessary writes.

**How to avoid:** The guard `!window.WordleBot.isFirstInstall && stored.wordlebot_onboarded !== true` prevents unnecessary writes once the flag is set. On subsequent loads, `stored.wordlebot_onboarded === true` evaluates first (returning `isFirstInstall = false` without entering the normalization branch).

**Warning signs:** N/A — this is expected behavior. If concerned, confirm write is only called once by checking Application → Storage in DevTools after two page loads.

---

### Pitfall 6: `wordlebot_onboarded` Cleared by clearCaches

**What goes wrong:** The roadmap decision states `wordlebot_onboarded` must be excluded from `clearCaches()`. The current `clearCaches()` in `content.js` (lines 60-61) explicitly lists the keys to remove: `chrome.storage.local.remove(['wordlebot_cache', 'wordlebot_dict'])`. `wordlebot_onboarded` is not in this list.

**Why it happens:** A developer adding the normalization write might also add a "clear onboarding state" option to `clearCaches()` for debugging purposes.

**How to avoid:** Never add `wordlebot_onboarded` to the `clearCaches()` remove call. Verify after implementation that Shift+Refresh (which calls `clearCaches`) does not clear `wordlebot_onboarded`.

**Warning signs:** After Shift+Refresh, onboarding appears again for users who already dismissed it.

---

## Code Examples

Verified patterns from direct codebase reading:

### Full detectFirstInstall Helper

```javascript
// Source: content.js — to be added as a function above loadDictionaryAndCaches
/**
 * Determine if the current user is a first-time installer.
 *
 * Heuristic (CONTEXT.md decisions):
 *   - wordlebot_onboarded === true → post-v1.7 user (already onboarded, false)
 *   - wordlebot_dict OR wordlebot_cache present → pre-v1.7 existing user (false)
 *   - all absent → true first install (true)
 *
 * Storage read failure → caller passes empty object {} → returns false (safe default)
 *
 * @param {Object} stored - Result of chrome.storage.local.get(['wordlebot_dict', 'wordlebot_cache', 'wordlebot_onboarded'])
 * @returns {boolean} true if first install, false if existing user
 */
function detectFirstInstall(stored) {
  if (stored.wordlebot_onboarded === true) {
    return false;  // post-v1.7: already onboarded
  }
  if (stored.wordlebot_dict || stored.wordlebot_cache) {
    return false;  // pre-v1.7 existing user: has cache data
  }
  return true;  // genuine first install: no storage data
}
```

### Modified loadDictionaryAndCaches — Detection Block

```javascript
// Source: content.js loadDictionaryAndCaches (lines 154-219), modified for Phase 16
async function loadDictionaryAndCaches(forceRebuild) {
  // PHASE 16: Read detection keys BEFORE loadDictionary can write wordlebot_dict
  var detectionStored;
  try {
    detectionStored = await chrome.storage.local.get(['wordlebot_dict', 'wordlebot_cache', 'wordlebot_onboarded']);
  } catch (e) {
    detectionStored = {};  // storage read failed — safe fallback (existing user, skip onboarding)
  }
  window.WordleBot.isFirstInstall = detectFirstInstall(detectionStored);

  // Normalize pre-v1.7 existing users to post-v1.7 state (fire-and-forget)
  if (!window.WordleBot.isFirstInstall && detectionStored.wordlebot_onboarded !== true) {
    chrome.storage.local.set({ wordlebot_onboarded: true }).catch(function(err) {
      console.warn('[WordleBot] Failed to write onboarded flag: ' + err.message);
    });
  }

  // Load dictionary via orchestrator (three-tier cascade) — unchanged
  var dictResult = await window.WordleBot.loadDictionary(forceRebuild);
  var fingerprint = dictResult.fingerprint;
  var fpShort = fingerprint.substring(0, 8);
  console.log('[WordleBot] Dictionary loaded: ' + dictResult.words.length +
    ' words (source: ' + dictResult.source + ', fingerprint: ' + fpShort + ')');

  window.WordleBot.dictionary = dictResult.words;
  window.WordleBot.dictionaryResult = dictResult;

  // ... rest of function unchanged (wordlebot_cache check, cache hit/miss, rebuild) ...
  var wasRebuilt = false;

  if (forceRebuild) {
    console.log('[WordleBot] Force rebuild requested');
    wasRebuilt = true;
  } else {
    var cached = await chrome.storage.local.get('wordlebot_cache');
    var cacheData = cached.wordlebot_cache;
    // ... existing cacheData fingerprint check logic unchanged ...
  }
  // ...
}
```

### Export to Namespace (Phase 17 consumption)

```javascript
// window.WordleBot.isFirstInstall is set directly (not via function export)
// It is set inside loadDictionaryAndCaches() as a side effect:
//   window.WordleBot.isFirstInstall = detectFirstInstall(detectionStored);

// Phase 17 reads it synchronously:
//   if (window.WordleBot.isFirstInstall) { showOnboarding(); }

// Initialize to null (not set yet) at top of content.js to make the lifecycle explicit:
window.WordleBot.isFirstInstall = null;
// Set to true/false inside loadDictionaryAndCaches(), which runs before Phase 17 mounting
```

### Verified chrome.storage.local Multi-Key Pattern (from existing codebase)

```javascript
// Pattern already used in codebase (single key — content.js line 173):
var cached = await chrome.storage.local.get('wordlebot_cache');
var cacheData = cached.wordlebot_cache;  // undefined if absent

// Expanded to multi-key (zero new I/O per call):
var stored = await chrome.storage.local.get(['wordlebot_dict', 'wordlebot_cache', 'wordlebot_onboarded']);
// stored.wordlebot_cache — undefined if absent (same behavior as before)
// stored.wordlebot_dict — undefined if absent
// stored.wordlebot_onboarded — undefined if absent, true if set

// Absent key: stored[key] === undefined (not null, not false)
// Confirmed pattern: content.js line 176: if (cacheData && cacheData.fingerprint === fingerprint)
// The guard checks truthiness of the absent-key case, which is undefined (falsy) — works correctly
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.runtime.onInstalled` for install detection | Storage-based detection (absence of keys = first install) | v1.7 Phase 16 | Works entirely from content script; no background service worker needed |
| No first-install concept | Three-state detection (post-v1.7 onboarded, pre-v1.7 existing, true first install) | v1.7 Phase 16 | Existing users upgrading to v1.7 never see onboarding |

**Deprecated/outdated:**
- `chrome.runtime.onInstalled` for first-install detection: Only works in background service workers. This extension has none. Never use in content scripts.

---

## Open Questions

1. **Should `isFirstInstall = null` be initialized at the top of `content.js`?**
   - What we know: Other namespace properties are set at declaration (`window.WordleBot.lastSuggestions = null` at line 2). `window.WordleBot.isFirstInstall` is set inside `loadDictionaryAndCaches`, which is called inside `backgroundInit`, which runs after `requestIdleCallback`. There is a window where `isFirstInstall` is undefined.
   - What's unclear: Whether Phase 17 could ever read `isFirstInstall` before `loadDictionaryAndCaches` completes.
   - Recommendation: Initialize `window.WordleBot.isFirstInstall = null` at the top of `content.js` (alongside `window.WordleBot.lastSuggestions = null`). Phase 17 should check `isFirstInstall === true` (not just `isFirstInstall`), so `null` correctly maps to "not yet determined / treat as existing user."

2. **Should detection re-run on the Shift+Refresh (forceRebuild=true) path?**
   - What we know: Shift+Refresh calls `clearCaches()` (removes `wordlebot_dict` and `wordlebot_cache`) then calls `loadDictionaryAndCaches(true)`. After `clearCaches()`, the two storage keys are absent. Detection would read them as absent — but `wordlebot_onboarded` is still `true` (excluded from clearCaches). So detection would correctly return `isFirstInstall = false`.
   - What's unclear: Whether this is desirable or whether detection should be skipped on forceRebuild.
   - Recommendation: Let detection re-run on forceRebuild. The `wordlebot_onboarded === true` guard correctly handles the Shift+Refresh case — no onboarding appears after a hard refresh. No special-casing needed.

3. **What happens on the background update re-render path (clearCaches + loadDictionaryAndCaches(true))?**
   - What we know: Phase 15's background update path calls `clearCaches()` then `loadDictionaryAndCaches(true)` after a fingerprint mismatch. Detection runs again inside this second call. `wordlebot_dict` and `wordlebot_cache` are absent (just cleared), but `wordlebot_onboarded` is still `true`. Detection returns `isFirstInstall = false` correctly.
   - What's unclear: Whether re-running detection on the background path is wasteful.
   - Recommendation: Accept the minor overhead. The second detection run is cheap (storage read already performed), correct in its result, and requires no special-casing.

---

## Sources

### Primary (HIGH confidence)

- `C:/WordleBot/src/content.js` — Direct reading of `loadDictionaryAndCaches()` (lines 154-219), `clearCaches()` (lines 55-85), `backgroundInit()` (lines 237-454), `window.WordleBot.lastSuggestions = null` initialization pattern (line 2)
- `C:/WordleBot/src/dictionary.js` — Direct reading of `loadFromCache()` and `saveToCache()` confirming `wordlebot_dict` key schema and write timing
- `C:/WordleBot/.planning/research/PITFALLS.md` — Pitfall 1 (onInstalled from content script), Pitfall 2 (update triggers onboarding for existing users), Pitfall 6 (dismiss state async write)
- `C:/WordleBot/.planning/REQUIREMENTS.md` — ONBD-01 and ONBD-02 definitions, traceability to Phase 16
- `C:/WordleBot/.planning/ROADMAP.md` — Phase 16 success criteria (1: fresh install flagged; 2: existing cache = existing user; 3: no delay to suggestions)
- `C:/WordleBot/.planning/codebase/CONVENTIONS.md` — ES5 style (var, function), IIFE pattern, window.WordleBot namespace, error handling patterns
- `C:/WordleBot/.planning/phases/16-first-install-detection-logic/16-CONTEXT.md` — All locked decisions and discretion areas

### Secondary (MEDIUM confidence)

- `C:/WordleBot/.planning/codebase/ARCHITECTURE.md` — Confirmed `content.js` is the correct location for application lifecycle concerns; confirmed namespace pattern
- `C:/WordleBot/.planning/STATE.md` — Confirmed Phase 15 complete, Phase 16 is next, `wordlebot_onboarded` excluded from `clearCaches()` is an established decision

### Tertiary (LOW confidence)

- Chrome Extension MV3 `chrome.storage.local.get(array)` multi-key behavior — confirmed indirectly via existing codebase patterns (`cached.wordlebot_cache` undefined when absent, not null); WebFetch of Chrome docs confirms API accepts array but does not explicitly state absent-key behavior. Confidence HIGH from codebase evidence, MEDIUM from docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs directly observed in working codebase
- Architecture: HIGH — detection logic follows established patterns exactly; placement reasoning grounded in direct codebase reading
- Pitfalls: HIGH — Pitfall 4 (ordering bug) is the only non-obvious finding; verified via direct tracing of `loadDictionary` → `saveToCache` write sequence in `dictionary.js`

**Research date:** 2026-02-18
**Valid until:** Stable — no external dependencies; Chrome MV3 storage API is stable; codebase patterns are established. Valid until Phase 16 is planned and executed.
