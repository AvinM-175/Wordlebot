# Phase 17: Onboarding UI and Integration - Research

**Researched:** 2026-02-18
**Domain:** Chrome Extension MV3 — Shadow DOM onboarding overlay inside existing panel, integrated with content.js render lifecycle
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Overlay layout & style
- Full panel overlay — covers the entire suggestions area, user sees only onboarding until dismissed
- Match existing panel style — same colors, fonts, and feel as normal suggestions (cohesive, not special)
- Text only — no icons, illustrations, or visual elements beyond text and headings
- Include a welcome header (e.g., "Welcome to WordleBot") at the top, then tips below

#### Content & messaging
- Casual & friendly tone — warm, conversational (not technical or terse)
- Simple & accessible explanation of what WordleBot does — no mention of entropy, frequency, or technical terms
- Three tips presented as numbered steps: 1. What it does, 2. Click to expand cards, 3. Shift+Refresh to reset dictionary
- Claude drafts all copy — user will review in the code

#### Dismissal & transition
- Instant removal — no fade or animation, overlay disappears immediately on dismiss
- Suggestions appear instantly after dismissal — board state processed behind the overlay so suggestions are ready
- Primary "Got it" button — prominent, styled call to action (not a subtle text link)
- Dismissable via "Got it" button OR Escape key — keyboard-friendly alternative
- Write wordlebot_onboarded flag to storage BEFORE removing overlay — ensures persistence even if DOM removal fails

#### Mounting strategy
- Option A: isOnboardingActive guard in processBoardState() — skips rendering while onboarding is visible
- Dedicated renderOnboarding() function — clear separation from the normal render flow
- On dismiss, immediately trigger suggestions render (not wait for next MutationObserver cycle)

### Claude's Discretion
- Post-dismiss trigger mechanism (immediate processBoardState call vs cached result display)
- Exact copy wording for all three onboarding tips
- Button styling details within existing panel patterns
- Escape key event listener placement and cleanup

### Deferred Ideas (OUT OF SCOPE)
- Refine recommendation engine for first guesses — broaden the set of opening words the model naturally surfaces (e.g., CRANE, SLATE, ADIEU alongside TARES). Not hardcoded; the entropy/frequency model should be tuned to recommend a wider variety of strong openers. Add as future phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBD-03 | First-time users see a dismissable onboarding intro explaining how the extension works | renderOnboarding() function injects overlay into panel body; isOnboardingActive guard prevents processBoardState from clearing it; dismissed via "Got it" button or Escape key |
| ONBD-04 | Onboarding covers three topics: what WordleBot does, click cards to expand details, Shift+Refresh to reset dictionary | Three numbered tips rendered as static text inside the overlay; copy drafted below |
| ONBD-05 | User can dismiss onboarding with a clear action ("Got it" button) and it never appears again | Dismiss handler writes wordlebot_onboarded=true to chrome.storage.local first, then removes overlay and triggers processBoardState; sets isOnboardingActive=false |
| ONBD-06 | Onboarding dismissal state persists across page reloads and browser restarts | chrome.storage.local is persistent (survives page reload and browser restart); wordlebot_onboarded=true is already excluded from clearCaches() per roadmap decision |
| ONBD-07 | Onboarding renders inside the existing Shadow DOM panel (no new UI surfaces or permissions) | Overlay uses same panel body (state.body) that panelRenderer uses; no new host element, no new shadow root, no new stylesheet file, no manifest changes |
</phase_requirements>

---

## Summary

Phase 17 adds a one-time onboarding overlay to the existing Shadow DOM panel. The overlay covers the full panel body area (`.body`) so the user sees only onboarding content until they dismiss it. All rendering happens inside the already-mounted shadow root — no new UI surfaces, no new permissions, no new stylesheet files are required.

The central integration challenge is preventing `panelRenderer.render()` from clearing the onboarding overlay while it is visible. The locked decision is Option A: an `isOnboardingActive` boolean flag in `content.js` that `processBoardState()` checks before calling `panelRenderer.render()`. While onboarding is active, suggestions are computed but not rendered to the panel. On dismiss, the overlay is removed, `isOnboardingActive` is set to false, and `processBoardState` is called immediately with the already-computed board state so suggestions appear without delay.

Styling follows the locked decision: match the existing panel style exactly using the same CSS custom properties (`--wb-bg`, `--wb-text`, `--wb-text-secondary`, `--wb-border`) that `panelUI.js` already defines via its constructable stylesheet. The "Got it" button is styled to match the panel's design language — solid background, no border-radius deviation, same font family. New CSS rules are added to the existing constructable stylesheet in `panelUI.js` (the only stylesheet in this extension's shadow DOM). No new stylesheet file is created.

