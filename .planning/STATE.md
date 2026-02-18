# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Help players understand *why* certain guesses are mathematically better
**Current focus:** Phase 15 — Content.js Wiring — Background Update Check

## Current Position

Phase: 15 of 17 (Content.js Wiring — Background Update Check)
Plan: 1 of 1 in current phase (COMPLETE)
Status: Phase 15 complete — ready to plan Phase 16
Last activity: 2026-02-18 — Phase 15 plan 01 complete

Progress: [████░░░░░░] 30% (v1.7)

## Performance Metrics

**Velocity:**
- Total plans completed: 2 (v1.7)
- Average duration: 1 min
- Total execution time: 2 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14-01 | 1 | 1 min | 1 min |
| 15-01 | 1 | 1 min | 1 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.5]: Shannon entropy primary, frequency tie-breaker; full dictionary stats; Shadow DOM isolation; requestIdleCallback non-blocking init; near-tie random sampling
- [v1.7 Roadmap]: bundleUrl stored in wordlebot_dict cache entry alongside words and fingerprint
- [v1.7 Roadmap]: wordlebot_onboarded excluded from clearCaches() — not a computational cache
- [v1.7 Roadmap]: Onboarding mounting strategy (Option A vs B) must be decided before Phase 17 — see research/PITFALLS.md Pitfall 3
- [14-01]: findBundleUrl exported from dictExtractor (not duplicated in dictionary.js) — dictExtractor owns URL discovery
- [14-01]: findBundleUrl called in loadDictionary before loadFromCache, passed as arg (not called inside loadFromCache)
- [14-01]: URL pre-check guard: both currentBundleUrl and cacheData.bundleUrl must be non-null for comparison to run — pre-Phase-14 cache entries fall through to 30-day timer
- [14-01]: urlResult[0] used to normalize findBundleUrl array return — Strategy 1 unshifts primary bundle to position 0
- [15-01]: checkForUpdate placed in dictionary.js (not content.js) — dictionary.js owns all extraction and fingerprint logic
- [15-01]: Fire-and-forget via .then() chain (not await) — ensures suggestions render immediately from cache without blocking on background check
- [15-01]: isComputing guard before processBoardState in re-render path — prevents race with initial compute; background check latency (500ms-12s) makes race unlikely
- [15-01]: clearCaches() before loadDictionaryAndCaches(true) — two extractions on background update path is expected and correct; browser cache makes second extraction fast

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 14 RESOLVED]: findBundleUrl() was private inside dictExtractor IIFE — now exported as public API in 14-01
- [Phase 17]: Mounting strategy undecided — (A) isOnboardingActive guard in processBoardState() vs (B) shadow root sibling mount. Must resolve before any UI code. Research recommends Option A.

## Session Continuity

Last session: 2026-02-18
Stopped at: Phase 15-01 complete — stale-while-revalidate background update check fully wired
Resume file: None
