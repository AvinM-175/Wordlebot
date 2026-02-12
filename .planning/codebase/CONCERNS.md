# Codebase Concerns

**Analysis Date:** 2026-02-12

## Tech Debt

**Polling Fallback in domReader.js:**
- Issue: When MutationObserver fails to find board container, code falls back to polling at 1-second intervals with no cleanup mechanism
- Files: `src/domReader.js` (lines 200-214)
- Impact: Continuous polling runs for entire game session, consuming CPU even when game is idle; no unsubscribe mechanism if container appears later
- Fix approach: Implement retry logic that upgrades from polling to MutationObserver if container becomes available; add maximum polling duration or manual disconnect requirement

**Memory Leak in panelUI Theme Observer:**
- Issue: `setupThemeObserver()` creates a MutationObserver without storing reference for cleanup. If panel is destroyed/recreated, observer persists
- Files: `src/panelUI.js` (lines 703-739)
- Impact: Multiple observers accumulate if panel reinitializes; duplicate theme change handlers fire; memory grows with each reinitialization
- Fix approach: Store observer reference in module state; add `destroy()` function to disconnect all observers; call destroy before reinit

**Unbounded Cache Growth in constraintEngine.js:**
- Issue: Memoization cache uses board state as key but never invalidates. Long game sessions can accumulate many cache entries with no eviction policy
- Files: `src/constraintEngine.js` (lines 10-11, 339-342, 390-391)
- Impact: Memory usage grows linearly with number of unique board states tested; no LRU or size limit; stale cache entries never cleared
- Fix approach: Implement simple LRU cache with 100-entry limit; clear cache on new game detection; or implement max age per entry

**Debounced Processing Race Condition:**
- Issue: `content.js` debounces board state changes with `isComputing` flag, but debounce timer cancels and reschedules without guarantee previous computation finished
- Files: `src/content.js` (lines 334-336, 254)
- Impact: If user rapidly changes tiles while computation is slow, debounce may schedule new computation before previous one completes, violating the `isComputing` guard
- Fix approach: Wait for computation promise to finish before allowing new schedule; use async/await chain instead of flag-based guard

**Undocumented Dictionary Cache Invalidation Overlap:**
- Issue: Two separate cache systems exist (wordlebot_dict and wordlebot_cache) with different invalidation triggers. fingerprint matching logic scattered across dictionary.js and content.js
- Files: `src/dictionary.js` (lines 160, 178, 209-213); `src/content.js` (lines 171-195)
- Impact: If bundled dictionary changes, computational cache (wordlebot_cache) may persist with stale fingerprint match logic; confusing cache invalidation behavior
- Fix approach: Consolidate fingerprint validation; document cache invalidation lifecycle; make wordlebot_cache invalidate atomically with wordlebot_dict

---

## Security Considerations

**innerHTML Assignment in panelRenderer.js:**
- Risk: `body.innerHTML = ''` clears panel, but if suggestion data ever contains user-controlled HTML (through future changes), XSS possible
- Files: `src/panelRenderer.js` (lines 97, 103, 434)
- Current mitigation: All content set via `textContent` or `createElement()`, not innerHTML; suggestion data sources are trusted (computational results)
- Recommendations: Document that innerHTML must never contain user input; add CSP header if possible; consider using `body.replaceChildren()` instead of innerHTML assignment

**Dictionary Extraction via Fetch Without Validation:**
- Risk: `dictExtractor.js` fetches game JavaScript files and parses them via regex/JSON parsing with minimal validation of structure before using as dictionary
- Files: `src/dictExtractor.js` (lines 77-104, 180-192, 397-465)
- Current mitigation: Fingerprint verification happens in dictionary.js after extraction; malformed data caught by SHA-256 comparison against bundled
- Recommendations: Add content-type validation on fetch responses; verify extracted array length before use; add maximum array size check

**localStorage Access Without Proper Error Handling in panelUI.js:**
- Risk: localStorage blocked in private mode silently fails; collapse state defaults to false, creating inconsistent UX across sessions
- Files: `src/panelUI.js` (lines 474-480, 487-491)
- Current mitigation: Try-catch blocks around localStorage calls; graceful degradation
- Recommendations: Log localStorage blocked state once to inform user; consider using chrome.storage.local as primary with localStorage fallback

**Chrome Storage API Dependency Without Fallback:**
- Risk: Content script relies on `chrome.storage.local` for dictionary and computational cache; if API fails, no offline fallback except bundled dictionary
- Files: `src/content.js` (lines 60, 172); `src/dictionary.js` (lines 152, 199)
- Current mitigation: Bundled dictionary fallback available; stale cache reused on extraction failure
- Recommendations: Document that extension requires chrome.storage.local permission; test behavior in restricted environments

---

## Performance Bottlenecks