Persistence relies on `chrome.storage.local` writing `wordlebot_onboarded: true` before the overlay is removed from the DOM (locked decision). This guarantees that even if the DOM removal fails or the tab is closed between the storage write and the DOM removal, the dismissal is persisted. On the next load, `detectFirstInstall()` (Phase 16) reads `wordlebot_onboarded === true` and sets `window.WordleBot.isFirstInstall = false`, preventing onboarding from showing again.

**Primary recommendation:** Add `isOnboardingActive` flag and `renderOnboarding()` function to `content.js`. Add onboarding CSS rules to the existing constructable stylesheet in `panelUI.js`. No new files. Two files changed.

---

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Shadow DOM `state.body` | Web API | Mount point for onboarding overlay | Already the exclusive UI surface in this extension; panelUI.js exposes `getBody()` |
| `CSSStyleSheet.replaceSync()` (constructable stylesheet) | Web API | Add onboarding CSS rules | Already used by panelUI.js — the only stylesheet in the extension's shadow DOM |
| `chrome.storage.local.set()` | Chrome MV3 | Write `wordlebot_onboarded: true` on dismiss | Already used throughout content.js for dict and cache writes; same key written by Phase 16 normalization |
| `window.WordleBot` namespace | N/A | `isOnboardingActive` flag and `renderOnboarding` export | Established pattern; every module publishes to this namespace |

### Supporting

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| `document.createElement()` | Web API | Build overlay DOM tree without innerHTML | Matches pattern in panelRenderer.js — never innerHTML for dynamic content |
| `addEventListener('keydown', ...)` + `removeEventListener` | Web API | Escape key dismiss | Add listener on overlay mount; remove it on dismiss to avoid leaks |
| `window.WordleBot.panelUI.getBody()` | Internal | Access panel body from content.js | Same accessor used by panelRenderer.js and showSourceIndicator() in content.js |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Injecting into `state.body` (panel body) | Shadow root sibling (Option B from PITFALLS.md) | Option B allows suggestions to load behind the overlay but requires additional z-index management and a second host element. Option A (locked) is simpler: body is cleared anyway when overlay is shown, and suggestions compute silently behind the guard flag. |
| Writing CSS via `panelUI.js` constructable stylesheet | New `<style>` element in shadow DOM | A new `<style>` element would work but violates the locked decision ("no new stylesheet files"). The existing constructable stylesheet approach is the only compliant method. |
| `chrome.storage.local` for persistence | `localStorage` | localStorage is already used for collapse preference (wordlebot_panel_collapsed) but it's a per-profile browser setting. The locked decision and ONBD-06 require chrome.storage.local for cross-session persistence matching the behavior of other wordlebot_ keys. |
| Immediate `processBoardState()` call on dismiss | Displaying cached `lastSuggestions` | `lastSuggestions` is populated during background compute while onboarding is shown. On dismiss, calling `panelRenderer.render(window.WordleBot.lastSuggestions, true)` directly is faster (no recompute) and matches the "ready instantly" decision. This is the correct approach if lastSuggestions is already populated. If null (edge case: dismiss before background init completes), fall back to calling processBoardState. |

**Installation:** No new packages. Zero `npm install` required.

---

## Architecture Patterns

### Files Changed

```
src/
├── content.js      # ADD: isOnboardingActive flag, renderOnboarding(), dismiss handler, guard in processBoardState
└── panelUI.js      # ADD: onboarding CSS rules to existing createStyles() constructable stylesheet
```

No new files. Manifest unchanged. No new permissions.

### Pattern 1: isOnboardingActive Guard in processBoardState

**What:** A module-level boolean in `content.js` that `processBoardState()` checks at the top of its body. When `true`, suggestions compute fully (candidates, rankings, suggestions object built, stored in `lastSuggestions`) but `panelRenderer.render()` is NOT called. The overlay survives.

**When to use:** Set to `true` immediately when `renderOnboarding()` is called. Set to `false` in the dismiss handler immediately before calling the post-dismiss render.

**Example:**

