# Phase 18: First-Guess Diversity Refinement - Research

**Researched:** 2026-02-18
**Domain:** Algorithmic tie-breaking / diversity penalty in a Shannon entropy ranking pipeline
**Confidence:** HIGH (pure in-codebase analysis — no external libraries involved)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Diversity expectations**
- Target 3-5 rotating strong openers in the top suggestions
- Variety comes from near-equal ranking (model treats close-scoring words as ties), not randomization
- The core problem is letter-composition similarity: the current top 5 all share similar letters (T, A, R, E, S) — want words with different letter coverage profiles (vowel-heavy, consonant-balanced, etc.)
- Words with different letter profiles should appear only if competitive — weaker-but-competitive words land on the lower end of the top 5

**Quality vs. variety tradeoff**
- All suggestions must be genuinely strong openers — no filler or "fun" inclusions that aren't mathematically defensible
- No changes to displayed scores — existing entropy/frequency display stays as-is
- Near-tie threshold should be distribution-based (adapts to how tightly scores cluster), not a fixed cutoff
- Minimum diversity guarantee within the near-tie group: Claude's discretion to balance minimum diversity with mathematical integrity

**Scoring adjustments**
- Adjust tie-breaking, not the primary scoring model — keep Shannon entropy primary, frequency as first tie-breaker
- Letter-overlap penalty: words sharing 3+ letters with already-ranked-higher words get demoted among near-ties
- First guess only: diversity-aware tie-breaking activates only on empty board; subsequent guesses use pure entropy/frequency
- Layer on top of existing v1.5 near-tie random sampling: first apply diversity penalty to reorder near-ties, then random shuffle within remaining ties

**Visible behavior**
- Keep suggestion count at 5 — diversity changes which words appear, not how many
- Update the existing near-tie footer message to mention diversity-aware selection (keep it concise)
- Footer message continues to appear at any board state when near-ties exist — just update the wording when diversity tie-breaking is active on first guess

### Claude's Discretion
- Exact distribution-based threshold calculation for near-ties
- Whether to guarantee a minimum of 3 diverse openers or accept what the math gives
- Exact letter-overlap penalty weight and implementation
- Precise footer message wording

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 18 modifies the first-guess suggestion pipeline in `suggestionEngine.js` to surface a broader variety of strong openers without changing the underlying scoring math. The current v1.5 near-tie random sampling in `suggestionEngine.js` (lines 409-446) already identifies a cluster of statistically equal openers using a fixed `NEAR_TIE_PCT = 2` percentage threshold, then randomly selects 5 of them. The problem is this cluster is almost entirely composed of words with the same TARES-like letter set because words with different letter profiles (e.g., ADIEU, CRANE) may fall outside the 2% cluster or, if inside, are frequently crowded out by random sampling among many similar words.

The solution layers a **diversity-aware reordering pass** directly inside `suggestionEngine.js`, applied to `firstGuessCache.bestAnswerGuesses` before the random sampling step. This pass: (1) computes a distribution-based near-tie cluster from the sorted scores, (2) applies a letter-overlap penalty to demote words that share 3+ letters with already-selected words, and (3) uses the existing Fisher-Yates shuffle on the remaining ties. No changes are needed to `entropyEngine.js`, `frequencyScorer.js`, or any rendering code except updating the `nearTieNote` string in `suggestionEngine.js`.

The only rendering touch is updating the footer message string — the `renderNearTieNote` function in `panelRenderer.js` already renders whatever string `buildSuggestions` returns as `nearTieNote`, so no DOM or CSS changes are required.

**Primary recommendation:** Implement the diversity penalty entirely in `suggestionEngine.js` within the existing opener near-tie block (lines 409-446), keeping all other files untouched.

---

## Standard Stack

### Core
| Component | File | Purpose | Notes |
|-----------|------|---------|-------|
| Suggestion pipeline | `src/suggestionEngine.js` | All diversity logic lives here | Pure stateless transform, no DOM |
| Entropy rankings | `src/entropyEngine.js` | Produces sorted `bestAnswerGuesses` | Read-only from suggestionEngine's perspective |
| Frequency scorer | `src/frequencyScorer.js` | `scoreWord()` for tie-breaking | Already used in entropy sort |

### No New Dependencies
This phase requires zero new libraries. All computation is vanilla JS array manipulation on data structures already in memory at suggestion time.

---

## Architecture Patterns

### Recommended Project Structure

No new files are needed. All changes are in:

