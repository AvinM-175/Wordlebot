window.WordleBot = window.WordleBot || {};
window.WordleBot.lastSuggestions = null;
window.WordleBot.isFirstInstall = null;

/**
 * Convert raw error to user-friendly message
 * @param {Error} err - The error object
 * @returns {string} User-friendly error message
 */
function getUserFriendlyError(err) {
  var msg = err && err.message ? err.message.toLowerCase() : '';

  if (msg.includes('dictionary') || msg.includes('load failed')) {
    return 'Dictionary failed to load. Try refreshing the page.';
  }

  if (msg.includes('tiles') || msg.includes('board')) {
    return 'Game board not detected. Make sure you\'re on NYT Wordle and click Play.';
  }

  return 'Something went wrong. Try refreshing the page.';
}

// Debounce utility - delays execution until delay ms after last call
function debounce(fn, delay) {
  var timer = null;
  return function() {
    var args = arguments;
    var context = this;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(function() {
      timer = null;
      fn.apply(context, args);
    }, delay);
  };
}

var DEBOUNCE_DELAY = 300;
var isComputing = false;

// Performance timing for staged initialization
var TIMING = {
  t_start: performance.now(),
  t_panel_mount: 0,
  t_dict_loaded: 0,
  t_board_ready: 0,
  t_first_suggestions: 0
};

/**
 * Clear all caches - both chrome.storage.local and in-memory
 * Call this when dictionary changes or for manual hard refresh
 */
async function clearCaches() {
  console.log('[WordleBot] Clearing all caches...');

  // Clear chrome.storage.local
  try {
    await chrome.storage.local.remove(['wordlebot_cache', 'wordlebot_dict']);
    console.log('[WordleBot] Chrome storage caches cleared (dict + computational)');
  } catch (err) {
    console.warn('[WordleBot] Failed to clear chrome.storage.local:', err.message);
  }

  // Clear in-memory caches
  if (window.WordleBot.entropy && window.WordleBot.entropy.clearCache) {
    window.WordleBot.entropy.clearCache();
  }

  if (window.WordleBot.freq && window.WordleBot.freq.clearTables) {
    window.WordleBot.freq.clearTables();
  }

  if (window.WordleBot.constraints && window.WordleBot.constraints.clearCache) {
    window.WordleBot.constraints.clearCache();
  }

  // Clear dictionary reference
  window.WordleBot.dictionary = null;
  window.WordleBot.dictionaryFingerprint = null;
  window.WordleBot.dictionaryResult = null;

  console.log('[WordleBot] All caches cleared');
}

// Export clearCaches to namespace
window.WordleBot.clearCaches = clearCaches;

/**
 * Show dictionary source indicator in panel footer
 * Per CONTEXT Decision #3:
 * - Extracted (fresh): no indicator
 * - Cached: "Using cached dictionary"
 * - Bundled: "Using offline dictionary"
 * @param {Object} dictResult - DictionaryResult from dictionary.js
 */
function showSourceIndicator(dictResult) {
  if (!dictResult) return;

  // Happy path: extracted + fresh = no indicator
  if (dictResult.source === 'extracted' && dictResult.freshness === 'fresh') {
    removeSourceIndicator();
    return;
  }

  var text = '';
  if (dictResult.source === 'cached') {
    text = 'Using cached dictionary';
  } else if (dictResult.source === 'bundled') {
    text = 'Using fallback dictionary \u2014 stats may differ from live data';
    console.warn('[WordleBot] Running on bundled fallback dictionary. Live extraction failed.');
  }

  if (!text) {
    removeSourceIndicator();
    return;
  }

  // Get panel body and append/update indicator
  var body = window.WordleBot.panelUI.getBody();
  if (!body) return;

  // Check if indicator already exists
  var existing = body.querySelector('.dict-source');
  if (existing) {
    existing.textContent = text;
    return;
  }

  var indicator = document.createElement('div');
  indicator.className = 'dict-source';
  indicator.textContent = text;
  body.appendChild(indicator);
}

/**
 * Remove source indicator from panel (used when extracted+fresh)
 */
function removeSourceIndicator() {
  var body = window.WordleBot.panelUI.getBody();
  if (!body) return;
  var existing = body.querySelector('.dict-source');
  if (existing) {
    existing.remove();
  }
}

