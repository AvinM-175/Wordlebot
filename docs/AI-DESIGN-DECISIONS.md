# AI Design Decisions

WordleBot's algorithmic core required numerous design choices balancing mathematical rigor, user experience, and computational performance. This document records the eight most significant decisions using Architecture Decision Record (ADR) format, preserving the context, alternatives, and tradeoffs for future maintainers.

---

### ADR-01: Entropy as Primary Scorer, Frequency as Tie-Breaker

**Status:** Accepted

**Context:** The initial design planned frequency-based scoring as the sole ranking mechanism, with entropy reserved for a future version. During development of the scoring engine, frequency-only ranking proved insufficient -- it ranks words with common letters highly regardless of their actual information value. Two words could have similar letter frequencies but vastly different abilities to narrow down the answer space.

**Decision:** Promote Shannon entropy to the primary ranking signal in the first release. Entropy is computed over all 243 possible feedback patterns (the complete set of green/yellow/gray combinations for a five-letter guess). A frequency composite score (weighted 60% positional, 30% overall, 10% bigram) breaks ties when two words have effectively identical entropy, and provides a human-readable "common letters" dimension for explanations.

**Alternatives Considered:**
- Pure frequency scoring: Fast to compute but mathematically unsound. It cannot distinguish between a word that happens to use common letters and one that genuinely partitions the candidate space efficiently.
- Pure entropy with no frequency component: Mathematically optimal but loses the intuitive "this word uses common letters" explanation dimension that helps users understand why a guess is strong.

**Consequences:**
- Computation is heavier -- every candidate is evaluated against all 243 feedback patterns for each possible secret word.
- Rankings are mathematically optimal for information gain, the gold standard for Wordle solvers.
- The frequency component gives users an intuitive rationale alongside the entropy score, supporting the extension's teaching mission.

---

### ADR-02: Explanations Designed Into Scoring, Not Bolted On

**Status:** Accepted

**Context:** Research on explainable AI recommends designing explanations into the system rather than generating them after the fact from opaque scores. A post-hoc explanation generator must reverse-engineer why a score is high, which can produce misleading or contradictory rationales.

**Decision:** The suggestion engine builds explanations directly from scoring components: entropy bits, letter frequency factors, near-tie detection, and likely-answer classification. Explanations are a first-class output of the scoring pipeline, not a separate module that interprets results.

**Alternatives Considered:**
- Post-hoc explanation generator that reverse-engineers high scores: Fragile and can produce misleading explanations when the true reason is a combination of factors.
- No explanations, just show rankings: Defeats WordleBot's core mission of helping users understand WHY a guess is strong, not just telling them WHAT to guess.

**Consequences:**
- Scoring modules must expose intermediate values (entropy in bits, frequency breakdown, urgency blend weight) rather than returning a single opaque score.
- Explanations are always consistent with actual ranking because they draw from the same data.
- Progressive disclosure (summary line plus expandable details) is possible because structured data exists at every level.

---

### ADR-03: Auto-Submit Intentionally Disabled

**Status:** Accepted

**Context:** Some Wordle helper extensions auto-type letters and submit guesses on behalf of the user. This fundamentally changes the user's relationship with the game, transforming a player into a spectator.

**Decision:** WordleBot shows suggestions and explanations only. The extension never simulates keyboard events, never manipulates game input elements, and never submits guesses. The manifest declares no permissions that would enable input injection -- only the "storage" permission is requested. Auto-submit is architecturally impossible, not merely disabled by a configuration flag.

**Alternatives Considered:**
- Auto-type with a confirmation dialog: Still crosses the automation line. An accidental click would submit a guess, and the presence of the option normalizes automation.
- Click-to-type (deferred to a potential future version): Preserves some user agency but requires careful UX design to prevent accidental submissions.

**Consequences:**
- Users must manually type their chosen word. This is a feature, not a limitation -- it keeps the player actively engaged in the game.
- The ethical boundary between assistance and automation is absolute and verifiable by inspecting the manifest and source code.
- No risk of accidental submissions or game-altering behavior.

---

### ADR-04: Hard Mode as Constraint, Not Separate Engine

**Status:** Accepted

**Context:** Wordle's hard mode requires reusing confirmed letters in subsequent guesses. This could be implemented as a completely separate scoring engine with different logic, or as an additional constraint layer on top of the existing engine.

**Decision:** Treat hard mode as additional filters in the constraint engine. The entropy and scoring engines remain identical regardless of mode -- only the candidate set changes. The constraint engine's extensible structure already supports adding new filter types without modifying scoring logic.

**Alternatives Considered:**
- Separate hard-mode engine with different scoring weights: Doubles the maintenance burden, risks divergent behavior between modes, and complicates testing.
- Ignore hard mode entirely: Limits product utility for the significant segment of Wordle players who prefer hard mode.

**Consequences:**
- Hard mode support is deferred to a future version but is architecturally planned. When implemented, it adds yellow-letter-must-be-reused filters without touching scoring logic.
- A single scoring pipeline serves both modes, keeping the codebase simple and testable.
- The constraint engine's modular design validates the separation of filtering from ranking.

---

### ADR-05: Two-Pass Duplicate-Letter Logic

**Status:** Accepted

