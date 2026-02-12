# Architecture

**Analysis Date:** 2026-02-12

## Pattern Overview

**Overall:** Chrome Extension Content Script Pipeline with Real-Time Information-Theoretic Analysis

**Key Characteristics:**
- Browser extension (manifest v3) running on NYT Wordle domain
- Event-driven reactive pipeline: DOM observation → board state extraction → constraint filtering → entropy ranking → UI rendering
- Modular, layered architecture with clear separation of concerns
- Heavy emphasis on mathematical rigor (Shannon entropy, pattern matching) and caching for performance
- Staged initialization: fast DOM mounting → deferred expensive computation → async data loading

## Layers

**DOM Integration Layer:**
- Purpose: Extract game state from NYT Wordle's DOM and monitor for changes
- Location: `src/domReader.js`
- Contains: Board state readers, tile parsers, MutationObserver setup, stabilization logic
- Depends on: Browser DOM APIs, MutationObserver
- Used by: Main content orchestrator (`src/content.js`)

**Data & Dictionary Layer:**
- Purpose: Three-tier dictionary loading (live extraction, cache, bundled fallback) with fingerprinting
- Location: `src/dictionary.js`, `src/dictExtractor.js`
- Contains: Dictionary orchestration, SHA-256 fingerprinting, cache invalidation, bundled fallback logic
- Depends on: Chrome storage API, crypto.subtle API, bundled word list (`data/NYTWordleList.txt`)
- Used by: Main content orchestrator, frequency table builder

**Frequency Analysis Layer:**
- Purpose: Build and serve frequency statistics for letter positions, overall letter frequency, and bigrams
- Location: `src/frequencyTables.js`, `src/frequencyScorer.js`
- Contains: Frequency table computation, serialization, cached commonness scoring
- Depends on: Dictionary words, memoization
- Used by: Entropy engine, suggestion engine

**Constraint Engine Layer:**
- Purpose: Convert game feedback (green/yellow/gray) into constraint logic and filter candidate words
- Location: `src/constraintEngine.js`
- Contains: Tile state validation, letter count derivation, position constraints, candidate filtering with memoization
- Depends on: Frequency tables (for tie-breaking)
- Used by: Main processing pipeline

**Entropy Engine Layer:**
- Purpose: Compute Shannon entropy for ranking guesses by information gain; manage first-guess cache
- Location: `src/entropyEngine.js`
- Contains: Pattern ID computation (base-3 encoding), entropy calculation, dual-ranking (entropy + commonness blend based on guesses remaining)
- Depends on: Frequency tables, constraint filtering results
- Used by: Suggestion engine, main processing pipeline

**Suggestion Building Layer:**
- Purpose: Synthesize constraint results, entropy rankings, and game state into structured suggestion output
- Location: `src/suggestionEngine.js`
- Contains: Mode detection (opener/mid-game/late-game/solved/error), confidence normalization, near-tie detection, explanation generation
- Depends on: Constraint results, entropy rankings, frequency data
- Used by: Panel renderer

**UI & Presentation Layer:**
- Purpose: Shadow DOM panel management, theme detection, state collapse/expand, refreshing
- Location: `src/panelUI.js`, `src/panelRenderer.js`
- Contains: Shadow DOM setup, theme color tokens, panel lifecycle, collapse/expand toggle with localStorage, fade transitions, error/loading states
- Depends on: panelRenderer
- Used by: Main orchestrator

**Main Orchestrator:**
- Purpose: Wire up entire pipeline with correct timing and lifecycle management
- Location: `src/content.js`
- Contains: Staged initialization, debouncing, board state observation, cache management, error handling, performance timing
- Depends on: All layers
- Used by: Chrome extension runtime (runs in manifest.json content_scripts)

## Data Flow

**Initialization Flow:**

1. Chrome inject `src/content.js` + dependencies (per manifest.json load order)
2. Stage 1 (fast): Mount shadow DOM panel via `panelUI.init()` → show loading spinner
3. Stage 2 (deferred via requestIdleCallback): Load dictionary (three-tier cascade) → build/restore frequency tables → init entropy engine
4. Wait for board via `domReader.waitForBoard()` (MutationObserver waits for 30 tiles)
5. Read initial board state → run through processing pipeline → render suggestions to panel
6. Start observer on board container to trigger debounced re-processing on tile state changes

**Per-Guess Processing Flow:**

1. MutationObserver detects `data-state` attribute change on tiles
2. Stabilization loop waits for two consecutive identical board reads (300ms intervals) to let animation complete
3. Extract board state via `domReader.readBoardState()` → yields { guesses, totalRows, status }
4. Filter candidates via `constraintEngine.filterCandidates()` → yields { candidates, unconstrained, warning }
5. Rank candidates via `entropyEngine.rankGuessesForState()` → yields rankings with entropy/commonness scores
6. Build structured suggestions via `suggestionEngine.buildSuggestions()` → yields { mode, header, suggestions, candidateCount, ... }
7. Render to panel via `panelRenderer.render()` with fade transition
8. Add dictionary source indicator (extracted/cached/bundled) to panel footer

**State Management:**

