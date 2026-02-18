/**
 * panelUI.js - Shadow DOM UI Panel for WordleBot
 * Phase 6: UI Panel Foundation
 *
 * Creates a floating overlay panel with:
 * - Shadow DOM isolation from NYT page styles
 * - Theme detection and matching (dark/light)
 * - Collapse/expand toggle with localStorage persistence
 * - Responsive auto-collapse on narrow viewports
 * - Skeleton loading placeholders for Phase 7 content
 */
(function () {
  'use strict';

  window.WordleBot = window.WordleBot || {};

  // Constants
  var STORAGE_KEY = 'wordlebot_panel_collapsed';
  var NARROW_VIEWPORT_QUERY = '(max-width: 600px)';

  // Module state
  var state = {
    host: null,
    shadow: null,
    panel: null,
    body: null,
    toggle: null,
    chevron: null,
    refreshBtn: null,
    sheet: null,
    collapsed: false,
    autoCollapsed: false,
    userPreference: false,
    mediaQuery: null,
    currentTheme: 'light'
  };

  // Theme color tokens from CONTEXT.md
  var THEME_TOKENS = {
    dark: {
      bg: '#121213',
      text: '#d7dadc',
      textSecondary: '#818384',
      border: '#3a3a3c',
      shadow: 'rgba(0,0,0,0.3)'
    },
    light: {
      bg: '#ffffff',
      text: '#1a1a1b',
      textSecondary: '#787c7e',
      border: '#d3d6da',
      shadow: 'rgba(0,0,0,0.1)'
    }
  };

  /**
   * Detect the current page theme (dark or light)
   * Primary: Check body.classList.contains("dark") - NYT Wordle's actual theme signal
   * Fallback: CSS variables or computed styles
   * Last resort: Default to light
   */
  function detectTheme() {
    // PRIMARY CHECK: NYT Wordle uses "dark" class on body for dark theme
    if (document.body && document.body.classList.contains('dark')) {
      return 'dark';
    }

    // If body exists but no "dark" class, it's light theme
    if (document.body) {
      return 'light';
    }

    // FALLBACK: If body isn't ready yet, try CSS variables
    var container = document.querySelector('#wordle-app-game') ||
                    document.querySelector('[class*="App-module"]') ||
                    document.documentElement;

    try {
      var styles = window.getComputedStyle(container);
      var bgVar = styles.getPropertyValue('--color-background').trim();
      var toneVar = styles.getPropertyValue('--color-tone-1').trim();
      var colorToCheck = bgVar || toneVar;

      if (colorToCheck) {
        var luminance = computeLuminance(colorToCheck);
        return luminance < 0.5 ? 'dark' : 'light';
      }
    } catch (e) {
      // Fallback silently
    }

    // Last resort: default to light
    return 'light';
  }

  /**
   * Compute relative luminance from an rgb/rgba color string
   * Returns value between 0 (black) and 1 (white)
   */
  function computeLuminance(colorString) {
    // Parse rgb(r, g, b) or rgba(r, g, b, a)
    var match = colorString.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) {
      return 1; // Default to light
    }

    var r = parseInt(match[1], 10) / 255;
    var g = parseInt(match[2], 10) / 255;
    var b = parseInt(match[3], 10) / 255;

    // Relative luminance formula (simplified)
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /**
   * Create constructable stylesheet with theme-aware styles
   */
  function createStyles(theme) {
    var tokens = THEME_TOKENS[theme] || THEME_TOKENS.light;
    var sheet = new CSSStyleSheet();

    var css = '\n' +
      ':host {\n' +
      '  --wb-bg: ' + tokens.bg + ';\n' +
      '  --wb-text: ' + tokens.text + ';\n' +
      '  --wb-text-secondary: ' + tokens.textSecondary + ';\n' +
      '  --wb-border: ' + tokens.border + ';\n' +
      '  --wb-shadow: ' + tokens.shadow + ';\n' +
      '}\n' +
      '\n' +
      '.panel {\n' +
      '  width: 300px;\n' +
      '  background-color: var(--wb-bg);\n' +
      '  color: var(--wb-text);\n' +
      '  border-radius: 8px;\n' +
      '  box-shadow: 0 4px 12px var(--wb-shadow);\n' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.4;\n' +
      '  overflow: hidden;\n' +
      '  border: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.header {\n' +
      '  display: flex;\n' +
      '  flex-direction: row;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '  padding: 12px 16px;\n' +
      '  border-bottom: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.panel.collapsed .header {\n' +
      '  border-bottom: none;\n' +
      '}\n' +
      '\n' +
      '.title {\n' +
      '  font-weight: 600;\n' +
      '  font-size: 14px;\n' +
      '  color: var(--wb-text);\n' +
      '}\n' +
      '\n' +
      '.toggle {\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  cursor: pointer;\n' +
      '  padding: 4px;\n' +
      '  border-radius: 4px;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: background-color 0.15s ease;\n' +
      '}\n' +
      '\n' +
      '.toggle:hover {\n' +
      '  background-color: var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.toggle:focus {\n' +
      '  outline: 2px solid var(--wb-text-secondary);\n' +
      '  outline-offset: 2px;\n' +
      '}\n' +
      '\n' +
      '.chevron {\n' +
      '  width: 0;\n' +
      '  height: 0;\n' +
      '  border-left: 5px solid transparent;\n' +
      '  border-right: 5px solid transparent;\n' +
      '  border-top: 6px solid var(--wb-text);\n' +
      '  transition: transform 0.2s ease;\n' +
      '}\n' +
      '\n' +
      '.panel.collapsed .chevron {\n' +
      '  transform: rotate(-90deg);\n' +
      '}\n' +
      '\n' +
      '.body {\n' +
      '  padding: 16px;\n' +
      '  max-height: 300px;\n' +
      '  overflow-y: auto;\n' +
      '}\n' +
      '\n' +
      '.panel.collapsed .body {\n' +
      '  display: none;\n' +
      '}\n' +
      '\n' +
      '.skeleton-item {\n' +
      '  display: flex;\n' +
      '  flex-direction: row;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '  padding: 10px 0;\n' +
      '  border-bottom: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.skeleton-item:last-child {\n' +
      '  border-bottom: none;\n' +
      '}\n' +
      '\n' +
      '.skeleton {\n' +
      '  background: linear-gradient(\n' +
      '    90deg,\n' +
      '    var(--wb-border) 0%,\n' +
      '    var(--wb-text-secondary) 50%,\n' +
      '    var(--wb-border) 100%\n' +
      '  );\n' +
      '  background-size: 200% 100%;\n' +
      '  border-radius: 4px;\n' +
      '  animation: shimmer 1.5s infinite linear;\n' +
      '}\n' +
      '\n' +
      '@keyframes shimmer {\n' +
      '  0% {\n' +
      '    background-position: 200% 0;\n' +
      '  }\n' +
      '  100% {\n' +
      '    background-position: -200% 0;\n' +
      '  }\n' +
      '}\n' +
      '\n' +
      '/* Candidate count header */\n' +
      '.candidate-count {\n' +
      '  font-size: 12px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  margin-bottom: 12px;\n' +
      '  padding-bottom: 8px;\n' +
      '  border-bottom: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '/* Suggestion cards */\n' +
      '.suggestion-card {\n' +
      '  padding: 10px 0;\n' +
      '  border-bottom: 1px solid var(--wb-border);\n' +
      '  cursor: pointer;\n' +
      '  transition: background-color 0.15s ease;\n' +
      '}\n' +
      '\n' +
      '.suggestion-card:last-child {\n' +
      '  border-bottom: none;\n' +
      '}\n' +
      '\n' +
      '.suggestion-card:hover {\n' +
      '  background-color: var(--wb-border);\n' +
      '  margin: 0 -16px;\n' +
      '  padding: 10px 16px;\n' +
      '}\n' +
      '\n' +
      '/* Top suggestion highlight */\n' +
      '.suggestion-card.top-suggestion {\n' +
      '  background-color: rgba(106, 170, 100, 0.1);\n' +
      '  margin: 0 -16px;\n' +
      '  padding: 10px 16px;\n' +
      '  border-radius: 4px;\n' +
      '}\n' +
      '\n' +
      '.suggestion-card.top-suggestion:hover {\n' +
      '  background-color: rgba(106, 170, 100, 0.2);\n' +
      '}\n' +
      '\n' +
      '/* Main row: word + confidence */\n' +
      '.suggestion-main {\n' +
      '  display: flex;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '}\n' +
      '\n' +
      '.suggestion-word {\n' +
      '  font-weight: 600;\n' +
      '  font-size: 14px;\n' +
      '  letter-spacing: 0.1em;\n' +
      '  color: var(--wb-text);\n' +
      '}\n' +
      '\n' +
      '.suggestion-confidence {\n' +
      '  font-size: 14px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '}\n' +
      '\n' +
      '/* Progressive disclosure content */\n' +
      '.suggestion-why {\n' +
      '  display: none;\n' +
      '  font-size: 13px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  margin-top: 6px;\n' +
      '  padding-left: 2px;\n' +
      '}\n' +
      '\n' +
      '.suggestion-card[data-state="1"] .suggestion-why,\n' +
      '.suggestion-card[data-state="2"] .suggestion-why {\n' +
      '  display: block;\n' +
      '}\n' +
      '\n' +
      '.suggestion-details {\n' +
      '  display: none;\n' +
      '  margin-top: 8px;\n' +
      '  padding-left: 8px;\n' +
      '  border-left: 2px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.suggestion-card[data-state="2"] .suggestion-details {\n' +
      '  display: block;\n' +
      '}\n' +
      '\n' +
      '.suggestion-detail {\n' +
      '  font-size: 12px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  margin-bottom: 4px;\n' +
      '}\n' +
      '\n' +
      '.suggestion-detail:last-child {\n' +
      '  margin-bottom: 0;\n' +
      '}\n' +
      '\n' +
      '/* Body fade transition */\n' +
      '.body {\n' +
      '  transition: opacity 0.15s ease;\n' +
      '}\n' +
      '\n' +
      '/* Edge state messages */\n' +
      '.edge-message {\n' +
      '  text-align: center;\n' +
      '  padding: 20px 0;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  font-size: 13px;\n' +
      '}\n' +
      '\n' +
      '.edge-message.error {\n' +
      '  color: #b55;\n' +
      '}\n' +
      '\n' +
      '.only-answer {\n' +
      '  text-align: center;\n' +
      '  padding: 16px 0;\n' +
      '}\n' +
      '\n' +
      '.only-answer-word {\n' +
      '  font-size: 20px;\n' +
      '  font-weight: 700;\n' +
      '  letter-spacing: 0.15em;\n' +
      '  color: var(--wb-text);\n' +
      '}\n' +
      '\n' +
      '.only-answer-label {\n' +
      '  font-size: 12px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  margin-bottom: 4px;\n' +
      '}\n' +
      '\n' +
      '/* Near-tie note */\n' +
      '.near-tie-note {\n' +
      '  font-size: 12px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  font-style: italic;\n' +
      '  margin-top: 12px;\n' +
      '  padding-top: 8px;\n' +
      '  border-top: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '/* Refresh button in header */\n' +
      '.refresh-btn {\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  cursor: pointer;\n' +
      '  padding: 4px;\n' +
      '  border-radius: 4px;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: background-color 0.15s ease;\n' +
      '  color: var(--wb-text);\n' +
      '}\n' +
      '\n' +
      '.refresh-btn:hover {\n' +
      '  background-color: var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.refresh-btn:focus {\n' +
      '  outline: 2px solid var(--wb-text-secondary);\n' +
      '  outline-offset: 2px;\n' +
      '}\n' +
      '\n' +
      '.refresh-icon {\n' +
      '  width: 16px;\n' +
      '  height: 16px;\n' +
      '}\n' +
      '\n' +
      '/* Spinner animation for loading state */\n' +
      '.refresh-btn.loading .refresh-icon {\n' +
      '  animation: spin 1s linear infinite;\n' +
      '}\n' +
      '\n' +
      '@keyframes spin {\n' +
      '  0% { transform: rotate(0deg); }\n' +
      '  100% { transform: rotate(360deg); }\n' +
      '}\n' +
      '\n' +
      '/* Solved summary */\n' +
      '.solved-summary {\n' +
      '  font-size: 13px;\n' +
      '  color: var(--wb-text);\n' +
      '  line-height: 1.5;\n' +
      '  padding: 12px 0;\n' +
      '}\n' +
      '\n' +
      '/* Game context */\n' +
      '.game-context {\n' +
      '  margin-top: 8px;\n' +
      '  padding-left: 8px;\n' +
      '  border-left: 2px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '/* Body loading state */\n' +
      '.wordlebot-loading {\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  padding: 24px 16px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '}\n' +
      '\n' +
      '.wordlebot-spinner {\n' +
      '  width: 24px;\n' +
      '  height: 24px;\n' +
      '  border: 3px solid var(--wb-border);\n' +
      '  border-top-color: #6aaa64;\n' +
      '  border-radius: 50%;\n' +
      '  animation: wordlebot-spin 0.8s linear infinite;\n' +
      '  margin-bottom: 12px;\n' +
      '}\n' +
      '\n' +
      '@keyframes wordlebot-spin {\n' +
      '  to { transform: rotate(360deg); }\n' +
      '}\n' +
      '\n' +
      '/* Dictionary source indicator */\n' +
      '.dict-source {\n' +
      '  font-size: 11px;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  text-align: center;\n' +
      '  padding: 6px 0 2px;\n' +
      '  border-top: 1px solid var(--wb-border);\n' +
      '  margin-top: 8px;\n' +
      '}\n' +
      '\n' +
      '/* Onboarding overlay */\n' +
      '.onboarding-overlay {\n' +
      '  padding: 12px 0;\n' +
      '}\n' +
      '\n' +
      '.onboarding-title {\n' +
      '  font-size: 15px;\n' +
      '  font-weight: 600;\n' +
      '  color: var(--wb-text);\n' +
      '  margin-bottom: 12px;\n' +
      '}\n' +
      '\n' +
      '.onboarding-tips {\n' +
      '  list-style: none;\n' +
      '  padding: 0;\n' +
      '  margin: 0 0 16px 0;\n' +
      '}\n' +
      '\n' +
      '.onboarding-tip {\n' +
      '  font-size: 13px;\n' +
      '  color: var(--wb-text);\n' +
      '  line-height: 1.5;\n' +
      '  padding: 8px 0;\n' +
      '  border-bottom: 1px solid var(--wb-border);\n' +
      '}\n' +
      '\n' +
      '.onboarding-tip:last-child {\n' +
      '  border-bottom: none;\n' +
      '}\n' +
      '\n' +
      '.onboarding-tip-number {\n' +
      '  font-weight: 600;\n' +
      '  color: var(--wb-text-secondary);\n' +
      '  margin-right: 4px;\n' +
      '}\n' +
      '\n' +
      '.onboarding-dismiss-btn {\n' +
      '  display: block;\n' +
      '  width: 100%;\n' +
      '  padding: 10px 0;\n' +
      '  background-color: #6aaa64;\n' +
      '  color: #ffffff;\n' +
      '  border: none;\n' +
      '  border-radius: 4px;\n' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n' +
      '  font-size: 14px;\n' +
      '  font-weight: 600;\n' +
      '  cursor: pointer;\n' +
      '  text-align: center;\n' +
      '  margin-top: 4px;\n' +
      '}\n' +
      '\n' +
      '.onboarding-dismiss-btn:hover {\n' +
      '  background-color: #538d4e;\n' +
      '}\n' +
      '\n' +
      '.onboarding-dismiss-btn:focus {\n' +
      '  outline: 2px solid var(--wb-text-secondary);\n' +
      '  outline-offset: 2px;\n' +
      '}\n';

    sheet.replaceSync(css);
    return sheet;
  }

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

  /**
   * Save collapse preference to localStorage
   */
  function setStoredCollapsed(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch (e) {
      // localStorage may be blocked, fail silently
    }
  }

  /**
   * Set panel collapsed state
   * @param {boolean} collapsed - Whether to collapse
   * @param {boolean} persist - Whether to save to localStorage (default true)
   */
  function setCollapsed(collapsed, persist) {
    if (persist === undefined) {
      persist = true;
    }

    state.collapsed = collapsed;

    if (state.panel) {
      if (collapsed) {
        state.panel.classList.add('collapsed');
      } else {
        state.panel.classList.remove('collapsed');
      }
    }

    if (persist) {
      setStoredCollapsed(collapsed);
      state.userPreference = collapsed;
    }
  }

  /**
   * Check if panel is currently collapsed
   */
  function isCollapsed() {
    return state.collapsed;
  }

  /**
   * Get the panel body element for content injection
   */
  function getBody() {
    return state.body;
  }

  /**
   * Get the refresh button element
   */
  function getRefreshBtn() {
    return state.refreshBtn;
  }

  /**
   * Setup responsive viewport collapse behavior
   */
  function setupResponsiveCollapse() {
    // Use matchMedia for responsive behavior
    var mq;
    try {
      mq = window.matchMedia(NARROW_VIEWPORT_QUERY);
    } catch (e) {
      return; // matchMedia not supported
    }

    state.mediaQuery = mq;

    function handleViewportChange(e) {
      var isNarrow = e.matches;

      if (isNarrow && !state.collapsed) {
        // Auto-collapse on narrow viewport
        state.autoCollapsed = true;
        setCollapsed(true, false); // Don't persist auto-collapse
      } else if (!isNarrow && state.autoCollapsed) {
        // Restore user preference when viewport expands
        state.autoCollapsed = false;
        setCollapsed(state.userPreference, false);
      }
    }

    // Modern browsers
    if (mq.addEventListener) {
      mq.addEventListener('change', handleViewportChange);
    } else if (mq.addListener) {
      // Older browsers fallback
      mq.addListener(handleViewportChange);
    }

    // Check initial state
    if (mq.matches) {
      state.autoCollapsed = true;
      setCollapsed(true, false);
    }
  }

  /**
   * Build the panel DOM structure
   */
  function buildPanelDOM() {
    // Create panel container
    var panel = document.createElement('div');
    panel.className = 'panel';

    // Header - layout: title | refresh | toggle
    var header = document.createElement('div');
    header.className = 'header';

    var title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'WordleBot';

    // Refresh button
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'refresh-btn';
    refreshBtn.setAttribute('aria-label', 'Refresh suggestions');
    refreshBtn.setAttribute('type', 'button');
    refreshBtn.setAttribute('title', 'Refresh suggestions');
    refreshBtn.innerHTML = '<svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';

    // Collapse toggle button
    var toggle = document.createElement('button');
    toggle.className = 'toggle';
    toggle.setAttribute('aria-label', 'Toggle panel');
    toggle.setAttribute('type', 'button');

    var chevron = document.createElement('span');
    chevron.className = 'chevron';
    toggle.appendChild(chevron);

    // Right side container for refresh + toggle
    var headerRight = document.createElement('div');
    headerRight.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    headerRight.appendChild(refreshBtn);
    headerRight.appendChild(toggle);

    header.appendChild(title);
    header.appendChild(headerRight);

    // Body with skeleton items
    var body = document.createElement('div');
    body.className = 'body';

    // Create 5 skeleton loading items
    for (var i = 0; i < 5; i++) {
      var skeletonItem = document.createElement('div');
      skeletonItem.className = 'skeleton-item';

      var skeletonWord = document.createElement('div');
      skeletonWord.className = 'skeleton';
      skeletonWord.style.width = '60px';
      skeletonWord.style.height = '18px';

      var skeletonScore = document.createElement('div');
      skeletonScore.className = 'skeleton';
      skeletonScore.style.width = '40px';
      skeletonScore.style.height = '14px';
      skeletonScore.style.marginLeft = 'auto';

      skeletonItem.appendChild(skeletonWord);
      skeletonItem.appendChild(skeletonScore);
      body.appendChild(skeletonItem);
    }

    panel.appendChild(header);
    panel.appendChild(body);

    return {
      panel: panel,
      body: body,
      toggle: toggle,
      chevron: chevron,
      refreshBtn: refreshBtn
    };
  }

  /**
   * Update panel theme
   * @param {string} theme - 'dark' or 'light'
   */
  function updateTheme(theme) {
    if (!state.shadow) {
      return;
    }

    state.currentTheme = theme;
    var newSheet = createStyles(theme);
    state.sheet = newSheet;
    state.shadow.adoptedStyleSheets = [newSheet];
  }

  /**
   * Poll for theme to stabilize (Wordle may apply theme class after initial load)
   * Uses requestAnimationFrame for efficient polling (~16ms intervals)
   * @param {number} retries - Number of remaining retries
   */
  function pollForTheme(retries) {
    // Re-detect theme using body.classList (primary method)
    var newTheme = detectTheme();

    if (newTheme !== state.currentTheme) {
      console.log('[WordleBot] Theme corrected after polling: ' + state.currentTheme + ' -> ' + newTheme);
      updateTheme(newTheme);
    } else if (retries > 0) {
      // Keep polling in case theme changes during page load
      requestAnimationFrame(function() {
        pollForTheme(retries - 1);
      });
    }
  }

  /**
   * Setup MutationObserver to watch for theme changes
   * Primary: Watch body class changes (NYT Wordle adds/removes "dark" class)
   */
  function setupThemeObserver() {
    var debounceTimer = null;

    function handleMutation() {
      // Debounce rapid mutations
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(function () {
        var newTheme = detectTheme();
        if (newTheme !== state.currentTheme) {
          console.log('[WordleBot] Theme changed: ' + state.currentTheme + ' -> ' + newTheme);
          updateTheme(newTheme);
        }
      }, 50);
    }

    try {
      var observer = new MutationObserver(handleMutation);

      // PRIMARY: Watch body for class changes (NYT Wordle uses body.dark)
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });

      // Also watch html element as backup
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });

      console.log('[WordleBot] Theme observer active (watching body.classList)');
    } catch (e) {
      console.warn('[WordleBot] Could not setup theme observer:', e);
    }
  }

  /**
   * Initialize the panel UI
   * Creates Shadow DOM host, builds panel structure, sets up event listeners
   * @returns {Object} { shadow, updateTheme }
   */
  function init() {
    var _initStart = performance.now();

    // Prevent double initialization
    if (state.host) {
      console.warn('[WordleBot] Panel already initialized');
      return {
        shadow: state.shadow,
        updateTheme: updateTheme
      };
    }

    // Create host element
    var host = document.createElement('div');
    host.id = 'wordlebot-panel-host';
    host.style.cssText = 'all: initial; position: fixed; top: 60px; right: 16px; z-index: 10000;';

    // Attach to body
    document.body.appendChild(host);

    // Create shadow root
    var shadow = host.attachShadow({ mode: 'open' });

    // Detect theme and create stylesheet
    var theme = detectTheme();
    var sheet = createStyles(theme);
    shadow.adoptedStyleSheets = [sheet];

    // Build panel DOM
    var dom = buildPanelDOM();

    // Store references
    state.host = host;
    state.shadow = shadow;
    state.panel = dom.panel;
    state.body = dom.body;
    state.toggle = dom.toggle;
    state.chevron = dom.chevron;
    state.refreshBtn = dom.refreshBtn;
    state.sheet = sheet;
    state.currentTheme = theme;

    // Append panel to shadow root
    shadow.appendChild(dom.panel);

    // Restore collapse state
    state.userPreference = getStoredCollapsed();
    if (state.userPreference) {
      setCollapsed(true, false);
    }

    // Setup toggle click handler
    dom.toggle.addEventListener('click', function () {
      var newState = !state.collapsed;
      state.autoCollapsed = false; // User explicitly toggled
      setCollapsed(newState, true);
    });

    // Setup responsive collapse
    setupResponsiveCollapse();

    // Poll for CSS variables to be available (Wordle applies theme asynchronously)
    // ~60 retries at ~16ms intervals = ~1 second max wait
    pollForTheme(60);

    // Setup observer for theme changes (user toggling dark/light mode)
    setupThemeObserver();

    var bodyHasDark = document.body && document.body.classList.contains('dark');
    console.log('[WordleBot] panelUI.init: ' + (performance.now() - _initStart).toFixed(0) + 'ms (theme: ' + theme + ', body.dark=' + bodyHasDark + ')');

    return {
      shadow: shadow,
      updateTheme: updateTheme
    };
  }

  // Export module
  window.WordleBot.panelUI = {
    init: init,
    setCollapsed: setCollapsed,
    isCollapsed: isCollapsed,
    updateTheme: updateTheme,
    getBody: getBody,
    getRefreshBtn: getRefreshBtn
  };
})();