```javascript
// Source: content.js — new module-level flag alongside isComputing
var isOnboardingActive = false;

// Inside processBoardState(), at the top of the compute block:
function processBoardState(boardState, isInitial) {
  if (isComputing) {
    console.log('[WordleBot] Skipping - already computing');
    return;
  }

  isComputing = true;

  // ... (existing: setLoading, filterCandidates, rankings, suggestions build) ...

  // Store for UI consumption (unchanged)
  window.WordleBot.lastSuggestions = suggestions;

  // NEW: skip render while onboarding is active
  if (!isOnboardingActive) {
    window.WordleBot.panelRenderer.render(suggestions, isInitial);
    if (window.WordleBot.dictionaryResult) {
      showSourceIndicator(window.WordleBot.dictionaryResult);
    }
  }

  // ... (existing: console.group logging unchanged) ...
}
```

**Critical detail:** The `isComputing` concurrency guard still applies. Only the render call is skipped, not the computation. `lastSuggestions` is always populated.

### Pattern 2: renderOnboarding() Function

**What:** A dedicated function that populates `state.body` with the onboarding overlay. Called once after `waitForBoard()` resolves and `window.WordleBot.isFirstInstall === true`.

**When to use:** Called from `backgroundInit()` in `content.js`, after the board is ready and the initial `processBoardState` has run (so `lastSuggestions` is populated before overlay shows — suggestions are "pre-warmed").

**Placement in backgroundInit():**

```javascript
// After waitForBoard() and after initial processBoardState():

if (window.WordleBot.isFirstInstall === true) {
  isOnboardingActive = true;
  renderOnboarding();
}

window.WordleBot.startObserver(function(boardState) {
  debouncedProcessBoardState(boardState);
});
```

**Why after initial processBoardState:** The initial `processBoardState` runs but isOnboardingActive is still false at that point, so the initial render populates the panel. Then we immediately set `isOnboardingActive = true` and call `renderOnboarding()` which overwrites the body with the overlay. This ensures `lastSuggestions` is populated by the time the user clicks "Got it". The user never sees the suggestions flash — the sequence is fast enough that the overlay mounts before the user can perceive the intermediate state.

**Alternative (preferred):** Set `isOnboardingActive = true` BEFORE calling the initial `processBoardState`, so the initial render is skipped entirely and the body goes directly to onboarding. Then call `renderOnboarding()`. This is cleaner — no intermediate render that gets overwritten.

```javascript
// Preferred sequence in backgroundInit():
if (window.WordleBot.isFirstInstall === true) {
  isOnboardingActive = true;
}

var initialState = window.WordleBot.readBoardState();
if (initialState) {
  processBoardState(initialState, true);  // computes but doesn't render (guard active)
}

if (window.WordleBot.isFirstInstall === true) {
  renderOnboarding();  // populate body with overlay after compute is done
}

window.WordleBot.startObserver(...);
```

### Pattern 3: Dismiss Handler

**What:** Event handler on the "Got it" button (and Escape key listener) that persists dismissal, tears down onboarding, and triggers the suggestions render.

**Sequence (locked decision: write storage BEFORE DOM removal):**

```javascript
function dismissOnboarding() {
  // 1. Persist dismissal first (before any DOM changes)
  chrome.storage.local.set({ wordlebot_onboarded: true }).then(function() {
    // 2. Clear onboarding flag
    isOnboardingActive = false;

    // 3. Remove overlay from panel body
    var body = window.WordleBot.panelUI.getBody();
    if (body) {
      body.innerHTML = '';
    }

    // 4. Render suggestions immediately (no loading delay)
    if (window.WordleBot.lastSuggestions) {
      window.WordleBot.panelRenderer.render(window.WordleBot.lastSuggestions, true);
      if (window.WordleBot.dictionaryResult) {
        showSourceIndicator(window.WordleBot.dictionaryResult);
      }
    } else {
      // Edge case: dismissed before background init completed
      var currentState = window.WordleBot.readBoardState();
      if (currentState && !isComputing) {
        processBoardState(currentState, true);
      }
    }

    // 5. Remove Escape key listener
    document.removeEventListener('keydown', escapeKeyHandler);
  }).catch(function(err) {
    console.warn('[WordleBot] Failed to write onboarded flag on dismiss: ' + err.message);
    // Even on storage failure: still dismiss the overlay (UX > persistence)
    isOnboardingActive = false;
    var body = window.WordleBot.panelUI.getBody();
    if (body) { body.innerHTML = ''; }
    if (window.WordleBot.lastSuggestions) {
      window.WordleBot.panelRenderer.render(window.WordleBot.lastSuggestions, true);
    }
    document.removeEventListener('keydown', escapeKeyHandler);
  });
}
```

