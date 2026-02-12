window.WordleBot = window.WordleBot || {};

(function () {
  'use strict';

  // --- Selector Configuration (DOM-04) ---
  // All selectors centralized here. If NYT changes markup, update ONLY this object.
  var SELECTORS = {
    // Primary: data-attribute selectors (most stable)
    allTiles: 'div[data-state]',
    tileStateAttr: 'data-state',

    // Structural: CSS Module substring selectors (fallback for scoping)
    board: '[class*="Board-module"]',
    row: '[class*="Row-module_row"]',

    // Game container: ID primary, CSS Module fallback
    gameContainer: '#wordle-app-game',
    gameContainerFallback: '[class*="App-module_game"]'
  };

  // Tile states that indicate an evaluated (submitted) tile
  var EVALUATED_STATES = ['correct', 'present', 'absent'];

  // Board dimensions
  var TILES_PER_ROW = 5;
  var TOTAL_ROWS = 6;
  var EXPECTED_TILE_COUNT = TILES_PER_ROW * TOTAL_ROWS; // 30

  // Stabilization timing
  var STABILITY_INTERVAL_MS = 300;

  // --- Board State Extraction (DOM-01, DOM-02) ---
  function readBoardState() {
    var allTiles = document.querySelectorAll(SELECTORS.allTiles);
    if (allTiles.length < EXPECTED_TILE_COUNT) {
      console.warn('[WordleBot] Expected ' + EXPECTED_TILE_COUNT + ' tiles, found ' + allTiles.length);
      return null;
    }

    var guesses = [];

    for (var row = 0; row < TOTAL_ROWS; row++) {
      var rowTiles = [];
      var hasEvaluatedTile = false;

      for (var col = 0; col < TILES_PER_ROW; col++) {
        var tile = allTiles[row * TILES_PER_ROW + col];
        var state = tile.getAttribute(SELECTORS.tileStateAttr);

        if (EVALUATED_STATES.indexOf(state) !== -1) {
          hasEvaluatedTile = true;

          // Primary: textContent. Fallback: aria-label parsing.
          var letter = (tile.textContent || '').trim().toUpperCase();
          if (!letter || letter.length !== 1) {
            // Fallback: try aria-label (format may be "1st letter, S, correct")
            var ariaLabel = tile.getAttribute('aria-label') || '';
            var ariaMatch = ariaLabel.match(/letter,?\s*([A-Za-z])/i);
            if (ariaMatch) {
              letter = ariaMatch[1].toUpperCase();
            }
          }

          rowTiles.push({
            letter: letter,
            status: state,
            position: col
          });
        }
      }

      // Only include rows where ALL 5 tiles are evaluated
      if (hasEvaluatedTile && rowTiles.length === TILES_PER_ROW) {
        guesses.push({
          word: rowTiles.map(function (t) { return t.letter; }).join(''),
          tiles: rowTiles
        });
      }
    }

    // Determine game status
    var status = 'in_progress';
    if (guesses.length > 0) {
      var lastGuess = guesses[guesses.length - 1];
      var allCorrect = lastGuess.tiles.every(function (t) { return t.status === 'correct'; });
      if (allCorrect) {
        status = 'won';
      } else if (guesses.length === TOTAL_ROWS) {
        status = 'lost';
      }
    }

    return {
      guesses: guesses,
      totalRows: TOTAL_ROWS,
      status: status
    };
  }

  // --- Wait for Board Readiness (DOM-03) ---
  // Waits indefinitely for game board to appear (user must click Play first)
  function waitForBoard() {
    return new Promise(function (resolve) {
      // Try immediately
      var tiles = document.querySelectorAll(SELECTORS.allTiles);
      if (tiles.length >= EXPECTED_TILE_COUNT) {
        console.log('[WordleBot] Game board found immediately (' + tiles.length + ' tiles)');
        return resolve();
      }

      console.log('[WordleBot] Waiting for game board (click Play to start)...');

      // Watch for tiles to appear via MutationObserver - no timeout
      var observer = new MutationObserver(function () {
        var tiles = document.querySelectorAll(SELECTORS.allTiles);
        if (tiles.length >= EXPECTED_TILE_COUNT) {
          observer.disconnect();
          console.log('[WordleBot] Game board found (' + tiles.length + ' tiles)');
          resolve();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // --- Change Detection Observer ---
  var activeObserver = null;
  var activePollInterval = null;
  var stabilizationTimer = null;
  var lastEmittedJSON = null;

  function startObserver(onChange) {
    if (typeof onChange !== 'function') {
      console.error('[WordleBot] startObserver requires a callback function');
      return;
    }

    // Stop any existing observer
    stopObserver();

    lastEmittedJSON = JSON.stringify(readBoardState());

    // --- Stabilization loop ---
    function scheduleStabilizationCheck() {
      if (stabilizationTimer) {
        clearTimeout(stabilizationTimer);
      }

      var previousSnapshot = null;

      function checkStability() {
        var currentState = readBoardState();
        var currentJSON = JSON.stringify(currentState);

        if (previousSnapshot === currentJSON) {
          // Two consecutive identical reads -- animation is done
          if (currentJSON !== lastEmittedJSON) {
            lastEmittedJSON = currentJSON;
            console.group('[WordleBot] Board state updated:');
            console.log(currentState);
            console.groupEnd();
            onChange(currentState);
          }
        } else {
          // State still changing -- check again
          previousSnapshot = currentJSON;
          stabilizationTimer = setTimeout(checkStability, STABILITY_INTERVAL_MS);
        }
      }

      // Start first check after initial delay
      stabilizationTimer = setTimeout(checkStability, STABILITY_INTERVAL_MS);
    }

    // --- Primary: MutationObserver ---
    var boardContainer = document.querySelector(SELECTORS.board)
                      || document.querySelector(SELECTORS.gameContainer)
                      || document.querySelector(SELECTORS.gameContainerFallback);

    if (boardContainer) {
      activeObserver = new MutationObserver(function (mutations) {
        var hasRelevantChange = mutations.some(function (m) {
          return m.type === 'attributes' && m.attributeName === SELECTORS.tileStateAttr;
        });
        if (hasRelevantChange) {
          scheduleStabilizationCheck();
        }
      });

      activeObserver.observe(boardContainer, {
        attributes: true,
        attributeFilter: [SELECTORS.tileStateAttr],
        subtree: true
      });

      console.log('[WordleBot] MutationObserver attached to board container');
    } else {
      // --- Fallback: Polling ---
      console.warn('[WordleBot] Board container not found for MutationObserver, falling back to polling');

      activePollInterval = setInterval(function () {
        var currentState = readBoardState();
        var currentJSON = JSON.stringify(currentState);
        if (currentJSON !== lastEmittedJSON) {
          lastEmittedJSON = currentJSON;
          console.group('[WordleBot] Board state updated (poll):');
          console.log(currentState);
          console.groupEnd();
          onChange(currentState);
        }
      }, 1000);
    }
  }

  function stopObserver() {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
    if (activePollInterval) {
      clearInterval(activePollInterval);
      activePollInterval = null;
    }
    if (stabilizationTimer) {
      clearTimeout(stabilizationTimer);
      stabilizationTimer = null;
    }
    lastEmittedJSON = null;
  }

  // --- Export to shared namespace ---
  window.WordleBot.readBoardState = readBoardState;
  window.WordleBot.waitForBoard = waitForBoard;
  window.WordleBot.startObserver = startObserver;
  window.WordleBot.stopObserver = stopObserver;

  // Expose selector config for debugging/testing
  window.WordleBot.SELECTORS = SELECTORS;

})();
