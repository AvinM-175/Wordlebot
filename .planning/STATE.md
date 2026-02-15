# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Help players understand *why* certain guesses are mathematically better
**Current focus:** Phase 14 — Dictionary Change Detection Infrastructure

## Current Position

Phase: 14 of 17 (Dictionary Change Detection Infrastructure)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-02-15 — Roadmap created for v1.7 (phases 14-17)

Progress: [░░░░░░░░░░] 0% (v1.7)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v1.7)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.5]: Shannon entropy primary, frequency tie-breaker; full dictionary stats; Shadow DOM isolation; requestIdleCallback non-blocking init; near-tie random sampling
- [v1.7 Roadmap]: bundleUrl stored in wordlebot_dict cache entry alongside words and fingerprint
- [v1.7 Roadmap]: wordlebot_onboarded excluded from clearCaches() — not a computational cache
- [v1.7 Roadmap]: Onboarding mounting strategy (Option A vs B) must be decided before Phase 17 — see research/PITFALLS.md Pitfall 3

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 14]: findBundleUrl() currently called inside dictExtractor.extract(). URL pre-check requires it callable earlier in loadFromCache(). Confirm viable at Phase 14 start.
- [Phase 17]: Mounting strategy undecided — (A) isOnboardingActive guard in processBoardState() vs (B) shadow root sibling mount. Must resolve before any UI code. Research recommends Option A.

## Session Continuity

Last session: 2026-02-15
Stopped at: Roadmap written for v1.7, ready to plan Phase 14
Resume file: None
