# Pitfalls Research

**Domain:** Chrome Extension — dictionary fingerprinting + first-install onboarding (content script only, no background service worker)
**Researched:** 2026-02-14
**Confidence:** HIGH (based on codebase analysis) / MEDIUM (Chrome API edge cases from training knowledge, tools unavailable for live verification)

---

## Critical Pitfalls

### Pitfall 1: First-Install Detection Requires a Service Worker That Doesn't Exist

**What goes wrong:**
`chrome.runtime.onInstalled` only fires in background service workers (and previously in background pages). It does NOT fire in content scripts. The current manifest has no `background` service worker. Developers assume they can detect first install from within `content.js`, try `chrome.runtime.onInstalled.addListener(...)` from the content script, and nothing happens — the onboarding never shows, silently.

**Why it happens:**
MV3 documentation examples show `chrome.runtime.onInstalled` in context, but always in a background script. Without a background script, the only option is an indirect approach: the content script reads a storage key on every load and infers first-install from its absence.

**How to avoid:**
Use storage-based first-run detection entirely from the content script, without `onInstalled`:

```javascript
// In content.js (or a dedicated onboarding.js)
async function checkFirstInstall() {
  var stored = await chrome.storage.local.get('wordlebot_onboarding');
  return !stored.wordlebot_onboarding; // true = first install
}
```

Set the key after dismissal, not after showing. If you set it on show and then the user closes the tab before dismissing, they'll see the onboarding again. Only mark dismissed when the user explicitly acts.

**Warning signs:**
- Adding `chrome.runtime.onInstalled.addListener` to a content script file (this throws no error but never fires)
- Onboarding never appears at all in testing
- Console shows no errors related to onboarding

**Phase to address:** Onboarding implementation phase

---

### Pitfall 2: Extension Update Triggers Onboarding Again for Existing Users

**What goes wrong:**
The storage flag (`wordlebot_onboarding`) is absent in users who installed before v1.7. When v1.7 ships, every existing user appears as a "first install" because the key was never written. They get the onboarding overlay on top of the working panel they already know how to use — confusing and intrusive.

**Why it happens:**
The "never seen onboarding" state (key absent) is identical for a true first install and a user who installed before onboarding existed. Without distinguishing between them, all pre-v1.7 users see the overlay.

**How to avoid:**
Version the onboarding state:

```javascript
// Check for specific onboarding version, not just presence
var stored = await chrome.storage.local.get('wordlebot_onboarding');
var hasSeenV17 = stored.wordlebot_onboarding &&
                  stored.wordlebot_onboarding.version === 'v1.7';
```

Alternatively, write an "already installed" marker on first load of any version, and check both: `onboardingDismissed` OR `hasUsedBefore`. If either is true, skip onboarding. A user with cached data in `wordlebot_dict` or `wordlebot_cache` has clearly used the extension before.

The simplest heuristic: if `wordlebot_cache` or `wordlebot_dict` already exists in storage, this is an existing user — don't show onboarding.

**Warning signs:**
- Testing onboarding against a fresh install works, but loading the extension on a profile that ran v1.5 shows the overlay
- Users report seeing "how it works" instructions for an extension they've been using for weeks

**Phase to address:** Onboarding implementation phase — write the first-run detection logic before implementing the UI

---

### Pitfall 3: `body.innerHTML = ''` in panelRenderer Destroys Onboarding Overlay

**What goes wrong:**
`panelRenderer.render()` and `renderWithFade()` both call `body.innerHTML = ''` to clear the panel before rendering new content. Any onboarding overlay injected into the panel body will be wiped out on the first board state update, typically within 1-2 seconds of page load.

The call chain: `init()` in `content.js` calls `processBoardState()` shortly after mounting, which calls `panelRenderer.render()`, which clears body. The onboarding disappears before users read it.

**Why it happens:**
The panel body is treated as a fully owned rendering surface that gets cleared on each update cycle. Onboarding content appended to `body` does not survive renders.

**How to avoid:**
Two safe approaches:

Option A — Block renders while onboarding is visible. Add an `isOnboardingActive` flag that `processBoardState` checks before calling `panelRenderer.render()`. Render is deferred until onboarding is dismissed.

Option B — Use the Shadow DOM host, not the panel body. Inject the onboarding overlay as a sibling of `.panel` inside the shadow root, not as a child of `.body`. This survives all panel body clears.

Option A is simpler and prevents the jarring experience of suggestions appearing beneath an onboarding overlay. Option B allows suggestions to load while onboarding is shown (useful if onboarding is non-blocking).

