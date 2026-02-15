# Architecture Research

**Domain:** Chrome Extension — Dictionary change detection + first-install onboarding
**Researched:** 2026-02-14
**Confidence:** HIGH — based on direct codebase reading of all 12 source modules

---

## Current Architecture (as-built v1.5.1)

### System Overview

```
manifest.json (MV3, no background service worker)
    |
    | run_at: document_idle
    v
Content Script Pipeline (all loaded in NYT Wordle page context)
┌──────────────────────────────────────────────────────────────┐
│  dictExtractor.js   -- NYT bundle parsing, word array regex  │
│  dictionary.js      -- 3-tier cascade + fingerprint + cache  │
│  domReader.js       -- board state extraction + observer     │
│  frequencyTables.js -- positional/overall/bigram frequency   │
│  frequencyScorer.js -- commonness scoring from freq tables   │
│  entropyEngine.js   -- Shannon entropy ranking + worker      │
│  constraintEngine.js -- green/yellow/gray filtering          │
│  suggestionEngine.js -- builds structured suggestion output  │
│  panelUI.js         -- Shadow DOM host, theme, collapse      │
│  panelRenderer.js   -- card rendering, loading, error states │
│  content.js         -- orchestration, init flow, event wiring│
└──────────────────────────────────────────────────────────────┘
    |                   |
    v                   v
chrome.storage.local  window.WordleBot namespace
  wordlebot_dict        (shared module state across scripts)
  wordlebot_cache

Shadow DOM Panel (injected into NYT page body)
┌───────────────────────────┐
│  .header (title, refresh) │
│  .body                    │
│    suggestion cards       │
│    .dict-source indicator │
└───────────────────────────┘
```

### Current Storage Keys

| Key | Owner | Contents |
|-----|-------|----------|
| `wordlebot_dict` | dictionary.js | `{ words, fingerprint, extractedAt, bundledFingerprint, source }` |
| `wordlebot_cache` | content.js | `{ fingerprint, freqTables, commonness, entropyCache }` |

### Current Init Flow

```
content.js init()
  ├─ panelUI.init()           -- Stage 1: mount panel immediately
  ├─ showBodyLoading()        -- show spinner
  └─ requestIdleCallback()    -- Stage 2: defer to browser idle
       ├─ loadDictionaryAndCaches()
       │    ├─ dictionary.loadDictionary()
       │    │    ├─ getBundledFingerprint()     -- memoized SHA-256 of bundled list
       │    │    ├─ loadFromCache()             -- checks wordlebot_dict
       │    │    │    ├─ bundledFingerprint mismatch? -> invalidate
       │    │    │    └─ age > 30 days? -> mark stale
       │    │    ├─ tryExtractionWithRetry()   -- live extraction from NYT bundle
       │    │    └─ saveToCache()
       │    ├─ fingerprint mismatch? -> rebuild freq+entropy
       │    └─ cache hit? -> restore freq+entropy from storage
       ├─ showSourceIndicator()
       ├─ waitForBoard()
       ├─ wire refreshBtn click
       └─ processBoardState() + startObserver()
```

---

## New Features: Integration Architecture

### Feature 1: Smart Dictionary Change Detection

**Current behavior:** Cache expires after 30 days regardless of whether NYT updated the dictionary.

**Target behavior:** Detect a changed dictionary by comparing the new extracted fingerprint against the cached fingerprint. If mismatch, force rebuild of computational cache immediately.

**Where fingerprinting already lives:**

Fingerprinting is **already fully implemented** in `dictionary.js`:
- `computeFingerprint()` — SHA-256 of sorted+joined word list
- `saveToCache()` — persists `fingerprint` in `wordlebot_dict`
- `loadFromCache()` — validates `bundledFingerprint` against current bundled dictionary

The fingerprint mismatch path in `content.js` `loadDictionaryAndCaches()` already detects it:
```javascript
if (cacheData && cacheData.fingerprint !== fingerprint) {
  // fingerprint changed — wasRebuilt = true
}
```

**What is missing:** The 30-day timer in `loadFromCache()` is the blocker. When the cache is fresh (< 30 days), `dictionary.loadDictionary()` returns the cached words without re-extracting — the new bundle is never fetched, so the fingerprint is never recalculated. The mismatch detection never runs on fresh caches.

**Solution — Staleness trigger replacement:**