/**
 * Determine if the current user is a first-time installer.
 * Three-state heuristic (from CONTEXT.md locked decisions):
 *   - wordlebot_onboarded === true -> post-v1.7 user (false)
 *   - wordlebot_dict OR wordlebot_cache present -> pre-v1.7 existing user (false)
 *   - all absent -> genuine first install (true)
 * Storage read failure: caller short-circuits to false before calling this function.
 * @param {Object} stored - Result of chrome.storage.local.get([...])
 * @returns {boolean}
 */
function detectFirstInstall(stored) {
  if (stored.wordlebot_onboarded === true) {
    return false;
  }
  if (stored.wordlebot_dict || stored.wordlebot_cache) {
    return false;
  }
  return true;
}

/**
 * Load dictionary and build/restore caches
 * @param {boolean} forceRebuild - If true, skip cache check and rebuild from scratch
 * @returns {Object} { words, fingerprint, wasRebuilt, dictResult }
 */
async function loadDictionaryAndCaches(forceRebuild) {
  // Load dictionary via orchestrator (three-tier cascade)
  var dictResult = await window.WordleBot.loadDictionary(forceRebuild);
  var fingerprint = dictResult.fingerprint;
  var fpShort = fingerprint.substring(0, 8);
  console.log('[WordleBot] Dictionary loaded: ' + dictResult.words.length +
    ' words (source: ' + dictResult.source + ', fingerprint: ' + fpShort + ')');

  window.WordleBot.dictionary = dictResult.words;
  window.WordleBot.dictionaryResult = dictResult;

  var wasRebuilt = false;

  if (forceRebuild) {
    // Force rebuild - skip cache check entirely
    console.log('[WordleBot] Force rebuild requested');
    wasRebuilt = true;
  } else {
    // Check computational cache (wordlebot_cache -- NOT wordlebot_dict)
    var cached = await chrome.storage.local.get('wordlebot_cache');
    var cacheData = cached.wordlebot_cache;

    if (cacheData && cacheData.fingerprint === fingerprint) {
      // Cache hit -- restore from persisted data
      window.WordleBot.freq.restoreTables(cacheData.freqTables);
      window.WordleBot.freq.commonness = cacheData.commonness;
      window.WordleBot.entropy.restoreCache(
        cacheData.entropyCache,
        dictResult.words,
        window.WordleBot.freq.tables,
        window.WordleBot.freq.commonness
      );
      console.log('[WordleBot] Computational cache reused (fingerprint: ' + fpShort + ')');
      return { words: dictResult.words, fingerprint: fingerprint, wasRebuilt: false, dictResult: dictResult };
    }

    if (cacheData && cacheData.fingerprint !== fingerprint) {
      // Fingerprint mismatch - dictionary changed
      var oldFp = cacheData.fingerprint.substring(0, 8);
      console.log('[WordleBot] Dictionary fingerprint changed: ' + oldFp + ' -> ' + fpShort);
      wasRebuilt = true;
    } else {
      // No computational cache exists
      console.log('[WordleBot] No computational cache found, building fresh');
      wasRebuilt = true;
    }
  }

  // Cache miss or force rebuild -- compute fresh
  window.WordleBot.freq.buildTables(dictResult.words);
  var commonness = window.WordleBot.freq.computeCommonness(dictResult.words, window.WordleBot.freq.tables);
  await window.WordleBot.entropy.init(dictResult.words, window.WordleBot.freq.tables, commonness);

  // Persist computational cache
  await chrome.storage.local.set({
    wordlebot_cache: {
      fingerprint: fingerprint,
      freqTables: window.WordleBot.freq.serializeTables(),
      commonness: commonness,
      entropyCache: window.WordleBot.entropy.serializeCache()
    }
  });
  console.log('[WordleBot] Computational cache rebuilt (fingerprint: ' + fpShort + ')');

  return { words: dictResult.words, fingerprint: fingerprint, wasRebuilt: wasRebuilt, dictResult: dictResult };
}

