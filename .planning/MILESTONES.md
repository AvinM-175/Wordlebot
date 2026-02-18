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

## v1.7 — Dictionary Intelligence + Onboarding (2026-02-18)

**Phases:** 14-18 | **Source:** 4,976 LOC JS (+478/-101) | **Tag:** v1.7

**Delivered:** Smart dictionary change detection replacing the brittle 30-day cache timer, first-install onboarding for new users, and diversity-aware opener selection.

**Key accomplishments:**
1. Bundle URL cache infrastructure — O(1) staleness pre-check using stored bundle URL, replacing 30-day timer as primary signal
2. Stale-while-revalidate dictionary check — background fingerprint comparison detects same-URL content changes, triggers silent rebuild and re-render
3. First-install detection — three-state storage heuristic distinguishes fresh installs from pre-v1.7 upgrades
4. Onboarding overlay — dismissable Shadow DOM intro with three tips, "Got it"/Escape dismiss, and board-state guard
5. Diversity-aware opener selection — letter-overlap penalty in near-tie reordering surfaces varied strong openers

**Archive:** [v1.7-ROADMAP.md](./milestones/v1.7-ROADMAP.md)

---

