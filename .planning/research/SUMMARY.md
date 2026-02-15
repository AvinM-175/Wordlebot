# Project Research Summary

**Project:** WordleBot v1.7
**Domain:** Chrome Extension MV3 — dictionary change detection + first-install onboarding
**Researched:** 2026-02-14
**Confidence:** HIGH

## Executive Summary

WordleBot v1.7 adds two focused features to an already-working MV3 Chrome extension (4,434 LOC, 12 modules, no background service worker). The key architectural insight from research is that this extension has no background script, which rules out `chrome.runtime.onInstalled` for first-install detection and mandates a `chrome.storage.local` sentinel approach. Both features can be implemented entirely with APIs already in use — zero new libraries, zero new permissions, and only one manifest change (adding `onboarding.js` to the content scripts list).

The recommended approach for dictionary change detection is a stale-while-revalidate pattern: return cached words immediately for zero latency impact, then run extraction in the background and compare fingerprints. If the fingerprint changes, silently rebuild and re-render. This replaces the brittle 30-day timer with content-aware invalidation. The bundle URL itself (which contains a webpack content hash) serves as a cheap O(1) pre-check before triggering the more expensive SHA-256 extraction and comparison. For first-install onboarding, a `wordlebot_onboarded` flag in `chrome.storage.local` checked at init time is the correct and simple pattern — but it must distinguish true first installs from pre-v1.7 users who simply lack the key.

The highest-risk pitfall across both features is the interaction between the onboarding overlay and the existing render pipeline: `panelRenderer.render()` calls `body.innerHTML = ''` on every board state update, which will silently wipe an onboarding overlay injected into the panel body. The safe mitigation is either an `isOnboardingActive` guard in `processBoardState()` or mounting the onboarding as a sibling of `.panel` inside the shadow root (not inside `.body`). This must be decided before any onboarding UI code is written.

## Key Findings

### Recommended Stack

Both features require no new dependencies. Every needed API is already in the codebase. `crypto.subtle.digest('SHA-256', ...)` is already used in `dictionary.js` lines 37-48 and extends naturally to hashing the extracted word array. `chrome.storage.local` is the canonical state store used throughout — adding `bundleUrl`/`bundleHash` fields to the existing `wordlebot_dict` entry and a new `wordlebot_onboarded` key is all the storage work required. The Shadow DOM panel in `panelUI.js` is the correct host for the onboarding overlay.

**Core technologies:**
- `crypto.subtle.digest('SHA-256', ...)`: fingerprint computation — already proven in `dictionary.js`; no library needed
- `chrome.storage.local`: all persistent state including onboarding sentinel — already granted, already used
- Shadow DOM (`panelUI.js`): onboarding overlay host — already isolates extension UI from NYT page styles
- `performance.getEntriesByType('resource')`: synchronous bundle URL discovery — already used in `dictExtractor.js` Strategy 1
- `TextEncoder`: encode strings for hashing — already used in `dictionary.js` line 40

**Do NOT add:** background service worker, external hashing library, any UI framework, onboarding library, localStorage for onboarding state (per-origin, not per-extension).

See `.planning/research/STACK.md` for full details.

### Expected Features

**Must have (table stakes):**
- First-install onboarding shown once, covering: what WordleBot does, click-to-expand cards, Shift+Refresh to reset dictionary
- Onboarding is dismissable with "Got it" and never shows again after dismissal
- Dictionary cache invalidates when NYT actually updates their content (not on a timer)
- Zero latency impact on cache hits — fast path must not be blocked by change detection

**Should have:**
- Bundle URL comparison as O(1) pre-check before expensive extraction (URL contains webpack content hash)
- Onboarding visible during loading state so the wait is informative, not blank
- Clear logging to distinguish URL-hash-based staleness triggers from timer-based fallback

**Defer to v1.x after validation:**
- `lastDetectedBundleUrl` tracked separately for debugging
- Onboarding re-trigger mechanism (triple-click or DevTools console)

**Defer to v2+:**
- "What's New" onboarding on version update (requires `lastSeenVersion` + version comparison)
- Settings panel or options page

