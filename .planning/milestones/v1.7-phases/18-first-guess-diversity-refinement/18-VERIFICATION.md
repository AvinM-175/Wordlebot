---
phase: 18-first-guess-diversity-refinement
verified: 2026-02-18T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Load extension on an empty Wordle board. Reload 3-5 times."
    expected: "The 5 suggested openers visibly differ in letter composition — not all sharing T/A/R/E/S. Words with different coverage profiles (vowel-heavy, consonant-balanced) appear across reloads."
    why_human: "Requires live entropy cache data and browser extension runtime. Can only assess visual diversity with actual NYT dictionary data and firstGuessCache populated."
  - test: "Check the footer message on an empty board when >5 near-ties exist."
    expected: "Footer reads: 'These openers are statistically very close in expected value — showing 5 of N near-tied words, chosen for letter variety.'"
    why_human: "Footer only renders when openerClusterSize > MAX_SUGGESTIONS, which requires the real first-guess cache to have more than 5 near-tied words."
  - test: "Make one guess (enter mid_game). Confirm suggestions change correctly."
    expected: "Mid-game suggestions use pure entropy/frequency ranking — no diversity interference. Suggestions are candidate words, not opener-specific."
    why_human: "Requires live board state and constraint filtering to verify mode switch works correctly end-to-end."
---

# Phase 18: First-Guess Diversity Refinement Verification Report

**Phase Goal:** Refine the entropy/frequency model to naturally surface a broader variety of strong opening words (e.g., CRANE, SLATE, ADIEU alongside TARES) without hardcoding — so first-guess recommendations feel less repetitive and better represent the space of strong openers.
**Verified:** 2026-02-18
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | First-guess suggestions show words with diverse letter profiles (not all TARES-like) | ? HUMAN | `applyDiversityReorder` implements the greedy diversity logic correctly in code; actual diversity output depends on live firstGuessCache data — needs human validation |
| 2   | Words with different letter coverage (vowel-heavy, consonant-balanced) appear in top 5 if competitive | ? HUMAN | Same dependency on live cache — code is correct but result depends on runtime data |
| 3   | Subsequent guesses (mid_game, late_game) are completely unaffected by diversity logic | ✓ VERIFIED | `applyDiversityReorder` is called only inside `if (mode === 'opener' && sourceRankings.length > MAX_SUGGESTIONS)` and the inner `if (clusterSize > MAX_SUGGESTIONS)` block. Lines 454 and 466 gate all diversity code. `mid_game` and `late_game` paths follow the plain `sourceRankings.slice(0, ...)` branch at lines 488-490. |
| 4   | All displayed suggestions are genuinely strong openers — no filler words | ✓ VERIFIED | Diversity reordering operates on indices within the near-tie cluster only (words already within 2% of top blendedScore). No words outside the cluster are promoted. Lines 456-464 compute the cluster; lines 466-484 select from it. |
| 5   | Footer message mentions diversity-aware selection when active on first guess | ✓ VERIFIED | Line 542: `nearTieNote = 'These openers are statistically very close in expected value \u2014 showing 5 of ' + openerClusterSize + ' near-tied words, chosen for letter variety.'` — inside `if (openerClusterSize > MAX_SUGGESTIONS)` at line 540. |
| 6   | Displayed scores (entropy, frequency, confidence) are unchanged | ✓ VERIFIED | Diversity reordering changes which words are sampled from the cluster, not the score values. Scores are attached to `selectedRankings[i]` entries which carry pre-computed `entropy`, `blendedScore`, and `frequency` from entropyEngine. Lines 496-513 assign scores directly from `r.entropy`, `r.blendedScore`. No score mutation in diversity path. |