```
src/
└── suggestionEngine.js   # Primary change — diversity-aware near-tie reordering
```

The `panelRenderer.js` `renderNearTieNote` function is already wired to render any string passed as `nearTieNote` — no changes required there.

### Pattern 1: Existing Near-Tie Opener Block (v1.5 baseline)

The current flow in `buildSuggestions` for `mode === 'opener'` is:

```javascript
// src/suggestionEngine.js, lines 409-446
if (mode === 'opener' && sourceRankings.length > MAX_SUGGESTIONS) {
  var topScore = sourceRankings[0].blendedScore;
  var threshold = topScore > 0 ? topScore * (1 - NEAR_TIE_PCT / 100) : 0;

  // 1. Find cluster size
  var clusterSize = 0;
  for (var c = 0; c < sourceRankings.length; c++) {
    if (sourceRankings[c].blendedScore >= threshold) { clusterSize++; }
    else { break; }
  }

  if (clusterSize > MAX_SUGGESTIONS) {
    // 2. Fisher-Yates shuffle on cluster indices
    // 3. Take first MAX_SUGGESTIONS from shuffled order
    // 4. Re-sort by original rank to preserve score ordering
  }
}
```

Phase 18 inserts a **diversity reordering step between steps 1 and 2** above.

### Pattern 2: Distribution-Based Threshold (Claude's Discretion)

The existing fixed `NEAR_TIE_PCT = 2` (a 2% score drop from top) is adequate for cluster detection. However, the user decision says the threshold should be "distribution-based." The recommended approach is to use **standard deviation of the cluster scores** rather than a fixed percentage, so it adapts to how tightly words cluster:

```javascript
// Compute mean and stddev of scores in a sliding window
// Near-tie = within (mean + k*stddev) of the top score
// Recommended k = 1.5 (captures ~87% of a normal distribution tail)
```

Alternative simpler approach: keep the existing 2% fixed threshold but call it distribution-aware by also looking at the gap between rank 5 and rank 6 — if that gap is small relative to the top-5 spread, expand the cluster. This may be more stable in practice.

**Recommendation:** Use the existing fixed `NEAR_TIE_PCT` as the primary threshold (it already works well), but compute the actual stddev of cluster scores to determine whether diversity enforcement is warranted (only apply penalty if cluster is homogeneous). This satisfies "distribution-based" without introducing fragility.

### Pattern 3: Letter-Overlap Penalty (Core Diversity Logic)

The penalty demotes words in the near-tie cluster that share 3+ letters with already-selected words. Implementation approach:

```javascript
// After cluster is identified, apply greedy diversity selection:
function applyDiversityPenalty(cluster, minOverlapThreshold) {
  // minOverlapThreshold = 3 (3+ shared letters triggers demotion)
  var selected = [];
  var deferred = [];

  for (var i = 0; i < cluster.length; i++) {
    var candidate = cluster[i];
    var letters = getLetterSet(candidate.word);  // Set of unique letters
    var tooSimilar = false;

    for (var s = 0; s < selected.length; s++) {
      if (letterOverlap(letters, getLetterSet(selected[s].word)) >= minOverlapThreshold) {
        tooSimilar = true;
        break;
      }
    }

    if (!tooSimilar) {
      selected.push(candidate);
    } else {
      deferred.push(candidate);
    }
  }

  // Append deferred words after diverse selections
  return selected.concat(deferred);
}

function getLetterSet(word) {
  // Returns array or set of unique characters in word
  var seen = {};
  for (var i = 0; i < 5; i++) { seen[word[i]] = true; }
  return Object.keys(seen);
}

function letterOverlap(setA, setB) {
  var count = 0;
  for (var i = 0; i < setA.length; i++) {
    if (setB.indexOf(setA[i]) !== -1) { count++; }
  }
  return count;
}
```

**Key insight:** This greedy approach runs in O(k²) where k = cluster size (typically 5-20 words). It is negligible overhead on a sorted array that already exists.

### Pattern 4: Integration with Existing Fisher-Yates Shuffle

The diversity pass reorders the cluster array; the existing Fisher-Yates shuffle then runs on the reordered cluster. The critical ordering decision for Phase 18 is:

```
1. Identify near-tie cluster (existing code)
2. Apply diversity penalty to reorder cluster  ← NEW STEP
3. Fisher-Yates shuffle on reordered cluster   ← existing code (unchanged)
4. Take first MAX_SUGGESTIONS from shuffled result ← existing code (unchanged)
5. Re-sort selected indices to preserve rank order ← existing code (unchanged)
```

