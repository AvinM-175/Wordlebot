---
phase: 15-content-js-wiring-background-update-check
plan: 01
subsystem: dictionary
tags: [chrome-extension, stale-while-revalidate, fingerprint, background-check, sha256]

# Dependency graph
requires:
  - phase: 14-dictionary-change-detection
    provides: bundleUrl stored in wordlebot_dict cache entry, URL pre-check in loadFromCache, findBundleUrl exported, tryExtractionWithRetry returns {words, bundleUrl} object

provides:
  - checkForUpdate(cachedResult) async function in dictionary.js -- background content fingerprint verification
  - window.WordleBot.checkForUpdate export for content.js consumption
  - Fire-and-forget background check in content.js backgroundInit gated on source === 'cached'
  - Full stale-while-revalidate pattern: serve cache immediately, detect content changes in background, re-render on mismatch
  - DICT-02, DICT-03, DICT-05, DICT-06 requirements covered

affects:
  - phase-16
  - phase-17
  - dictionary subsystem
  - content.js backgroundInit flow

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stale-while-revalidate: serve cached dictionary immediately, check fingerprint in background"
    - "fire-and-forget: .then() chain (not await) to avoid blocking suggestion pipeline"
    - "source guard: checkForUpdate only called when source === 'cached' -- never on extracted/bundled"
    - "isComputing guard at re-render call site -- prevents race with initial compute"

key-files:
  created: []
  modified:
    - src/dictionary.js
    - src/content.js

key-decisions:
  - "checkForUpdate placed in dictionary.js (not content.js) -- dictionary.js owns all extraction and fingerprint logic"
  - "Fire-and-forget via .then() chain in backgroundInit -- must not await to keep suggestion pipeline non-blocking"
  - "isComputing check before processBoardState in re-render path -- guard, not barrier -- if race occurs user still sees old suggestions rather than corrupt state"
  - "clearCaches() before loadDictionaryAndCaches(true) -- correct rebuild path; two extractions expected (one in checkForUpdate, one in rebuild)"

patterns-established:
  - "Background content verification: tryExtractionWithRetry -> computeFingerprint(extractionResult.words) -> compare -> saveToCache"
  - "Re-render path after background update: clearCaches().then(loadDictionaryAndCaches(true)).then(showSourceIndicator + processBoardState)"

requirements-completed: [DICT-02, DICT-03, DICT-05, DICT-06]

# Metrics
duration: 1min
completed: 2026-02-18
---

# Phase 15 Plan 01: Content.js Wiring Background Update Check Summary

**stale-while-revalidate dictionary check: checkForUpdate() in dictionary.js detects same-URL content fingerprint mismatches and triggers silent cache rebuild + suggestion re-render in content.js**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-18T05:49:32Z
- **Completed:** 2026-02-18T05:51:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `checkForUpdate(cachedResult)` async function to dictionary.js after `tryExtractionWithRetry` -- correctly uses `extractionResult.words` for fingerprinting (not the bare object), persists via `saveToCache` on mismatch, logs old/new 8-char hashes
- Exported `window.WordleBot.checkForUpdate` alongside existing `loadDictionary` export
- Wired fire-and-forget background check into content.js `backgroundInit` after `showSourceIndicator`, gated on `source === 'cached'` with `isComputing` guard and full `.catch()` error handling on both the outer check and inner rebuild chain

## Task Commits

Each task was committed atomically:

1. **Task 1: Add checkForUpdate function to dictionary.js** - `fcca9c6` (feat)
2. **Task 2: Wire fire-and-forget background check into content.js backgroundInit** - `0e345a0` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/dictionary.js` - Added `checkForUpdate` function (44 lines) and `window.WordleBot.checkForUpdate` export
- `src/content.js` - Added DICT-05/DICT-06 fire-and-forget background check block (22 lines) in `backgroundInit`

## Decisions Made
- checkForUpdate placed in dictionary.js, not content.js: dictionary.js owns all extraction and fingerprint logic; content.js only wires the call
- Fire-and-forget via `.then()` chain (not `await`): ensures suggestions render immediately from cache without waiting for background check
- `isComputing` guard before `processBoardState` in re-render path: background check resolves seconds after initial compute; guard prevents double-render but doesn't silence updates if no race occurs
- Two extractions on background update path is expected and correct: one inside `checkForUpdate` (detect change), one inside `loadDictionaryAndCaches(true)` (rebuild computational caches). Browser cache makes second extraction fast.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all private functions (`tryExtractionWithRetry`, `computeFingerprint`, `saveToCache`, `getBundledFingerprint`) were available within the dictionary.js IIFE scope as researched. Pitfall 4 (extractionResult.words, not bare object) was avoided per research guidance.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 complete: full stale-while-revalidate pattern operational
- DICT-01 through DICT-07 requirements all covered across phases 14-15
- Phase 16 can proceed -- no blockers from this phase
- The `window.WordleBot.checkForUpdate` export is available for any future testing or manual invocation

## Self-Check: PASSED

- FOUND: src/dictionary.js
- FOUND: src/content.js
- FOUND: 15-01-SUMMARY.md
- FOUND: fcca9c6 (Task 1 commit)
- FOUND: 0e345a0 (Task 2 commit)
- checkForUpdate defined and exported in dictionary.js (line 391)
- checkForUpdate called in content.js backgroundInit (fire-and-forget)

---
*Phase: 15-content-js-wiring-background-update-check*
*Completed: 2026-02-18*