The 30-day timer is the wrong staleness signal. Replace it with a per-session extraction trigger:

```
On each page load (fresh cache present):
  1. Return cached words immediately (fast path, no user delay)
  2. In background: extract live dictionary
  3. Compute fingerprint of extracted words
  4. Compare with cached fingerprint
  5. If mismatch: update wordlebot_dict, invalidate wordlebot_cache, trigger rebuild
```

This is a "serve stale, refresh in background" pattern — the same used by service workers with stale-while-revalidate.

**Modified component: `dictionary.js`**

Add a new exported function `checkForUpdate(cachedResult)`:
- Runs live extraction in background after the fast-path cache return
- Computes fingerprint of fresh extraction
- If fingerprint differs from `cachedResult.fingerprint`: saves new dict to storage, returns the new result
- Returns `null` if no change

**Modified component: `content.js`**

In `loadDictionaryAndCaches()`, after returning from the cache fast path:
- Call `dictionary.checkForUpdate(dictResult)` asynchronously
- If it resolves with a new dict: call `clearCaches()` and rebuild freq+entropy
- Show a transient "Dictionary updated" indicator via `showSourceIndicator()`

No changes needed to `dictExtractor.js` — it is already pure extraction.

**Data flow for change detection:**

```
Page load (cache fresh)
    |
    v
dictionary.loadDictionary() -- returns cached words immediately
    |
    v
content.js -- starts suggestions with cached words (no delay)
    |
    v (background, non-blocking)
dictionary.checkForUpdate()
    ├─ dictExtractor.extract()
    ├─ computeFingerprint(extractedWords)
    ├─ compare with cached fingerprint
    │
    ├─ MATCH: no-op, return null
    │
    └─ MISMATCH:
         ├─ saveToCache(newResult)
         ├─ return newResult
         v
content.js -- receives new result
    ├─ clearCaches()
    ├─ loadDictionaryAndCaches(forceRebuild=true)
    └─ re-processBoardState()
         showSourceIndicator("Dictionary updated")
```

**Storage change:** The `wordlebot_dict` schema is unchanged. `wordlebot_cache` gets invalidated naturally via fingerprint mismatch — no schema change needed.

**Manifest change:** None. No new permissions required.

---

### Feature 2: First-Install Onboarding

**Constraint:** `chrome.runtime.onInstalled` fires only in service workers (background scripts). This extension has no background service worker. Content scripts cannot register `onInstalled` listeners.

**Solution — `chrome.storage.local` flag:**

Store a flag `wordlebot_onboarded` in `chrome.storage.local`. On each init, check for its absence. Absence means first run.

```javascript
// In content.js init(), after panel mount:
var onboarding = await chrome.storage.local.get('wordlebot_onboarded');
if (!onboarding.wordlebot_onboarded) {
  showOnboarding();
}
```

This is safe because `chrome.storage.local` persists across extension updates (unlike `localStorage` which is per-origin and could theoretically be cleared). It also correctly handles the case where the user clears extension data — they'll see onboarding again, which is acceptable.

**New component: `onboarding.js`**

A new content script module responsible for:
- Rendering the onboarding overlay inside the existing Shadow DOM panel body
- Handling dismiss action (sets `wordlebot_onboarded = true` in storage)
- Providing `window.WordleBot.onboarding.show()` and `.dismiss()` API

**Where it renders:**

The onboarding UI renders inside `.body` of the existing Shadow DOM panel — the same element that `panelRenderer.js` uses. The onboarding replaces the body content temporarily, then the normal suggestion flow fills it after dismissal.

This avoids creating a second Shadow DOM host or a separate modal element, keeping UI isolation intact.

**Interaction with existing render flow:**

```
init()
  ├─ panelUI.init()         -- mounts panel
  ├─ showBodyLoading()      -- fills .body with spinner
  ├─ requestIdleCallback()
  │    ├─ loadDictionaryAndCaches()
  │    ├─ CHECK: is first install?
  │    │    YES: onboarding.show()  -- replaces .body content
  │    │         (suggestions held until dismissed)
  │    │    NO:  continue to processBoardState()
  │    ├─ waitForBoard()
  │    └─ processBoardState()
  │
  └─ (onboarding dismiss callback) -> processBoardState()
```

The onboarding must be shown AFTER `loadDictionaryAndCaches()` because:
1. The dict load is what sets `window.WordleBot.dictionary` needed after dismissal
2. Showing onboarding before loading would mean suggestions aren't ready when user dismisses

