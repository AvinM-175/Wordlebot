/**
 * panelRenderer.js - Suggestion Card Rendering for WordleBot
 * Phase 7: Live Suggestion Display and Auto-Update
 *
 * Renders suggestion data to the panel body with:
 * - Progressive disclosure (3-state click cycle)
 * - Edge state handling (0 candidates, 1 candidate, solved, error)
 * - Fade-in transitions for smooth updates
 * - Loading and error state management
 */
(function () {
  'use strict';

  window.WordleBot = window.WordleBot || {};

  // Module state
  var state = {
    isLoading: false,
    hasError: false,
    errorMessage: '',
    loadingStartTime: 0,
    pendingLoadingClear: null
  };

  // Minimum spinner visible duration (ms)
  var MIN_SPINNER_DURATION = 500;

  /**
   * Main render function - renders suggestions to panel body
   * @param {Object} suggestions - The lastSuggestions object from suggestionEngine
   * @param {boolean} isInitial - Whether this is the initial load (skips fade-in)
   */
  function render(suggestions, isInitial) {
    var body = window.WordleBot.panelUI.getBody();
    if (!body) {
      console.warn('[WordleBot] Panel body not available');
      return;
    }

    // Clear error state when rendering new content
    state.hasError = false;
    state.errorMessage = '';

    // Handle different modes
    if (!suggestions) {
      renderEdgeState({ mode: 'error', errorMessage: 'No suggestions available' }, body, isInitial);
      return;
    }

    if (suggestions.mode === 'error') {
      renderEdgeState(suggestions, body, isInitial);
      return;
    }

    if (suggestions.mode === 'solved') {
      renderSolvedState(suggestions, body, isInitial);
      return;
    }

    // Normal rendering path: opener, mid_game, late_game
    renderWithFade(body, function () {
      // Render candidate count header (hidden in opener mode per CONTEXT.md)
      if (suggestions.mode !== 'opener') {
        renderCandidateCount(suggestions.candidateCount, body);
      }

      // Handle edge cases
      if (suggestions.candidateCount === 0) {
        renderZeroCandidates(body);
        return;
      }

      if (suggestions.candidateCount === 1 && suggestions.suggestions.length === 1) {
        renderOnlyCandidate(suggestions.suggestions[0], body);
        return;
      }

      // Render suggestion cards
      renderSuggestionCards(suggestions.suggestions, body);

      // Render near-tie note if present
      if (suggestions.nearTieNote) {
        renderNearTieNote(suggestions.nearTieNote, body);
      }
    }, isInitial);
  }

  /**
   * Render with fade-in transition
   * @param {HTMLElement} body - The panel body element
   * @param {Function} contentFn - Function that populates the body
   * @param {boolean} isInitial - Whether this is initial load (skips fade)
   */
  function renderWithFade(body, contentFn, isInitial) {
    if (isInitial) {
      // Initial load: no fade, show immediately
      body.innerHTML = '';
      contentFn();
      body.style.opacity = '1';
    } else {
      // Subsequent updates: fade in
      body.style.opacity = '0';
      body.innerHTML = '';

      contentFn();

      // Double rAF for reliable fade-in after DOM update
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          body.style.opacity = '1';
        });
      });
    }
  }

  /**
   * Render candidate count header
   * @param {number} count - Number of remaining candidates
   * @param {HTMLElement} body - The panel body element
   */
  function renderCandidateCount(count, body) {
    var header = document.createElement('div');
    header.className = 'candidate-count';
    header.textContent = 'Candidates remaining: ' + count;
    body.appendChild(header);
  }

  /**
   * Render suggestion cards
   * @param {Array} suggestions - Array of suggestion objects
   * @param {HTMLElement} body - The panel body element
   */
  function renderSuggestionCards(suggestions, body) {
    for (var i = 0; i < suggestions.length; i++) {
      var card = createSuggestionCard(suggestions[i], i === 0);
      body.appendChild(card);
    }

    // Setup event delegation for click handling
    body.addEventListener('click', handleCardClick);
  }

  /**
   * Create a single suggestion card
   * @param {Object} suggestion - The suggestion object
   * @param {boolean} isTop - Whether this is the #1 suggestion
   * @returns {HTMLElement} The card element
   */
  function createSuggestionCard(suggestion, isTop) {
    var card = document.createElement('div');
    card.className = 'suggestion-card';
    if (isTop) {
      card.classList.add('top-suggestion');
    }
    card.setAttribute('data-state', '0');
    card.setAttribute('aria-expanded', 'false');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    // Main row: word + confidence
    var main = document.createElement('div');
    main.className = 'suggestion-main';

    var word = document.createElement('span');
    word.className = 'suggestion-word';
    word.textContent = suggestion.word.toUpperCase();

    var confidence = document.createElement('span');
    confidence.className = 'suggestion-confidence';
    confidence.textContent = suggestion.confidence + '%';

    main.appendChild(word);
    main.appendChild(confidence);
    card.appendChild(main);

    // Why line (hidden by default, shown when state >= 1)
    var why = document.createElement('div');
    why.className = 'suggestion-why';
    why.textContent = suggestion.whyLine;
    card.appendChild(why);

    // Details (hidden by default, shown when state >= 2)
    var details = document.createElement('div');
    details.className = 'suggestion-details';

    for (var i = 0; i < suggestion.details.length; i++) {
      var detail = document.createElement('div');
      detail.className = 'suggestion-detail';
      detail.textContent = suggestion.details[i];
      details.appendChild(detail);
    }

    card.appendChild(details);

    // Keyboard accessibility
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cycleCardState(card);
      }
    });

    return card;
  }

  /**
   * Handle card click - progressive disclosure
   * Uses event delegation for efficiency
   * @param {Event} event - Click event
   */
  function handleCardClick(event) {
    var card = event.target.closest('.suggestion-card');
    if (!card) {
      return;
    }

    cycleCardState(card);
  }

  /**
   * Cycle card through progressive disclosure states
   * 0 -> 1 (show why) -> 2 (show details) -> 0 (collapse)
   * @param {HTMLElement} card - The card element
   */
  function cycleCardState(card) {
    var currentState = parseInt(card.getAttribute('data-state') || '0', 10);
    var newState = (currentState + 1) % 3;

    card.setAttribute('data-state', String(newState));
    card.setAttribute('aria-expanded', newState > 0 ? 'true' : 'false');
  }

  /**
   * Render zero candidates edge state
   * @param {HTMLElement} body - The panel body element
   */
  function renderZeroCandidates(body) {
    var message = document.createElement('div');
    message.className = 'edge-message';
    message.textContent = 'No words match \u2014 check your feedback colors';
    body.appendChild(message);
  }

  /**
   * Render single candidate (only answer) state
   * @param {Object} suggestion - The single suggestion
   * @param {HTMLElement} body - The panel body element
   */
  function renderOnlyCandidate(suggestion, body) {
    var container = document.createElement('div');
    container.className = 'only-answer';

    var label = document.createElement('div');
    label.className = 'only-answer-label';
    label.textContent = 'Only possibility:';

    var word = document.createElement('div');
    word.className = 'only-answer-word';
    word.textContent = suggestion.word.toUpperCase();

    container.appendChild(label);
    container.appendChild(word);
    body.appendChild(container);

    // Still show a card for details expansion
    var card = createSuggestionCard(suggestion, true);
    card.classList.remove('top-suggestion');
    card.style.marginTop = '16px';
    body.appendChild(card);
  }

  /**
   * Render near-tie note at bottom
   * @param {string} note - The near-tie note text
   * @param {HTMLElement} body - The panel body element
   */
  function renderNearTieNote(note, body) {
    var noteEl = document.createElement('div');
    noteEl.className = 'near-tie-note';
    noteEl.textContent = note;
    body.appendChild(noteEl);
  }

  /**
   * Render edge state (error or zero candidates)
   * @param {Object} suggestions - The suggestions object
   * @param {HTMLElement} body - The panel body element
   * @param {boolean} isInitial - Whether this is initial load (skips fade)
   */
  function renderEdgeState(suggestions, body, isInitial) {
    renderWithFade(body, function () {
      var message = document.createElement('div');
      message.className = 'edge-message error';

      if (suggestions.candidateCount === 0) {
        message.textContent = 'No words match \u2014 check your feedback colors';
      } else if (suggestions.errorMessage) {
        message.textContent = suggestions.errorMessage;
      } else {
        message.textContent = 'Something went wrong. Try refreshing.';
      }

      body.appendChild(message);
    }, isInitial);
  }

  /**
   * Render solved state with summary
   * @param {Object} suggestions - The suggestions object with solvedSummary
   * @param {HTMLElement} body - The panel body element
   * @param {boolean} isInitial - Whether this is initial load (skips fade)
   */
  function renderSolvedState(suggestions, body, isInitial) {
    renderWithFade(body, function () {
      // Header showing solve count
      var header = document.createElement('div');
      header.className = 'candidate-count';
      header.textContent = suggestions.header;
      body.appendChild(header);

      // Solved summary
      if (suggestions.solvedSummary) {
        var summary = document.createElement('div');
        summary.className = 'solved-summary';
        summary.textContent = suggestions.solvedSummary;
        body.appendChild(summary);
      }

      // Game context narrative
      if (suggestions.gameContext && suggestions.gameContext.guesses.length > 0) {
        var context = document.createElement('div');
        context.className = 'game-context';

        for (var i = 0; i < suggestions.gameContext.guesses.length; i++) {
          var guess = suggestions.gameContext.guesses[i];
          var guessEl = document.createElement('div');
          guessEl.className = 'suggestion-detail';
          guessEl.textContent = guess.word.toUpperCase() + ': ' + guess.revealed;
          context.appendChild(guessEl);
        }

        body.appendChild(context);
      }
    }, isInitial);
  }

  /**
   * Set loading state
   * Shows spinner in header when loading, keeps previous suggestions visible
   * Enforces minimum visible duration for user perception
   * @param {boolean} isLoading - Whether loading is in progress
   */
  function setLoading(isLoading) {
    var refreshBtn = window.WordleBot.panelUI.getRefreshBtn();
    if (!refreshBtn) {
      return;
    }

    if (isLoading) {
      // Cancel any pending clear operation
      if (state.pendingLoadingClear) {
        clearTimeout(state.pendingLoadingClear);
        state.pendingLoadingClear = null;
      }

      state.isLoading = true;
      state.loadingStartTime = Date.now();
      refreshBtn.classList.add('loading');
      refreshBtn.setAttribute('aria-busy', 'true');
    } else {
      // Calculate how long spinner has been visible
      var elapsed = Date.now() - state.loadingStartTime;
      var remaining = MIN_SPINNER_DURATION - elapsed;

      if (remaining > 0) {
        // Keep spinner visible for minimum duration
        state.pendingLoadingClear = setTimeout(function() {
          state.isLoading = false;
          state.pendingLoadingClear = null;
          refreshBtn.classList.remove('loading');
          refreshBtn.setAttribute('aria-busy', 'false');
        }, remaining);
      } else {
        // Minimum duration already met
        state.isLoading = false;
        refreshBtn.classList.remove('loading');
        refreshBtn.setAttribute('aria-busy', 'false');
      }
    }
  }

  /**
   * Set error state
   * Displays error message in panel body, or clears error state if null
   * @param {string|null} message - Error message to display, or null to clear
   */
  function setError(message) {
    // If null, just clear error state without rendering
    if (message === null) {
      state.hasError = false;
      state.errorMessage = '';
      return;
    }

    state.hasError = true;
    state.errorMessage = message || 'Something went wrong';

    var body = window.WordleBot.panelUI.getBody();
    if (!body) {
      return;
    }

    renderWithFade(body, function () {
      var errorEl = document.createElement('div');
      errorEl.className = 'edge-message error';
      errorEl.textContent = state.errorMessage + '. Try refreshing.';
      body.appendChild(errorEl);
    }, false);

    setLoading(false);
  }

  /**
   * Show full-body loading state with spinner and message
   * Used during initial preparation before suggestions are ready
   * @param {string} message - Loading message to display (e.g., "Preparing suggestions...")
   */
  function showBodyLoading(message) {
    var body = window.WordleBot.panelUI.getBody();
    if (!body) {
      return;
    }

    body.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'wordlebot-loading';

    var spinner = document.createElement('div');
    spinner.className = 'wordlebot-spinner';

    var text = document.createElement('div');
    text.textContent = message || 'Loading...';

    container.appendChild(spinner);
    container.appendChild(text);
    body.appendChild(container);
    body.style.opacity = '1';
  }

  /**
   * Show critical error - for errors that occur before panel initialization
   * First tries to use panel.setError, falls back to a minimal floating div
   * @param {string} message - User-friendly error message
   */
  function showCriticalError(message) {
    // Try using panel if it exists
    var body = window.WordleBot.panelUI && window.WordleBot.panelUI.getBody && window.WordleBot.panelUI.getBody();
    if (body) {
      setError(message);
      return;
    }

    // Fallback: create minimal error div
    var existingError = document.getElementById('wordlebot-critical-error');
    if (existingError) {
      existingError.remove();
    }

    var errorDiv = document.createElement('div');
    errorDiv.id = 'wordlebot-critical-error';
    errorDiv.style.cssText = [
      'position: fixed',
      'top: 60px',
      'right: 16px',
      'z-index: 10000',
      'background: white',
      'border: 1px solid #d3d6da',
      'border-radius: 8px',
      'padding: 16px',
      'font-family: sans-serif',
      'font-size: 14px',
      'color: #1a1a1b',
      'max-width: 280px',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.1)'
    ].join(';');

    var header = document.createElement('div');
    header.style.fontWeight = 'bold';
    header.style.marginBottom = '8px';
    header.textContent = 'WordleBot';

    var msgEl = document.createElement('div');
    msgEl.textContent = message;

    errorDiv.appendChild(header);
    errorDiv.appendChild(msgEl);
    document.body.appendChild(errorDiv);
  }

  // Export module
  window.WordleBot.panelRenderer = {
    render: render,
    setLoading: setLoading,
    setError: setError,
    showBodyLoading: showBodyLoading,
    showCriticalError: showCriticalError
  };
})();