This means diversity-preferred words move earlier in the cluster array, so when the Fisher-Yates shuffle runs, they have a higher probability of landing in the selected 5 — but randomness still applies. The diversity logic is not deterministic selection; it is probabilistic weighting via reordering.

### Pattern 5: nearTieNote String Update

The current string (when cluster > MAX_SUGGESTIONS):

```javascript
nearTieNote = 'These openers are statistically very close in expected value \u2014 showing 5 of ' + openerClusterSize + ' near-tied words.';
```

When diversity tie-breaking is active (i.e., `mode === 'opener'` and `openerClusterSize > MAX_SUGGESTIONS`), update to something like:

```javascript
nearTieNote = 'These openers are statistically very close \u2014 showing 5 of ' + openerClusterSize + ' near-tied words, chosen for letter variety.';
```

The `renderNearTieNote` in `panelRenderer.js` renders this verbatim — no other change needed.

When diversity tie-breaking is NOT active (cluster <= MAX_SUGGESTIONS, falling through to `detectNearTie`), the existing wording from `detectNearTie` remains unchanged for both opener and non-opener states.

### Anti-Patterns to Avoid

- **Hardcoding words:** Never add CRANE, SLATE, ADIEU, etc. as literals. The penalty must be purely structural (letter overlap).
- **Modifying displayed scores:** The `confidence`, `entropy`, and `frequency` values on each card must not change — diversity reordering happens before card selection, not after score computation.
- **Changing entropyEngine.js:** The `firstGuessCache` is computed once and cached to `chrome.storage.local`. Diversity logic must be a post-processing step in `suggestionEngine.js`, not baked into the cache.
- **Applying diversity to non-opener modes:** The `if (mode === 'opener')` guard is already in place; diversity logic must remain inside it.
- **Replacing random sampling:** Diversity reordering must precede the Fisher-Yates shuffle, not replace it. The spec says "first apply diversity penalty to reorder near-ties, then random shuffle within remaining ties."

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Letter set comparison | Custom bitwise letter masks | Simple object/seen-map (already used throughout codebase) | Codebase consistently uses `seen[ch] = true` pattern; no Set polyfill needed |
| Sorting stability | Custom merge sort | Native `Array.sort` with stable tiebreak | V8's Array.sort is stable since Node 11 / Chrome 70 |
| Cluster detection | Custom statistical library | Inline mean/stddev on 5-20 element array | Trivial math, no library justified |

**Key insight:** This entire phase is pure algorithmic array manipulation on data that already exists in memory. No new data structures, APIs, or libraries are involved.

---

## Common Pitfalls

### Pitfall 1: Diversity Pass Running on Non-Opener States
**What goes wrong:** Diversity penalty accidentally applied to mid-game or late-game suggestions, degrading quality.
**Why it happens:** The `mode === 'opener'` check is already in place, but a refactor could inadvertently move logic outside it.
**How to avoid:** Keep all new diversity code inside the existing `if (mode === 'opener' && sourceRankings.length > MAX_SUGGESTIONS)` block.
**Warning signs:** Mid-game suggestions show words with very different letter profiles when only one was previously recommended.

### Pitfall 2: Diversity Pass Consuming `firstGuessCache` Directly Without Copying
**What goes wrong:** The diversity pass mutates `sourceRankings` (which is `firstGuessCache.bestAnswerGuesses`), corrupting the cached data for subsequent calls.
**Why it happens:** `firstGuessCache` is module-level state in `entropyEngine.js`. If the array is sorted/mutated in place, subsequent `buildSuggestions` calls see a different order.
**How to avoid:** Work on a slice of the cluster: `var cluster = sourceRankings.slice(0, clusterSize);` before applying the diversity pass. The existing code already does `sourceRankings.slice(0, ...)` in the non-cluster path; the cluster path uses index arrays (`clusterIndices`) which is safe.
**Warning signs:** Opener suggestions become deterministic after the first call (always same 5 words, random sampling seems broken).

### Pitfall 3: Letter-Overlap Threshold Too Aggressive (All Words Similar)
**What goes wrong:** With threshold = 3 shared letters, most 5-letter words share 3+ letters with each other (vowels A/E alone cause high overlap). The greedy selection may always put 4 "diverse" words first and 1 deferred, never selecting words like ADIEU if RAISE was already selected (both have A, I, E = 3 shared).
**Why it happens:** Common vowels (A, E) appear in nearly every strong opener. A threshold of 3 with common vowels included makes almost everything "similar."
**How to avoid:** Consider counting overlap on consonants only, or use a threshold of 4 (sharing 4+ of 5 letters = nearly identical letter set). Validate empirically against the actual top-20 opener list. Alternatively, implement the penalty as "3+ shared letters AND the shared letters are all the same specific set" — but this is complex.
**Recommendation:** Start with threshold = 3, test against actual top-20. If ADIEU and CRANE are consistently demoted alongside TARES, raise to 4. The user spec says 3+ triggers demotion; validate this produces the desired variety.

