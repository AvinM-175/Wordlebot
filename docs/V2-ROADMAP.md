# Future V2 Considerations

WordleBot v1 is a complete, functional product. The following V2 considerations represent natural extensions that leverage the existing architecture. Each item is grounded in specific modules and code patterns already in place. None require fundamental rewrites -- they extend, not replace.

---

## Overview

| Item | Feature | Complexity | Ethical Impact | Priority Signal |
|------|---------|-----------|----------------|-----------------|
| V2-A | Learning from Guesses | Medium | Low (local only) | High -- most user-visible improvement |
| V2-B | Assisted Input | Medium | High (crosses assistance/automation line) | Medium -- requires careful UX |
| V2-C | Hard Mode Toggle | Small | None | High -- unlocks large user segment |
| V2-D | ML Fine-Tuning | Large | Medium (data source questions) | Low -- highest effort, least certain payoff |

---

## V2-A: Learning from User Guesses

**What It Enables:** WordleBot tracks the user's guess history across games (locally) and personalizes suggestions over time. By observing which types of words the user already knows, it adjusts rankings to surface words outside the user's comfort zone -- turning the tool into a vocabulary coach, not just a strategy coach.

**Current Architecture Hooks:**
- The extension already uses the browser's local storage APIs for panel state and computation cache. Extending this storage for guess history is a natural addition, not a new infrastructure pattern.
- The entropy engine's late-game urgency weights are already tunable constants. Personalized weights could replace the static defaults based on observed user patterns.
- The frequency scorer's weighted composite (positional, overall, and bigram components) could be adjusted per-user based on which letter patterns the user consistently plays.

**What's New:**
- A guess history storage module that reads and writes game records to local storage.
- A personalization engine that analyzes past guesses to derive user-specific weight adjustments for the frequency and urgency components.
- A "clear history" option in the panel, giving the user full control over stored data.

**Ethical Alignment:** Fully respects all five principles from UX-ETHICAL-CONSTRAINTS.md. All data stays local (Principle 2: Privacy by Architecture). No network calls are needed. The user can clear history at any time (Principle 5: User Agency and Control). Suggestions remain suggestions -- the user still types their own guesses (Principle 1: Assistance, Not Automation).

**Complexity:** Medium. Storage and weight adjustment are straightforward engineering. The personalization algorithm requires thoughtful design to avoid degrading suggestion quality -- naive adjustments could make suggestions worse, not better.

**Key Risks:**
- Personalization could degrade suggestion quality if the learning algorithm overweights sparse data or draws false patterns from a small sample.
- Convergence is inherently slow: Wordle allows one game per day, so building a meaningful user profile takes weeks of data.

---

## V2-B: Assisted Input (Type on Behalf)

**What It Enables:** The user double-clicks a suggestion to have WordleBot type the letters into the game input. The user must still manually press Enter to submit. This is a convenience feature that walks the line between assistance and automation.

**Current Architecture Hooks:**
- The panel already renders clickable suggestion cards with event delegation. Adding a double-click handler alongside the existing single-click expand is a natural extension of the interaction model.
- The content script has access to the game page DOM. No new manifest permissions would be required for dispatching keyboard events on the already-matched page.

**What's New:**
- A keyboard event dispatch module that simulates letter key presses into the game input.
- A double-click event handler on suggestion cards, distinct from the single-click expand behavior.
- Visual feedback in the panel showing which word is being typed.
- A settings toggle to enable or disable this feature, disabled by default.

**Ethical Alignment:** This is the one V2 item that directly tensions with Principle 1 (Assistance, Not Automation) from UX-ETHICAL-CONSTRAINTS.md. The current enforcement is absolute: no keyboard event dispatch code exists anywhere in the extension. V2-B would introduce it.

Mitigations that preserve the spirit of Principle 1:
- The feature is opt-in and disabled by default. Users must deliberately enable it.
- Only letters are typed, never Enter. The user must still submit the guess themselves.
- Double-click activation (not single-click) prevents accidental use.
- UX-ETHICAL-CONSTRAINTS.md would need an amendment acknowledging this controlled exception to the automation boundary.

The line between "coach" and "player" shifts but is not eliminated. The user still decides which word to play and must take the deliberate action of submitting it.

**Complexity:** Medium. Keyboard event dispatch is well-understood browser API work. The real complexity is in UX: the double-click versus single-click distinction must be reliable, and the feature must not create an accidental path to automation.

**Key Risks:**
- Users may perceive this as "cheating mode" even with safeguards, potentially undermining trust in WordleBot's coaching identity.
- The NYT game page could detect and block synthetic keyboard events, making the feature unreliable or entirely nonfunctional.

---

## V2-C: Hard Mode Toggle

