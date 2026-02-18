# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Help players understand *why* certain guesses are mathematically better
**Current focus:** Phase 18 — First-Guess Diversity Refinement

## Current Position

Phase: 18 of 18 (First-Guess Diversity Refinement)
Plan: 1 of 1 in current phase (COMPLETE)
Status: Phase 18 plan 01 complete — diversity-aware opener tie-breaking implemented
Last activity: 2026-02-18 — Phase 18 plan 01 complete

Progress: [██████░░░░] 50% (v1.8)

## Performance Metrics

**Velocity:**
- Total plans completed: 4 (v1.7)
- Average duration: 1.5 min
- Total execution time: 6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14-01 | 1 | 1 min | 1 min |
| 15-01 | 1 | 1 min | 1 min |
| 16-01 | 1 | 1 min | 1 min |
| 17-01 | 1 | 3 min | 3 min |
| 18-01 | 1 | 1 min | 1 min |

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
- [16-01]: detectFirstInstall placed in content.js (not dictionary.js) — detection is a content script concern about user state, not a dictionary concern
- [16-01]: window.WordleBot.isFirstInstall initialized to null — null means not-yet-determined; Phase 17 checks === true so null correctly maps to "don't show onboarding"
- [16-01]: catch sets detectionStored = null (not {}) — empty object would look like fresh install; storage failure must default to false (safe default)
- [16-01]: Normalization guard checks detectionStored !== null before accessing .wordlebot_onboarded — skip write if storage read failed
- [16-01]: Normalization write is fire-and-forget (.catch, no await) — does not block dictionary loading or suggestion rendering
- [17-01]: processBoardState hoisted to module scope — dismissOnboarding (module scope) requires access to it; was previously nested inside backgroundInit
- [17-01]: lastSuggestions assignment outside !isOnboardingActive guard — suggestions pre-computed during onboarding for instant reveal on dismiss
- [17-01]: renderOnboarding() and dismissOnboarding() not exported to window.WordleBot — internal content.js implementation
- [18-01]: overlapThreshold=3 — words sharing 3+ unique letters with any selected word are deferred to back of near-tie cluster
- [18-01]: Fisher-Yates shuffle preserved after diversity reorder — diversity-ordered indices are shuffled, diverse words survive sampling more often
- [18-01]: applyDiversityReorder only runs inside opener near-tie block — mid_game/late_game modes completely unaffected

### Roadmap Evolution

- Phase 18 added: First-Guess Diversity Refinement — broaden opener diversity in entropy/frequency model

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 14 RESOLVED]: findBundleUrl() was private inside dictExtractor IIFE — now exported as public API in 14-01
- [Phase 17 RESOLVED]: Mounting strategy — Option A (isOnboardingActive guard in processBoardState) implemented in 17-01

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 18-01-PLAN.md
Resume file: .planning/phases/18-first-guess-diversity-refinement/18-01-SUMMARY.md