**Entropy Computation on Every Board Change (mid-game):**
- Problem: `rankGuessesForState()` called on every board state mutation, performs full entropy ranking of remaining candidates against all dictionary words
- Files: `src/entropyEngine.js` (lines 176-290); `src/content.js` (lines 276-280)
- Cause: No caching of entropy rankings; recomputes from scratch even for small board changes
- Improvement path: Cache entropy rankings per remaining-set fingerprint; only recompute when candidates change; implement memoization similar to constraintEngine

**Double Computation in Entropy Ranking:**
- Problem: `rankGuessesForState()` computes entropy twice: once for bestInfoGuesses pool, once for bestAnswerGuesses pool, performing identical pattern computations
- Files: `src/entropyEngine.js` (lines 209, 236, 250)
- Cause: Separate ranking paths don't share intermediate entropy buckets
- Improvement path: Compute entropy once per guess candidate pair; store results in map; reuse for both pools

**Linear Search in Constraint Merging:**
- Problem: `buildPerPosition()` and position constraint building use `.indexOf()` in loops to check array membership
- Files: `src/constraintEngine.js` (lines 119-121, 125-128, 162-166, 173)
- Cause: No use of Set for O(1) membership checking
- Improvement path: Replace arrays with Set for excludedLetters and yellowPositions; refactor constraint representation

**Shadow DOM Stylesheet Update on Every Theme Change:**
- Problem: `updateTheme()` calls `sheet.replaceSync(css)` which recompiles entire 464-line CSS ruleset on every theme toggle
- Files: `src/panelUI.js` (lines 263-266)
- Cause: No caching of CSS per theme; full replacement instead of variable override
- Improvement path: Use CSS custom properties exclusively; toggle CSS variables instead of full sheet replacement

**Dictionary Loading Synchronous Fingerprint Computation:**
- Problem: `computeFingerprint()` performs SHA-256 on sorted dictionary (O(n log n)) on every load; blocks UI thread during initialization
- Files: `src/dictionary.js` (lines 37-48)
- Cause: Called during cache validation even when extracting fresh; redundant computation when using cached data
- Improvement path: Cache computed fingerprint with dictionary data; only compute when dictionary actually changes

---

## Fragile Areas

**DOM Selection in domReader.js:**
- Files: `src/domReader.js` (lines 8-20, 34-99)
- Why fragile: Selectors rely on NYT Wordle's CSS module class patterns (`[class*="Board-module"]`, `[class*="Row-module_row"]`). If NYT changes class naming scheme, board detection fails silently
- Safe modification: Test selector changes against real NYT Wordle page; add fallback selectors; log selector success/failure during init
- Test coverage: readBoardState() tested with one fixed board state; no tests for selector robustness or NYT changes

**Dictionary Extraction Regex Patterns:**
- Files: `src/dictExtractor.js` (lines 30, 171-182, 233-280)
- Why fragile: Complex regex patterns attempt to locate dictionary array in minified JavaScript; patterns vulnerable to NYT code refactoring (variable name changes, array nesting changes, formatting changes)
- Safe modification: Test extraction against multiple NYT Wordle code versions; add extraction strategy fallback ordering; log which strategy succeeds
- Test coverage: No automated tests for extraction against actual NYT JavaScript; manual verification only

**Panel Styling via Shadow DOM CSS String:**
- Files: `src/panelUI.js` (lines 244-464)
- Why fragile: 464 lines of CSS concatenated as string with manual variable substitution; prone to escaping errors if theme colors change
- Safe modification: Test CSS with all theme combinations; extract CSS to separate file; use CSS object model instead of string
- Test coverage: Manual theme testing only; no automated CSS validation

**Constraint Engine State Merge Logic:**
- Files: `src/constraintEngine.js` (lines 102-143)
- Why fragile: Complex minCount/maxCount merging logic with subtle semantics (null = infinity, 0 = absent entirely). Off-by-one errors in constraint merging break filtering
- Safe modification: Add comprehensive unit tests for each constraint merge case; test double letters, repeated patterns; verify against known Wordle solutions
- Test coverage: No unit tests for constraint merging; tested only via end-to-end filtering

**Entropy Pattern Computation with Duplicate Letters:**
- Files: `src/entropyEngine.js` (lines 41-81)
- Why fragile: Two-pass letter counting algorithm for handling duplicate letters in guesses and secrets. Subtle interaction with green/yellow/gray state assignment
- Safe modification: Add test cases for all duplicate letter patterns (GG, GY, YY, YG combinations); verify pattern IDs match expected Wordle feedback
- Test coverage: No unit tests for pattern computation; tested only via ranking output validation

---

## Known Bugs