**Note on storage write before DOM removal:** The locked decision says write storage BEFORE removing overlay. The `.then()` approach shown above does the DOM removal inside the then-callback, after the storage write resolves. However, `chrome.storage.local.set()` resolves in < 10ms in practice. The user will not perceive any delay. This satisfies the locked decision without adding visible latency.

**Alternative interpretation of "write before remove":** Start the write, then immediately remove the overlay without awaiting. If the write fails, the overlay is already gone but the user never sees it again (unless they clear storage). Given the locked decision says "ensures persistence even if DOM removal fails" (not "ensures DOM removal succeeds only if write succeeds"), the fire-and-forget approach is acceptable — but the `.then()` approach more precisely honors the intent.

### Pattern 4: Escape Key Handler

**What:** A named function (not anonymous) added as a `keydown` listener on `document` when the overlay mounts. Named so it can be removed cleanly on dismiss.

```javascript
function escapeKeyHandler(event) {
  if (event.key === 'Escape') {
    dismissOnboarding();
  }
}

// In renderOnboarding():
document.addEventListener('keydown', escapeKeyHandler);
```

**Scope:** The listener is on `document`. Shadow DOM does not capture keyboard events at the shadow root level for `keydown` — the event bubbles up to `document`. No special event handling needed for Shadow DOM keyboard events.

**Cleanup:** `document.removeEventListener('keydown', escapeKeyHandler)` in `dismissOnboarding()`. Failure to remove causes a permanent dangling listener that fires on every subsequent Escape press. The named function reference is essential — anonymous functions cannot be removed.

### Pattern 5: Onboarding CSS Rules in Existing Stylesheet

**What:** New CSS class rules added to `createStyles()` in `panelUI.js` inside the existing `css` string. These rules use the same `var(--wb-*)` custom properties that all other styles use.

**No new file.** Rules are appended to the existing constructable stylesheet string.

```css
/* Onboarding overlay — covers full panel body */
.onboarding-overlay {
  /* No absolute positioning needed — replaces body content entirely */
}

.onboarding-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 12px;
}

.onboarding-tips {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
}

.onboarding-tip {
  font-size: 13px;
  color: var(--wb-text);
  line-height: 1.5;
  padding: 8px 0;
  border-bottom: 1px solid var(--wb-border);
}

.onboarding-tip:last-child {
  border-bottom: none;
}

.onboarding-tip-number {
  font-weight: 600;
  color: var(--wb-text-secondary);
  margin-right: 6px;
}

.onboarding-dismiss-btn {
  display: block;
  width: 100%;
  padding: 10px 0;
  background-color: #6aaa64;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  margin-top: 4px;
}

.onboarding-dismiss-btn:hover {
  background-color: #538d4e;
}

.onboarding-dismiss-btn:focus {
  outline: 2px solid var(--wb-text-secondary);
  outline-offset: 2px;
}
```

**Button color rationale:** `#6aaa64` is the Wordle green already used for `.suggestion-card.top-suggestion` highlight (`rgba(106, 170, 100, 0.1)` extracts to `#6aaa64`). Using it as a solid button color creates visual consistency without introducing a new color token.

### Pattern 6: renderOnboarding() DOM Construction

**What:** Builds the overlay using `document.createElement()` calls (matching the codebase pattern — never `innerHTML` for dynamic content).

```javascript
function renderOnboarding() {
  var body = window.WordleBot.panelUI.getBody();
  if (!body) {
    console.warn('[WordleBot] renderOnboarding: panel body not available');
    return;
  }

  body.innerHTML = '';
  body.style.opacity = '1';

  var overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';

  var title = document.createElement('div');
  title.className = 'onboarding-title';
  title.textContent = 'Welcome to WordleBot!';
  overlay.appendChild(title);

  var tips = [
    'WordleBot looks at the Wordle board and suggests the best next guess — ranked by how much each word narrows down the answer.',
    'Tap any suggestion to see why it\'s recommended. Tap again for more detail. Tap a third time to collapse it.',
    'Shift+click the refresh button to reset the dictionary if WordleBot ever gets out of sync with the game.'
  ];

  var tipsList = document.createElement('ol');
  tipsList.className = 'onboarding-tips';

  for (var i = 0; i < tips.length; i++) {
    var tip = document.createElement('li');
    tip.className = 'onboarding-tip';

    var num = document.createElement('span');
    num.className = 'onboarding-tip-number';
    num.textContent = (i + 1) + '.';

    var text = document.createTextNode(' ' + tips[i]);

    tip.appendChild(num);
    tip.appendChild(text);
    tipsList.appendChild(tip);
  }

  overlay.appendChild(tipsList);

  var btn = document.createElement('button');
  btn.className = 'onboarding-dismiss-btn';
  btn.setAttribute('type', 'button');
  btn.textContent = 'Got it';
  btn.addEventListener('click', dismissOnboarding);
  overlay.appendChild(btn);

  body.appendChild(overlay);

  // Escape key dismiss
  document.addEventListener('keydown', escapeKeyHandler);
}
```

