window.WordleBot = window.WordleBot || {};

/**
 * Dictionary Extraction Module
 *
 * Discovers the NYT Wordle JS bundle URL, fetches the bundle as text,
 * regex-extracts two word arrays (solutions and guesses), validates them,
 * and returns a structured result.
 *
 * Public API: window.WordleBot.dictExtractor.extract()
 *
 * This module is pure -- it only uses browser built-in APIs (fetch, DOMParser,
 * document.querySelectorAll, console, JSON, RegExp). It does NOT import or
 * call anything from dictionary.js or any other module.
 */
(function() {

  /**
   * Multi-strategy bundle URL discovery.
   *
   * Strategy 1: Performance API -- find all JS files loaded by the browser,
   *   including dynamically-loaded webpack chunks not in script[src] tags.
   * Strategy 2: Query live DOM for script tags matching known patterns.
   * Strategy 3: Fetch page HTML and parse it if DOM/perf find nothing.
   *
   * @returns {Promise<string|string[]|null>} Single URL, array of URLs, or null.
   */
  async function findBundleUrl() {
    var wordlePattern = /wordle\.[a-f0-9]+\.js/;
    var mainPattern = /main\.[a-f0-9]+\.js/;
    var gameAssetsPattern = /games-assets\/v2\/.*\.js/;

    // Strategy 1: Performance API -- discovers dynamically-loaded webpack chunks
    try {
      var resources = performance.getEntriesByType('resource');
      var gameChunks = [];

      for (var r = 0; r < resources.length; r++) {
        var name = resources[r].name;
        if (!gameAssetsPattern.test(name)) continue;

        // Put wordle.*.js or main.*.js at the front (likely main bundle)
        if (wordlePattern.test(name) || mainPattern.test(name)) {
          gameChunks.unshift(name);
        } else {
          gameChunks.push(name);
        }
      }

      if (gameChunks.length > 0) {
        return gameChunks;
      }
    } catch (e) {
      // performance API not available, continue to fallback
    }

    // Strategy 2: Query live DOM for script tags
    var allUrls = [];
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src');
      if (!src) continue;

      var fullUrl = new URL(src, document.location.href).href;

      if (wordlePattern.test(src)) {
        return fullUrl;
      }
      if (mainPattern.test(src)) {
        return fullUrl;
      }

      allUrls.push(fullUrl);
    }

    // Strategy 3: Fetch page HTML and parse it
    try {
      var response = await fetch(window.location.href);
      if (response.ok) {
        var html = await response.text();
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var parsedScripts = doc.querySelectorAll('script[src]');

        for (var j = 0; j < parsedScripts.length; j++) {
          var parsedSrc = parsedScripts[j].getAttribute('src');
          if (!parsedSrc) continue;

          var parsedFullUrl = new URL(parsedSrc, document.location.href).href;

          if (wordlePattern.test(parsedSrc)) {
            return parsedFullUrl;
          }
          if (mainPattern.test(parsedSrc)) {
            return parsedFullUrl;
          }

          if (allUrls.indexOf(parsedFullUrl) === -1) {
            allUrls.push(parsedFullUrl);
          }
        }
      }
    } catch (e) {
      console.warn('[WordleBot] HTML fetch fallback failed:', e.message);
    }

    // Strategy 4: Return all collected script URLs as last resort
    if (allUrls.length > 0) {
      return allUrls;
    }

    return null;
  }

  /**
   * Fetch a JS file as plain text.
   *
   * @param {string} url - The URL to fetch.
   * @returns {Promise<string|null>} The text content, or null on failure.
   */
  async function fetchBundleText(url) {
    try {
      var response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return await response.text();
    } catch (e) {
      return null;
    }
  }

  /**
   * Find all candidate word arrays in a JS source text.
   *
   * Primary strategy: Scan for array literals containing quoted 5-letter words.
   * Secondary strategy: Scan for .split(",") patterns with 5-letter words.
   *
   * Handles both single and double quotes throughout.
   * Returns all candidates found (disambiguation happens in extract()).
   *
   * @param {string} sourceText - The JS bundle source text.
   * @returns {string[][]} Array of candidate word arrays (may be empty).
   */
  function findWordArrays(sourceText) {
    var candidates = [];
    var fiveLetterWord = /^[a-z]{5}$/;

    // Primary strategy: Find array literals of quoted 5-letter words
    var arrayStartPattern = /\[["']/g;
    var match;

    while ((match = arrayStartPattern.exec(sourceText)) !== null) {
      var startIdx = match.index;

      // Quick check: do the next ~50 chars look like 5-letter word arrays?
      var snippet = sourceText.substring(startIdx, startIdx + 50);
      if (!/^\[["'][a-z]{5}["'],["'][a-z]{5}["']/.test(snippet)) continue;

      // Find the matching closing ] by tracking bracket depth
      var bracketDepth = 0;
      var endIdx = startIdx;
      var found = false;
      for (var i = startIdx; i < sourceText.length; i++) {
        if (sourceText[i] === '[') bracketDepth++;
        if (sourceText[i] === ']') {
          bracketDepth--;
          if (bracketDepth === 0) {
            endIdx = i;
            found = true;
            break;
          }
        }
      }

      if (!found) continue;

      // Skip past this array for next regex search
      arrayStartPattern.lastIndex = endIdx + 1;

      // Extract the substring from [ to ] inclusive
      var arrayStr = sourceText.substring(startIdx, endIdx + 1);

      // Try JSON.parse first (fast, handles well-formed double-quoted arrays)
      var arr = null;
      try {
        arr = JSON.parse(arrayStr);
      } catch (e) {
        // JSON.parse failed -- try with quotes normalized to double quotes
        try {
          var normalized = arrayStr.replace(/'/g, '"');
          arr = JSON.parse(normalized);
        } catch (e2) {
          arr = null;
        }
      }

      if (arr && Array.isArray(arr)) {
        var valid = [];
        for (var v = 0; v < arr.length; v++) {
          if (typeof arr[v] === 'string' && fiveLetterWord.test(arr[v])) {
            valid.push(arr[v]);
          }
        }
        if (valid.length > 500) {
          candidates.push(valid);
        }
      } else {
        // Manual regex extraction as last resort
        var words = [];
        var wordPatternDouble = /"([a-z]{5})"/g;
        var wordPatternSingle = /'([a-z]{5})'/g;
        var wordMatch;

        while ((wordMatch = wordPatternDouble.exec(arrayStr)) !== null) {
          words.push(wordMatch[1]);
        }
        if (words.length === 0) {
          while ((wordMatch = wordPatternSingle.exec(arrayStr)) !== null) {
            words.push(wordMatch[1]);
          }
        }

        if (words.length > 500) {
          candidates.push(words);
        }
      }
    }

    // Secondary strategy: Find .split(",") patterns
    var splitPatternDouble = /"([a-z]{5}(?:,[a-z]{5}){500,})"\.split\s*\(\s*["'],["']\s*\)/g;
    var splitMatch;
    while ((splitMatch = splitPatternDouble.exec(sourceText)) !== null) {
      var splitWords = splitMatch[1].split(',');
      var validSplit = [];
      for (var s = 0; s < splitWords.length; s++) {
        if (fiveLetterWord.test(splitWords[s])) {
          validSplit.push(splitWords[s]);
        }
      }
      if (validSplit.length > 500) {
        candidates.push(validSplit);
      }
    }

    var splitPatternSingle = /'([a-z]{5}(?:,[a-z]{5}){500,})'\.split\s*\(\s*["'],["']\s*\)/g;
    while ((splitMatch = splitPatternSingle.exec(sourceText)) !== null) {
      var splitWordsSingle = splitMatch[1].split(',');
      var validSplitSingle = [];
      for (var ss = 0; ss < splitWordsSingle.length; ss++) {
        if (fiveLetterWord.test(splitWordsSingle[ss])) {
          validSplitSingle.push(splitWordsSingle[ss]);
        }
      }
      if (validSplitSingle.length > 500) {
        candidates.push(validSplitSingle);
      }
    }

    return candidates;
  }

  /**
   * Disambiguate candidate arrays into solutions and guesses by size.
   *
   * Handles three cases:
   * 1. Two arrays found: smaller (~2,300) = solutions, larger (~10,000) = guesses
   * 2. One large array (10,000+): combined list (NYT merged solutions+guesses)
   * 3. Insufficient data: returns null
   *
   * @param {string[][]} candidates - All candidate word arrays found across chunks.
   * @returns {{ solutions: string[]|null, guesses: string[]|null, allWords: string[], combined: boolean }|null}
   */
  function disambiguateArrays(candidates) {
    if (candidates.length === 0) return null;

    // Sort by length ascending
    candidates.sort(function(a, b) { return a.length - b.length; });

    // Case: single large array (NYT combined list)
    if (candidates.length === 1) {
      var single = candidates[0];
      if (single.length >= 10000) {
        return { solutions: null, guesses: null, allWords: single, combined: true };
      }
      return null;
    }

    // Case: two+ arrays -- try to disambiguate
    var solutions = null;
    var guesses = null;

    for (var k = 0; k < candidates.length; k++) {
      var len = candidates[k].length;
      if (!solutions && len >= 2000 && len <= 3000) {
        solutions = candidates[k];
      } else if (!guesses && len >= 8000 && len <= 15000) {
        guesses = candidates[k];
      }
    }

    // Fallback: smallest = solutions, largest = guesses
    if (!solutions || !guesses) {
      solutions = candidates[0];
      guesses = candidates[candidates.length - 1];
    }

    var allWords = solutions.concat(guesses);
    return { solutions: solutions, guesses: guesses, allWords: allWords, combined: false };
  }

  /**
   * Validate extracted arrays for format and count ranges.
   *
   * Handles both split (solutions + guesses) and combined (single allWords) cases.
   *
   * @param {Object} result - Disambiguation result with solutions, guesses, allWords, combined.
   * @returns {{ ok: boolean, reason?: string }} Validation result.
   */
  function validateArrays(result) {
    var fiveLetterPattern = /^[a-z]{5}$/;

    if (result.combined) {
      // Combined list: validate allWords
      for (var i = 0; i < result.allWords.length; i++) {
        if (!fiveLetterPattern.test(result.allWords[i])) {
          return { ok: false, reason: 'invalid_word: ' + result.allWords[i] };
        }
      }
      if (result.allWords.length < 10000 || result.allWords.length > 20000) {
        return { ok: false, reason: 'word_count_out_of_range: ' + result.allWords.length + ' (expected 10000-20000)' };
      }
      return { ok: true };
    }

    // Split list: validate solutions and guesses separately
    for (var si = 0; si < result.solutions.length; si++) {
      if (!fiveLetterPattern.test(result.solutions[si])) {
        return { ok: false, reason: 'invalid_solution_word: ' + result.solutions[si] };
      }
    }
    for (var gi = 0; gi < result.guesses.length; gi++) {
      if (!fiveLetterPattern.test(result.guesses[gi])) {
        return { ok: false, reason: 'invalid_guess_word: ' + result.guesses[gi] };
      }
    }
    if (result.solutions.length < 2000 || result.solutions.length > 3000) {
      return { ok: false, reason: 'solution_count_out_of_range: ' + result.solutions.length + ' (expected 2000-3000)' };
    }
    if (result.guesses.length < 8000 || result.guesses.length > 15000) {
      return { ok: false, reason: 'guess_count_out_of_range: ' + result.guesses.length + ' (expected 8000-15000)' };
    }

    // Check for overlap (warning only)
    var solutionSet = {};
    for (var sk = 0; sk < result.solutions.length; sk++) {
      solutionSet[result.solutions[sk]] = true;
    }
    var overlapCount = 0;
    for (var gk = 0; gk < result.guesses.length; gk++) {
      if (solutionSet[result.guesses[gk]]) {
        overlapCount++;
      }
    }
    if (overlapCount > 0) {
      console.warn('[WordleBot] Warning: ' + overlapCount + ' words overlap between solutions and guesses arrays');
    }

    return { ok: true };
  }

  /**
   * Build a failure result object with consistent shape.
   *
   * @param {string} error - The error description.
   * @returns {Object} Failure result object.
   */
  function failureResult(error) {
    return {
      success: false,
      solutions: null,
      guesses: null,
      allWords: null,
      source: null,
      bundleUrl: null,
      error: error
    };
  }

  /**
   * Public extract function -- orchestrates the full extraction pipeline.
   *
   * findBundleUrl -> fetchBundleText -> extractArrays -> validateArrays -> result
   *
   * @returns {Promise<Object>} Structured result with success/failure and data.
   */
  async function extract() {
    try {
      // Step 1: Find bundle URLs
      var bundleUrl = await findBundleUrl();
      if (bundleUrl === null) {
        var error = 'bundle_not_found';
        console.warn('[WordleBot] Dictionary extraction failed: ' + error);
        return failureResult(error);
      }

      // Normalize to array
      var urls = typeof bundleUrl === 'string' ? [bundleUrl] : bundleUrl;

      // Step 2 & 3: Fetch chunks and accumulate candidate word arrays across all files
      var allCandidates = [];
      var sourceUrl = null;

      for (var u = 0; u < urls.length; u++) {
        var text = await fetchBundleText(urls[u]);
        if (text === null) continue;

        var found = findWordArrays(text);
        if (found.length > 0) {
          for (var f = 0; f < found.length; f++) {
            allCandidates.push(found[f]);
          }
          if (sourceUrl === null) sourceUrl = urls[u];
        }
      }

      // Disambiguate all candidates (handles 1 combined or 2+ split arrays)
      if (allCandidates.length === 0) {
        var noArraysError = 'no_arrays_found: searched ' + urls.length + ' files';
        console.warn('[WordleBot] Dictionary extraction failed: ' + noArraysError);
        return failureResult(noArraysError);
      }

      var arrays = disambiguateArrays(allCandidates);
      if (arrays === null) {
        var disambigError = 'disambiguation_failed: found ' + allCandidates.length + ' candidates but could not identify word lists';
        console.warn('[WordleBot] Dictionary extraction failed: ' + disambigError);
        return failureResult(disambigError);
      }

      // Step 4: Validate
      var valid = validateArrays(arrays);
      if (!valid.ok) {
        var validError = 'validation_failed: ' + valid.reason;
        console.warn('[WordleBot] Dictionary extraction failed: ' + validError);
        return failureResult(validError);
      }

      // Step 5: Success logging
      if (arrays.combined) {
        console.log('[WordleBot] Extracted ' + arrays.allWords.length + ' words (combined list) from NYT bundle (' + sourceUrl + ')');
      } else {
        console.log('[WordleBot] Extracted ' + arrays.solutions.length + ' solutions + ' + arrays.guesses.length + ' guesses from NYT bundle (' + sourceUrl + ')');
      }

      return {
        success: true,
        solutions: arrays.solutions,
        guesses: arrays.guesses,
        allWords: arrays.allWords,
        source: arrays.combined ? 'extracted_combined' : 'extracted_split',
        bundleUrl: sourceUrl,
        error: null
      };

    } catch (e) {
      var unexpectedError = 'unexpected_error: ' + e.message;
      console.warn('[WordleBot] Dictionary extraction failed: ' + unexpectedError);
      return failureResult(unexpectedError);
    }
  }

  // Export to namespace
  window.WordleBot.dictExtractor = {
    extract: extract
  };

})();