**Onboarding content (three items):**
1. How suggestions work (entropy-based ranking)
2. Click cards to expand details
3. Shift+Refresh to force dictionary reset

**Styles:**

Add onboarding-specific CSS classes to `panelUI.js`'s `createStyles()` function — the single CSS sheet in the Shadow DOM. Do not use a separate stylesheet.

**Dismiss behavior:**
- User clicks "Got it" button
- `chrome.storage.local.set({ wordlebot_onboarded: true })`
- `panelRenderer.showBodyLoading('Preparing suggestions...')`
- Call `processBoardState(initialState, true)` to fill panel with suggestions

**Storage key added:** `wordlebot_onboarded` (boolean `true`, never deleted by `clearCaches()` — it is not a computational cache)

**Manifest change:** None. `chrome.storage.local` is already permitted.

---

## Component Responsibilities (after v1.7)

| Component | Existing? | Role | Changed? |
|-----------|-----------|------|----------|
| `dictExtractor.js` | Yes | Raw extraction from NYT bundle | No |
| `dictionary.js` | Yes | 3-tier cascade + fingerprint + cache | Add `checkForUpdate()` function |
| `domReader.js` | Yes | Board state, observer, board wait | No |
| `frequencyTables.js` | Yes | Positional/overall/bigram tables | No |
| `frequencyScorer.js` | Yes | Commonness scoring | No |
| `entropyEngine.js` | Yes | Shannon entropy ranking | No |
| `constraintEngine.js` | Yes | Candidate filtering | No |
| `suggestionEngine.js` | Yes | Builds structured suggestion output | No |
| `panelUI.js` | Yes | Shadow DOM host, styles, theme | Add onboarding CSS classes |
| `panelRenderer.js` | Yes | Card rendering, states | No |
| `onboarding.js` | **New** | First-install overlay, dismiss flow | New module |
| `content.js` | Yes | Orchestration, init flow | Add background dict check + onboarding gate |

---

## Data Flow After v1.7

### Dictionary Change Detection Flow

```
loadDictionaryAndCaches(false)
    |
    v
dictionary.loadDictionary()
    |
    |-- cache fresh? --> return cached result immediately
    |                        |
    |                        v (non-blocking, background)
    |                    dictionary.checkForUpdate(cachedResult)
    |                        |
    |                        |-- no change: null
    |                        |-- changed: new DictionaryResult
    |                                 |
    |                                 v
    |                             content.js detects new result
    |                             clearCaches() + rebuild + re-render
    |
    |-- cache stale/miss: tryExtractionWithRetry()
    |       |-- success: computeFingerprint + saveToCache + return
    |       |-- fail: use stale cache or bundled fallback
    v
loadResult = { words, fingerprint, wasRebuilt, dictResult }
```

### First-Install Onboarding Flow

```
init() -- page load
    |
    v
panelUI.init() + showBodyLoading()
    |
    v (requestIdleCallback)
loadDictionaryAndCaches()
    |
    v
chrome.storage.local.get('wordlebot_onboarded')
    |
    |-- NOT SET (first install):
    |       onboarding.show()
    |           renders in .body
    |           user reads + clicks "Got it"
    |           chrome.storage.local.set({ wordlebot_onboarded: true })
    |           -> processBoardState(initialState, true)
    |
    |-- SET (returning user):
    |       waitForBoard()
    |       processBoardState(initialState, true)
    v
Normal suggestion flow
```

---

## Architectural Patterns

### Pattern 1: Stale-While-Revalidate (new for v1.7)

**What:** Return cached data immediately for performance. In the background, check if data has changed. If changed, update and re-render.

**When to use:** Cache freshness is unknown. User must not be blocked by a network fetch on every page load.

**Implementation in this codebase:**

```javascript
// dictionary.js -- new function
async function checkForUpdate(cachedResult) {
  var extracted = await tryExtractionWithRetry();
  if (!extracted) return null;

  var fp = await computeFingerprint(extracted);
  if (fp === cachedResult.fingerprint) return null; // no change

  var newResult = {
    words: extracted,
    source: 'extracted',
    freshness: 'fresh',
    fingerprint: fp
  };
  var bundledFp = await getBundledFingerprint();
  await saveToCache(newResult, bundledFp);
  return newResult;
}
```

