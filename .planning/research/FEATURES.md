# Feature Research

**Domain:** Chrome Extension — Dictionary Change Detection + First-Install Onboarding
**Researched:** 2026-02-14
**Confidence:** HIGH (based on direct codebase analysis) / MEDIUM (Chrome API patterns from training knowledge, unverified via live docs)

---

## Context: What Already Exists

The following is already built and must NOT be redesigned:

- SHA-256 fingerprint computed from word array content (`dictionary.js` lines 37-48)
- Fingerprint stored in `wordlebot_dict` cache key with `extractedAt` timestamp
- 30-day staleness timer in `dictionary.js` (`THIRTY_DAYS_MS`)
- Computational cache (`wordlebot_cache`) invalidated automatically when fingerprint changes
- Shift+Click hard refresh clears all caches and forces re-extraction (`content.js` lines 354-388)
- Panel body with `.dict-source` footer indicator for cached/bundled states (`content.js` lines 98-147)
- Storage keys in use: `wordlebot_dict`, `wordlebot_cache`, `wordlebot_panel_collapsed`

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Onboarding shown once on first install | Standard pattern for all utility extensions; without it, users don't know how to use the extension | LOW | Must be dismissable; must never show again after dismissed |
| Onboarding covers basic interaction (click to expand cards) | Progressive disclosure is non-obvious; users who don't click never see the "why" line | LOW | Single sentence or diagram suffices |
| Onboarding explains Shift+Refresh | This is a power-user feature hidden behind Shift+Click; new users will never find it otherwise | LOW | One line of text |
| Dictionary cache invalidates when NYT updates content | Users who played with stale dictionary report wrong word counts; extension feels broken | MEDIUM | The 30-day timer is a proxy for this; content-hash detection is more precise |
| No slowdown on daily use | Cache invalidation must be invisible on the fast path (fresh cache, no change) | LOW | The fast path already skips extraction entirely; detection must not add to this path |

### Differentiators (What Makes These Features Good)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Bundle URL hash as cheap change signal | The Wordle JS bundle URL already contains a webpack content hash (`wordle.[a-f0-9]+\.js`). Comparing the stored URL vs current URL is O(1) vs O(n) SHA-256 computation. If URL matches, skip extraction entirely. If URL changes, force re-extraction. | LOW | Bundle URL is already captured as `bundleUrl` in dictExtractor result. Just needs to be stored and compared. See `dictExtractor.js` line 455: `bundleUrl: sourceUrl` |
| Onboarding inline in panel body (not a popup) | Extension has no popup page — Shadow DOM panel is the only UI surface. Inline onboarding fits the architecture and doesn't require new permission or UI surface | MEDIUM | Must integrate with existing `panelRenderer.js` render lifecycle; must not block suggestions after dismissal |
| Onboarding appears before first suggestions render | Shows during the loading state (while dictionary loads and entropy engine initializes). Zero extra wait time for user. | MEDIUM | Requires checking first-install flag early in `content.js` init, before `backgroundInit` completes |
| Dismissal persisted in `chrome.storage.local` | Consistent with existing storage pattern; survives browser restarts; aligns with `wordlebot_dict` / `wordlebot_cache` storage architecture | LOW | New key: `wordlebot_onboarded`. Single boolean or timestamp. |

### Anti-Features (Avoid These)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| `chrome.runtime.onInstalled` for first-install detection | The "correct" Chrome API for detecting first install | **Not available in content scripts.** WordleBot has no background service worker. Adding one just for onboarding adds complexity, a new manifest entry, and a new permission surface. `runtime.onInstalled` fires in the service worker, not in content scripts. | Check `chrome.storage.local` for a `wordlebot_onboarded` flag at content script startup. This is the correct pattern for content-script-only extensions. |
| Full SHA-256 hash of dictionary as change signal on every page load | Comprehensive, accurate | Runs on every load even when cache is fresh. `computeFingerprint()` is O(n log n) — already identified as a performance bottleneck in CONCERNS.md (line 94). Adding it as a "change detection" step on top of the existing 30-day timer doubles the fingerprint cost. | Use bundle URL hash (O(1)) as a pre-check. Only compute SHA-256 fingerprint after extraction, same as today. |
| Word count comparison as change signal | Cheap O(1) check | False negatives: NYT could swap words without changing count. Low signal quality. | Bundle URL hash is equally cheap but has no false negatives for code deployments. |
| Multi-step onboarding wizard / modal overlay | Rich onboarding UX | Requires blocking the page or creating a modal surface outside Shadow DOM. Conflicts with architecture constraint: no popup, no options page, extension runs on NYT page. Modal overlay could interfere with NYT styles even with Shadow DOM isolation. | Single-screen dismissable card inside the panel body. |
| "What's new" / changelog onboarding on update | Users of update-aware extensions expect this | This extension has no update awareness mechanism today. Adds scope. NYT players just want to play — changelog notes in a game assistant are noise. | If needed in v2, add `lastSeenVersion` to storage and compare vs `chrome.runtime.getManifest().version`. Defer to v2. |
| Persistent "help" button in panel header | Users can always access onboarding | Adds permanent UI chrome. Panel header already has title + refresh + toggle (three elements). Fourth element crowds the header on 300px panel. | One-time onboarding is sufficient for a utility with three things to learn. Advanced users use Shift+Refresh anyway. |

