# Testing Patterns

**Analysis Date:** 2026-02-12

## Test Framework

**Status:**
- **No automated testing infrastructure detected**
- No test files (*.test.js, *.spec.js) found in codebase
- No Jest, Vitest, Mocha, or other test runner configuration
- No test scripts in manifest or build configuration

**Implications:**
- Testing is manual/browser-based only
- Browser extension content script loaded directly into NYT Wordle page
- Validation occurs at runtime via console debugging

## Test Coverage Gaps

**Untested Areas:**

**DOM Reading Layer (`domReader.js`):**
- Board state extraction from NYT Wordle DOM
- Selector stability across NYT Wordle versions
- Fallback parsing (aria-label extraction when textContent fails)
- MutationObserver stabilization logic
- Board readiness detection (waitForBoard function)
- Files: `C:\WordleBotFeb\src\domReader.js`
- Risk: High - DOM selectors brittle; NYT changes will break silently
- Current validation: Manual visual inspection only

**Constraint Engine (`constraintEngine.js`):**
- Input validation function (`validateBoardState`)
- Constraint derivation logic (greens, yellows, grays)
- Memoization cache correctness
- Edge cases: duplicate letters in word, all tiles same status
- Files: `C:\WordleBotFeb\src\constraintEngine.js`
- Risk: High - Incorrect constraints cause wrong candidate filtering
- Current validation: No unit tests; verified manually via console logging

**Entropy Calculation (`entropyEngine.js`):**
- Pattern ID encoding/decoding (base-3 representation)
- Two-pass feedback computation with duplicate letter handling
- Shannon entropy calculation across buckets
- First-guess cache serialization/deserialization
- Files: `C:\WordleBotFeb\src\entropyEngine.js`
- Risk: Very High - Mathematical correctness critical; subtle off-by-one errors possible
- Current validation: Manual calculation check only

**Frequency Scoring (`frequencyScorer.js`):**
- Weight composition formula (positional, overall, bigram)
- Commonness normalization
- Tie-breaking between equal-entropy words
- Files: `C:\WordleBotFeb\src\frequencyScorer.js`
- Risk: Medium - Incorrect weights affect recommendation quality but not correctness
- Current validation: Tuning via manual observation of top suggestions

**Integration Across Modules:**
- Dictionary loading cascade (extraction → cache → bundled)
- Cache fingerprint invalidation
- State recovery from persisted cache
- Module initialization order dependencies
- Files: `C:\WordleBotFeb\src\content.js`, `C:\WordleBotFeb\src\dictionary.js`
- Risk: High - Cascading failures if one step breaks
- Current validation: Manual end-to-end testing in browser

**UI Rendering (`panelRenderer.js`, `panelUI.js`):**
- Shadow DOM isolation and CSS scoping
- Theme detection and switching (dark/light mode)
- Progressive disclosure state management
- Body fade transitions
- Files: `C:\WordleBotFeb\src\panelUI.js`, `C:\WordleBotFeb\src\panelRenderer.js`
- Risk: Low-Medium - Visual issues but not algorithmic
- Current validation: Browser inspector and manual theme toggling

**Chrome Storage API (`content.js`):**
- chrome.storage.local.get/set operations
- Cache serialization (Uint8Array → JSON → Uint8Array)
- localStorage fallbacks (for collapse preference)
- Concurrent cache writes
- Files: `C:\WordleBotFeb\src\content.js`
- Risk: Medium - Storage failures cause silent cache misses
- Current validation: No tests; rely on error logging

## Manual Testing Approach

**Current Workflow:**
1. Load extension in Chrome via `chrome://extensions/`
2. Navigate to NYT Wordle game
3. Visual inspection: Compare suggestions against manual decision tree
4. Console logs checked for errors and performance timing
5. Theme toggle tested manually
6. Refresh button tested (normal and shift-click)

**Test Scenarios Run Manually:**
- First guess: Compare entropy rankings with expected algorithm
- Mid-game: Test constraint filtering with known board state
- Late game: Verify "only answer" highlighting with 1 candidate
- Error states: Intentionally break DOM selectors, verify error message
- Cache behavior: Clear storage, reload, verify performance difference
- Theme switching: Toggle NYT dark/light, verify panel adapts

## Recommended Testing Strategy