```javascript
// content.js -- after loadDictionaryAndCaches() returns
if (loadResult.dictResult.source === 'cached') {
  dictionary.checkForUpdate(loadResult.dictResult).then(function(newResult) {
    if (!newResult) return;
    // Dictionary changed — rebuild silently
    clearCaches().then(function() {
      loadDictionaryAndCaches(true).then(function(reloadResult) {
        showSourceIndicator(reloadResult.dictResult);
        var boardState = window.WordleBot.readBoardState();
        if (boardState) processBoardState(boardState, false);
      });
    });
  });
}
```

**Trade-offs:**
- Pro: zero latency impact on cache hits
- Pro: no 30-day timer needed
- Con: on the load where the dictionary changes, user sees old suggestions briefly before re-render
- Con: adds one extraction call per page load (always)
- Mitigation: extraction is fetching a JS file already in browser cache, cost is low

### Pattern 2: Storage-Flag First-Run Detection (new for v1.7)

**What:** Use a persistent storage flag to distinguish first install from returning user. Check flag early in init, before board is ready.

**When to use:** `chrome.runtime.onInstalled` is unavailable in content scripts. First-run state must be persisted across reloads.

**Implementation:**

```javascript
// content.js -- in backgroundInit(), after loadDictionaryAndCaches()
var stored = await chrome.storage.local.get('wordlebot_onboarded');
if (!stored.wordlebot_onboarded) {
  await window.WordleBot.onboarding.show(function onDismiss() {
    // After user dismisses, process board normally
    window.WordleBot.readBoardState() && processBoardState(initialState, true);
  });
} else {
  // Normal flow
  var initialState = window.WordleBot.readBoardState();
  if (initialState) processBoardState(initialState, true);
}
```

**Trade-offs:**
- Pro: simple, reliable, no service worker needed
- Pro: respects privacy (no network call, no background script)
- Con: if user clears extension storage, onboarding shows again — acceptable behavior

### Pattern 3: Shadow DOM CSS Extension (existing, used for new styles)

**What:** All panel styles live in a single `CSSStyleSheet` constructed in `panelUI.js createStyles()`. New UI components add their CSS to this same sheet.

**When to use:** Any new UI element rendered inside the Shadow DOM panel.

**Implementation:** Append new CSS class definitions to the `css` string inside `createStyles()`. Do not use inline styles or separate stylesheets.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Background Service Worker for First-Run Detection

**What people do:** Add a `background.js` service worker, register `chrome.runtime.onInstalled`, send a message to the content script.

**Why it's wrong:**
- Requires adding `"background": { "service_worker": "background.js" }` to manifest
- Adds a new manifest permission scope
- Message passing between service worker and content script is async and fragile (service worker can be terminated before message arrives)
- Completely unnecessary when `chrome.storage.local` is already available and permitted

**Do this instead:** Check for the absence of `wordlebot_onboarded` in `chrome.storage.local` at init time.

### Anti-Pattern 2: Onboarding in a Second Shadow DOM Host

**What people do:** Create a new `div` host element for the onboarding modal, separate from `#wordlebot-panel-host`.

**Why it's wrong:**
- Doubles the number of Shadow DOM roots managed by the extension
- Requires a separate CSS sheet duplicating theme tokens
- Onboarding is temporary UI that occupies the same space as the panel — it belongs inside the panel

**Do this instead:** Render onboarding inside the existing `.body` element of the panel. It is already isolated by Shadow DOM. Dismiss replaces the body content with suggestions.

### Anti-Pattern 3: Replacing the 30-Day Timer with a 24-Hour Timer

**What people do:** Change `THIRTY_DAYS_MS` to a shorter interval like 24 hours.

**Why it's wrong:**
- Still forces unnecessary extraction even when NYT hasn't updated their dictionary
- Adds a 12-second extraction + retry on every load for users whose cache is "stale"
- The timer-based approach is fundamentally the wrong model for change detection

**Do this instead:** Use fingerprint comparison via `checkForUpdate()`. Only trigger rebuild when the dictionary actually changed.

### Anti-Pattern 4: Blocking Init on Onboarding Storage Check

**What people do:** Put the storage check before `loadDictionaryAndCaches()`, blocking dictionary load on the storage read.