**Warning signs:**
- Onboarding shows for ~1 second then disappears
- `body.innerHTML = ''` appears in render path that runs during onboarding
- Onboarding unit tests pass (no board state changes) but integration fails

**Phase to address:** Onboarding UI phase — verify the onboarding component against the render lifecycle before finalizing

---

### Pitfall 4: SHA-256 Fingerprint Runs on Every Page Load Even When Cache is Fresh

**What goes wrong:**
`dictionary.js` calls `computeFingerprint(words)` after every successful extraction (`tryExtractionWithRetry`). If the extracted word list is large (~13,751 words), the SHA-256 computation takes 5-50ms depending on device. More critically, `getBundledFingerprint()` is called at the start of every `loadDictionary()` call, which loads and hashes the entire bundled file if not memoized.

The memoization (`_bundledCache`) is per-session (page-scoped variable), so it resets on every page load. This means every page load hashes the bundled dictionary file. With a fresh cache, this bundled hash is computed, compared to the stored `bundledFingerprint`, and if they match the cached live dictionary is used — so the bundled hash is always computed even when the cache is perfectly fresh.

**Why it happens:**
The current code correctly memoizes within a session but the memoized variable dies with the page. The design requires the bundled fingerprint as an invalidation signal, which mandates computing it on every load.

**How to avoid:**
Two strategies:

1. Store the bundled fingerprint itself in `chrome.storage.local` alongside the dictionary cache. On load, read both the cached fingerprint AND the stored bundled fingerprint. Compute the actual bundled fingerprint only when the stored value is absent. This trades a storage read for a hash computation on most loads.

2. Accept the overhead since it runs inside `requestIdleCallback`. The bundled file is ~70KB; SHA-256 over it is fast. Benchmark it before optimizing. The current code already defers via `scheduleCompute` with a 2000ms timeout.

If measured and found acceptable (< 20ms), document it as "by design" and don't over-engineer. If blocking UI is observed, move the bundled hash to a stored value.

**Warning signs:**
- Performance.now() timing shows `dict_caches` step taking > 100ms on cold load
- Users on lower-end devices report panel taking several seconds to show suggestions
- Bundle hash computation in DevTools Performance profile shows on main thread before `requestIdleCallback` call

**Phase to address:** Dictionary fingerprinting phase — benchmark before implementing stored-fingerprint optimization

---

### Pitfall 5: Hash Computed Over Sorted Words But Extraction Order Is Non-Deterministic

**What goes wrong:**
`computeFingerprint` sorts the words before hashing: `words.slice().sort().join('\n')`. This is correct for stability, but only if the word arrays coming from different extraction paths (live extraction, cached, bundled) are compared against hashes that were also sorted. If any code path computes a fingerprint over an unsorted array, the fingerprints will not match even when the word sets are identical, triggering a false "dictionary changed" detection and a full cache rebuild.

**Why it happens:**
The NYT bundle may return words in different orders across chunks (see `disambiguateArrays` — words from multiple JS chunks are concatenated with `.concat()`). The order of `allCandidates` passed to `disambiguateArrays` depends on the order chunks are fetched. Sort normalization in `computeFingerprint` handles this, but a developer adding a new extraction path who forgets to pass through `computeFingerprint` (and instead stores a raw order-dependent hash) would create a silent false-change detector.

**How to avoid:**
Never store or compare a fingerprint that was not computed by `computeFingerprint`. Treat that function as the single canonical hashing function. Add an inline comment documenting the sort-normalization invariant. If a faster hashing approach is introduced (e.g., for performance), it must also sort first.

**Warning signs:**
- `wordlebot_cache` is rebuilt on every page load despite the word list not changing
- Fingerprint in logs changes between loads for the same NYT bundle
- Console shows "Dictionary fingerprint changed" on every load

**Phase to address:** Dictionary fingerprinting phase

---

### Pitfall 6: Onboarding Dismissed State Not Written Atomically With Render

**What goes wrong:**
The onboarding dismiss sequence is: user clicks "Got it" button, the overlay hides (CSS or DOM removal), and the storage write happens asynchronously. If the user immediately closes the tab or the write fails (storage quota exceeded, concurrent write contention with `wordlebot_cache` being written simultaneously), the dismissed state is not persisted. On next visit, the onboarding appears again.

**Why it happens:**
`chrome.storage.local.set()` is async. If the event handler does `overlay.remove()` then `await chrome.storage.local.set(...)`, and the tab is closed between those two operations, the write never completes. The UI disappears but the state is not saved.

