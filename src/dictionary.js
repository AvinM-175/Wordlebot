window.WordleBot = window.WordleBot || {};

/**
 * Dictionary Orchestrator Module
 *
 * Three-tier dictionary loading cascade:
 *   1. Live extraction via dictExtractor.extract() (freshest data)
 *   2. Cached data from chrome.storage.local (fast repeat loads)
 *   3. Bundled fallback from data/NYTWordleList.txt (always available)
 *
 * Public API: window.WordleBot.loadDictionary(forceRefresh)
 *   Returns: { words: string[], source: string, freshness: string, fingerprint: string }
 *
 * Cache key: 'wordlebot_dict' in chrome.storage.local
 * Staleness: 30 days (CONTEXT Decision #5)
 * Retry: One retry after 12s on extraction failure (CONTEXT Decision #4)
 * Stale cache: Used silently when extraction fails (CONTEXT Decision #6)
 * Invalidation: Bundled fingerprint mismatch invalidates cache (CONTEXT Decision #8)
 */
(function() {

  // ---- Constants ----
  var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 2592000000
  var RETRY_DELAY = 12000; // 12 seconds (Decision #4: 10-15s range)
  var CACHE_KEY = 'wordlebot_dict';

  // ---- Memoized bundled data (computed once per session) ----
  var _bundledCache = { words: null, fingerprint: null };

  // ---- Internal Functions ----

  /**
   * Compute SHA-256 fingerprint of a word list.
   * Words are sorted, joined by newline, then hashed.
   * Returns hex string.
   */
  async function computeFingerprint(words) {
    var canonical = words.slice().sort().join('\n');
    var encoder = new TextEncoder();
    var data = encoder.encode(canonical);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashArray = new Uint8Array(hashBuffer);
    var hashHex = '';
    for (var i = 0; i < hashArray.length; i++) {
      hashHex += hashArray[i].toString(16).padStart(2, '0');
    }
    return hashHex;
  }

  /**
   * Load the bundled fallback dictionary from extension resources.
   * Returns a flat array of lowercase 5-letter words.
   */
  async function loadBundledFallback() {
    var url = chrome.runtime.getURL('data/NYTWordleList.txt');
    var response = await fetch(url);
    if (!response.ok) {
      throw new Error('[WordleBot] Bundled dictionary load failed: ' + response.status);
    }
    var text = await response.text();
    var words = text.trim().split('\n');
    var filtered = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i].trim().toLowerCase();
      if (w.length === 5) {
        filtered.push(w);
      }
    }
    return filtered;
  }

  /**
   * Get the bundled dictionary fingerprint (memoized).
   * Also memoizes the bundled words to avoid loading the file twice.
   * Returns the SHA-256 hex fingerprint string.
   */
  async function getBundledFingerprint() {
    if (_bundledCache.fingerprint !== null) {
      return _bundledCache.fingerprint;
    }
    var words = await loadBundledFallback();
    var fp = await computeFingerprint(words);
    _bundledCache.words = words;
    _bundledCache.fingerprint = fp;
    return fp;
  }

  /**
   * Get the memoized bundled words array.
   * Must be called after getBundledFingerprint() has run at least once.
   * Falls back to loading if not yet memoized.
   */
  async function getBundledWords() {
    if (_bundledCache.words !== null) {
      return _bundledCache.words;
    }
    // This path should not normally execute (getBundledFingerprint loads both)
    var words = await loadBundledFallback();
    _bundledCache.words = words;
    return words;
  }

  /**
   * Attempt a single live extraction via dictExtractor.
   * Returns the word array on success, or null on failure.
   */
  async function tryExtraction() {
    try {
      if (!window.WordleBot.dictExtractor || !window.WordleBot.dictExtractor.extract) {
        console.warn('[WordleBot] dictExtractor not available');
        return null;
      }
      var result = await window.WordleBot.dictExtractor.extract();
      if (result.success && result.allWords && result.allWords.length > 0) {
        return result.allWords;
      }
      console.warn('[WordleBot] Extraction returned failure: ' + (result.error || 'unknown'));
      return null;
    } catch (e) {
      console.warn('[WordleBot] Extraction threw error: ' + e.message);
      return null;
    }
  }

  /**
   * Try extraction with one retry after RETRY_DELAY ms.
   * Returns the word array on success, or null if both attempts fail.
   */
  async function tryExtractionWithRetry() {
    var first = await tryExtraction();
    if (first) return first;

    console.log('[WordleBot] Extraction failed, retrying in ' + (RETRY_DELAY / 1000) + 's...');

    await new Promise(function(resolve) {
      setTimeout(resolve, RETRY_DELAY);
    });

    return await tryExtraction();
  }

  /**
   * Load dictionary from chrome.storage.local cache.
   * Validates structure and bundled fingerprint match.
   * Returns a DictionaryResult on hit, or null on miss/invalidation.
   *
   * @param {string} currentBundledFp - Current bundled dictionary fingerprint.
   * @returns {Promise<Object|null>} DictionaryResult or null.
   */
  async function loadFromCache(currentBundledFp) {
    try {
      var stored = await chrome.storage.local.get(CACHE_KEY);
      var cacheData = stored[CACHE_KEY];

      if (!cacheData || !Array.isArray(cacheData.words) || !cacheData.fingerprint || !cacheData.extractedAt) {
        return null;
      }

      // Check bundled fingerprint -- extension update detection (Decision #8)
      if (cacheData.bundledFingerprint !== currentBundledFp) {
        console.log('[WordleBot] Bundled dictionary changed -- cache invalidated');
        return null;
      }

      // Check staleness (Decision #5: 30-day window)
      var age = Date.now() - cacheData.extractedAt;
      var isStale = age > THIRTY_DAYS_MS;

      if (isStale) {
        var days = Math.floor(age / 86400000);
        console.log('[WordleBot] Cache is stale (' + days + ' days old)');
      }

      var result = {
        words: cacheData.words,
        source: 'cached',
        freshness: isStale ? 'stale' : 'fresh',
        fingerprint: cacheData.fingerprint
      };

      console.log('[WordleBot] Dictionary loaded from cache (' +
        result.words.length + ' words, ' + result.freshness +
        ', fingerprint: ' + result.fingerprint.substring(0, 8) + ')');

      return result;
    } catch (e) {
      console.warn('[WordleBot] Cache read failed: ' + e.message);
      return null;
    }
  }

  /**
   * Save a dictionary result to chrome.storage.local cache.
   *
   * @param {Object} dictResult - The DictionaryResult to cache.
   * @param {string} bundledFp - Current bundled dictionary fingerprint.
   */
  async function saveToCache(dictResult, bundledFp) {
    try {
      var entry = {
        words: dictResult.words,
        fingerprint: dictResult.fingerprint,
        extractedAt: Date.now(),
        bundledFingerprint: bundledFp,
        source: dictResult.source
      };
      var storageObj = {};
      storageObj[CACHE_KEY] = entry;
      await chrome.storage.local.set(storageObj);
      console.log('[WordleBot] Dictionary cached (' +
        entry.words.length + ' words, fingerprint: ' +
        entry.fingerprint.substring(0, 8) + ')');
    } catch (e) {
      console.warn('[WordleBot] Cache save failed: ' + e.message);
    }
  }

  /**
   * Main orchestrator: load dictionary through three-tier fallback cascade.
   *
   * @param {boolean} [forceRefresh=false] - Skip cache, force re-extraction.
   * @returns {Promise<Object>} DictionaryResult { words, source, freshness, fingerprint }
   */
  async function loadDictionary(forceRefresh) {
    var staleCache = null;

    // Step A: Get bundled fingerprint (memoized after first call)
    var bundledFp = await getBundledFingerprint();

    // Step B: Try cache fast path (unless forceRefresh)
    if (!forceRefresh) {
      var cached = await loadFromCache(bundledFp);
      if (cached) {
        if (cached.freshness === 'fresh') {
          // FAST PATH: fresh cache, skip extraction entirely
          window.WordleBot.dictionaryFingerprint = cached.fingerprint;
          return cached;
        }
        // Stale cache: save reference, try extraction first
        staleCache = cached;
      }
    }

    // Step C: Try live extraction with retry
    var extractedWords = await tryExtractionWithRetry();

    if (extractedWords) {
      var fp = await computeFingerprint(extractedWords);
      var result = {
        words: extractedWords,
        source: 'extracted',
        freshness: 'fresh',
        fingerprint: fp
      };

      console.log('[WordleBot] Dictionary extracted (' +
        result.words.length + ' words, fingerprint: ' +
        fp.substring(0, 8) + ')');

      // Save to cache for next load
      await saveToCache(result, bundledFp);

      // Backward compatibility (Plan 02 will clean up)
      window.WordleBot.dictionaryFingerprint = result.fingerprint;

      return result;
    }

    // Extraction failed -- try stale cache (Decision #6: use silently)
    if (staleCache) {
      console.log('[WordleBot] Extraction failed -- using stale cache');

      // Backward compatibility
      window.WordleBot.dictionaryFingerprint = staleCache.fingerprint;

      return staleCache;
    }

    // Step D: Bundled fallback (last resort)
    var bundledWords = await getBundledWords();
    var bundledResult = {
      words: bundledWords,
      source: 'bundled',
      freshness: 'bundled',
      fingerprint: _bundledCache.fingerprint
    };

    console.log('[WordleBot] Using bundled fallback dictionary (' +
      bundledWords.length + ' words)');

    // Backward compatibility
    window.WordleBot.dictionaryFingerprint = bundledResult.fingerprint;

    return bundledResult;
  }

  // ---- Export ----
  window.WordleBot.loadDictionary = loadDictionary;

})();
