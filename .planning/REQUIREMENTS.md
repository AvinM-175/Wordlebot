# Requirements: WordleBot

**Defined:** 2026-02-14
**Core Value:** Help players understand *why* certain guesses are mathematically better

## v1.7 Requirements

Requirements for v1.7: Dictionary Intelligence + Onboarding.

### Dictionary Change Detection

- [ ] **DICT-01**: Extension stores the NYT bundle URL alongside the cached dictionary for future comparison
- [ ] **DICT-02**: On page load with a fresh cache, extension compares stored bundle URL against current bundle URL to detect dictionary changes
- [ ] **DICT-03**: When bundle URL changes, extension re-extracts the dictionary and rebuilds computational caches automatically
- [ ] **DICT-04**: When bundle URL matches (no change), extension serves cached dictionary with zero extraction overhead
- [ ] **DICT-05**: After serving cached dictionary, extension checks for content changes in the background without blocking suggestions
- [ ] **DICT-06**: If background check detects a fingerprint mismatch (same URL, different content), extension rebuilds caches and re-renders suggestions
- [ ] **DICT-07**: 30-day staleness timer remains as a fallback for cases where bundle URL cannot be determined

### First-Install Onboarding

- [ ] **ONBD-01**: Extension detects first-install state via chrome.storage.local flag (no background service worker needed)
- [ ] **ONBD-02**: Extension distinguishes true first-install from existing users upgrading to v1.7 (existing cache data = existing user, skip onboarding)
- [ ] **ONBD-03**: First-time users see a dismissable onboarding intro explaining how the extension works
- [ ] **ONBD-04**: Onboarding covers three topics: what WordleBot does, click cards to expand details, Shift+Refresh to reset dictionary
- [ ] **ONBD-05**: User can dismiss onboarding with a clear action ("Got it" button) and it never appears again
- [ ] **ONBD-06**: Onboarding dismissal state persists across page reloads and browser restarts
- [ ] **ONBD-07**: Onboarding renders inside the existing Shadow DOM panel (no new UI surfaces or permissions)

## Future Requirements

### v2 (Deferred)

- **UPD-01**: "What's New" onboarding shown after extension updates with new features
- **HELP-01**: Persistent help button in panel for re-accessing onboarding tips

## Out of Scope

| Feature | Reason |
|---------|--------|
| Background service worker for install detection | Unnecessary complexity; storage-flag approach works in content scripts |
| External hashing libraries | crypto.subtle.digest already proven in codebase |
| Options page or popup for onboarding | Extension has no popup/options page; Shadow DOM panel is the UI surface |
| Full SHA-256 on every page load as primary detection | Performance overhead; bundle URL comparison is cheaper and sufficient |
| Hard mode toggle | Deferred to V2 |
| Automated test suite | Manual TEST-CHECKLIST.md used currently |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DICT-01 | — | Pending |
| DICT-02 | — | Pending |
| DICT-03 | — | Pending |
| DICT-04 | — | Pending |
| DICT-05 | — | Pending |
| DICT-06 | — | Pending |
| DICT-07 | — | Pending |
| ONBD-01 | — | Pending |
| ONBD-02 | — | Pending |
| ONBD-03 | — | Pending |
| ONBD-04 | — | Pending |
| ONBD-05 | — | Pending |
| ONBD-06 | — | Pending |
| ONBD-07 | — | Pending |

**Coverage:**
- v1.7 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after initial definition*