- **Dictionary**: Loaded once, stored in `window.WordleBot.dictionary`. Fingerprint cached in chrome.storage.local to invalidate when source changes.
- **Frequency tables**: Built once per dictionary, serialized and persisted to chrome.storage.local. Restored on next load if fingerprint matches.
- **Entropy cache**: First-guess rankings (unconstrained state) pre-computed and cached. Used when no guesses have been made yet.
- **Constraint cache**: Per-board-state constraint results memoized via compact string key (word:statuscode|word:statuscode format).
- **Computational cache**: Frequency tables + entropy cache bundled and persisted together under `wordlebot_cache` key. Invalidated on dictionary fingerprint mismatch.
- **UI state**: Panel collapse/expand preference stored in localStorage (`wordlebot_panel_collapsed`). Theme detected dynamically from body.classList.

## Key Abstractions

**BoardState:**
- Purpose: Canonical representation of game progress
- Examples: `src/domReader.js` readBoardState(), `src/content.js` processBoardState()
- Pattern: { guesses: [{ word: "hello", tiles: [{letter, status, position}] }], totalRows: 6, status: 'in_progress'|'won'|'lost' }

**ConstraintResult:**
- Purpose: Filtered candidate pool plus metadata about constraints
- Examples: `src/constraintEngine.js` filterCandidates()
- Pattern: { candidates: string[], unconstrained: boolean, warning: string|null }

**RankingResult:**
- Purpose: Per-word rankings with entropy and commonness scores
- Examples: `src/entropyEngine.js` rankGuessesForState(), getFirstGuessCache()
- Pattern: { word: string, entropy: number, commonness: number, blendedScore: number }

**SuggestionOutput:**
- Purpose: Complete rendering specification for one suggestion card
- Examples: `src/suggestionEngine.js` buildSuggestions()
- Pattern: { mode: 'opener'|'mid_game'|'late_game'|'solved'|'error', suggestions: [{word, confidence, scores, whyLine, detailed}], candidateCount, nearTieNote, gameContext, ... }

**DictionaryResult:**
- Purpose: Load result with source tracking and freshness metadata
- Examples: `src/dictionary.js` loadDictionary()
- Pattern: { words: string[], source: 'extracted'|'cached'|'bundled', freshness: 'fresh'|'stale'|'bundled', fingerprint: hex string }

## Entry Points

**Content Script Bootstrap:**
- Location: `src/content.js` (lines 220-438, IIFE wrapper)
- Triggers: Chrome extension loads on https://www.nytimes.com/games/wordle/*
- Responsibilities: Initialize all modules, manage lifecycle, coordinate pipeline, handle errors, measure timing

**Board State Observation:**
- Location: `src/domReader.js` startObserver()
- Triggers: Called after board ready, provides onChange callback
- Responsibilities: Monitor DOM for tile changes, stabilize reads, emit board state updates

**Refresh Button Handler:**
- Location: `src/content.js` (lines 343-399)
- Triggers: User clicks refresh button in panel
- Responsibilities: Re-read board state and process (normal refresh) or clear all caches + rebuild (Shift+Click hard refresh)

**Panel Rendering:**
- Location: `src/panelRenderer.js` render()
- Triggers: Suggestion processing completes
- Responsibilities: Clear panel body, render suggestions based on mode, handle edge states, apply fade transitions

## Error Handling

**Strategy:** Multi-level fallback with user-friendly error messaging

**Patterns:**

- **Validation**: `constraintEngine.validateBoardState()` checks board state shape; `dictionary.js` validates word list format
- **Graceful degradation**: Dictionary cascade (extracted → cached → bundled) ensures always-available word list even if extraction fails
- **User messaging**: `content.js` getUserFriendlyError() converts technical errors to player-friendly text: "Dictionary failed to load. Try refreshing the page."
- **Concurrent processing guard**: `isComputing` flag in `content.js` prevents overlapping suggestion runs (line 40-41)
- **Error state rendering**: `panelRenderer.js` renderEdgeState() + showCriticalError() for UI-level error display
- **Cache invalidation**: Fingerprint mismatch automatically invalidates stale computational cache (line 189-193 in content.js)

## Cross-Cutting Concerns

**Logging:** All modules use console with `[WordleBot]` prefix for easy filtering. Timing breakdown logged at end of initialization. Board state changes logged in groups. No secrets logged.

**Validation:** Input validation at constraint engine (board state shape), frequency tables (letter/position bounds), entropy engine (remaining candidate count checks). Output validation in suggestion engine (confidence normalization guards division by zero).

**Authentication:** None required. Extension runs on user's own browser; no backend API calls.

**Performance Optimization:**
- Memoization: Constraint engine caches per-board-state results; frequency tables cached in chrome.storage; entropy first-guess cache pre-built
- Debouncing: Board state processing debounced 300ms to skip intermediate animation frames
- Staged initialization: Panel DOM mounts fast; expensive computation deferred to idle callback
- Lazy allocation: Entropy engine pre-allocates reusable buffers (publicBuckets, publicSecretCounts) once per init
- Adaptive strategies: Entropy engine switches to "remaining-only" ranking when candidates ≤ 20 (ADAPTIVE_THRESHOLD)

---

*Architecture analysis: 2026-02-12*