---

## Feature Dependencies

```
[First-Install Flag Check]
    └──requires──> [chrome.storage.local read at startup]
                       └──already exists──> [dictionary.js / content.js use chrome.storage.local]

[Onboarding UI]
    └──requires──> [First-Install Flag Check]
    └──requires──> [Panel body available (panelUI.init called)]
    └──enhances──> [Panel Renderer] (adds a new render mode: 'onboarding')

[Bundle URL Hash Detection]
    └──requires──> [bundleUrl stored in wordlebot_dict cache entry]
                       └──currently missing──> [bundleUrl not persisted to cache today]
    └──enhances──> [Dictionary staleness check] (replaces/supplements 30-day timer)

[Bundle URL Hash Detection] ──feeds into──> [Computational Cache Invalidation]
    (already exists: fingerprint mismatch triggers cache rebuild in content.js lines 189-199)
```

### Dependency Notes

- **Bundle URL hash detection requires storing bundleUrl in cache:** `dictionary.js` `saveToCache()` (line 199) currently stores `words`, `fingerprint`, `extractedAt`, `bundledFingerprint`, `source` — but NOT `bundleUrl`. This key must be added to the cache entry for URL comparison to work.

- **Onboarding requires panel body, which requires panelUI.init():** The panel mounts in Stage 1 (fast, synchronous). Onboarding should be checked and displayed in Stage 1 or very early in Stage 2, before the dictionary loading completes, so the user sees it during the loading wait.

- **Onboarding dismissal must not block suggestions:** After dismissal, the normal suggestion pipeline continues. Onboarding is an overlay within the panel body, not a blocking gate.

- **Bundle URL detection is independent of SHA-256 fingerprint computation:** URL comparison is a pre-extraction check. SHA-256 fingerprint computation happens after extraction, unchanged. The URL check just decides whether to attempt extraction at all.

---

## MVP Definition

### Launch With (v1.7)

Minimum viable product for this milestone — what's needed to deliver both features correctly.

**Smart Dictionary Change Detection:**
- [ ] Store `bundleUrl` in `wordlebot_dict` cache entry when saving — needed to enable URL comparison
- [ ] On cache load, compare stored `bundleUrl` vs current bundle URL discovered at page load; if mismatch, treat as stale (force extraction) — replaces 30-day timer for the common case
- [ ] Keep 30-day timer as fallback for cases where bundle URL cannot be determined (Strategy 3/4 in `findBundleUrl()` returns null or array)
- [ ] Log when URL-hash-based staleness triggers vs timer-based staleness

**First-Install Onboarding:**
- [ ] Check `wordlebot_onboarded` flag from `chrome.storage.local` at startup
- [ ] If flag absent: show onboarding card in panel body covering (a) what WordleBot does, (b) click cards to expand, (c) Shift+Refresh to reset dictionary
- [ ] Onboarding shown during loading state (so it appears immediately, not after a multi-second delay)
- [ ] Single dismissal button ("Got it") that sets `wordlebot_onboarded: true` in `chrome.storage.local` and transitions to normal content
- [ ] After dismissal, immediately show suggestions if already computed, or show loading state if still computing

### Add After Validation (v1.x)

Features to add if v1.7 proves stable:

- [ ] Track `lastDetectedBundleUrl` separately so URL mismatch can be logged distinctly from timer expiry — useful for debugging
- [ ] Onboarding re-trigger via hidden mechanism (triple-click title, or DevTools console command) — for support debugging

### Future Consideration (v2+)

- [ ] "What's New" onboarding on version update (requires `lastSeenVersion` in storage, version comparison via `chrome.runtime.getManifest()`)
- [ ] Settings panel that lets users configure behavior (defer until v2 adds options page)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| First-install onboarding | HIGH — extension is not self-explanatory | LOW — ~50 lines: storage check + render function + dismiss handler | P1 |
| Store bundleUrl in cache | HIGH — enables URL-hash detection | LOW — one line added to `saveToCache()` in dictionary.js | P1 |
| Bundle URL comparison on cache load | HIGH — replaces brittle 30-day timer | LOW — ~10 lines in `loadFromCache()` comparing stored vs current URL | P1 |
| Keep 30-day timer as secondary fallback | MEDIUM — safety net for edge cases | LOW — already exists, just kept | P1 |
| Onboarding shown during loading state | MEDIUM — improves perceived performance | MEDIUM — requires reading storage flag before Stage 2 deferred init | P2 |
| Log URL-hash vs timer staleness trigger | LOW — debugging value | LOW — one console.log line | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Implementation Notes by Feature