**Anti-features to avoid:**
- `chrome.runtime.onInstalled` from content script (silently does nothing — no background script exists)
- SHA-256 over word array on every page load as a "change detector" (runs before extraction; word-array hashing requires extraction first)
- Timer reduction (24-hour timer vs 30-day) — wrong model; use content-aware detection instead
- Multi-step wizard or modal overlay (no popup/options page surface; panel body is the only UI)

See `.planning/research/FEATURES.md` for full details including the dependency graph and MVP checklist.

### Architecture Approach

Both features integrate into the existing `content.js` orchestration layer with minimal surface area. Dictionary change detection adds one new exported function `checkForUpdate(cachedResult)` to `dictionary.js` — a pure addition that runs extraction in the background after the cache fast path returns. First-install onboarding adds one new module `onboarding.js` that renders into the existing Shadow DOM panel body and is called from `content.js`'s `backgroundInit()` after `loadDictionaryAndCaches()` completes. CSS for onboarding is appended to the existing `createStyles()` function in `panelUI.js` — no new stylesheet.

**Modified/new components after v1.7:**
1. `dictionary.js` — add `checkForUpdate(cachedResult)` function; also store `bundleUrl` in `saveToCache()`
2. `onboarding.js` (new) — first-install overlay, dismiss flow, `wordlebot_onboarded` storage write
3. `panelUI.js` — append onboarding CSS classes to `createStyles()`
4. `content.js` — wire non-blocking `checkForUpdate()` call after cache hit; add onboarding gate after dict load
5. `manifest.json` — add `src/onboarding.js` to content scripts list (after `panelUI.js`, before `content.js`)

**Storage after v1.7:**

| Key | Cleared by clearCaches()? | Purpose |
|-----|--------------------------|---------|
| `wordlebot_dict` | Yes | Extracted dictionary + fingerprint + new `bundleUrl`/`bundleHash` fields |
| `wordlebot_cache` | Yes | Freq tables + entropy cache |
| `wordlebot_onboarded` | **No** | First-install sentinel — must survive cache clears |

**Critical:** `wordlebot_onboarded` must be explicitly excluded from `clearCaches()`. It is not a computational cache.

See `.planning/research/ARCHITECTURE.md` for data flow diagrams and build order.

### Critical Pitfalls

1. **`chrome.runtime.onInstalled` from content script silently does nothing** — There is no background service worker. This event never fires in content scripts. Use `chrome.storage.local.get('wordlebot_onboarded')` absence check at startup instead. No manifest change required.

2. **Extension update shows onboarding to all existing pre-v1.7 users** — The absence of `wordlebot_onboarded` is identical for a true first install and a user who installed before v1.7. Mitigation: if `wordlebot_dict` or `wordlebot_cache` already exists in storage, treat as existing user and skip onboarding. This heuristic correctly protects pre-v1.7 users.

3. **`body.innerHTML = ''` in `panelRenderer.render()` destroys the onboarding overlay** — `processBoardState()` triggers a render within 1-2 seconds of page load, wiping any content injected into `.body`. Choose one mitigation before writing UI code: (A) `isOnboardingActive` flag that prevents `processBoardState()` from calling `panelRenderer.render()` while onboarding is visible, or (B) mount onboarding as a sibling of `.panel` inside the shadow root, not inside `.body`.

4. **Fingerprint false-positives from unsorted word arrays** — `computeFingerprint()` sorts words before hashing. If any new code path hashes words without sorting first, fingerprints will never match even for identical word sets, triggering cache rebuilds on every load. Never store or compare a fingerprint not computed via `computeFingerprint()`. Add a comment documenting this invariant.

5. **Onboarding dismissed state lost on async write race** — If the tab closes between the overlay hiding and `chrome.storage.local.set()` completing, the dismissed flag is never persisted. Write storage first and hide the overlay in the `.then()` callback — guarantees persistence before UI confirmation.

6. **SHA-256 computation on main thread before `requestIdleCallback`** — All fingerprint computation must remain inside the `scheduleCompute` / `requestIdleCallback` callback. Verify in DevTools Performance profile on cold load.