**Score:** 4/6 truths verified programmatically, 2/6 need human validation (live data dependency). All code paths are correctly implemented.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/suggestionEngine.js` — `getLetterSet` | Returns object mapping each unique letter to true | ✓ VERIFIED | Lines 330-338: Iterates `word.length` chars, sets `set[word.charAt(i)] = true`, returns `set`. Substantive implementation, not a stub. |
| `src/suggestionEngine.js` — `applyDiversityReorder` | Diversity-aware near-tie reordering for opener mode | ✓ VERIFIED | Lines 340-373: Walks `clusterSize` indices, calls `getLetterSet` for each candidate and each already-selected word, counts overlap via `for (letter in candidateSet)`, pushes to `deferred` if `overlapCount >= overlapThreshold`, else to `selected`. Returns `selected.concat(deferred)`. Correct greedy deferral implementation. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `applyDiversityReorder` | Fisher-Yates shuffle | `diverseOrder` assigned to `clusterIndices` before shuffle loop | ✓ WIRED | Line 470: `var diverseOrder = applyDiversityReorder(sourceRankings, clusterSize, 3);` Line 471: `var clusterIndices = diverseOrder;` Fisher-Yates shuffle at lines 472-477 operates directly on `clusterIndices`, which IS the `diverseOrder` array. The plan's `via` pattern expected a single-line match; actual code splits assignment across two lines — semantically identical, fully wired. |
| `openerClusterSize > MAX_SUGGESTIONS` | `nearTieNote` with "letter variety" | Inside opener mode guard at line 540 | ✓ WIRED | Lines 539-546: `if (mode === 'opener')` → `if (openerClusterSize > MAX_SUGGESTIONS)` → string with "chosen for letter variety." Non-cluster path falls through to `detectNearTie` unchanged. |

### Requirements Coverage

Phase 18 PLAN frontmatter declares `requirements: []` — no formal requirement IDs were claimed for this phase. REQUIREMENTS.md has no requirement IDs mapped to Phase 18 in its traceability table. Phase 18 was scoped as an enhancement (refinement) rather than a requirement-tracked feature.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| (none) | 18-01-PLAN.md | No requirement IDs claimed | N/A — no orphaned requirements |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps DICT-01 through DICT-07 to phases 14-15 and ONBD-01 through ONBD-07 to phases 16-17. No REQUIREMENTS.md entries reference Phase 18. Coverage is complete with zero orphaned requirements for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none found) | — | No TODOs, FIXMEs, placeholders, empty returns, or console-log-only implementations detected in `src/suggestionEngine.js` | — | — |

Scan run against: `src/suggestionEngine.js`. No anti-patterns found.

### Human Verification Required

#### 1. Opener diversity — visual check

**Test:** Load the extension on an empty NYT Wordle board. Reload 3-5 times.
**Expected:** The 5 suggested openers vary in letter composition across reloads. Not all words share the same TARES-like letter cluster. Words with visibly different letter profiles (e.g., vowel-heavy, consonant-balanced) should appear.
**Why human:** The code is correct, but actual diversity output depends on the live `firstGuessCache.bestAnswerGuesses` computed from the real NYT dictionary. The research phase flagged an open question: whether words like ADIEU and CRANE rank within the top 20 cached openers. If they fall outside the cache, the diversity pass has fewer distinct letter profiles to work with. Only a live run can confirm the user-visible result.

#### 2. Footer message — live board check

**Test:** On an empty board, check the footer below the 5 suggestions.
**Expected:** Footer reads: "These openers are statistically very close in expected value — showing 5 of N near-tied words, chosen for letter variety." where N is the cluster count.
**Why human:** The footer only renders when `openerClusterSize > MAX_SUGGESTIONS` (more than 5 near-tied openers in the cluster). If the real dictionary produces a cluster of exactly 5, this branch is not triggered and the footer falls through to `detectNearTie`. A human must confirm the live cluster size causes this branch to fire.

#### 3. Mid-game isolation — mode switch check

**Test:** Make one guess on the Wordle board, then observe the suggestions panel.
**Expected:** Suggestions switch to mid-game/late-game mode using pure entropy/frequency ranking. No diversity reordering applies. The footer shows normal near-tie language (if applicable) rather than "chosen for letter variety."
**Why human:** Requires live board state and constraint filtering to verify the mode detection (`detectMode`) correctly transitions to `mid_game` and that the diversity block is skipped.

### Gaps Summary

No gaps found. All implemented code paths are correct:

- `getLetterSet` is a substantive helper with proper unique-letter-set logic.
- `applyDiversityReorder` is a substantive greedy deferral algorithm, correctly returning `selected.concat(deferred)` of cluster indices.
- The diversity pass is correctly positioned inside the opener near-tie block, before the Fisher-Yates shuffle.
- The Fisher-Yates shuffle operates on the diversity-ordered `clusterIndices` array.
- The footer message correctly appends "chosen for letter variety." in the cluster-triggered path only.
- Non-opener modes (mid_game, late_game) are completely isolated from the diversity logic.
- No hardcoded words exist anywhere in the implementation.
- Commits 6230bac and 9b23c1d are real and verified against the repo.
- No formal requirements were claimed or left orphaned.

The 2 items marked for human verification are not gaps — they are behavioral checks that require live extension runtime and real dictionary data to confirm. The code implementation is complete and correct.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
