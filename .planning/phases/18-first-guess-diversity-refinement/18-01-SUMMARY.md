---
phase: 18-first-guess-diversity-refinement
plan: 01
subsystem: suggestionEngine
tags: [diversity, opener, near-tie, letter-coverage, fisher-yates]
dependency_graph:
  requires: []
  provides: [diversity-aware opener suggestions]
  affects: [src/suggestionEngine.js]
tech_stack:
  added: []
  patterns: [letter-set overlap comparison, greedy demotion with deferred queue]
key_files:
  created: []
  modified: [src/suggestionEngine.js]
decisions:
  - overlapThreshold=3 means words sharing 3+ unique letters with any selected word are deferred
  - Fisher-Yates shuffle preserved — diversity reorder operates on cluster indices before shuffle
  - Non-opener modes (mid_game, late_game) completely unaffected — guard is inside opener near-tie block only
metrics:
  duration: 1 min
  completed: 2026-02-18
  tasks_completed: 2
  files_modified: 1
---

# Phase 18 Plan 01: First-Guess Diversity Refinement Summary

Diversity-aware opener tie-breaking using letter-overlap penalty with greedy deferral at threshold=3.

## What Was Built

Added two helper functions to `src/suggestionEngine.js` and integrated them into the opener near-tie pipeline:

**`getLetterSet(word)`** — Returns an object mapping each unique letter in the word to `true`. Used for O(1) letter intersection comparisons.

**`applyDiversityReorder(sourceRankings, clusterSize, overlapThreshold)`** — Walks through the near-tie cluster in rank order, building a `selected` list (diverse words) and a `deferred` list (words that share >= `overlapThreshold` unique letters with any already-selected word). Returns `selected.concat(deferred)` — diverse words front-loaded in the cluster.

**Integration:** Inside the `if (clusterSize > MAX_SUGGESTIONS)` opener block, `applyDiversityReorder` is called with `overlapThreshold=3` before the Fisher-Yates shuffle. The result is assigned to `clusterIndices` directly. Fisher-Yates then shuffles these diversity-ordered indices. Because diverse words occupy the front, they survive the `.slice(0, MAX_SUGGESTIONS)` sampling more often than redundant words.

**Footer message** updated from:
```
"...showing 5 of N near-tied words."
```
to:
```
"...showing 5 of N near-tied words, chosen for letter variety."
```

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add diversity-aware near-tie reordering to opener pipeline | 6230bac | src/suggestionEngine.js |
| 2 | Update near-tie footer message for diversity-aware selection | 9b23c1d | src/suggestionEngine.js |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **overlapThreshold = 3** (per user decision from research phase) — Words sharing 3 or more unique letters with any already-selected word get deferred. This balances diversity against over-penalizing common letters.

2. **Greedy deferral preserves rank order within selected/deferred groups** — The selected array maintains original rank order among diverse words; deferred array maintains rank order among redundant words. Fisher-Yates then provides randomness across the full ordered sequence.

3. **No hardcoded word lists** — Diversity logic is purely letter-overlap math, agnostic to specific words.

## Self-Check: PASSED

- FOUND: src/suggestionEngine.js
- FOUND: 18-01-SUMMARY.md
- FOUND: commit 6230bac (Task 1)
- FOUND: commit 9b23c1d (Task 2)