**Context:** Duplicate letters in Wordle (words like TEETH, EERIE, SPEED) cause the most constraint bugs in solvers. A letter can appear as green in one position and gray in another within the same guess, meaning "exactly N copies" rather than simply "present" or "absent." Processing tiles left-to-right produces incorrect constraints for these cases.

**Decision:** Use a count-first-then-derive approach with two passes per guess. Pass one collects ALL tile feedback for each letter in the guess (counting greens, yellows, and grays separately). Pass two derives minimum and maximum letter counts from the complete picture. This prevents the classic bug where left-to-right processing marks a letter as absent before discovering it is green elsewhere.

**Alternatives Considered:**
- Single-pass left-to-right processing: Faster but produces incorrect constraints for duplicate letters. This is the number-one bug in Wordle solvers and eliminates valid candidates.
- Track exact global letter counts across all guesses: Correct but requires more complex state management than the per-guess snapshot approach, and makes per-guess delta explanations harder to compute.

**Consequences:**
- Correct handling of all duplicate-letter scenarios, including triples and beyond.
- Per-guess delta tracking enables accurate "this guess eliminated N candidates" explanations in the UI.
- Slightly more complex constraint derivation, but eliminates an entire class of bugs that plague other solvers.

---

### ADR-06: Adaptive Threshold at 20 Candidates

**Status:** Accepted

**Context:** When many candidates remain (hundreds or thousands), the best information-gain guess might not itself be a remaining candidate -- it is an "exploration" guess that maximally partitions the candidate space. When few candidates remain, exploration guesses add diminishing value because most candidates already separate well from each other.

**Decision:** Use an adaptive threshold of 20 candidates. Above 20 remaining candidates, the engine scores all dictionary words as potential guesses (exploration mode). At or below 20, it scores only the remaining candidates themselves (exploitation mode). The threshold of 20 balances computation cost against information value.

**Alternatives Considered:**
- Always score the full dictionary: Wasteful when only five candidates remain. Computation time scales with dictionary size unnecessarily and returns exploration guesses that provide negligible advantage.
- Always score only remaining candidates: Misses powerful exploration guesses early in the game when the candidate pool is large and a non-candidate word could partition the space far better than any candidate.
- User-configurable threshold: Adds settings complexity for minimal user benefit. Most players have no intuition for what this threshold should be.

**Consequences:**
- Early-game suggestions may include non-candidate exploration words that maximally partition the remaining space.
- Late-game suggestions are always playable candidates, which feels natural to the user.
- The fixed threshold avoids configuration complexity while providing near-optimal behavior across game states.

---

### ADR-07: Urgency Blending for Late-Game Suggestions

**Status:** Accepted

**Context:** Pure entropy ranking ignores word commonness. In the late game, when few guesses remain, a common word that is "good enough" informationally may be preferable to an obscure word with marginally higher entropy. Wordle answers tend to be common English words, so commonness is a useful proxy for answer likelihood.

**Decision:** Blend entropy with word commonness using urgency weights keyed to guesses remaining. With four or more guesses left, scoring is pure entropy (urgency weight of zero). With three guesses left, commonness receives 15% weight. With two left, 40%. On the final guess, scoring is 100% commonness -- the user must guess a likely answer, not gather information.

**Alternatives Considered:**
- Pure entropy always: Ignores the practical reality that obscure words are far less likely to be Wordle answers, especially on the final guess where information gathering is pointless.
- Hard cutoff (switch from entropy to frequency at a fixed guess number): Creates an abrupt behavior change that confuses users when suggestions suddenly shift character.
- User-configurable urgency weights: Deferred to a future version. The added complexity is not justified when the default weights perform well across game states.

**Consequences:**
- Suggestions naturally shift from "most informative" to "most likely answer" as the game progresses, matching how human players intuitively adjust strategy.
- Users see this reflected in explanations (e.g., "prioritizing common words with two guesses remaining").
- The urgency weights are defined as named constants, making future tuning straightforward.

---

### ADR-08: No Network Calls (Everything Local)

**Status:** Accepted

**Context:** A Chrome extension that reads game state could communicate with external servers, raising privacy, security, and trust concerns. Network calls could leak the day's answer, track user behavior, or introduce latency that degrades the experience.

**Decision:** Zero network communication. The dictionary is bundled as a static text file loaded from the extension's own resources. All computation -- entropy calculation, constraint filtering, frequency scoring -- runs entirely in the content script. The only manifest permission is "storage" (used for panel collapse state and computation cache). No background script exists.

**Alternatives Considered:**
- Server-side entropy computation: Enables more sophisticated models but introduces latency, privacy risk, server infrastructure cost, and a single point of failure.
- Telemetry for product improvement: Valuable usage data but violates the privacy-first principle and requires a privacy policy, consent flows, and server infrastructure.
- Dynamic dictionary updates via network: Could keep the word list current but requires network infrastructure and creates a dependency on an external service.

**Consequences:**
- The extension works fully offline after installation. No privacy concerns arise from usage.
- No server infrastructure to build, maintain, or pay for.
- Dictionary updates require publishing a new extension version rather than a server-side change.
- Users can independently verify the no-network claim by monitoring the DevTools Network panel during a full game session.
