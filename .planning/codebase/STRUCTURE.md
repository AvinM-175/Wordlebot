# Codebase Structure

**Analysis Date:** 2026-02-12

## Directory Layout

```
WordleBotFeb/
├── manifest.json           # Chrome extension v3 manifest
├── src/                    # Core extension source code
│   ├── content.js          # Main orchestrator & pipeline
│   ├── domReader.js        # Board state extraction & observation
│   ├── dictionary.js       # Dictionary loading orchestrator (3-tier cascade)
│   ├── dictExtractor.js    # Live extraction from page
│   ├── frequencyTables.js  # Letter frequency statistics
│   ├── frequencyScorer.js  # Word commonness scoring
│   ├── constraintEngine.js # Constraint filtering & memoization
│   ├── entropyEngine.js    # Shannon entropy ranking & first-guess cache
│   ├── suggestionEngine.js # Synthesis & mode detection
│   ├── panelUI.js          # Shadow DOM panel lifecycle
│   └── panelRenderer.js    # Suggestion card rendering
├── data/                   # Bundled resources
│   └── NYTWordleList.txt   # Fallback word list (2915 words)
├── icons/                  # Extension icons
│   ├── icon16.png          # Taskbar/tab icon (16px)
│   ├── icon48.png          # Extension menu icon (48px)
│   └── icon128.png         # Chrome Web Store icon (128px)
├── docs/                   # Product & design documentation
│   ├── PROBLEM-STATEMENT.md
│   ├── PRODUCT-SUMMARY.md
│   ├── AI-DESIGN-DECISIONS.md
│   ├── UX-ETHICAL-CONSTRAINTS.md
│   ├── TEST-CHECKLIST.md
│   └── V2-ROADMAP.md
└── .planning/              # GSD planning documents
    └── codebase/
        ├── ARCHITECTURE.md # (This file)
        └── STRUCTURE.md    # (You are here)
```

## Directory Purposes

**src/:**
- Purpose: All extension source code (JavaScript modules)
- Contains: Content script modules implementing pipeline layers
- Key files: `content.js` (entry point), `domReader.js` (DOM integration), `entropyEngine.js` (core algorithm)

**data/:**
- Purpose: Extension resource assets (web-accessible to content scripts)
- Contains: Bundled fallback word list
- Key files: `NYTWordleList.txt` (2915 five-letter words)

**icons/:**
- Purpose: Extension UI icons (referenced in manifest.json)
- Contains: PNG icons at 16, 48, 128px for various Chrome UI contexts

**docs/:**
- Purpose: Product documentation and design decisions
- Contains: Problem statement, feature specifications, roadmap, UX constraints
- Key files: `PROBLEM-STATEMENT.md` (pain point analysis), `AI-DESIGN-DECISIONS.md` (technical choices)

**.planning/codebase/:**
- Purpose: GSD (Generation, Specification, Documentation) codebase analysis
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md
- Generated: No (manually authored by mapping agents)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `manifest.json`: Chrome extension v3 manifest; declares content_scripts, permissions, icons, web-accessible resources
- `src/content.js`: Content script entry point; initializes pipeline, manages lifecycle, coordinates all modules

**Configuration:**
- `manifest.json`: Permissions (storage), content script injection (NYT Wordle domain), web-accessible resources (bundled word list)

**Core Logic:**
- `src/entropyEngine.js`: Shannon entropy computation, pattern matching (base-3 encoding), dual-ranking strategy
- `src/constraintEngine.js`: Constraint derivation from feedback, candidate filtering with memoization
- `src/suggestionEngine.js`: Mode detection, suggestion synthesis, explanation generation
- `src/dictionary.js`: Three-tier loading cascade, fingerprinting, cache invalidation

**UI & Presentation:**
- `src/panelUI.js`: Shadow DOM panel initialization, theme detection, collapse/expand state
- `src/panelRenderer.js`: Suggestion card rendering, fade transitions, edge state handling
- `src/domReader.js`: Board state extraction, DOM change observation, stabilization logic

**Testing:**
- None yet (no .test.js files); manual testing checklist in `docs/TEST-CHECKLIST.md`

**Data:**
- `data/NYTWordleList.txt`: 2915 five-letter words, one per line; fetched via chrome.runtime.getURL()

## Naming Conventions

**Files:**
- camelCase.js (e.g., `entropyEngine.js`, `frequencyTables.js`)
- Descriptive names indicating module responsibility
- No underscores or hyphens

**Directories:**
- lowercase (e.g., `src`, `data`, `icons`, `docs`, `.planning`)

**Functions & Variables:**
- camelCase (e.g., `readBoardState()`, `filterCandidates()`, `computeEntropy()`)
- Prefixed with verb or adjective for clarity (e.g., `build*`, `compute*`, `render*`, `derive*`)

