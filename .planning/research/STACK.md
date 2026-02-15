# Stack Research

**Domain:** Chrome Extension MV3 — dictionary change detection + first-install onboarding
**Researched:** 2026-02-14
**Confidence:** HIGH (grounded in existing working codebase; no external dependencies needed)

---

## Summary

Both new features (JS bundle fingerprinting and first-install onboarding) require **zero new libraries**. Every capability needed is already present in the codebase or is a built-in browser/Chrome Extension API. The research identifies the correct integration points, flags one architectural constraint, and specifies what NOT to add.

---

## Recommended Stack — New Capabilities Only

### Feature 1: Dictionary Change Detection (Bundle Fingerprinting)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `crypto.subtle.digest` | Web Crypto API (built-in) | SHA-256 hash of fetched JS bundle text | **Already in use** — `dictionary.js` lines 37-48 uses this exact API to hash word arrays. Extends naturally to hashing raw bundle text before extraction. Zero latency vs. full word comparison. |
| `chrome.storage.local` | Chrome Extension API (built-in) | Persist last-seen bundle URL hash alongside dictionary cache | **Already in use** — `wordlebot_dict` and `wordlebot_cache` keys already stored here. Adding `bundleUrlHash` field to `wordlebot_dict` entry requires no new infrastructure. |
| `TextEncoder` | Built-in Web API | Encode bundle text string to `Uint8Array` for `crypto.subtle` input | **Already in use** — `dictionary.js` line 40 uses `new TextEncoder()`. Pattern is identical. |

**How bundle fingerprinting works (no new tech):**

```javascript
// In dictExtractor.js: return bundle text hash alongside words
async function hashBundleText(text) {
  var encoder = new TextEncoder();
  var data = encoder.encode(text);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  var hashArray = new Uint8Array(hashBuffer);
  var hex = '';
  for (var i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}
```

Then in `dictionary.js`, compare `bundleHash` in cached entry against freshly computed hash. If they match, skip extraction entirely. If they differ, re-extract.

**Performance cost of hashing:** SHA-256 on a ~500KB JS bundle text takes ~1-3ms via SubtleCrypto (hardware-accelerated). This is negligible compared to the current extraction pipeline.

---

### Feature 2: First-Install Onboarding UI

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `chrome.storage.local` | Chrome Extension API (built-in) | First-run sentinel: check for absence of `wordlebot_onboarding_seen` key | **Already in use**. Pattern: `chrome.storage.local.get('wordlebot_onboarding_seen')` — if key is absent, show onboarding; on dismiss, set the key. Single `"storage"` permission already granted in manifest. |
| Shadow DOM (existing `panelUI.js`) | Built-in browser API | Host the onboarding overlay within the existing Shadow DOM | **Already in use** — the Shadow DOM panel in `panelUI.js` is the natural container. Injects onboarding HTML into the shadow root or panel body, style-isolated from NYT page. |
| `content.js` init function | Existing module | Trigger point: check sentinel before `backgroundInit()` runs | **Already in use** — the `(async function init())` in `content.js` is where first-run check belongs. No additional trigger mechanism needed. |

**Why NOT `chrome.runtime.onInstalled` (important constraint):**

The manifest has no background service worker (`"background"` key is absent). `chrome.runtime.onInstalled` only fires in background/service worker context — it is NOT available in content scripts. Adding a background service worker solely for first-run detection would:
1. Require a new `background.js` file and manifest change
2. Add inter-script messaging complexity (service worker → content script)
3. Create a new test surface

**Use `chrome.storage.local` sentinel instead** — it works within content script context, requires no manifest changes, uses the already-granted `"storage"` permission, and is the standard pattern for extensions without a background script.

```javascript
// In content.js init() — before backgroundInit():
async function checkFirstInstall() {
  var stored = await chrome.storage.local.get('wordlebot_onboarding_seen');
  return !stored.wordlebot_onboarding_seen;
}

async function markOnboardingSeen() {
  await chrome.storage.local.set({ wordlebot_onboarding_seen: true });
}
```

