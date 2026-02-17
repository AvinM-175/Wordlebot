# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Help players understand *why* certain guesses are mathematically better
**Current focus:** Phase 15 — Content.js Wiring — Background Update Check

## Current Position

Phase: 15 of 17 (Content.js Wiring — Background Update Check)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-02-17 — Phase 14 complete, verified

Progress: [███░░░░░░░] 25% (v1.7)

## Performance Metrics

**Velocity:**
- Total plans completed: 1 (v1.7)
- Average duration: 1 min
- Total execution time: 1 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14-01 | 1 | 1 min | 1 min |

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 14 RESOLVED]: findBundleUrl() was private inside dictExtractor IIFE — now exported as public API in 14-01
- [Phase 17]: Mounting strategy undecided — (A) isOnboardingActive guard in processBoardState() vs (B) shadow root sibling mount. Must resolve before any UI code. Research recommends Option A.

## Session Continuity

Last session: 2026-02-17
Stopped at: Phase 14 complete and verified, ready to plan Phase 15
Resume file: None