**What It Enables:** A toggle in the panel enables hard mode constraints. When active, suggestions only include words that reuse all confirmed letters (green and yellow) from prior guesses. This serves the significant population of Wordle players who play in hard mode and currently receive suggestions that violate their game's rules.

**Current Architecture Hooks:**
- The constraint engine already processes green and yellow tile constraints through a two-pass system. Hard mode adds an additional "must reuse confirmed letters" filter on top of the existing filter chain.
- The constraint engine's extensible filter structure (greens, excluded positions, letter counts) naturally accommodates a new filter stage without modifying scoring logic.
- The panel already has a toggle pattern (the collapse button) that can be replicated for a hard mode switch.
- The constraint engine was architecturally designed for this extension (ADR-04 in AI-DESIGN-DECISIONS.md).

**What's New:**
- A hard-mode filter function in the constraint engine that enforces the rule: every yellow or green letter from prior guesses must appear in the next guess.
- A toggle button in the panel header area.
- Persistence of the hard mode preference to local storage so it survives page refreshes.

**Ethical Alignment:** Fully respects all five principles from UX-ETHICAL-CONSTRAINTS.md. No automation, no network calls, no solution leaks. Hard mode is purely a constraint modification that narrows the suggestion set -- it changes which words appear, not how the user interacts with them.

**Complexity:** Small. The constraint engine was designed with this extension in mind. The toggle UI is a known pattern already implemented for panel collapse. This is the lowest-effort V2 item with the highest architectural readiness.

**Key Risks:**
- Edge cases where hard mode constraints reduce candidates to zero. The existing empty-state handling already covers this scenario, but the user experience of "no valid words" may need additional explanation specific to hard mode.

---

## V2-D: ML Fine-Tuning of Frequency Tables

**What It Enables:** Replaces the static letter frequency tables (computed from the full dictionary at load time) with learned weights trained on actual Wordle answer distributions. Wordle answers tend to be common, recognizable words rather than obscure valid guesses. Trained tables could improve the frequency tie-breaker by reflecting this bias, making late-game suggestions more likely to be the actual answer.

**Current Architecture Hooks:**
- The frequency scorer consumes tables through a fixed interface (positional, overall, bigram components). The data source can change without modifying the scorer itself.
- The frequency tables module has a clean build, serialize, and restore pattern that could accept externally trained data alongside or instead of computed data.
- The cache system's fingerprint-based invalidation would naturally trigger a rebuild when tables change, requiring no special migration logic.

**What's New:**
- A training pipeline (offline, outside the extension) that analyzes historical Wordle answers to derive weighted frequency tables reflecting answer-word patterns.
- A mechanism to bundle trained tables as an alternative to the computed tables, potentially with a toggle between "standard" and "trained" frequency modes.
- Evaluation methodology to measure whether trained tables actually improve suggestion quality compared to the current computed tables.

**Ethical Alignment:** Respects Principles 1, 4, and 5 fully. Principle 2 (Privacy by Architecture) is respected if training happens offline on publicly available data -- no user data is involved. Principle 3 (No Solution Leaks) requires care: trained tables must reflect general letter-frequency patterns in answer words, not encode specific future answers. The tables must be a statistical model, not a lookup of the answer list.

**Complexity:** Large. The extension-side changes are small (swap one table source for another). The substantial work is entirely outside the extension: building an offline training pipeline, curating training data, evaluating output quality, and determining whether the improvement is statistically meaningful. This is a data science effort, not primarily an engineering effort.

**Key Risks:**
- Trained tables may not measurably improve suggestions. Entropy is the primary ranking signal; frequency is only a tie-breaker. Improving a tie-breaker has limited impact on the overall ranking.
- Overfitting to past answers could hurt performance on future answers if the NYT shifts its word selection patterns. The effort-to-impact ratio is the worst of all four V2 items.

---

## Deferred Items Not in V2 Scope

The following items are acknowledged but not scoped for V2. They represent valid future work that is either lower priority or dependent on external factors.

- **Cross-browser support (Firefox, Safari)** -- Requires WebExtensions API adaptation and separate testing environments. Worthwhile but independent of feature development.
- **Settings/options page** -- Low user value until V2 features create settings worth configuring. The current panel-based controls are sufficient for v1.
- **Remaining word browser ("show all N words")** -- Useful for power users who want to see the full candidate list, but not core to the suggestion and explanation mission.
- **Split guess vs solution word lists** -- Depends on obtaining and maintaining a curated answer-word list separate from the full valid-guess dictionary. Improves frequency scoring but introduces a maintenance burden.
- **Web Worker for opener computation** -- Performance optimization that offloads the first-guess entropy calculation to a background thread. Useful if startup latency becomes a user complaint, but not a feature.