**Note on `ol` vs styled divs:** Using an `<ol>` for numbered tips is semantically correct but the CSS list-style is set to `none` to control visual appearance manually via the `.onboarding-tip-number` span. This matches the codebase approach in `renderSuggestionCards` which builds structure via spans rather than relying on browser defaults.

### Anti-Patterns to Avoid

- **Injecting onboarding as a shadow root sibling (Option B):** Violates the locked decision. Option A (guard flag) is the required approach.

- **Calling `panelRenderer.showBodyLoading()` after onboarding mounts:** `showBodyLoading()` calls `body.innerHTML = ''` which would destroy the overlay. After `renderOnboarding()` is called, nothing should write to the panel body except `dismissOnboarding()`.

- **Using an anonymous function for the Escape key listener:** Cannot be removed with `removeEventListener`. Results in a permanent dangling listener.

- **Setting `isOnboardingActive = false` before the storage write resolves:** If the tab is closed after setting the flag false but before the storage write completes, the onboarding flag is not persisted. Always sequence: write storage → on success, set flag false and update DOM.

- **Skipping the `isOnboardingActive` check in the background update re-render path:** The background update path in `content.js` (lines 291-302) also calls `processBoardState()`. If `isOnboardingActive` is not checked there too, a background dictionary update could wipe the overlay. The guard in `processBoardState()` covers this automatically — all entry points flow through `processBoardState`.

- **Writing `wordlebot_onboarded: true` in `renderOnboarding()` (on show, not on dismiss):** If written on show and the user closes the tab without dismissing, the flag is set but the user never saw the full onboarding. On next load, no onboarding appears. Write only on explicit dismissal.

- **Not guarding against `isFirstInstall === null`:** Phase 16 initializes `isFirstInstall` to `null`. Phase 17 must check `=== true` (not truthiness), because `null` should not trigger onboarding.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Styled "Got it" button | Custom button component | `document.createElement('button')` with CSS via existing constructable stylesheet | No UI framework exists in this extension; the constructable stylesheet pattern is already established |
| Overlay persistence | Timer-based re-injection | `isOnboardingActive` flag blocking `panelRenderer.render()` | The flag approach is O(1) per render cycle; re-injection would add complexity and potential flicker |
| Storage write with retry | Manual retry loop | Standard `chrome.storage.local.set().catch()` | Chrome storage is reliable; failure is rare and non-critical (worst case: user sees onboarding one extra time) |

**Key insight:** This phase is 100% integration work against existing infrastructure. The panel, shadow DOM, stylesheet, storage API, and render cycle are all already built. Phase 17 only adds: one flag, two functions, one CSS block, and one check inside an existing function.

---

## Common Pitfalls

### Pitfall 1: processBoardState Destroys Overlay (Pitfall 3 from PITFALLS.md)

**What goes wrong:** `panelRenderer.render()` → `renderWithFade()` → `body.innerHTML = ''` wipes the onboarding overlay. Overlay appears for ~1 second (the debounce delay) then disappears on the first MutationObserver trigger.

**Why it happens:** Panel body is treated as a fully owned rendering surface cleared on every update.

**How to avoid:** The `isOnboardingActive` guard is the locked solution. Add the check inside `processBoardState()` AFTER building suggestions but BEFORE calling `panelRenderer.render()`. The guard must also protect the `showSourceIndicator()` call that follows render (also writes to body).

**Warning signs:** Overlay disappears after a tile is placed; console shows render cycle completing while overlay should be visible.

### Pitfall 2: Dismiss Triggers But Storage Write Fails Silently

**What goes wrong:** `chrome.storage.local.set()` fails (quota exceeded, browser policy, etc.). The dismiss handler removes the overlay anyway. On next load, `wordlebot_onboarded` is absent, `isFirstInstall === true`, and onboarding shows again.

**Why it happens:** Storage quota is shared across all extensions. Edge case but possible.

