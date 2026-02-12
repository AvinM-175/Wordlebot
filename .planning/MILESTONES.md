# Milestones

## v1.5 — Frequency Analysis + Polish (2026-02-12)

**Phases:** 1-13 | **Source:** 4,434 LOC JS (11 modules) | **Tag:** v1.5

**Delivered:** Full-featured Wordle assistant Chrome extension with entropy-based ranking, frequency analysis, runtime dictionary extraction, and polished UI.

**Key accomplishments:**
1. Runtime dictionary extraction from NYT Wordle's JS bundle with 3-tier fallback cascade
2. Shannon entropy ranking engine with urgency-based blending (exploration to exploitation)
3. Frequency analysis: positional, overall, and bigram statistics over 13,751-word dictionary
4. Shadow DOM panel with dark/light theme detection, progressive disclosure, and MutationObserver auto-updates
5. Opener near-tie random sampling with statistical disclaimer
6. Edge case fixes: click handler leak, game-lost state, fallback dictionary labeling

**Archive:** [v1.5-ROADMAP.md](./milestones/v1.5-ROADMAP.md)
