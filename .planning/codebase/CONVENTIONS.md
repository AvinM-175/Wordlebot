# Coding Conventions

**Analysis Date:** 2026-02-12

## Naming Patterns

**Files:**
- Camel case: `frequencyScorer.js`, `constraintEngine.js`, `panelRenderer.js`
- Purpose-descriptive names indicating module responsibility
- Example: `domReader.js` for DOM reading logic, `entropyEngine.js` for entropy calculations

**Functions:**
- Camel case with verb-first descriptive names: `scoreWord()`, `readBoardState()`, `buildTables()`, `filterCandidates()`
- Private helper functions prefixed with underscore by convention (via inline comment): `// --- Private` sections
- Setter/getter pattern: `setCollapsed()`, `getBody()`, `isCollapsed()`
- Action verbs: `build*`, `compute*`, `derive*`, `filter*`, `detect*`, `render*`, `load*`

**Variables:**
- Camel case: `boardState`, `constraintResult`, `frequencyTables`, `isComputing`
- Constants in UPPER_SNAKE_CASE: `DEBOUNCE_DELAY`, `EVALUATED_STATES`, `TOTAL_ROWS`, `FIRST_GUESS_CACHE_SIZE`
- Closure variables preserved across module lifecycle: `state`, `cache`, `encodedWords`, `dictionary`
- Abbreviated for hot paths: `wc` (wordCount), `pos` (position), `fp` (fingerprint)

**Types:**
- Objects prefixed with type-hinting: `boardState`, `constraintResult`, `dictionaryResult`, `frequencyTables`
- Enum-like strings: `'correct'`, `'present'`, `'absent'` for tile statuses; `'dark'`, `'light'` for themes
- Namespace object: `window.WordleBot` as central singleton for all modules

## Code Style

**Formatting:**
- No linter/formatter detected - code uses consistent manual formatting
- 2-space indentation throughout
- Semicolons required at statement ends
- No trailing commas in objects/arrays
- Brace style: opening brace on same line (Allman style NOT used)
- Line length: generally kept under 100 characters where practical

**Linting:**
- No ESLint or Prettier configuration detected
- `'use strict';` declared at module level in IIFE closures
- No TypeScript or transpilation in pipeline
- Raw ES5 JavaScript with no async/await (Promise-based async)

**Example style from `constraintEngine.js`:**
```javascript
function validateBoardState(boardState) {
  if (!boardState || !Array.isArray(boardState.guesses)) {
    return 'Invalid board state: missing guesses array';
  }
  for (var g = 0; g < boardState.guesses.length; g++) {
    var guess = boardState.guesses[g];
    if (!guess.tiles || guess.tiles.length !== 5) {
      return 'Invalid guess at index ' + g + ': expected 5 tiles';
    }
  }
  return null;
}
```

## Import Organization

**Module System:**
- No import/require statements - uses global namespace pollution via `window.WordleBot`
- Each script in `manifest.json` loaded in sequence; order matters (see content_scripts array)
- Execution order: dictExtractor → dictionary → domReader → frequencyTables → frequencyScorer → entropyEngine → constraintEngine → suggestionEngine → panelUI → panelRenderer → content.js

**Namespace Pattern:**
- Global namespace: `window.WordleBot = window.WordleBot || {}`
- Sub-namespaces: `window.WordleBot.freq`, `window.WordleBot.entropy`, `window.WordleBot.constraints`
- Module state private within IIFE, exports to namespace: `window.WordleBot.methodName = methodName`
- Example from `frequencyScorer.js`:
```javascript
var ns = window.WordleBot.freq;
ns.scoreWord = scoreWord;
ns.scoreWords = scoreWords;
ns.computeCommonness = computeCommonness;
```

**Path Aliases:**
- No aliases - all file references relative within manifest

## Error Handling

**Patterns:**
- Validation-first with early returns: Check preconditions, return error info or null
- Two modes: Return error in result object vs. throw exception
- Validation errors returned as `warning` property: See `constraintEngine.js` `filterCandidates()`
- Extraction failures logged but fall back gracefully (three-tier cascade in `dictionary.js`)
- Try-catch for async operations with console.warn/error logging
- User-friendly error messages in `getUserFriendlyError()` mapping generic errors to NYT Wordle context

**Example from `constraintEngine.js`:**
```javascript
function filterCandidates(dictionary, boardState) {
  var validationError = validateBoardState(boardState);
  if (validationError) {
    return {
      candidates: [],
      unconstrained: false,
      warning: validationError,
      // ... empty constraints
    };
  }
  // ... proceed with filtering
}
```