**Why it's wrong:**
- Dictionary loading and onboarding check can happen in parallel — no dependency between them
- The dictionary needs to be loaded before onboarding dismissal anyway
- The only hard dependency: onboarding should render AFTER dict is loaded (so suggestions are ready immediately on dismiss)

**Do this instead:** Run `loadDictionaryAndCaches()` first (it sets `window.WordleBot.dictionary`), then check the onboarding flag. The storage read is ~1ms — not a meaningful bottleneck.

---

## Integration Points

### Internal Boundaries (Modified)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `content.js` → `dictionary.js` | Direct call: `window.WordleBot.loadDictionary()` | Unchanged |
| `content.js` → `dictionary.js` | New call: `window.WordleBot.checkForUpdate()` | Non-blocking `.then()` chain |
| `content.js` → `onboarding.js` | New call: `window.WordleBot.onboarding.show(onDismiss)` | Callback-based, awaitable |
| `onboarding.js` → `panelUI.js` | `window.WordleBot.panelUI.getBody()` to render into `.body` | Same as `panelRenderer.js` |
| `onboarding.js` → `chrome.storage.local` | Set `wordlebot_onboarded: true` on dismiss | New storage key |
| `panelUI.js` → new CSS classes | Onboarding styles appended to `createStyles()` | No new exports needed |

### Storage Keys (Complete List After v1.7)

| Key | Owner | Cleared by clearCaches()? | Purpose |
|-----|-------|--------------------------|---------|
| `wordlebot_dict` | dictionary.js | Yes | Extracted dictionary + fingerprint |
| `wordlebot_cache` | content.js | Yes | Freq tables + entropy cache |
| `wordlebot_onboarded` | onboarding.js | **No** | First-install flag, must survive cache clears |
| `wordlebot_panel_collapsed` | panelUI.js (localStorage) | No (localStorage) | Collapse preference |

Note: `wordlebot_onboarded` must NOT be removed in `clearCaches()`. The user completing onboarding is separate from computational caches. The `clearCaches()` function in `content.js` explicitly removes `['wordlebot_cache', 'wordlebot_dict']` — add `wordlebot_onboarded` to the exclusion comment.

---

## Build Order (Suggested)

Dependencies flow from bottom to top:

```
1. dictionary.js -- add checkForUpdate() function
   (pure addition, no dependency changes, self-contained)

2. onboarding.js -- new module
   (depends on: panelUI.getBody(), chrome.storage.local)
   (no dependency on dictionary — renders independently)

3. panelUI.js -- add onboarding CSS classes to createStyles()
   (parallel with step 2, no functional dependency)

4. content.js -- wire checkForUpdate() background call + onboarding gate
   (depends on: dictionary.checkForUpdate, onboarding.show)

5. manifest.json -- add onboarding.js to content_scripts list
   (load order: after panelUI.js, before content.js)
```

**Rationale for this order:**

- `dictionary.js` change is isolated and testable before touching `content.js`
- `onboarding.js` can be built and manually verified before wiring the gate in `content.js`
- CSS additions to `panelUI.js` are cosmetic and have no functional dependency on either new module
- `manifest.json` change is last because `onboarding.js` must exist before referencing it

---

## Manifest Changes Required

```json
{
  "content_scripts": [{
    "js": [
      "src/dictExtractor.js",
      "src/dictionary.js",
      "src/domReader.js",
      "src/frequencyTables.js",
      "src/frequencyScorer.js",
      "src/entropyEngine.js",
      "src/constraintEngine.js",
      "src/suggestionEngine.js",
      "src/panelUI.js",
      "src/panelRenderer.js",
      "src/onboarding.js",
      "src/content.js"
    ]
  }]
}
```

`onboarding.js` loads after `panelUI.js` (needs Shadow DOM ready) and before `content.js` (which calls it). No other manifest changes. No new permissions. No service worker.

---

## Sources

- Direct codebase reading: all 12 source modules in `C:/WordleBot/src/`
- `C:/WordleBot/manifest.json` — current permissions and content script load order
- `C:/WordleBot/.planning/PROJECT.md` — v1.7 milestone requirements and constraints
- Chrome Extension MV3 content script documentation (background knowledge, HIGH confidence): `chrome.runtime.onInstalled` is unavailable in content scripts; `chrome.storage.local` is the correct approach for persistent first-run detection without a background script

---

*Architecture research for: WordleBot v1.7 — Dictionary Intelligence + Onboarding*
*Researched: 2026-02-14*
