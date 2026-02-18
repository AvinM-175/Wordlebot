# Roadmap: WordleBot

## Milestones

- ✅ **v1.5 Frequency Analysis + Polish** - Phases 1-13 (shipped 2026-02-12)
- 🚧 **v1.7 Dictionary Intelligence + Onboarding** - Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.5 Frequency Analysis + Polish (Phases 1-13) - SHIPPED 2026-02-12</summary>

Phases 1-13 delivered the full-featured WordleBot extension: runtime dictionary extraction, Shannon entropy ranking, frequency analysis, Shadow DOM UI, and all v1.5 polish. See `.planning/milestones/v1.5-ROADMAP.md` for details.

</details>

### 🚧 v1.7 Dictionary Intelligence + Onboarding (In Progress)

**Milestone Goal:** Replace the brittle 30-day cache timer with content-aware dictionary change detection, and give first-time users a one-time guided introduction to the extension.

#### Phase 14: Dictionary Change Detection Infrastructure

**Goal:** The dictionary module stores bundle URL as part of the cache entry and uses it as an O(1) pre-check for staleness, so the extension can detect NYT dictionary updates from cache alone — before any extraction occurs.
**Depends on:** Phase 13 (v1.5 complete)
**Requirements:** DICT-01, DICT-04, DICT-07
**Success Criteria** (what must be TRUE):
  1. After a successful dictionary extraction, the cached entry includes the bundle URL alongside words and fingerprint
  2. On page load with a fresh cache, the extension serves cached words immediately when the stored URL matches the current bundle URL — no extraction runs
  3. When the 30-day timer expires and no bundle URL can be determined, the cache is treated as stale and extraction is triggered as before
**Plans:** 1 plan

Plans:
- [x] 14-01-PLAN.md — Export findBundleUrl, add URL pre-check to loadFromCache, store bundleUrl in saveToCache

#### Phase 15: Content.js Wiring — Background Update Check

**Goal:** After returning cached words to the caller immediately, the extension runs a non-blocking background check that re-extracts the dictionary if the bundle URL changed or if the content fingerprint differs — then silently re-renders suggestions with the updated dictionary.
**Depends on:** Phase 14
**Requirements:** DICT-02, DICT-03, DICT-05, DICT-06
**Success Criteria** (what must be TRUE):
  1. Suggestions appear immediately from cache on every page load — no perceptible delay from the background check
  2. When the NYT bundle URL changes between page loads, the extension automatically re-extracts the dictionary and rebuilds caches without any user action
  3. When the bundle URL is the same but the content fingerprint differs (same URL, new content), the extension detects the mismatch in the background and re-renders suggestions using the updated dictionary
  4. The browser console shows a log entry indicating whether a re-extraction was triggered by URL change or fingerprint mismatch, distinguishing it from timer-based fallback
**Plans:** 1/1 plans complete

Plans:
- [ ] 15-01-PLAN.md — Add checkForUpdate to dictionary.js and wire fire-and-forget background check into content.js

#### Phase 16: First-Install Detection Logic

**Goal:** The extension reliably identifies whether the current user is a genuine first-time installer or a pre-v1.7 existing user, using only chrome.storage.local — so onboarding is shown exactly to the right audience.
**Depends on:** Phase 14
**Requirements:** ONBD-01, ONBD-02
**Success Criteria** (what must be TRUE):
  1. A user who installs the extension for the first time (no prior WordleBot storage) is flagged as a first-install at startup
  2. A user who installed WordleBot before v1.7 (wordlebot_dict or wordlebot_cache present in storage) is treated as an existing user and skipped for onboarding — even though wordlebot_onboarded is absent
  3. The detection logic runs synchronously with the init flow and does not delay dictionary loading or suggestion rendering
**Plans:** 1/1 plans complete

Plans:
- [ ] 16-01-PLAN.md — Add detectFirstInstall helper and wire detection into loadDictionaryAndCaches

#### Phase 17: Onboarding UI and Integration

**Goal:** First-time users see a single dismissable introduction inside the existing Shadow DOM panel that explains what WordleBot does, how to expand cards, and how to reset the dictionary — and it never appears again after dismissal.
**Depends on:** Phase 16
**Requirements:** ONBD-03, ONBD-04, ONBD-05, ONBD-06, ONBD-07
**Success Criteria** (what must be TRUE):
  1. On first install, the panel displays an onboarding overlay covering: what WordleBot does, clicking cards to expand details, and Shift+Refresh to reset the dictionary
  2. The onboarding overlay has a "Got it" button; clicking it dismisses the overlay and transitions the panel to the normal suggestions view
  3. After dismissal, reloading the page or restarting the browser never shows the onboarding again
  4. The panel renders the onboarding overlay inside the existing Shadow DOM without any new UI surfaces, permissions, or stylesheet files
  5. The board state update cycle does not overwrite the onboarding overlay while it is visible
**Plans:** 1/1 plans complete

Plans:
- [ ] 17-01-PLAN.md — Add onboarding overlay CSS to panelUI.js and full onboarding lifecycle to content.js

#### Phase 18: First-Guess Diversity Refinement

**Goal:** Refine the entropy/frequency model to naturally surface a broader variety of strong opening words (e.g., CRANE, SLATE, ADIEU alongside TARES) without hardcoding — so first-guess recommendations feel less repetitive and better represent the space of strong openers.
**Depends on:** Phase 17
**Plans:** 1/1 plans complete

Plans:
- [ ] 18-01-PLAN.md — Add diversity-aware near-tie reordering and update footer message

## Progress

**Execution Order:** 14 → 15 → 16 → 17 → 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-13. v1.5 phases | v1.5 | Complete | Complete | 2026-02-12 |
| 14. Dictionary Change Detection Infrastructure | v1.7 | 1/1 | Complete | 2026-02-17 |
| 15. Content.js Wiring — Background Update Check | v1.7 | Complete    | 2026-02-18 | - |
| 16. First-Install Detection Logic | v1.7 | Complete    | 2026-02-18 | - |
| 17. Onboarding UI and Integration | v1.7 | Complete    | 2026-02-18 | - |
| 18. First-Guess Diversity Refinement | v1.7 | Complete    | 2026-02-18 | - |