**Error Logging:**
```javascript
console.error('[WordleBot] Processing error:', err.message);
console.warn('[WordleBot] Constraint warning: ' + result.warning);
```

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**
- Prefixed with module indicator: `'[WordleBot]'` for all logs (enables filtering)
- Levels used: `console.log()` (info), `console.warn()`, `console.error()`, `console.group()`
- Performance timing logged: `'Panel mounted: ' + (t_panel_mount - t_start).toFixed(0) + 'ms'`
- State changes logged: Board state updates, cache operations, dictionary loads
- Progress indicators: `'[WordleBot] Waiting for game board (click Play to start)...'`

**Example from `content.js`:**
```javascript
console.group('[WordleBot] Suggestions (' + suggestions.mode + '):');
console.log('Header:', suggestions.header);
console.log('Top picks:', suggestions.suggestions.map(function (s) {
  return s.word + ' (' + s.confidence + '%) ' + s.whyLine;
}));
console.groupEnd();
```

## Comments

**When to Comment:**
- Algorithm explanations: Complex entropy calculations, constraint derivation (see `entropyEngine.js`)
- Decision rationale: References to CONTEXT.md decisions (e.g., "CONTEXT Decision #3" in `content.js`)
- State transitions: Mode detection logic, loading phases
- Performance notes: Cache behavior, hot-path optimizations
- Fallback logic: Multi-tier cascades (extraction → cache → bundled)

**JSDoc/TSDoc:**
- Limited use; primary in UI modules with detailed docstrings
- Function-level documentation: `@param` and `@returns` for public API
- Example from `panelUI.js`:
```javascript
/**
 * Get stored collapse preference from localStorage
 */
function getStoredCollapsed() {
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch (e) {
    // localStorage may be blocked
    return false;
  }
}
```

**Section Headers:**
- Multi-dash separators: `// --- Core: Two-pass feedback pattern ---`
- Used to organize large modules into logical phases
- Makes navigation via grep easier

## Function Design

**Size:**
- Range: 5-100 lines typical
- Larger functions (100-200 lines) used for multi-phase initialization (e.g., `init()` in `content.js`)
- Strategies: Decompose into helpers for reusable logic, keep orchestration/initialization monolithic

**Parameters:**
- 1-3 parameters typical; avoids parameter objects except for result/options bundles
- Options objects used for configuration: `shadow.adoptedStyleSheets = [sheet]`
- Callbacks passed directly: `function(boardState) { ... }`

**Return Values:**
- Single return type per function (void, object, array, string, boolean)
- Result objects with consistent properties: `{ candidates, unconstrained, warning, constraints }`
- Null for "not found" / "invalid" cases (not undefined for consistency)
- Early return pattern reduces nesting

**Example from `domReader.js`:**
```javascript
function readBoardState() {
  var allTiles = document.querySelectorAll(SELECTORS.allTiles);
  if (allTiles.length < EXPECTED_TILE_COUNT) {
    console.warn('[WordleBot] Expected ' + EXPECTED_TILE_COUNT + ' tiles, found ' + allTiles.length);
    return null;
  }
  // ... processing
  return {
    guesses: guesses,
    totalRows: TOTAL_ROWS,
    status: status
  };
}
```

## Module Design

**Exports:**
- All modules export via `window.WordleBot` namespace (no module.exports)
- Public API at bottom of file, clearly marked
- Example from `frequencyTables.js`:
```javascript
var ns = window.WordleBot.freq = window.WordleBot.freq || {};
ns.buildTables = buildTables;
ns.restoreTables = restoreTables;
ns.serializeTables = serializeTables;
ns.tables = null;  // populated after buildTables() called
```

**Barrel Files:**
- Not used; each module self-contained within single file

**IIFE Pattern:**
- All substantial modules wrapped in Immediately Invoked Function Expression: `(function() { 'use strict'; ... })();`
- Prevents namespace pollution
- Creates closure for private module state
- Example: `frequencyScorer.js`, `constraintEngine.js`, `panelUI.js`

**Module State:**
- Declared at top of IIFE: `var positionalFreq = null;`, `var cache = {};`
- Persists across function calls (session lifetime)
- Cleared via explicit `clearCache()` or `clearTables()` methods
- Thread-safety note: Single-threaded JavaScript, no concurrent access concerns

---

*Convention analysis: 2026-02-12*
