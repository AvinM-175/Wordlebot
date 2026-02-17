---
phase: 14-dictionary-change-detection
plan: 01
subsystem: dictionary
tags: [chrome-storage, performance-api, bundle-url, cache, dictionary]

# Dependency graph
requires:
  - phase: pre-phase-14
    provides: dictExtractor.extract() returning bundleUrl field, dictionary.js cache system with saveToCache/loadFromCache/loadDictionary
provides:
  - findBundleUrl exported from window.WordleBot.dictExtractor as public API
  - bundleUrl stored in wordlebot_dict cache entry after every successful extraction
  - O(1) URL pre-check in loadFromCache: URL match serves cache immediately, mismatch forces extraction
  - 30-day timer preserved as fallback when URL unavailable (DICT-07)
  - tryExtraction returns { words, bundleUrl } object (was: words array only)
affects:
  - 14-dictionary-change-detection-02
  - 15-background-update-check

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Export private discovery function to enable pre-extraction URL comparison"
    - "Two-arg loadFromCache: bundledFp + currentBundleUrl for layered cache validation"
    - "Null-guard on both sides of URL comparison to handle pre-Phase-14 cache entries gracefully"
    - "findBundleUrl result normalization: string | string[] | null -> string | null via urlResult[0] when array"

key-files:
  created: []
  modified:
    - src/dictExtractor.js
    - src/dictionary.js

key-decisions:
  - "findBundleUrl exported from dictExtractor so dictionary.js can call it before extraction (not duplicated)"
  - "findBundleUrl called in loadDictionary before loadFromCache, passed as arg (not called inside loadFromCache)"
  - "URL pre-check guard: currentBundleUrl !== null && cacheData.bundleUrl — both must be truthy for comparison to run"
  - "Pre-Phase-14 cache entries (no bundleUrl field) fall through to 30-day timer without forced extraction"
  - "bundleUrl: null stored when falling back to bundled dictionary (no NYT URL exists for offline fallback)"

patterns-established:
  - "Pattern 1: Cache validation layers - bundledFingerprint check, then URL pre-check, then 30-day timer"
  - "Pattern 2: Normalize findBundleUrl() return type immediately after call using typeof/Array.isArray"
  - "Pattern 3: Pass discovery results as function args, not call discoverers inside validators"

# Metrics
duration: 1min
completed: 2026-02-17
---

# Phase 14 Plan 01: Bundle URL Cache Infrastructure Summary

**Bundle URL stored in wordlebot_dict cache and O(1) URL pre-check added to loadFromCache using performance.getEntriesByType, replacing 30-day timer as primary staleness signal while keeping timer as null-URL fallback**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-17T14:56:02Z
- **Completed:** 2026-02-17T14:57:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Exported `findBundleUrl` from `window.WordleBot.dictExtractor` so dictionary.js can call it before full extraction
- `tryExtraction()` now returns `{ words, bundleUrl }` instead of a bare word array, plumbing the URL through to `saveToCache`
- `saveToCache` stores `bundleUrl: dictResult.bundleUrl || null` in every cache entry, enabling URL comparison on next load
- `loadFromCache` accepts `currentBundleUrl` parameter and performs URL equality check before the 30-day timer
- `loadDictionary` calls `findBundleUrl` in new Step A2, normalizes the return, passes result to `loadFromCache`
- Pre-Phase-14 cache entries (missing `bundleUrl` field) fall through to 30-day timer without forced extraction

## Task Commits

Each task was committed atomically:

1. **Task 1: Export findBundleUrl and plumb bundleUrl through extraction result** - `3849138` (feat)
2. **Task 2: Add bundleUrl to saveToCache, URL pre-check to loadFromCache, findBundleUrl call to loadDictionary** - `19f9366` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `src/dictExtractor.js` - Added `findBundleUrl: findBundleUrl` to the exported namespace object
- `src/dictionary.js` - Updated `tryExtraction`, `tryExtractionWithRetry` pass-through, `loadFromCache` signature + URL pre-check block, `saveToCache` cache entry, `loadDictionary` Step A2 + updated `loadFromCache` call

## Decisions Made
- Export `findBundleUrl` from `dictExtractor` (not duplicate logic in dictionary.js) — preserves "dictExtractor owns URL discovery" separation
- Call `findBundleUrl` in `loadDictionary` before `loadFromCache` (not inside `loadFromCache`) — keeps async call outside validator, keeps loadFromCache single-responsibility
- Guard: `currentBundleUrl !== null && cacheData.bundleUrl` ensures comparison only runs when both non-null, making pre-Phase-14 migration transparent
- Use `urlResult[0]` to normalize array return — Strategy 1 (Performance API) places wordle.*.js at position 0 via `unshift`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The blocker from STATE.md ("findBundleUrl() currently called inside dictExtractor.extract()") was resolved exactly as planned: export the function from the IIFE, call it from loadDictionary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 14 Plan 01 infrastructure is complete: cache stores `bundleUrl`, `loadFromCache` does URL pre-check, `findBundleUrl` is public API
- Phase 14 Plan 02 (if any) or Phase 15 can wire `content.js` to call `loadDictionary` with the new URL-aware cache path
- STATE.md blocker "[Phase 14]: findBundleUrl() currently called inside dictExtractor.extract()" is resolved — can be cleared

---
*Phase: 14-dictionary-change-detection*
*Completed: 2026-02-17*

## Self-Check: PASSED

- src/dictExtractor.js: FOUND
- src/dictionary.js: FOUND
- Commit 3849138 (Task 1): FOUND
- Commit 19f9366 (Task 2): FOUND
- findBundleUrl exported from dictExtractor: VERIFIED (1 match)
- bundleUrl in saveToCache entry: VERIFIED (1 match)
- loadFromCache 2-arg signature: VERIFIED (1 match)
- URL pre-check guard (both non-null): VERIFIED (1 match)
- findBundleUrl called in loadDictionary: VERIFIED (2 matches: call site + availability check)
- No remaining extractedWords references: VERIFIED (0 matches)