(async function init() {
  console.log('[WordleBot] Content script loaded on Wordle page');

  try {
    // Stage 1: Mount panel immediately (fast - just DOM creation)
    var panelResult = window.WordleBot.panelUI.init();
    window.WordleBot.panel = panelResult;
    TIMING.t_panel_mount = performance.now();
    console.log('[WordleBot] Panel mounted: ' + (TIMING.t_panel_mount - TIMING.t_start).toFixed(0) + 'ms');

    // Show loading state immediately
    window.WordleBot.panelRenderer.showBodyLoading('Preparing suggestions\u2026');

    // Stage 2: Defer expensive work until browser is idle
    var scheduleCompute = window.requestIdleCallback || function(cb) { setTimeout(cb, 0); };

    scheduleCompute(async function backgroundInit() {
      try {
        // Load dictionary and build/restore caches
        var loadResult = await loadDictionaryAndCaches(false);
        TIMING.t_dict_loaded = performance.now();
        console.log('[WordleBot] Dictionary + caches ready: ' + (TIMING.t_dict_loaded - TIMING.t_start).toFixed(0) + 'ms');

        // Show dictionary source indicator in panel footer
        showSourceIndicator(loadResult.dictResult);

        // DICT-05: Non-blocking background update check (only when dictionary came from cache)
        if (loadResult.dictResult.source === 'cached') {
          window.WordleBot.checkForUpdate(loadResult.dictResult).then(function(newResult) {
            if (!newResult) return;
            // DICT-06: Fingerprint mismatch detected -- rebuild and re-render
            console.log('[WordleBot] Background update: rebuilding caches and re-rendering suggestions');
            clearCaches().then(function() {
              return loadDictionaryAndCaches(true);
            }).then(function(reloadResult) {
              showSourceIndicator(reloadResult.dictResult);
              var currentState = window.WordleBot.readBoardState();
              if (currentState && !isComputing) {
                processBoardState(currentState, false);
              }
            }).catch(function(err) {
              console.warn('[WordleBot] Background rebuild failed: ' + err.message);
            });
          }).catch(function(err) {
            console.warn('[WordleBot] Background update check failed: ' + err.message);
          });
        }

        // Board state processing pipeline
        function processBoardState(boardState, isInitial) {
          // Prevent concurrent processing
          if (isComputing) {
            console.log('[WordleBot] Skipping - already computing');
            return;
          }

          isComputing = true;

          // Show loading state (unless initial load)
          if (!isInitial) {
            window.WordleBot.panelRenderer.setLoading(true);
          }

          try {
            var result = window.WordleBot.constraints.filterCandidates(
              window.WordleBot.dictionary, boardState
            );

            if (result.warning) {
              console.warn('[WordleBot] Constraint warning: ' + result.warning);
            }

            console.log('[WordleBot] Candidates remaining: ' + result.candidates.length);

            var rankings;
            if (result.unconstrained) {
              rankings = window.WordleBot.entropy.getFirstGuessCache();
              console.log('[WordleBot] Using cached first-guess rankings (unconstrained)');
            } else {
              var guessesLeft = boardState.totalRows - boardState.guesses.length;
              rankings = window.WordleBot.entropy.rankGuessesForState(
                result.candidates, guessesLeft
              );
            }

            // Build structured suggestion output
            var suggestions = window.WordleBot.suggestions.buildSuggestions(
              result, rankings, boardState,
              window.WordleBot.dictionary,
              window.WordleBot.freq.tables,
              window.WordleBot.freq.commonness
            );

            // Store for UI consumption
            window.WordleBot.lastSuggestions = suggestions;

            // Render to panel
            window.WordleBot.panelRenderer.render(suggestions, isInitial);

            // Re-add source indicator after render (render clears body innerHTML)
            if (window.WordleBot.dictionaryResult) {
              showSourceIndicator(window.WordleBot.dictionaryResult);
            }

            console.group('[WordleBot] Suggestions (' + suggestions.mode + '):');
            console.log('Header:', suggestions.header);
            console.log('Candidates:', suggestions.candidateCount);
            if (suggestions.suggestions.length > 0) {
              console.log('Top picks:', suggestions.suggestions.map(function (s) {
                return s.word + ' (' + s.confidence + '%) ' + s.whyLine;
              }));
            }
            if (suggestions.nearTieNote) {
              console.log('Note:', suggestions.nearTieNote);
            }
            if (suggestions.gameContext.guesses.length > 0) {
              console.log('Game context:', suggestions.gameContext.guesses.map(function (g) {
                return g.word + ': ' + g.revealed + ' (eliminated ' + g.eliminated + ')';
              }));
            }
            if (suggestions.solvedSummary) {
              console.log('Summary:', suggestions.solvedSummary);
            }
            console.groupEnd();

          } catch (err) {
            var userMessage = getUserFriendlyError(err);
            console.error('[WordleBot] Processing error:', err.message);
            window.WordleBot.panelRenderer.setError(userMessage);
          } finally {
            isComputing = false;
            window.WordleBot.panelRenderer.setLoading(false);
          }
        }

        // Debounced version for observer callback
        var debouncedProcessBoardState = debounce(function(boardState) {
          processBoardState(boardState, false);
        }, DEBOUNCE_DELAY);

        // Wait for game board
        await window.WordleBot.waitForBoard();
        TIMING.t_board_ready = performance.now();
        console.log('[WordleBot] Board ready: ' + (TIMING.t_board_ready - TIMING.t_start).toFixed(0) + 'ms');

        // Wire up refresh button with Shift+Click for hard refresh
        var refreshBtn = window.WordleBot.panelUI.getRefreshBtn();
        if (refreshBtn) {
          refreshBtn.addEventListener('click', async function(event) {
            // Ignore if already computing
            if (isComputing) {
              console.log('[WordleBot] Refresh ignored - already computing');
              return;
            }

            // Check for Shift+Click = hard refresh
            if (event.shiftKey) {
              console.log('[WordleBot] Forced rebuild (shift-refresh)');

              // Show loading state immediately
              window.WordleBot.panelRenderer.setLoading(true);

              try {
                // Clear all caches
                await clearCaches();

                // Reload dictionary and rebuild caches from scratch
                var reloadResult = await loadDictionaryAndCaches(true);

                // Update source indicator after hard refresh
                showSourceIndicator(reloadResult.dictResult);

                // Clear constraint engine cache (it was cleared in clearCaches but just to be safe)
                if (window.WordleBot.constraints.clearCache) {
                  window.WordleBot.constraints.clearCache();
                }

                // Re-read board state and process
                var currentState = window.WordleBot.readBoardState();
                if (currentState) {
                  processBoardState(currentState, false);
                }
              } catch (err) {
                console.error('[WordleBot] Hard refresh failed:', err.message);
                window.WordleBot.panelRenderer.setError('Hard refresh failed: ' + err.message);
                window.WordleBot.panelRenderer.setLoading(false);
              }
              return;
            }

            // Normal refresh
            console.log('[WordleBot] Manual refresh triggered');

            // Clear any previous error
            window.WordleBot.panelRenderer.setError(null);

            // Re-read board state and process
            var currentState = window.WordleBot.readBoardState();
            if (currentState) {
              processBoardState(currentState, false);
            }
          });
        }

        var initialState = window.WordleBot.readBoardState();
        if (initialState) {
          console.group('[WordleBot] Initial board state:');
          console.log(initialState);
          console.groupEnd();
          processBoardState(initialState, true);  // isInitial = true (no fade on first load)
        }

        TIMING.t_first_suggestions = performance.now();

        window.WordleBot.startObserver(function (boardState) {
          debouncedProcessBoardState(boardState);
        });
        console.log('[WordleBot] Observer started -- watching for board changes');

        // Log timing summary
        console.log('[WordleBot] Ready! Total: ' + (TIMING.t_first_suggestions - TIMING.t_start).toFixed(0) + 'ms');
        console.log('[WordleBot] Timing breakdown:', JSON.stringify({
          panel_mount: (TIMING.t_panel_mount - TIMING.t_start).toFixed(0) + 'ms',
          dict_caches: (TIMING.t_dict_loaded - TIMING.t_start).toFixed(0) + 'ms',
          board_ready: (TIMING.t_board_ready - TIMING.t_start).toFixed(0) + 'ms',
          first_suggestions: (TIMING.t_first_suggestions - TIMING.t_start).toFixed(0) + 'ms'
        }, null, 2));

      } catch (err) {
        console.error('[WordleBot] Background init error:', err.message);
        var userMessage = getUserFriendlyError(err);
        window.WordleBot.panelRenderer.showCriticalError(userMessage);
      }
    }, { timeout: 2000 });

  } catch (err) {
    var userMessage = getUserFriendlyError(err);
    console.error('[WordleBot] Critical error:', err.message);
    window.WordleBot.panelRenderer.showCriticalError(userMessage);
  }
})();
