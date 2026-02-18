# Phase 18: First-Guess Diversity Refinement - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Refine the entropy/frequency model's tie-breaking behavior so first-guess recommendations naturally surface a broader variety of strong opening words (e.g., CRANE, SLATE, ADIEU alongside TARES) without hardcoding. The change targets first-guess (empty board) only — subsequent guesses are unaffected.

</domain>

<decisions>
## Implementation Decisions

### Diversity expectations
- Target 3-5 rotating strong openers in the top suggestions
- Variety comes from near-equal ranking (model treats close-scoring words as ties), not randomization
- The core problem is letter-composition similarity: the current top 5 all share similar letters (T, A, R, E, S) — want words with different letter coverage profiles (vowel-heavy, consonant-balanced, etc.)
- Words with different letter profiles should appear only if competitive — weaker-but-competitive words land on the lower end of the top 5

### Quality vs. variety tradeoff
- All suggestions must be genuinely strong openers — no filler or "fun" inclusions that aren't mathematically defensible
- No changes to displayed scores — existing entropy/frequency display stays as-is
- Near-tie threshold should be distribution-based (adapts to how tightly scores cluster), not a fixed cutoff
- Minimum diversity guarantee within the near-tie group: Claude's discretion to balance minimum diversity with mathematical integrity

### Scoring adjustments
- Adjust tie-breaking, not the primary scoring model — keep Shannon entropy primary, frequency as first tie-breaker
- Letter-overlap penalty: words sharing 3+ letters with already-ranked-higher words get demoted among near-ties
- First guess only: diversity-aware tie-breaking activates only on empty board; subsequent guesses use pure entropy/frequency
- Layer on top of existing v1.5 near-tie random sampling: first apply diversity penalty to reorder near-ties, then random shuffle within remaining ties

### Visible behavior
- Keep suggestion count at 5 — diversity changes which words appear, not how many
- Update the existing near-tie footer message to mention diversity-aware selection (keep it concise)
- Footer message continues to appear at any board state when near-ties exist — just update the wording when diversity tie-breaking is active on first guess

### Claude's Discretion
- Exact distribution-based threshold calculation for near-ties
- Whether to guarantee a minimum of 3 diverse openers or accept what the math gives
- Exact letter-overlap penalty weight and implementation
- Precise footer message wording

</decisions>

<specifics>
## Specific Ideas

- Existing footer says: "These openers are statistically very close in expected value — showing 5 of 9 near-tied words." — update this to reflect diversity-aware selection on first guess, keep it concise
- ADIEU (vowel-heavy) should appear in top 5 if competitive with TARES (consonant-balanced) — it may rank lower but should be present
- The v1.5 near-tie random sampling mechanism stays — diversity tie-breaking layers on top of it, not replaces it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-first-guess-diversity-refinement*
*Context gathered: 2026-02-18*