See `.planning/research/PITFALLS.md` for the full "Looks Done But Isn't" checklist and recovery strategies.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Dictionary Change Detection Infrastructure
**Rationale:** The `bundleUrl` storage field is a prerequisite for URL-based staleness detection. `checkForUpdate()` in `dictionary.js` is a self-contained pure addition testable before touching `content.js`. Dictionary logic has no dependency on onboarding — start here.
**Delivers:** Smart cache invalidation that detects NYT dictionary updates without a 30-day wait; bundle URL stored in cache entry.
**Addresses:** "Dictionary cache invalidates when NYT updates content" (table stakes), "Bundle URL comparison as O(1) pre-check" (differentiator).
**Avoids:** Pitfall 4 (unsorted fingerprint false-positives), Pitfall 6 (SHA-256 on main thread).
**Files changed:** `dictionary.js` only.
**Research flag:** Skip — patterns are well-documented in existing codebase. `checkForUpdate()` follows same pattern as existing `tryExtractionWithRetry()`.

### Phase 2: Content.js Wiring — Background Update Check
**Rationale:** `content.js` change depends on Phase 1 (`checkForUpdate()` must exist). Isolated to the stale-while-revalidate call after cache hit; no onboarding dependency.
**Delivers:** Non-blocking background dictionary check on every page load; silent re-render when dictionary changes; source indicator update.
**Implements:** Stale-while-revalidate pattern (ARCHITECTURE.md Pattern 1).
**Avoids:** Zero latency impact on fast path (suggestions appear immediately from cache; background check runs after).
**Files changed:** `content.js`.
**Research flag:** Skip — pattern is well-described in ARCHITECTURE.md with concrete code examples.

### Phase 3: First-Install Detection Logic
**Rationale:** Detection logic must be correct before any onboarding UI is built. Writing and testing the heuristic (existing cache = existing user) in isolation prevents the most damaging pitfall (Pitfall 2 — showing onboarding to all pre-v1.7 users).
**Delivers:** Reliable first-install vs existing-user distinction; `wordlebot_onboarded` sentinel written on dismiss.
**Addresses:** Pitfall 1 (`onInstalled` anti-pattern), Pitfall 2 (update shows onboarding to existing users).
**Files changed:** Logic can be developed in `onboarding.js` stub or directly in `content.js` — decision for planning.
**Research flag:** Skip — storage flag pattern is well-established; the heuristic (check for existing `wordlebot_dict`/`wordlebot_cache`) is clearly specified in PITFALLS.md.

### Phase 4: Onboarding UI and Integration
**Rationale:** UI work comes after detection logic is proven correct (Phase 3). The mounting point decision (panel body + `isOnboardingActive` guard vs. shadow root sibling) must be made first and cannot be changed after UI is built.
**Delivers:** `onboarding.js` module with panel overlay, "Got it" dismiss button, transition to normal suggestions flow; onboarding CSS in `panelUI.js`; manifest update adding `onboarding.js`.
**Addresses:** "First-install onboarding shown once" (table stakes), "Onboarding visible during loading state" (differentiator).
**Avoids:** Pitfall 3 (`body.innerHTML = ''` destroying overlay), Pitfall 5 (async dismiss write race).
**Files changed:** `onboarding.js` (new), `panelUI.js`, `content.js`, `manifest.json`.
**Research flag:** Needs attention — the render lifecycle interaction (Pitfall 3) requires a deliberate mounting decision before coding. Recommend confirming Option A vs Option B with a quick prototype of the `isOnboardingActive` guard before full implementation.

### Phase Ordering Rationale

- Dictionary work precedes onboarding work: no shared dependencies; proves the stale-while-revalidate pattern works before adding UI complexity.
- Detection logic (Phase 3) precedes UI (Phase 4): the "existing user" heuristic is the highest-risk logic decision. If it's wrong, it causes user-visible regression (Pitfall 2). Isolating it lets it be verified before any UI is involved.
- `manifest.json` change is deferred to Phase 4 because `onboarding.js` must exist before it can be referenced.
- `panelUI.js` CSS additions are bundled with Phase 4 (no functional dependency on Phases 1-3; purely cosmetic and only needed when the UI is ready).

### Research Flags

Phases needing careful validation before/during implementation:
- **Phase 4 (Onboarding UI):** The `body.innerHTML = ''` render lifecycle interaction (Pitfall 3) requires an explicit mounting strategy decision. Prototype the `isOnboardingActive` guard or shadow-root-sibling approach before committing to full UI implementation.