**Board Readiness Detection Timing:**
- Symptoms: Extension loads but panel appears before game board is detected; user sees empty panel or error briefly
- Files: `src/domReader.js` (lines 103-126); `src/content.js` (lines 338-341)
- Trigger: Rapid page load with extension; board tiles appear after content script executes
- Workaround: Extension waits indefinitely via MutationObserver; shows "Waiting for game board" in console; panel displays nothing until board found

**Theme Toggle Rapid-Fire Mutation Storm:**
- Symptoms: If user clicks dark/light mode toggle repeatedly, console shows duplicate "Theme changed" messages; potential UI stutter
- Files: `src/panelUI.js` (lines 706-718)
- Trigger: Click dark/light toggle multiple times in rapid succession
- Workaround: Debounce implemented (50ms), but may still process queued changes

---

## Test Coverage Gaps

**No Unit Tests for Core Algorithms:**
- What's not tested: constraintEngine.filterCandidates(), entropyEngine.rankGuesses(), constraint merging logic
- Files: `src/constraintEngine.js`, `src/entropyEngine.js`
- Risk: Silent failures in algorithm; incorrect suggestions passed to user; no regression detection on refactoring
- Priority: HIGH

**No Tests for DOM Reader Selector Fallbacks:**
- What's not tested: Board detection in different page states; selector fallback chain; polling mode behavior
- Files: `src/domReader.js`
- Risk: Extension silent fails if NYT changes DOM; users think extension is broken
- Priority: HIGH

**No Tests for Dictionary Extraction Strategies:**
- What's not tested: All four extraction strategies (Performance API, DOM query, HTML fetch, fallback); resilience to NYT code changes
- Files: `src/dictExtractor.js`
- Risk: Extraction fails silently; users see stale cached dictionary or bundled fallback without knowing
- Priority: MEDIUM

**No Tests for Cache Invalidation:**
- What's not tested: Fingerprint mismatch invalidation; stale cache handling; cache age validation; computational cache persistence
- Files: `src/dictionary.js`, `src/content.js`
- Risk: Stale data served silently; fingerprint collisions not detected; cache bloat undetected
- Priority: MEDIUM

**No Tests for Panel UI Rendering Edge Cases:**
- What's not tested: 0 candidates state; 1 candidate state; solved state; error states; fade-in transitions; progressive disclosure states
- Files: `src/panelRenderer.js`
- Risk: UI crashes on edge cases; suggestion cards render incorrectly; modal/expanded states fail
- Priority: MEDIUM

---

## Scaling Limits

**Dictionary Size Ceiling:**
- Current capacity: ~2,300 words (NYT Wordle list)
- Limit: Entropy computation is O(candidates × dictionary × 243 patterns); at 10,000 word dictionary, ranking becomes noticeably slow
- Scaling path: Implement candidate-only entropy ranking (already adaptive at 20 candidates); cache entropy results; pre-compute heuristic rankings for large sets

**Constraint Engine Cache Memory:**
- Current capacity: Unbounded; assumes < 50 unique board states per session
- Limit: After ~1,000 unique board states (testing various guesses), cache grows to megabytes; no eviction
- Scaling path: Implement LRU cache with 100-entry cap; clear on new game; add cache size monitoring

---

## Missing Critical Features

**No Undo/Rewind Support:**
- Problem: User cannot step back to previous board state; must refresh to test alternative guesses
- Blocks: Testing "what-if" scenarios; exploring alternative strategies
- Workaround: Manual refresh (Shift+Click) clears caches and lets user re-enter board state

**No Explanation of Why a Suggestion is Recommended:**
- Problem: Panel shows entropy/commonness scores as percentages, not in human terms
- Blocks: Non-technical users don't understand why "RAISE" vs "SLATE" matters
- Workaround: Clicking suggestion cards shows entropy and candidate count, but no "this eliminates more words" narrative

**No Hard Mode Support:**
- Problem: All suggestions assume player can guess any word; Wordle hard mode requires guesses to be consistent with past feedback
- Blocks: Hard mode players get suggestions that violate game rules
- Workaround: Player must ignore invalid suggestions manually

---

## Fragile Areas Summary

| Component | Risk Level | Main Issue |
|-----------|-----------|-----------|
| DOM Reader Selectors | HIGH | Dependent on NYT Wordle CSS class names |
| Dictionary Extraction | HIGH | Regex patterns vulnerable to code refactoring |
| Constraint Merge Logic | MEDIUM | Complex state machine, no unit tests |
| Entropy Pattern Computation | MEDIUM | Duplicate letter handling subtle |
| Panel Styling | MEDIUM | 464 lines of CSS in string form |
| Cache Systems | MEDIUM | Dual caches with overlapping invalidation |
| Debounce + isComputing Guard | MEDIUM | Race condition between debounce and async work |

---

*Concerns audit: 2026-02-12*
