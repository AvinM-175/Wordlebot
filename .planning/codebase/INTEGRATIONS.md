# External Integrations

**Analysis Date:** 2026-02-12

## APIs & External Services

**NYT Wordle Game Bundle (Read-Only):**
- Service: New York Times Wordle JS Bundle
- What it's used for: Live extraction of official word dictionary
- URL Pattern: `https://www.nytimes.com/games-assets/v2/*.js`
- Method: HTTP fetch (no authentication required)
- Client/SDK: Fetch API (native browser)
- Discovery: Multi-strategy (Performance API, DOM script tags, HTML parsing)
- Location in code: `src/dictExtractor.js` - `findBundleUrl()`, `fetchBundleText()`

**NYT Wordle Page Content:**
- Service: New York Times Wordle game page
- What it's used for: Reading game board state (tile colors, letters, game status)
- URL: `https://www.nytimes.com/games/wordle/*`
- Method: DOM inspection via querySelector, querySelectorAll
- Location in code: `src/domReader.js` - reads DOM with CSS selectors and data attributes

## Data Storage

**Dictionary Storage:**

**Primary Storage - Chrome Storage API:**
- Backend: `chrome.storage.local` (extension local storage)
- Keys:
  - `wordlebot_dict` - Cached dictionary with metadata and freshness timestamp
  - `wordlebot_cache` - Computational cache (frequency tables, entropy cache)
- Purpose: Persist precomputed data between sessions for fast loading
- Client: Native Chrome Storage API
- Quota: Typical 10MB limit (WordleBot uses <1MB)
- Location in code:
  - `src/dictionary.js` - lines 80-120 (dictionary cache management)
  - `src/content.js` - lines 172-214 (computational cache management)

**Secondary Storage - localStorage:**
- Backend: Browser localStorage (HTML5)
- Key: `wordlebot_panel_collapsed`
- Purpose: Persist panel UI state (collapsed/expanded preference)
- Location in code: `src/panelUI.js` - STORAGE_KEY constant and state persistence

**Bundled Fallback Dictionary:**
- Location: `data/NYTWordleList.txt`
- Format: Newline-delimited list of lowercase 5-letter words
- Size: 13,751 words (~96KB)
- Purpose: Built-in offline fallback when extraction or cache unavailable
- Access: Via `chrome.runtime.getURL()` and fetch API

## Data Flow: Dictionary Loading (Three-Tier Cascade)

```
1. EXTRACTION TIER (freshest)
   └─ src/dictExtractor.js: Extract word lists from NYT JS bundle
      └─ fetch from https://www.nytimes.com/games-assets/v2/*.js
         └─ Regex parse: solutions and guess arrays
            └─ Fingerprint (SHA-256) and validate

2. CACHE TIER (fastest repeat loads)
   └─ src/dictionary.js: Check chrome.storage.local['wordlebot_dict']
      └─ If fingerprint matches extracted → return cached
      └─ If stale (>30 days) → use silently as fallback
      └─ If fingerprint mismatch → invalidate

3. BUNDLED TIER (always available)
   └─ data/NYTWordleList.txt
      └─ fetch(chrome.runtime.getURL('data/NYTWordleList.txt'))
         └─ Parse, fingerprint, validate
```

