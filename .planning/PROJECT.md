# WordleBot

## What This Is

A Chrome extension (Manifest V3) that provides real-time, entropy-based word suggestions directly on the NYT Wordle page. Reads the game board, ranks candidates by information gain, and shows explained suggestions in a floating side panel. Runs entirely in-browser with no network calls.

## Core Value

Help players understand *why* certain guesses are mathematically better — a strategy coach, not an auto-player.

## Requirements

### Validated

- Board state extraction from NYT Wordle DOM — v1.5
- Constraint filtering (green/yellow/gray with duplicate letter handling) — v1.5
- Shannon entropy ranking with dual tracks (info gain + answer-oriented) — v1.5
- Frequency-based scoring (positional, overall, bigram) — v1.5
- Urgency blending (exploration early, exploitation late) — v1.5
- Runtime dictionary extraction from NYT JS bundle — v1.5
- Three-tier dictionary cascade (extract > cache > bundled fallback) — v1.5
- Shadow DOM panel with theme matching (dark/light) — v1.5
- Progressive disclosure (3-state card expansion) — v1.5
- MutationObserver auto-updates on board state changes — v1.5
- Near-tie detection with random sampling for openers — v1.5
- Late-game candidate classification (likely_answer vs rare_valid) — v1.5
- Non-blocking loading via requestIdleCallback — v1.5
- Game-over states: solved summary + lost state — v1.5

### Active

(None — next milestone not yet planned)

### Out of Scope

- Hard mode toggle — planned for V2 (V2-C in V2-ROADMAP.md)
- Assisted input / type-on-behalf — ethical concerns (V2-B)
- Learning from user guess history — needs weeks of data (V2-A)
- ML fine-tuning of frequency tables — high effort, uncertain payoff (V2-D)
- Cross-browser support (Firefox, Safari) — requires separate testing
- Automated test suite — manual TEST-CHECKLIST.md used currently

## Context

Shipped v1.5 with 4,434 LOC JavaScript across 11 modules.
Tech stack: Chrome Extension (Manifest V3), vanilla JS, Shadow DOM, chrome.storage.local.
Dictionary: 13,751 5-letter words extracted from NYT Wordle's JS bundle.
NYT merged their solution + guess lists into a single combined list — no separate "answer" list available.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shannon entropy as primary signal | Information-theoretic optimal for narrowing candidates | Good — surfaces strong openers naturally |
| Frequency as tie-breaker only | Entropy dominates; frequency just differentiates equal-entropy words | Good — prevents obscure words from ranking when entropy is tied |
| Compute stats over full dictionary | No separate answer list available (NYT merged them) | Good — pragmatic given NYT's change |
| Shadow DOM isolation | Prevents NYT style interference with panel | Good — zero style conflicts observed |
| requestIdleCallback for init | Non-blocking: user can play while engine initializes | Good — panel shows loading state, game is playable |
| 30-day cache staleness | Balance between freshness and avoiding repeated extraction | Revisit — could miss NYT dictionary updates |
| Near-tie random sampling | Avoids deterministic top-5 that looks "hardcoded" | Good — each refresh shows different near-tied openers |

## Constraints

- No keyboard event dispatch (Principle 1: Assistance, Not Automation)
- No network calls beyond NYT page resources (Principle 2: Privacy by Architecture)
- No solution list access or leaking (Principle 3: No Solution Leaks)
- All data stays local in chrome.storage.local (Principle 2)
- Single permission: "storage" only

---
*Last updated: 2026-02-12 after v1.5 milestone*