**How to avoid:**
- Write storage first, hide overlay on the `then()` callback (or `await` the write before removing the overlay). This means a slight delay (< 10ms) but guarantees the state is persisted before the UI confirms.
- Alternatively, write storage synchronously using `localStorage` as a fast-path (already used by panelUI for collapse state), then write `chrome.storage.local` as backup. Read from `chrome.storage.local` on next load, fall back to `localStorage` if storage is unavailable.
- Keep the dismiss key separate from other writes. Don't batch it with dictionary cache writes; they're unrelated and the dictionary write may fail independently.

**Warning signs:**
- Onboarding reappears after dismissal on slow connections or tab-close-immediately scenarios
- Storage quota errors in console (unlikely at this scale, but worth checking)
- Race condition visible in test: simulate tab close immediately after click

**Phase to address:** Onboarding implementation phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip service worker, detect first-install via storage absence | No manifest change, no new file | Cannot distinguish true first install from pre-v1.7 user without heuristics | Only if combined with "existing cache = existing user" check |
| Use localStorage for onboarding dismissed state (like collapse pref) | Zero async issues | State lost on `localStorage.clear()`, not shared across devices | Acceptable for local-only UX preference |
| Hash bundled dictionary on every load (no stored bundled fp) | Simpler code | ~5-20ms on every cold load, runs in requestIdleCallback so low risk | Acceptable until profiling shows it matters |
| Inject onboarding inside panel body (not shadow root sibling) | Simpler DOM structure | Destroyed on first render() call | Never — use shadow root sibling instead |
| Show onboarding even while suggestions are computing | Simpler sequencing | Suggestions pop in under onboarding overlay | Only if onboarding blocks the body area explicitly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `chrome.storage.local` + first-install | Reading absence of key as "new user" without version guard | Check for existing data (dict/cache keys) as proxy for existing user |
| `chrome.runtime.onInstalled` | Calling it from a content script | Only works in background service workers; use storage-based detection in content scripts |
| `panelRenderer.render()` | Injecting persistent UI elements into panel body | Inject into the shadow root directly as a sibling to `.panel`, not into `.body` |
| `requestIdleCallback` timeout | Setting timeout too short for slow devices | The existing 2000ms timeout is appropriate; don't reduce it for onboarding checks |
| `crypto.subtle.digest` | Running SHA-256 synchronously | It's async; always `await` it; failure to await causes silent undefined fingerprint |
| `chrome.storage.local` write concurrency | Writing onboarding dismissed at same time as dict cache save | Use separate keys with separate `set()` calls; storage writes to different keys don't conflict |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fingerprint computed on main thread before `requestIdleCallback` | Panel mount stutters; board feels unresponsive | All fingerprint computation must be inside the `scheduleCompute` callback | On any device; immediately |
| Bundle text fetch for hash comparison (not needed for change detection) | Extraction takes 500ms+ even when cache is warm | Fingerprinting uses the already-extracted words array, not a re-fetch of the bundle | On slow connections; every load |
| Onboarding overlay with CSS animation on Shadow DOM mount | Layout thrash when panel animates in + overlay animates in simultaneously | No animation on onboarding panel itself; keep it static until DOM is stable | On initial load |
| SHA-256 over 13,751 words × ~5 chars each (~70KB string) | 5-50ms blocking depending on device | Runs inside `requestIdleCallback` — already mitigated. Benchmark before adding extra calls | On low-end devices if called multiple times per load |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing onboarding dismissed in `window` namespace instead of storage | Any page script could fake-dismiss the onboarding | Always use `chrome.storage.local` or `localStorage` (not accessible to page scripts from content script context) |
| Injecting onboarding HTML with `innerHTML` using user-controlled strings | XSS within Shadow DOM | Onboarding text is static hardcoded strings; never use `innerHTML` with dynamic content |
| Trusting fingerprint stored in `chrome.storage.local` as a security boundary | Not a security concern here — fingerprint is only for cache invalidation | No action needed; fingerprint is advisory not authoritative |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Onboarding blocks suggestions for existing users who get it on update | Frustration: users know the product, get a tutorial they didn't ask for | Gate onboarding on "no prior usage data" check, not just absence of dismiss key |
| Onboarding shown while panel is still in "Preparing suggestions..." loading state | Overlay competes visually with loading spinner; feels broken | Delay onboarding show until loading state resolves OR design onboarding to be the loading state |
| Dismiss button inside Shadow DOM panel not obviously a button | Users don't know they can dismiss | Use explicit "Got it" button with affordance, not just an X close icon |
| Onboarding text refers to features the user hasn't seen yet | "Click to expand cards" is meaningless before cards appear | Show onboarding after the first suggestions render, not immediately on mount |
| Onboarding too wide disrupts panel layout on narrow screens | Overlaps NYT content on mobile-width viewports | Match panel's responsive collapse breakpoint; don't show onboarding when viewport < 600px |
| "Dictionary changed" notification shown as a persistent indicator | Users think something is broken | Show as a one-time, auto-dismissing message or just log it; don't add a permanent indicator |

