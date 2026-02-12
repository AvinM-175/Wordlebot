# Technology Stack

**Analysis Date:** 2026-02-12

## Languages

**Primary:**
- JavaScript (ES5/ES6) - All source code in `src/` directory
- Plain vanilla JavaScript (no transpilation, no build step)

## Runtime

**Environment:**
- Chrome Browser (Manifest V3 extension)
- Client-side only (content scripts running in browser context)

**Extension Context:**
- Manifest Version: 3
- Target: Chrome Extension
- Entry Point: Content script (`src/content.js`) injected on NYT Wordle pages

## Frameworks

**Core:**
- No frameworks used - Pure vanilla JavaScript
- Web APIs: Shadow DOM for UI isolation
- Native Chrome Extensions API (Manifest V3)

**UI:**
- Shadow DOM (native browser API) - used in `src/panelUI.js` for style isolation
- Inline CSS styling (no stylesheet bundling)

**Storage:**
- Chrome Storage API (chrome.storage.local) - for caching dictionaries and computed data
- localStorage (for panel collapse state preference)

**Testing:**
- Not detected - No test framework configured

**Build/Dev:**
- No build tool required
- No bundler (webpack, Rollup, esbuild, etc.)
- Loads directly as extension manifest

## Key Dependencies

**Critical:**
- None - extension has zero npm/external dependencies
- Uses only native browser APIs and Chrome Extensions APIs

**Infrastructure:**
- Word dictionary: Bundled locally in `data/NYTWordleList.txt` (13,751 words)
- No external libraries or frameworks
- All algorithms implemented from scratch

## External APIs & Services

**None:**
- No npm packages
- No external API calls (except fetching NYT Wordle JS bundle from nytimes.com)
- No CDN dependencies
- No analytics services
- No tracking or telemetry

## Configuration

**Extension Configuration:**
- `manifest.json` - Chrome Extension Manifest V3 configuration
  - Permissions: "storage" only
  - Content scripts: Loaded on `https://www.nytimes.com/games/wordle/*`
  - Web accessible resources: `data/NYTWordleList.txt` for NYT domain
  - Icons: 16px, 48px, 128px PNG files in `icons/` directory

**Dictionary:**
- Bundled: `data/NYTWordleList.txt` (newline-delimited, lowercase 5-letter words)
- Extraction: Dictionary can be extracted live from NYT's Wordle JS bundle via `src/dictExtractor.js`
- Caching: Computed data cached in chrome.storage.local with fingerprint validation

**Storage Keys:**
- `wordlebot_dict` - Cached dictionary and metadata
- `wordlebot_cache` - Computational cache (entropy, frequency tables)
- `wordlebot_panel_collapsed` - Panel UI state preference

## Environment Requirements

**Development:**
- Chrome browser (for testing extension)
- Text editor (no build tools required)
- Manual extension loading via chrome://extensions with developer mode

**Production:**
- Chrome browser only
- Requires "storage" permission

## Source Code Organization

**Entry Points:**
- `src/content.js` - Main entry point, orchestrates initialization and board state monitoring
- `manifest.json` - Extension configuration and content script injection

**Core Modules:**
- `src/dictionary.js` - Dictionary loading orchestrator (three-tier cascade: extraction → cache → bundled)
- `src/dictExtractor.js` - Live extraction of word lists from NYT Wordle JS bundle
- `src/domReader.js` - Board state reading from DOM
- `src/constraintEngine.js` - Constraint filtering based on tile feedback
- `src/entropyEngine.js` - Shannon entropy calculation and ranking
- `src/frequencyTables.js` - Letter frequency analysis
- `src/frequencyScorer.js` - Word commonness scoring
- `src/suggestionEngine.js` - Suggestion generation and formatting
- `src/panelUI.js` - Shadow DOM panel creation and management
- `src/panelRenderer.js` - Suggestion rendering to panel

**Assets:**
- `data/NYTWordleList.txt` - Bundled fallback word dictionary
- `icons/` - Extension icons (16, 48, 128px)

## Notable Technical Decisions

**No Build Process:**
- All JavaScript shipped as-is to avoid complexity and potential bugs
- No transpilation, no minification in development (extension handles compression)
- Vanilla JavaScript maintains full browser compatibility

**No Dependencies:**
- Zero npm packages - eliminates supply chain risk, version conflicts, and external vulnerabilities
- All algorithms (entropy, constraint filtering, frequency analysis) implemented in pure JavaScript

**Performance Optimization:**
- Staged initialization: Panel mounts immediately (fast), heavy computation deferred to idle callbacks
- Caching: Three-tier dictionary system (extracted → cached → bundled) for fast loads
- Computational caching: Frequency tables and entropy cache persisted with fingerprint validation
- Memoization: Constraint engine caches query results per board state

**Chrome Extension Specifics:**
- Manifest V3 (required by modern Chrome)
- Content script runs in page context (not background worker)
- Single permission: "storage" only
- Shadow DOM for CSS isolation from NYT styles

---

*Stack analysis: 2026-02-12*