---

## Supporting Libraries

None. All required capabilities are native browser APIs or Chrome Extension APIs already in use.

| Library | Decision | Reason |
|---------|----------|--------|
| `js-sha256` or similar | Do NOT add | `crypto.subtle.digest` is already working in this codebase (evidenced by `dictionary.js` lines 37-48) |
| `murmur3` / `xxhash` / FNV | Do NOT add | SHA-256 via SubtleCrypto is fast enough (~1-3ms for bundle text), already proven, and produces consistent 64-char hex output for storage |
| Any UI framework | Do NOT add | Shadow DOM + vanilla JS pattern is established across 4,434 LOC; introducing a framework now would be inconsistent and add bundle complexity |
| Any onboarding library | Do NOT add | A dismissable overlay is 30-40 lines of vanilla JS; the Shadow DOM isolation already handles style conflicts |

---

## Development Tools

No new dev tools required. Existing workflow (manual extension reload + TEST-CHECKLIST.md) applies.

---

## Installation

No new packages. Zero `npm install` required.

---

## Alternatives Considered

### Hashing Alternatives

| Recommended | Alternative | Why Not Alternative |
|-------------|-------------|---------------------|
| `crypto.subtle.digest('SHA-256', ...)` | Comparing word array length + first/last word as "lightweight fingerprint" | Already have SHA-256 working; a lightweight fingerprint can miss insertions in the middle of the array. SHA-256 catches any change. |
| `crypto.subtle.digest('SHA-256', ...)` on raw bundle text | SHA-256 on extracted word array (current approach in `dictionary.js`) | Hashing bundle text detects changes *before* the expensive word extraction. Word-array hashing requires extraction first, which is what we want to avoid when the bundle hasn't changed. |
| `crypto.subtle.digest('SHA-256', ...)` | `crypto.subtle.digest('SHA-1', ...)` | SHA-1 is deprecated for new uses. SHA-256 is already in use. No reason to mix algorithms. |

### Onboarding Trigger Alternatives

| Recommended | Alternative | Why Not Alternative |
|-------------|-------------|---------------------|
| `chrome.storage.local` sentinel in content script | `chrome.runtime.onInstalled` in service worker | No service worker exists in manifest. Adding one solely for first-run detection adds architectural complexity (messaging, new background.js, manifest change) with no other benefit. |
| `chrome.storage.local` sentinel | `localStorage` sentinel | `localStorage` is per-origin (nytimes.com domain), not per-extension. NYT could clear it, or it could conflict with NYT's own storage. `chrome.storage.local` is isolated to the extension. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `chrome.runtime.onInstalled` | Requires background service worker not present in manifest; adds messaging overhead | `chrome.storage.local` sentinel key checked in content script `init()` |
| External hashing library (e.g., `js-sha256`) | `crypto.subtle.digest` is already proven in this codebase; external dependency adds bundle size and maintenance surface | `crypto.subtle.digest('SHA-256', ...)` — already implemented in `dictionary.js` |
| `localStorage` for onboarding state | Per-origin, not per-extension; can be cleared by the host page or user; not isolated | `chrome.storage.local` — extension-scoped, already granted |
| Background service worker | Sole justification (first-install trigger) doesn't warrant new architectural layer; would require message passing from SW → content script | Content script `chrome.storage.local` check |
| Hashing the entire bundle on every page load | SHA-256 on 500KB text takes ~1-3ms but is redundant if the bundle URL hasn't changed | Compare bundle URL first; only hash if URL is new or URL-based invalidation is insufficient |

---

## Stack Patterns for This Milestone

**Bundle change detection pattern:**

If bundle URL changes (webpack hash in filename): invalidation is free — the URL itself signals a change. No hashing needed for URL-based invalidation.