---

## "Looks Done But Isn't" Checklist

- [ ] **Fingerprint stability:** Verify fingerprint is identical across three consecutive loads with the same NYT bundle — proves sort-normalization is working
- [ ] **First-install detection (existing users):** Load the extension on a profile with existing `wordlebot_cache` data — onboarding must NOT appear
- [ ] **First-install detection (true new user):** Load in a fresh profile with all storage cleared — onboarding MUST appear
- [ ] **Onboarding survives board state change:** Dismiss and re-show onboarding, then simulate a board tile change via MutationObserver — verify overlay is not wiped
- [ ] **Onboarding dismissed persists across page reload:** Dismiss, reload NYT Wordle, verify onboarding does not reappear
- [ ] **Onboarding dismissed persists across extension update:** Dismiss in v1.7, simulate extension reload (chrome://extensions → reload), verify onboarding does not reappear
- [ ] **Hash computation doesn't stall the main thread:** Check DevTools Performance panel; fingerprint computation must appear inside idle callback, not blocking page paint
- [ ] **False positive change detection:** Load extension twice in a row, ensure "Dictionary fingerprint changed" is NOT logged on second load when bundle hasn't changed
- [ ] **False negative change detection:** Manually change a word in `wordlebot_dict` in DevTools → Application → Storage, reload, verify fingerprint mismatch is detected and cache is rebuilt

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Onboarding shown to all existing users on v1.7 ship | LOW | Deploy v1.7.1 hotfix: add existing-user heuristic check, set dismissed flag retroactively via content script if `wordlebot_cache` is present |
| Onboarding wiped by render() on first board state | MEDIUM | Add `isOnboardingActive` guard in `processBoardState` or move overlay to shadow root sibling |
| Fingerprint false-positive causing cache rebuild every load | LOW | Fix sort normalization, re-test, ship patch. Users experience one extra slow load after the fix deploys |
| `chrome.runtime.onInstalled` added to content script (silently does nothing) | LOW | Move detection logic to storage-based approach; no user-visible impact during the broken period |
| Dismiss state lost on tab-close race condition | LOW | Write storage before hiding overlay; affected users see onboarding one extra time; self-healing on next dismissal |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| First-install via `onInstalled` from content script | Before any onboarding code is written — architecture decision | Check that no `chrome.runtime.onInstalled` call exists in any content script file |
| Update triggers onboarding for existing users | Onboarding implementation — first-run detection logic | Test against profile with existing `wordlebot_cache` data |
| `body.innerHTML = ''` destroys overlay | Onboarding UI phase — decide mounting point before implementing | Integration test: trigger board state change while onboarding is visible |
| SHA-256 blocking main thread | Dictionary fingerprinting phase — verify it's inside `requestIdleCallback` | DevTools Performance profile on cold load |
| Hash false-positive on unsorted words | Dictionary fingerprinting phase — add sort-normalization test | Log fingerprint across 3 consecutive loads; must be identical |
| Onboarding dismissed state lost (async write) | Onboarding implementation — write-before-hide pattern | Simulate tab close immediately after dismiss click; reload and verify it doesn't reappear |
| Onboarding shown on narrow viewport | Onboarding UI phase — responsive check | Test at 400px viewport width |

---

## Sources

- Codebase analysis: `C:/WordleBot/src/content.js`, `dictionary.js`, `dictExtractor.js`, `panelUI.js`, `panelRenderer.js`, `manifest.json` (2026-02-14)
- Chrome Extension MV3 content script API scope: `chrome.runtime.onInstalled` is background-only (HIGH confidence from training; tools unavailable for live verification)
- `crypto.subtle.digest` async behavior: MDN Web Docs (HIGH confidence from training)
- `chrome.storage.local` async semantics and quota behavior: Chrome Extension docs (MEDIUM confidence from training; tools unavailable for live verification)
- Shadow DOM isolation and `innerHTML` clearing pattern: Observed directly in `panelRenderer.renderWithFade` (HIGH confidence)
- MV3 manifest structure: `manifest.json` — no `background` key present (HIGH confidence, direct observation)

---
*Pitfalls research for: Chrome Extension dictionary fingerprinting + first-install onboarding*
*Researched: 2026-02-14*