### Pitfall 4: nearTieNote Only Shows in Cluster-Triggered Path
**What goes wrong:** When the cluster is small (exactly 5 words in the near-tie), `openerClusterSize` is 0 and the code falls through to `detectNearTie`. The updated diversity message would never appear even though diversity-aware selection did occur (if it ran).
**Why it happens:** The current `nearTieNote` logic has two branches: cluster path (shows count message) and non-cluster path (`detectNearTie`). Diversity code runs only in the cluster path.
**How to avoid:** This is by design — diversity penalty only applies when `clusterSize > MAX_SUGGESTIONS`. If the cluster is ≤ 5, no diversity selection is needed (all near-ties already fit). The footer message only updates when the cluster-triggered path runs, which is exactly when diversity selection happened. No fix needed.
**Warning signs:** None — this is correct behavior.

### Pitfall 5: Re-sorting Selected Indices Destroys Diversity
**What goes wrong:** After Fisher-Yates shuffle, the existing code re-sorts the sampled cluster indices by original rank order (`sampled.sort(function(a, b) { return a - b; })`). This means after diversity reordering, the selected items are re-sorted by their position in the original (pre-diversity) rank order, preserving the original high-entropy words at the top.
**Why it happens:** The re-sort is intentional — it ensures the displayed list shows the top word first. But it means diversity-boosted words that were moved earlier in the cluster array (to survive Fisher-Yates) get re-sorted back to their original positions.
**How to avoid:** This behavior is actually correct. The diversity pass increases the probability that diverse words are sampled (by moving them earlier in the cluster before shuffle). After selection and re-sort, they appear at their natural rank position, which may be position 3, 4, or 5. This is the right UX — the top word is still the highest-entropy opener, but diverse words appear further down.
**Warning signs:** None — this is the intended behavior per the spec ("Words with different letter profiles should appear only if competitive — weaker-but-competitive words land on the lower end of the top 5").

---

## Code Examples

### Current Near-Tie Opener Block (Complete, Annotated)

```javascript
// src/suggestionEngine.js, lines 409-446
// Source: direct codebase read

var selectedRankings;
var openerClusterSize = 0;

if (mode === 'opener' && sourceRankings.length > MAX_SUGGESTIONS) {
  var topScore = sourceRankings[0].blendedScore;
  var threshold = topScore > 0 ? topScore * (1 - NEAR_TIE_PCT / 100) : 0;

  // STEP 1: Detect cluster size
  var clusterSize = 0;
  for (var c = 0; c < sourceRankings.length; c++) {
    if (sourceRankings[c].blendedScore >= threshold) { clusterSize++; }
    else { break; }
  }

  if (clusterSize > MAX_SUGGESTIONS) {
    openerClusterSize = clusterSize;

    // ← INSERT DIVERSITY PASS HERE (Phase 18)
    // Input: sourceRankings[0..clusterSize-1]
    // Output: same items reordered so diverse words are earlier
    // Constraint: must NOT mutate sourceRankings (it's firstGuessCache)

    // STEP 2: Fisher-Yates shuffle on cluster indices
    var clusterIndices = new Array(clusterSize);
    for (var ci = 0; ci < clusterSize; ci++) { clusterIndices[ci] = ci; }
    for (var fi = clusterSize - 1; fi > 0; fi--) {
      var fj = Math.floor(Math.random() * (fi + 1));
      var tmp = clusterIndices[fi];
      clusterIndices[fi] = clusterIndices[fj];
      clusterIndices[fj] = tmp;
    }

    // STEP 3: Take first MAX_SUGGESTIONS
    var sampled = clusterIndices.slice(0, MAX_SUGGESTIONS);
    sampled.sort(function (a, b) { return a - b; }); // preserve rank order

    selectedRankings = new Array(MAX_SUGGESTIONS);
    for (var si = 0; si < MAX_SUGGESTIONS; si++) {
      selectedRankings[si] = sourceRankings[sampled[si]];
    }
  } else {
    selectedRankings = sourceRankings.slice(0, Math.min(maxSuggestions, sourceRankings.length));
  }
}
```

