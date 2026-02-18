# Phase 17: Onboarding UI and Integration - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

First-time users see a single dismissable introduction inside the existing Shadow DOM panel that explains what WordleBot does, how to expand cards, and how to reset the dictionary — and it never appears again after dismissal. No new UI surfaces, permissions, or stylesheet files.

</domain>

<decisions>
## Implementation Decisions

### Overlay layout & style
- Full panel overlay — covers the entire suggestions area, user sees only onboarding until dismissed
- Match existing panel style — same colors, fonts, and feel as normal suggestions (cohesive, not special)
- Text only — no icons, illustrations, or visual elements beyond text and headings
- Include a welcome header (e.g., "Welcome to WordleBot") at the top, then tips below

### Content & messaging
- Casual & friendly tone — warm, conversational (not technical or terse)
- Simple & accessible explanation of what WordleBot does — no mention of entropy, frequency, or technical terms
- Three tips presented as numbered steps: 1. What it does, 2. Click to expand cards, 3. Shift+Refresh to reset dictionary
- Claude drafts all copy — user will review in the code

### Dismissal & transition
- Instant removal — no fade or animation, overlay disappears immediately on dismiss
- Suggestions appear instantly after dismissal — board state processed behind the overlay so suggestions are ready
- Primary "Got it" button — prominent, styled call to action (not a subtle text link)
- Dismissable via "Got it" button OR Escape key — keyboard-friendly alternative
- Write wordlebot_onboarded flag to storage BEFORE removing overlay — ensures persistence even if DOM removal fails

### Mounting strategy
- Option A: isOnboardingActive guard in processBoardState() — skips rendering while onboarding is visible
- Dedicated renderOnboarding() function — clear separation from the normal render flow
- On dismiss, immediately trigger suggestions render (not wait for next MutationObserver cycle)

### Claude's Discretion
- Post-dismiss trigger mechanism (immediate processBoardState call vs cached result display)
- Exact copy wording for all three onboarding tips
- Button styling details within existing panel patterns
- Escape key event listener placement and cleanup

</decisions>

<specifics>
## Specific Ideas

- Suggestions should be ready the instant the overlay is dismissed — no loading state or delay
- The overlay should feel like a natural part of the panel, not a modal or popup from a different design system

</specifics>

<deferred>
## Deferred Ideas

- Refine recommendation engine for first guesses — broaden the set of opening words the model naturally surfaces (e.g., CRANE, SLATE, ADIEU alongside TARES). Not hardcoded; the entropy/frequency model should be tuned to recommend a wider variety of strong openers. Add as future phase.

</deferred>

---

*Phase: 17-onboarding-ui-and-integration*
*Context gathered: 2026-02-18*