If bundle URL stays the same but content changes (less common for webpack): hash the fetched text and compare against cached `bundleTextHash` stored in `wordlebot_dict`.

**Recommended layered approach:**
1. Check bundle URL against `cachedBundleUrl` in stored entry — free, no hashing
2. If URL changed: re-extract (no hash needed, URL is sufficient signal)
3. If URL same: hash fetched text, compare against `cachedBundleHash` — catches edge cases where NYT redeploys same-named file

**First-install pattern:**

```javascript
// Sentinel check (content script, no service worker needed)
var stored = await chrome.storage.local.get('wordlebot_onboarding_seen');
var isFirstInstall = !stored.wordlebot_onboarding_seen;

if (isFirstInstall) {
  showOnboarding(); // render into shadow DOM
}

function dismissOnboarding() {
  chrome.storage.local.set({ wordlebot_onboarding_seen: true });
  hideOnboarding();
}
```

---

## Version Compatibility

| API | Chrome Version Required | Notes |
|-----|------------------------|-------|
| `crypto.subtle.digest` | Chrome 37+ | Already used in `dictionary.js`; no compatibility concern |
| `chrome.storage.local` | Chrome 33+ (MV3: required) | Already used throughout codebase |
| `chrome.storage.local` Promise API (`await chrome.storage.local.get()`) | Chrome 88+ | Already used with `await` throughout `dictionary.js` and `content.js` |
| Shadow DOM v1 | Chrome 53+ | Already used in `panelUI.js` |
| `TextEncoder` | Chrome 38+ | Already used in `dictionary.js` |

All APIs in use are Chrome 88+ minimum. MV3 itself requires Chrome 88+. No compatibility gaps.

---

## Storage Key Plan

Extending the existing `wordlebot_dict` cache entry (no new storage keys needed for fingerprinting):

```javascript
// Existing wordlebot_dict entry (from dictionary.js)
{
  words: [...],
  fingerprint: "abc123...",      // SHA-256 of word array (existing)
  extractedAt: 1234567890,       // timestamp (existing)
  bundledFingerprint: "...",     // bundled dict fingerprint (existing)
  source: "extracted",           // existing

  // NEW FIELDS for bundle change detection:
  bundleUrl: "https://...",      // URL of fetched bundle (new)
  bundleHash: "def456..."        // SHA-256 of raw bundle text (new)
}

// New standalone key for onboarding
"wordlebot_onboarding_seen": true   // set on dismiss
```

Total new storage keys: 1 (`wordlebot_onboarding_seen`). Two new fields on existing entry.

---

## Sources

- `C:/WordleBot/src/dictionary.js` lines 37-48 — Direct evidence: `crypto.subtle.digest('SHA-256')` working in this extension context (HIGH confidence)
- `C:/WordleBot/src/dictionary.js` lines 152-216 — Direct evidence: `chrome.storage.local.get/set` with Promise API in use (HIGH confidence)
- `C:/WordleBot/manifest.json` — Direct evidence: no `"background"` key; only `"storage"` permission; confirms `chrome.runtime.onInstalled` is not available without manifest change (HIGH confidence)
- `C:/WordleBot/src/content.js` lines 221-439 — Direct evidence: `init()` function structure is the correct injection point for first-run check (HIGH confidence)
- `C:/WordleBot/src/panelUI.js` — Direct evidence: Shadow DOM panel infrastructure exists for onboarding overlay rendering (HIGH confidence)
- Chrome Extension MV3 specification (training data, January 2025) — `chrome.runtime.onInstalled` fires in service worker context only; `chrome.storage.local` sentinel is standard pattern for extensions without background scripts (MEDIUM confidence — unverified via official docs due to tool restrictions; consistent with manifest structure evidence)

---
*Stack research for: Chrome Extension MV3 — dictionary fingerprinting and first-install onboarding*
*Researched: 2026-02-14*