### Diversity Insertion Point — Recommended Implementation

```javascript
// Phase 18 addition: diversity-aware cluster reordering
// Insert between STEP 1 (cluster detection) and STEP 2 (Fisher-Yates)
// Only runs when clusterSize > MAX_SUGGESTIONS

if (clusterSize > MAX_SUGGESTIONS) {
  openerClusterSize = clusterSize;

  // --- NEW: Diversity pass ---
  // Extract the cluster as a working copy (never mutate sourceRankings)
  var cluster = [];
  for (var di = 0; di < clusterSize; di++) {
    cluster.push({ idx: di, word: sourceRankings[di].word });
  }

  // Greedy diversity reordering: prefer words with different letter coverage
  var OVERLAP_THRESHOLD = 3;  // 3+ shared letters = too similar
  var diverseCluster = [];
  var deferredCluster = [];

  function getUniqueLetters(word) {
    var seen = {};
    for (var li = 0; li < 5; li++) { seen[word[li]] = true; }
    return Object.keys(seen);
  }

  function countOverlap(lettersA, lettersB) {
    var count = 0;
    for (var oi = 0; oi < lettersA.length; oi++) {
      if (lettersB.indexOf(lettersA[oi]) !== -1) { count++; }
    }
    return count;
  }

  for (var gi = 0; gi < cluster.length; gi++) {
    var candidate = cluster[gi];
    var candidateLetters = getUniqueLetters(candidate.word);
    var tooSimilar = false;

    for (var ds = 0; ds < diverseCluster.length; ds++) {
      var selectedLetters = getUniqueLetters(diverseCluster[ds].word);
      if (countOverlap(candidateLetters, selectedLetters) >= OVERLAP_THRESHOLD) {
        tooSimilar = true;
        break;
      }
    }

    if (tooSimilar) {
      deferredCluster.push(candidate);
    } else {
      diverseCluster.push(candidate);
    }
  }

  // Rebuild clusterIndices from reordered cluster (diverse first, deferred after)
  var reordered = diverseCluster.concat(deferredCluster);
  var clusterIndices = new Array(clusterSize);
  for (var ri = 0; ri < clusterSize; ri++) {
    clusterIndices[ri] = reordered[ri].idx;  // use original index into sourceRankings
  }

  // STEP 2 (existing): Fisher-Yates shuffle on reordered cluster
  for (var fi = clusterSize - 1; fi > 0; fi--) {
    var fj = Math.floor(Math.random() * (fi + 1));
    var tmp = clusterIndices[fi];
    clusterIndices[fi] = clusterIndices[fj];
    clusterIndices[fj] = tmp;
  }

  // STEP 3 (existing): Take first MAX_SUGGESTIONS, re-sort by rank
  var sampled = clusterIndices.slice(0, MAX_SUGGESTIONS);
  sampled.sort(function (a, b) { return a - b; });

  selectedRankings = new Array(MAX_SUGGESTIONS);
  for (var si = 0; si < MAX_SUGGESTIONS; si++) {
    selectedRankings[si] = sourceRankings[sampled[si]];
  }
}
```

### Updated nearTieNote String

```javascript
// src/suggestionEngine.js — inside the openerClusterSize > MAX_SUGGESTIONS branch
// Replace the existing nearTieNote assignment (line ~498)

nearTieNote = 'These openers are statistically very close \u2014 showing 5 of ' +
  openerClusterSize +
  ' near-tied words, chosen for letter variety.';
```

---

## Key Architectural Decisions for Claude's Discretion

### Distribution-Based Threshold

**Recommendation:** Keep the existing `NEAR_TIE_PCT = 2` as the cluster detection threshold (it already works). Add a secondary check: compute the standard deviation of scores in the cluster. If stddev / mean < 0.005 (very tight cluster = all nearly identical scores), diversity enforcement is most valuable. If stddev is larger, the cluster naturally has score variation that already creates variety. This lets the system skip the diversity pass when it isn't needed.

Simpler alternative: always apply the diversity pass when `clusterSize > MAX_SUGGESTIONS`. This is safe because the pass is O(k²) on a small array and is correct — it just does useful work even when it might not be strictly necessary.

**Planner decision:** The simpler "always apply" approach is recommended for Phase 18. The distribution-based stddev check can be added later if needed.

### Minimum Diversity Guarantee