Phases with well-documented patterns (can proceed directly to implementation):
- **Phase 1 (dict.js changes):** `checkForUpdate()` mirrors the existing extraction pattern. No new concepts.
- **Phase 2 (content.js wiring):** Concrete code example provided in ARCHITECTURE.md Pattern 1. Standard Promise chaining.
- **Phase 3 (detection logic):** Storage flag pattern is well-established; heuristic is clearly specified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All conclusions grounded in direct codebase evidence (`dictionary.js` lines 37-48 prove `crypto.subtle`, `manifest.json` confirms no background script). Zero inference about external libraries needed. |
| Features | HIGH (codebase) / MEDIUM (Chrome API patterns) | MVP scope is unambiguous. `chrome.runtime.onInstalled` limitation confirmed by manifest inspection. Bundle URL webpack hash pattern inferred from `findBundleUrl()` regex — not live-verified. |
| Architecture | HIGH | Based on direct reading of all 12 source modules. Data flow diagrams reflect actual code paths. Build order has clear dependency rationale. |
| Pitfalls | HIGH (render lifecycle) / MEDIUM (Chrome API edge cases) | `body.innerHTML = ''` pattern is directly observable in `panelRenderer.renderWithFade()`. `chrome.storage.local` async semantics and quota behavior are from training knowledge, not live docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **Mounting strategy for onboarding overlay (Option A vs B):** Research identifies the risk (Pitfall 3) and both valid solutions but does not make the final call. This is an implementation decision to make at the start of Phase 4. Recommendation: prototype the `isOnboardingActive` guard in `content.js`'s `processBoardState()` — it is simpler and prevents suggestions from appearing beneath an onboarding overlay.

- **Bundle URL availability before extraction:** `findBundleUrl()` is currently called inside `dictExtractor.extract()`. To use the URL for pre-extraction staleness comparison, it must be called earlier in `loadFromCache()`. FEATURES.md notes that `performance.getEntriesByType('resource')` is synchronous and already used in Strategy 1 — extracting `findBundleUrl()` as a separately exportable function needs to be confirmed as viable during Phase 1 planning.

- **`chrome.storage.local` write atomicity guarantees:** The dismissed-state race condition (Pitfall 5) is noted and the mitigation (write-before-hide) is specified. However, whether `chrome.storage.local.set()` is guaranteed atomic for single-key writes under extension storage quota pressure was not live-verified. Treat the write-before-hide pattern as sufficient mitigation and move on.

## Sources

### Primary (HIGH confidence)
- `C:/WordleBot/src/dictionary.js` — `crypto.subtle.digest` usage, `chrome.storage.local` pattern, `computeFingerprint()` sort-normalization, `loadFromCache()` staleness logic
- `C:/WordleBot/src/content.js` — init flow, `processBoardState()` call chain, `clearCaches()` key list, `requestIdleCallback` usage
- `C:/WordleBot/src/panelRenderer.js` — `body.innerHTML = ''` render pattern (Pitfall 3 root cause)
- `C:/WordleBot/src/dictExtractor.js` — `findBundleUrl()` implementation, `performance.getEntriesByType('resource')` Strategy 1, webpack hash regex
- `C:/WordleBot/src/panelUI.js` — Shadow DOM structure, `createStyles()` CSS sheet pattern
- `C:/WordleBot/manifest.json` — absence of `background` key; confirms `chrome.runtime.onInstalled` unavailable; `storage` permission granted

### Secondary (MEDIUM confidence)
- Chrome Extension MV3 specification (training data, January 2025) — `chrome.runtime.onInstalled` fires in service worker context only; `chrome.storage.local` sentinel pattern for content-script-only extensions
- `C:/WordleBot/CONCERNS.md` — "Dictionary Loading Synchronous Fingerprint Computation" performance concern; validates why SHA-256 on every load is wrong for change detection
- Webpack content-addressed filename pattern — inferred from `findBundleUrl()` regex `/wordle\.[a-f0-9]+\.js/`; standard webpack behavior, not live-verified

### Tertiary (LOW confidence)
- `chrome.storage.local` write atomicity under quota pressure — assumed safe for single-key writes; not verified against Chrome source or live docs

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*