### Smart Dictionary Change Detection

**Current state:** `dictionary.js` `loadFromCache()` checks:
1. Cache structure valid
2. `bundledFingerprint` matches current bundled dict fingerprint (extension update detection)
3. Age > 30 days (staleness)

**Target state:** Add step 2.5:
- After bundled fingerprint check, compare `cacheData.bundleUrl` vs current `bundleUrl` from `findBundleUrl()`
- If mismatch: treat as stale, proceed to extraction
- If `bundleUrl` null or unavailable: fall through to 30-day timer check (unchanged behavior)

**Where `currentBundleUrl` comes from:** This is the tricky part. `loadFromCache()` runs before extraction. The URL discovery (`findBundleUrl()`) is currently inside `dictExtractor.extract()`. One approach: extract `findBundleUrl()` as a separate exported function, call it early in the cascade just for comparison. Cost: one Performance API read (synchronous, trivial) or DOM query (synchronous). No network call needed — the bundle URL is already in the browser's resource timing list from when the page loaded the NYT JS bundle.

**Confidence:** HIGH — `performance.getEntriesByType('resource')` is synchronous, O(resources) — typically ~20-50 entries on Wordle page. This is already what Strategy 1 of `findBundleUrl()` does today.

### First-Install Onboarding

**Correct detection pattern for content-script-only extensions (no service worker):**

```javascript
// At startup, before or alongside Stage 1:
var onboardingData = await chrome.storage.local.get('wordlebot_onboarded');
var isFirstInstall = !onboardingData.wordlebot_onboarded;

if (isFirstInstall) {
  showOnboarding();  // Render into panel body
}
```

**Why not `chrome.runtime.onInstalled`:** This event is only available in background service workers (Manifest V3) or background pages (Manifest V2). WordleBot has no background script in its manifest. Adding one just for onboarding would require:
1. Adding `"background": { "service_worker": "background.js" }` to manifest.json
2. Writing a service worker that sends a message to content scripts
3. Content scripts receiving the message via `chrome.runtime.onMessage`
4. Handling race conditions (content script may load before or after the service worker message)

This is 3-4x the complexity of a simple storage flag check. The storage flag approach is the correct pattern for this architecture.

**Onboarding content (three things to teach):**
1. **What it does:** "WordleBot suggests optimal guesses using information theory — each suggestion tells you how much it narrows down the remaining words."
2. **How to use cards:** "Click any suggestion card to see why it's recommended."
3. **How to reset:** "Shift + click the refresh button to reset the dictionary if suggestions look wrong."

**Onboarding placement:** Render into panel body, replacing the loading spinner content. After dismissal (or after the first suggestion computation completes, if user hasn't dismissed), transition to normal suggestion content. Panel body is the only UI surface — this is where it belongs.

**Confidence:** HIGH — `chrome.storage.local` is already the project's canonical state store. Flag approach is well-established.

---

## Competitor Feature Analysis

| Feature | Typical Approach | Our Approach |
|---------|-----------------|--------------|
| First-install detection | `chrome.runtime.onInstalled` in service worker (extensions with background scripts) OR `chrome.storage.local` flag (content-script-only extensions) | `chrome.storage.local` flag — correct for our architecture |
| Onboarding UI | Dedicated options page, popup page, or injected modal | Inline panel card — fits no-popup constraint |
| Onboarding dismissal | "Don't show again" checkbox, X button, or "Got it" button | "Got it" button — single clear action |
| Dictionary/data freshness | URL hash (webpack builds), ETag headers, version field, timer | Bundle URL hash as primary signal; 30-day timer as fallback |

---

## Sources

- Direct codebase analysis: `src/dictionary.js`, `src/dictExtractor.js`, `src/content.js`, `src/panelUI.js`, `src/panelRenderer.js`, `manifest.json`
- Codebase concern: `CONCERNS.md` — "Dictionary Loading Synchronous Fingerprint Computation" performance bottleneck (verified HIGH concern, informs why SHA-256 on every load is wrong approach)
- Architecture doc: `.planning/codebase/ARCHITECTURE.md` — confirms no background service worker in manifest; confirms `chrome.storage.local` as canonical state store
- `chrome.runtime.onInstalled` API pattern: training knowledge (MEDIUM confidence — standard MV3 API, well-documented, but live docs not verified); content-script limitation is verified by manifest inspection (no background script present)
- Bundle URL webpack hash pattern: training knowledge (MEDIUM confidence — standard webpack content hashing, observable in `findBundleUrl()` regex pattern `/wordle\.[a-f0-9]+\.js/` which confirms NYT uses content-addressed filenames)
- `performance.getEntriesByType('resource')` as synchronous URL discovery: HIGH confidence — already used in `dictExtractor.js` Strategy 1, lines 34-55; proven to work in this codebase

---

*Feature research for: WordleBot v1.7 — Dictionary Intelligence + Onboarding*
*Researched: 2026-02-14*