**Retry Logic:**
- Extraction failure: Retry once after 12 seconds (Decision #4 in code)
- If second attempt fails: Fall back to cached (if available) or bundled
- Location: `src/dictionary.js` - lines 140-200 (loadExtractedDictionary function)

## File Storage

**None explicitly used:**
- No persistent file uploads or downloads
- No IndexedDB usage
- All data stays local in chrome.storage

## Caching Strategy

**Dictionary Fingerprinting (SHA-256):**
- Computed via Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`)
- Purpose: Validate dictionary consistency between tiers, detect changes
- Location: `src/dictionary.js` - `computeFingerprint()` function

**Computational Cache (Persistence):**
- Cached items:
  - Frequency tables (positional and bigram letter frequencies)
  - Commonness scores (letter commonness ranking)
  - Entropy cache (precomputed information gain rankings for first-guess position)
- Invalidation: Cleared when dictionary fingerprint changes
- Serialization: Custom serialization methods in frequency and entropy modules
- Location: `src/content.js` - lines 206-214 (cache persistence)

**Memory Caches (Session-Only):**
- Constraint engine memoization cache: Per-boardstate query results
- Entropy engine: First-guess rankings cached after initial computation
- Location: `src/constraintEngine.js` - `cache` object, `src/entropyEngine.js` - `firstGuessCache`

## Authentication & Identity

**Auth Provider:**
- None - Extension requires no authentication
- No login, no user accounts, no API keys
- No identity verification needed

**Permissions:**
- Chrome Permission: `storage` (only permission required)
- Scope: Allows read/write to chrome.storage.local
- Justification: Caching dictionary and computational results

## Monitoring & Observability

**Error Tracking:**
- None configured - No external error reporting service
- Errors logged to browser console only
- Location: `src/content.js` - error handling at lines 322-326, 380-383

**Logs:**
- Browser console logging only
- Prefixed with `[WordleBot]` for easy filtering
- Locations:
  - `src/content.js` - Detailed timing and state logs
  - `src/dictionary.js` - Dictionary loading progress
  - All modules - Initialization and error reporting

**Performance Monitoring:**
- Manual performance.now() timing checkpoints
- Timing summary logged at startup
- Location: `src/content.js` - TIMING object and console.log at lines 419-424

## CI/CD & Deployment

**Hosting:**
- None required - Deployed via Chrome Web Store
- No server backend

**Deployment Method:**
- Manual: Upload to Chrome Web Store
- Version: Managed in `manifest.json` - `"version": "1.0.0"`

**Distribution:**
- Chrome Web Store (primary distribution)
- Side-loading via manual extension installation (developer testing)

## Environment Configuration

**Required Env Vars:**
- None - Zero external environment variables

**Secrets Location:**
- No secrets used (no API keys, no credentials)
- No .env file needed

**Config Files:**
- `manifest.json` - Extension configuration (permissions, content scripts, resources)
- No separate config file for settings

## Webhooks & Callbacks

**Incoming Webhooks:**
- None

**Outgoing Webhooks:**
- None - No external callbacks or notifications

## Browser APIs Used

**Fetch API:**
- Dictionary extraction from NYT bundle
- Bundled dictionary loading
- Location: `src/dictExtractor.js`, `src/dictionary.js`

**DOM APIs:**
- querySelector, querySelectorAll - Board state reading
- Shadow DOM - UI isolation
- Location: `src/domReader.js`, `src/panelUI.js`

**Chrome APIs:**
- `chrome.storage.local.get()` - Read cache
- `chrome.storage.local.set()` - Write cache
- `chrome.storage.local.remove()` - Clear cache
- `chrome.runtime.getURL()` - Access bundled resources
- Location: `src/content.js`, `src/dictionary.js`

**Web Crypto API:**
- SHA-256 fingerprinting
- Location: `src/dictionary.js` - `computeFingerprint()`

**Performance API:**
- Timing measurements
- Bundle URL discovery
- Location: `src/content.js`, `src/dictExtractor.js`

**MutationObserver / ResizeObserver:**
- Board state change detection (implicit in DOM monitoring)
- Location: `src/content.js` - `startObserver()` function

## Cross-Origin Restrictions

**Same-Origin:**
- Content script runs in `https://www.nytimes.com/games/wordle/*` context
- DOM access: Full access to NYT Wordle page elements

**Cross-Origin:**
- Fetch to `https://www.nytimes.com/games-assets/v2/*.js` permitted (same origin)
- Fetch to `data/NYTWordleList.txt` (extension resource) permitted

## Data Sensitivity

**No Personal Data Collected:**
- No user tracking
- No analytics
- No data sent anywhere
- All processing happens locally

**Cache Contents:**
- Dictionary words (public domain)
- Frequency tables (derived from dictionary, no personal data)
- Entropy cache (derived computations, no personal data)

---

*Integration audit: 2026-02-12*