**Priority 1 - Constraint Engine:**
```javascript
// Pattern: Verify filterCandidates() with known inputs
const testCases = [
  {
    boardState: {
      guesses: [{
        word: 'SLATE',
        tiles: [
          {letter: 'S', status: 'correct', position: 0},
          {letter: 'L', status: 'present', position: 1},
          // ...
        ]
      }],
      totalRows: 6,
      status: 'in_progress'
    },
    expectedCandidates: ['SLING', 'SLUMP', ...],
    shouldNotInclude: ['SLATE', 'TESTS', ...]
  }
  // ... more cases
];
```

**Priority 2 - Entropy Calculation:**
```javascript
// Pattern: Verify pattern computation with duplicate letters
// Test: word="TESTS" (repeated T,S), guess="SPEED"
// Should correctly mark: S(pos0)=yellow, P(pos2)=absent, E(pos3)=correct, E(pos4)=correct, D=absent
```

**Priority 3 - Integration:**
```javascript
// Pattern: Simulate full game flow
// 1. Load dictionary
// 2. Present board state changes
// 3. Verify suggestions update correctly
// 4. Cache serialization/restore
```

**Suggested Test Structure (if implementing):**
```
test/
├── unit/
│   ├── constraintEngine.test.js
│   ├── entropyEngine.test.js
│   ├── frequencyScorer.test.js
│   └── domReader.test.js
├── integration/
│   ├── fullGameFlow.test.js
│   ├── cacheManagement.test.js
│   └── themeHandling.test.js
└── fixtures/
    ├── boardStates.js
    ├── dictionaries.js
    └── mockDOM.js
```

## Performance Validation (Current)

**Timing Checkpoints Logged:**
```javascript
// From content.js
console.log('[WordleBot] Panel mounted: ' + (TIMING.t_panel_mount - TIMING.t_start).toFixed(0) + 'ms');
console.log('[WordleBot] Dictionary + caches ready: ' + (TIMING.t_dict_loaded - TIMING.t_start).toFixed(0) + 'ms');
console.log('[WordleBot] Board ready: ' + (TIMING.t_board_ready - TIMING.t_start).toFixed(0) + 'ms');
console.log('[WordleBot] First suggestions: ' + (TIMING.t_first_suggestions - TIMING.t_start).toFixed(0) + 'ms');
```

**Metrics Observed:**
- Panel mount: ~0-10ms (DOM creation)
- Dictionary load: ~50-200ms (depends on source: extraction vs. cache vs. bundled)
- Board ready detection: ~100-500ms (wait for DOM elements)
- First suggestions: ~200-600ms total from content script load

**No automated performance regression testing** - measured via console logs only.

## Known Testing Limitations

1. **Browser API Dependencies:**
   - chrome.storage.local mocked or unavailable in test environment
   - Require headless Chrome or explicit browser API stubs

2. **DOM Dependencies:**
   - domReader.js tightly coupled to NYT Wordle markup
   - Requires either actual NYT page or mock DOM fixture with exact selectors

3. **Async Complexity:**
   - Multiple Promise chains (extraction, cache load, initialization)
   - Timing-sensitive operations (stabilization checks, animation frames)
   - No Promise/async-await testing utilities detected

4. **Shadow DOM Isolation:**
   - panelUI.js uses Shadow DOM; CSS isolation hard to test without actual browser
   - Adopted stylesheets require CSSOM support

## Debugging Tools Used

**Browser Console:**
- All modules log to `console.*` with `[WordleBot]` prefix
- Timing data available via `TIMING` object in `content.js`
- Cache inspection: `chrome.storage.local.get()` in console
- Module state accessible: `window.WordleBot.dictionary`, `window.WordleBot.constraints`, etc.

**Chrome DevTools:**
- Source maps not detected (no compiled/minified code)
- Breakpoints set directly in src files
- Network tab shows dictionary extraction fetch
- Storage tab shows `wordlebot_dict` and `wordlebot_cache` entries

**Manual Validation Method (Current):**
```javascript
// In browser console, after game started:
window.WordleBot.readBoardState()  // See current board state
window.WordleBot.constraints.filterCandidates(
  window.WordleBot.dictionary,
  window.WordleBot.readBoardState()
)  // Verify candidate filtering
window.WordleBot.lastSuggestions  // See rendered suggestions
```

---

*Testing analysis: 2026-02-12*