**How to avoid:** Always attach `.catch()` to the storage write. In the catch handler: still dismiss the UI (don't trap the user in onboarding) but log a warning. The user may see onboarding again on next load — this is the acceptable failure mode. Do NOT retry or show an error to the user.

**Warning signs:** Storage quota error in console. Onboarding reappears after dismissal on profiles with many extensions.

### Pitfall 3: Escape Key Listener Leaks

**What goes wrong:** The `keydown` listener added in `renderOnboarding()` is not removed in `dismissOnboarding()`. On subsequent page loads (if somehow onboarding is triggered again), a second listener is added. Each Escape key press fires the handler multiple times.

**Why it happens:** Anonymous functions or failure to call `removeEventListener` with the same function reference.

**How to avoid:** Use a named function reference (`escapeKeyHandler`) defined at module scope in `content.js`. Call `document.removeEventListener('keydown', escapeKeyHandler)` in `dismissOnboarding()`.

**Warning signs:** Pressing Escape triggers dismissOnboarding twice; console shows duplicate storage writes.

### Pitfall 4: isFirstInstall is null at Onboarding Check Time

**What goes wrong:** The onboarding check runs before `loadDictionaryAndCaches()` completes. `window.WordleBot.isFirstInstall` is still `null` (initialized at the top of content.js). Checking `isFirstInstall` truthiness treats `null` as false — no onboarding for a genuine first install.

**Why it happens:** The onboarding check is placed before `loadDictionaryAndCaches` resolves in `backgroundInit()`.

**How to avoid:** Place the `isFirstInstall === true` check AFTER `await loadDictionaryAndCaches(false)` returns. By that point, `isFirstInstall` is set to its final `true` or `false` value. Always use strict equality (`=== true`).

**Warning signs:** First-install user sees no onboarding on fresh install; `console.log` of `isFirstInstall` shows `null` at check time.

### Pitfall 5: Background Update Re-Render Wipes Overlay

**What goes wrong:** The background dictionary update path in `content.js` (lines 291-302) calls `processBoardState(currentState, false)` after rebuilding caches. If this fires while onboarding is active, the `isOnboardingActive` guard must be in place or the overlay is destroyed.

**Why it happens:** The background update path calls `processBoardState` directly, not through the debounced observer.

**How to avoid:** The `isOnboardingActive` guard inside `processBoardState()` automatically protects against this. No additional check needed in the background update path — as long as the guard is in `processBoardState` (not in the observer callback).

**Warning signs:** Background dictionary update destroys onboarding overlay; user sees suggestion panel appear under or instead of onboarding.

### Pitfall 6: Storage Write vs. DOM Removal Ordering

**What goes wrong:** Overlay is removed from DOM before `chrome.storage.local.set()` resolves. Tab closes in the ~10ms window. Onboarding state not persisted.

**Why it happens:** Fire-and-forget pattern: `chrome.storage.local.set({...})` is called without awaiting; DOM removal happens synchronously in the same click handler.

**How to avoid:** The locked decision mandates storage write BEFORE DOM removal. Implementation must sequence the write first. Using `.then()` (as shown in Pattern 3) ensures DOM removal only happens after the write resolves. This is a ~10ms delay the user will not perceive.

**Warning signs:** Onboarding reappears after dismiss on slow-storage environments; race condition visible only in test when simulating tab close immediately after "Got it" click.

---

## Code Examples

Verified patterns from direct codebase reading:

### backgroundInit Integration Point

```javascript
// Source: content.js lines 275-476 (backgroundInit) — integration point for Phase 17

scheduleCompute(async function backgroundInit() {
  try {
    var loadResult = await loadDictionaryAndCaches(false);
    // ... (existing timing, source indicator, background update check unchanged) ...

    // Phase 17: Set onboarding guard before initial processBoardState
    if (window.WordleBot.isFirstInstall === true) {
      isOnboardingActive = true;  // block render during initial compute
    }

    // ... (existing refresh button wiring unchanged) ...

    var initialState = window.WordleBot.readBoardState();
    if (initialState) {
      processBoardState(initialState, true);  // computes lastSuggestions; render blocked if onboarding
    }

    // Phase 17: Show onboarding overlay AFTER compute (lastSuggestions now populated)
    if (window.WordleBot.isFirstInstall === true) {
      renderOnboarding();
    }

    window.WordleBot.startObserver(function(boardState) {
      debouncedProcessBoardState(boardState);
    });

    // ... (existing timing log unchanged) ...
  } catch (err) {
    // ... (existing error handling unchanged) ...
  }
}, { timeout: 2000 });
```

### processBoardState Guard Insertion Point

```javascript
// Source: content.js processBoardState() — current render call at lines 356-361
// Existing code:
window.WordleBot.lastSuggestions = suggestions;
window.WordleBot.panelRenderer.render(suggestions, isInitial);
if (window.WordleBot.dictionaryResult) {
  showSourceIndicator(window.WordleBot.dictionaryResult);
}

// Phase 17 modification:
window.WordleBot.lastSuggestions = suggestions;
if (!isOnboardingActive) {
  window.WordleBot.panelRenderer.render(suggestions, isInitial);
  if (window.WordleBot.dictionaryResult) {
    showSourceIndicator(window.WordleBot.dictionaryResult);
  }
}
```

### CSS Addition to createStyles() in panelUI.js

```javascript
// Source: panelUI.js createStyles() — append to existing css string before sheet.replaceSync(css)
// Add after the '.dict-source' rule block (currently the last rule, line ~464):

'/* Onboarding overlay */\n' +
'.onboarding-title {\n' +
'  font-size: 15px;\n' +
'  font-weight: 600;\n' +
'  color: var(--wb-text);\n' +
'  margin-bottom: 12px;\n' +
'}\n' +
'\n' +
'.onboarding-tips {\n' +
'  list-style: none;\n' +
'  padding: 0;\n' +
'  margin: 0 0 16px 0;\n' +
'}\n' +
'\n' +
'.onboarding-tip {\n' +
'  font-size: 13px;\n' +
'  color: var(--wb-text);\n' +
'  line-height: 1.5;\n' +
'  padding: 8px 0;\n' +
'  border-bottom: 1px solid var(--wb-border);\n' +
'}\n' +
'\n' +
'.onboarding-tip:last-child {\n' +
'  border-bottom: none;\n' +
'}\n' +
'\n' +
'.onboarding-tip-number {\n' +
'  font-weight: 600;\n' +
'  color: var(--wb-text-secondary);\n' +
'  margin-right: 4px;\n' +
'}\n' +
'\n' +
'.onboarding-dismiss-btn {\n' +
'  display: block;\n' +
'  width: 100%;\n' +
'  padding: 10px 0;\n' +
'  background-color: #6aaa64;\n' +
'  color: #ffffff;\n' +
'  border: none;\n' +
'  border-radius: 4px;\n' +
'  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
'  font-size: 14px;\n' +
'  font-weight: 600;\n' +
'  cursor: pointer;\n' +
'  text-align: center;\n' +
'  margin-top: 4px;\n' +
'}\n' +
'\n' +
'.onboarding-dismiss-btn:hover {\n' +
'  background-color: #538d4e;\n' +
'}\n' +
'\n' +
'.onboarding-dismiss-btn:focus {\n' +
'  outline: 2px solid var(--wb-text-secondary);\n' +
'  outline-offset: 2px;\n' +
'}\n'
```

### Onboarding Copy (Draft for User Review)

```
Title: "Welcome to WordleBot!"

Tip 1: "WordleBot looks at your Wordle board and suggests the best next guess — ranked by how much each word narrows down the answer."

Tip 2: "Tap any suggestion to see why it's recommended. Tap again for more detail. Tap once more to collapse it."

Tip 3: "If WordleBot ever seems out of sync, Shift+click the refresh button in the top right to reset everything."

Button: "Got it"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No onboarding (v1.5) | In-panel overlay with guard flag | Phase 17 (v1.7) | First-time users get orientation without any extra UI surface |
| `chrome.runtime.onInstalled` for install detection | Storage-based detection (Phase 16) | Phase 16 (v1.7) | Works from content script; no background worker needed |
| Animation on overlay transitions | Instant removal (no animation) | Phase 17 locked decision | Eliminates visual complexity; suggestions appear immediately |

**Deprecated/outdated:**
- Option B (shadow root sibling) for onboarding mount: Considered in PITFALLS.md research but superseded by the locked Option A decision. Do not implement.

---

## Open Questions

1. **Post-dismiss render: lastSuggestions direct render vs. processBoardState call**
   - What we know: `window.WordleBot.lastSuggestions` is populated during `processBoardState` (line 353 in content.js). By the time the user clicks "Got it", the initial `processBoardState` has already run (guard prevented the render, but the compute happened). `lastSuggestions` should be non-null.
   - What's unclear: Edge case — user clicks "Got it" before `backgroundInit` fully completes (extremely fast dismiss). `lastSuggestions` would be `null`. The dismiss handler must check `lastSuggestions !== null` and fall back to calling `processBoardState`.
   - Recommendation: In `dismissOnboarding()`: if `window.WordleBot.lastSuggestions` is non-null, call `panelRenderer.render(window.WordleBot.lastSuggestions, true)` directly (instant, no recompute). If null, call `processBoardState(window.WordleBot.readBoardState(), true)` as fallback. This is the correct two-branch approach.

2. **Escape key listener on `document` vs. shadow root**
   - What we know: Keyboard events (`keydown`) bubble up through the Shadow DOM boundary to `document`. The NYT page does not consume Escape in a way that would prevent it reaching the WordleBot listener. `panelUI.js` uses `document.body` for its MutationObserver (theme detection), so accessing `document` from content scripts is already established.
   - What's unclear: If NYT Wordle adds its own Escape handler that calls `event.stopPropagation()`, WordleBot's listener would not fire. This is a theoretical risk; no evidence it occurs.
   - Recommendation: Use `document.addEventListener('keydown', escapeKeyHandler)` — the standard approach. If NYT intercepts Escape, the "Got it" button still works as the primary dismiss mechanism.

3. **showBodyLoading() interaction with onboarding**
   - What we know: `showBodyLoading()` is called at the start of `backgroundInit()` (`window.WordleBot.panelRenderer.showBodyLoading('Preparing suggestions…')` at line 270) BEFORE the onboarding check. By the time `renderOnboarding()` is called (after `loadDictionaryAndCaches` resolves), `showBodyLoading()` has long since been called.
   - What's unclear: The loading spinner shows briefly before onboarding appears. Users see: loading spinner → onboarding overlay. Is this the right UX?
   - Recommendation: Accept this sequence. The loading state is brief (< 2 seconds) and shows something is happening. When `renderOnboarding()` replaces it with the overlay, the transition is instant (no animation). This is preferable to showing the overlay during loading (which would race with the spinner).

---

## Sources

### Primary (HIGH confidence)

- `C:/WordleBot/src/content.js` — Direct reading of full file (500 lines): `processBoardState()` render call location (lines 356-361), `backgroundInit()` structure (lines 275-476), `isComputing` flag pattern (lines 41, 316), `showSourceIndicator()` calls, `window.WordleBot.lastSuggestions` assignment (line 353)
- `C:/WordleBot/src/panelRenderer.js` — Direct reading: `renderWithFade()` body.innerHTML='' pattern (lines 95-115), `render()` entry points, `showBodyLoading()` (lines 432-453)
- `C:/WordleBot/src/panelUI.js` — Direct reading: `createStyles()` constructable stylesheet (lines 118-468), `getBody()` (lines 529-531), `state.body` reference, existing CSS class patterns
- `C:/WordleBot/.planning/research/PITFALLS.md` — Pitfall 3 (body.innerHTML destroys overlay), Pitfall 6 (async dismiss write race condition), UX Pitfalls section
- `C:/WordleBot/.planning/phases/16-first-install-detection-logic/16-VERIFICATION.md` — Confirms Phase 16 complete: `window.WordleBot.isFirstInstall` set correctly at line 184, `wordlebot_onboarded` excluded from clearCaches (line 61)
- `C:/WordleBot/.planning/codebase/CONVENTIONS.md` — ES5 style (var, function, no async/await outside content.js), IIFE pattern, namespace pattern, `document.createElement` over innerHTML

### Secondary (MEDIUM confidence)

- `C:/WordleBot/.planning/ROADMAP.md` — Phase 17 success criteria, Plan dependency on Phase 16
- `C:/WordleBot/.planning/REQUIREMENTS.md` — ONBD-03 through ONBD-07 definitions and traceability
- `C:/WordleBot/manifest.json` — Confirmed: no `background` key, `"permissions": ["storage"]` only, no new permissions needed

### Tertiary (LOW confidence)

- Shadow DOM keyboard event bubbling behavior (keydown bubbles through shadow boundary to document) — confirmed from training knowledge; no Context7 source available. Confidence MEDIUM from multiple sources in training data. Backup: "Got it" button always works regardless.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs directly observed in working codebase
- Architecture: HIGH — isOnboardingActive guard pattern directly grounded in Pitfall 3 from PITFALLS.md research; all integration points identified from direct code reading
- Pitfalls: HIGH — Pitfalls 1, 3, 6 from PITFALLS.md directly apply; ordering of storage write vs DOM removal is the primary non-obvious constraint

**Research date:** 2026-02-18
**Valid until:** Stable — no external dependencies; all patterns internal to the codebase. Valid until Phase 17 is planned and executed.