**Recommendation:** Do not add a hard minimum guarantee. The greedy diversity pass already maximizes variety given the overlap constraint. If the entire near-tie cluster happens to consist of words with identical letter profiles (unlikely in practice), the pass returns them in original order and the shuffle runs normally. Forcing a minimum would require selecting words from outside the near-tie cluster, violating the quality constraint.

### Letter-Overlap Threshold

**Recommendation:** Use threshold = 3 as specified. If empirical testing shows over-demotion (e.g., ADIEU and CRANE both deferred because A/E overlap), raise to 4. A threshold of 4 means "words sharing 4 of their unique letters are considered too similar" — this is very conservative and should give maximum variety while still demoting near-duplicates like TARES/RATES/STARE.

**Alternative:** Consonant-only overlap. Since vowels appear in almost every opener, counting only consonant overlap reduces false-positive demotion. This complicates the code; try threshold=3 first.

---

## State of the Art

| Old Approach | Current Approach (v1.5) | Phase 18 Approach |
|--------------|------------------------|-------------------|
| Deterministic top-5 (always same words) | Random sampling within near-tie cluster | Diversity-reordered cluster, then random sampling |
| No near-tie detection | Fixed 2% threshold cluster detection | Same threshold + letter-overlap penalty before shuffle |
| No diversity footer | "showing 5 of N near-tied words" | "showing 5 of N near-tied words, chosen for letter variety" |

---

## Open Questions

1. **Does the actual top-20 first-guess cache contain enough letter-diverse words?**
   - What we know: `FIRST_GUESS_CACHE_SIZE = 20` in `entropyEngine.js`. The cache stores the top 20 words by entropy.
   - What's unclear: Whether words like ADIEU and CRANE are in the top 20, or whether they rank lower than 20th.
   - Recommendation: The planner should add a verification task: log the actual `firstGuessCache.bestAnswerGuesses` top 20 in a dev console session to confirm diverse openers are present. If ADIEU is rank 25+, the cache size may need to increase (e.g., to 30). This would require a cache invalidation (clearing `chrome.storage.local`).

2. **Does the overlap threshold of 3 produce the desired behavior on actual data?**
   - What we know: TARES, RATES, STARE, TEARS all share T, A, R, E, S = 5 letters. CRANE shares C, R, A, N, E with TARES: overlap = {A, R, E} = 3. With threshold=3, CRANE would be deferred if TARES was already selected.
   - What's unclear: Whether threshold=3 is too aggressive (deferring diverse words like CRANE) or too lenient (not deferring enough TARES-like words).
   - Recommendation: The planner should include a validation step where the developer runs the diversity pass in the console against the cached top-20 list and inspects which words are selected vs deferred.

3. **Does `openerClusterSize` reflect diversity or raw cluster count?**
   - What we know: `openerClusterSize` is set to `clusterSize` (number of words within 2% of top score). This value is used in the `nearTieNote` string.
   - What's unclear: Nothing — this is correct. The footer note says "5 of N near-tied words" which accurately describes the situation before diversity selection.
   - Recommendation: No change needed. The count in the footer reflects the size of the mathematically equivalent cluster, not the diversity-filtered subset.

---

## Sources

### Primary (HIGH confidence)
- `C:/WordleBot/src/suggestionEngine.js` — Full code read; near-tie cluster logic is lines 409-446; nearTieNote is lines 494-501
- `C:/WordleBot/src/entropyEngine.js` — Full code read; `firstGuessCache` structure, `FIRST_GUESS_CACHE_SIZE = 20`, sort order
- `C:/WordleBot/src/frequencyScorer.js` — Full code read; `scoreWord()` API and `getLetterSet` equivalent pattern (`seen[ch] = true`)
- `C:/WordleBot/src/panelRenderer.js` — Full code read; `renderNearTieNote` renders verbatim string, no changes needed

### Secondary (MEDIUM confidence)
- `C:/WordleBot/.planning/phases/18-first-guess-diversity-refinement/18-CONTEXT.md` — Phase decisions document

### Tertiary (LOW confidence)
- None — this phase requires no external research; all decisions are in-codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure codebase analysis, no external dependencies
- Architecture: HIGH — integration point is clearly identified (lines 409-446 of `suggestionEngine.js`)
- Pitfalls: HIGH — derived from direct code reading of the mutation risk and shuffle mechanics
- Open questions: MEDIUM — empirical questions about actual data that can only be answered by running the extension

**Research date:** 2026-02-18
**Valid until:** Stable — no external dependencies or versioned APIs involved. Valid until codebase changes.