**DOM Elements & CSS:**
- kebab-case classes (e.g., `dict-source`, `panel-body`)
- data-* attributes for semantic state (e.g., `data-state` for tile feedback)

**Constants:**
- UPPER_CASE (e.g., `DEBOUNCE_DELAY`, `ADAPTIVE_THRESHOLD`, `TILES_PER_ROW`)

**Exports to window.WordleBot namespace:**
- `window.WordleBot.readBoardState` (domReader)
- `window.WordleBot.waitForBoard` (domReader)
- `window.WordleBot.startObserver` (domReader)
- `window.WordleBot.stopObserver` (domReader)
- `window.WordleBot.loadDictionary` (dictionary)
- `window.WordleBot.entropy` (entropyEngine)
- `window.WordleBot.freq` (frequencyTables)
- `window.WordleBot.constraints` (constraintEngine)
- `window.WordleBot.suggestions` (suggestionEngine)
- `window.WordleBot.panelUI` (panelUI)
- `window.WordleBot.panelRenderer` (panelRenderer)
- `window.WordleBot.clearCaches` (content)
- Plus module state: `dictionary`, `dictionaryResult`, `lastSuggestions`, `panel`, `SELECTORS`

## Where to Add New Code

**New Feature (e.g., new ranking strategy):**
- Primary code: Add function to appropriate layer (e.g., new scoring method → `src/frequencyScorer.js` or new module in `src/`)
- Integration point: Wire into `src/content.js` processBoardState() pipeline or `src/suggestionEngine.js` buildSuggestions()
- Tests: Add `.test.js` file next to source file (co-located pattern)
- Documentation: Update `docs/AI-DESIGN-DECISIONS.md` if design rationale, or `docs/V2-ROADMAP.md` if feature roadmap

**New Component/Module (e.g., keyboard shortcut handler):**
- Implementation: Create `src/[name].js` following IIFE pattern with window.WordleBot.* exports
- Entry point: Register in `src/content.js` initialization or listener setup
- Dependencies: List in file header comment
- Examples: `src/panelUI.js`, `src/entropyEngine.js`

**Utilities (e.g., common math function):**
- Shared helpers: Create in `src/[name].js` or inline in `src/content.js` if small (< 50 lines)
- Export: Add to window.WordleBot namespace for cross-module access
- Example: `debounce()` function inlined in content.js

**New UI Element:**
- Shadow DOM insertion: `src/panelUI.js` (panel host & CSS)
- Rendering: `src/panelRenderer.js` (content generation)
- Styling: Inline CSS in panelUI.js (self-contained Shadow DOM)
- Example: Dictionary source indicator in panelRenderer.js lines 56-134

**New Data Source:**
- Bundled resources: Place in `data/` and declare in `manifest.json` web_accessible_resources
- Fetch code: Add to `src/dictionary.js` or new module
- Example: `data/NYTWordleList.txt` with chrome.runtime.getURL()

## Special Directories

**data/:**
- Purpose: Static assets bundled with extension
- Generated: No
- Committed: Yes
- Access: Via chrome.runtime.getURL('data/NYTWordleList.txt') in content scripts

**.planning/codebase/:**
- Purpose: GSD planning documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes (by GSD mapping agents)
- Committed: Yes
- Consumed by: `/gsd:plan-phase` and `/gsd:execute-phase` orchestrators

**docs/:**
- Purpose: Product documentation, design decisions, roadmap
- Generated: No (manually maintained)
- Committed: Yes
- Read-only for code (reference only)

**icons/:**
- Purpose: Extension UI assets
- Generated: No
- Committed: Yes
- Used by: manifest.json icons declaration

## Module Load Order

Chrome manifest.json content_scripts enforce strict load order (lines 15-26 of manifest.json):

1. `src/dictExtractor.js` - Dictionary extraction utilities
2. `src/dictionary.js` - Dictionary orchestration (depends on #1)
3. `src/domReader.js` - DOM utilities (independent)
4. `src/frequencyTables.js` - Frequency table engine (independent)
5. `src/frequencyScorer.js` - Commonness scoring (depends on #4)
6. `src/entropyEngine.js` - Entropy computation (depends on #4, #5)
7. `src/constraintEngine.js` - Constraint filtering (depends on #4)
8. `src/suggestionEngine.js` - Suggestion synthesis (depends on above)
9. `src/panelUI.js` - Panel UI (independent)
10. `src/panelRenderer.js` - Panel rendering (depends on #9)
11. `src/content.js` - Main orchestrator (depends on all above)

**Important:** Do not reorder without checking transitive dependencies. Each module exports to window.WordleBot namespace; later modules assume earlier ones are initialized.

---

*Structure analysis: 2026-02-12*
