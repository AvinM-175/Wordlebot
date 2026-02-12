window.WordleBot = window.WordleBot || {};

(function () {
  'use strict';

  // --- Private constants ---
  var POWERS_OF_3 = [1, 3, 9, 27, 81];
  var PATTERN_COUNT = 243;  // 3^5
  var ADAPTIVE_THRESHOLD = 20;  // switch to remaining-only when candidates <= this
  var FIRST_GUESS_CACHE_SIZE = 20;

  // Urgency weights for bestAnswerGuesses commonness blend (tunable)
  var URGENCY = {
    4: 0.0,   // guessesLeft >= 4: pure entropy
    3: 0.15,  // slight commonness boost
    2: 0.4,   // balanced
    1: 1.0    // pure commonness -- must solve now
  };

  // --- Private module state ---
  var encodedWords = null;    // Array of Uint8Array(5), values 0-25
  var dictionary = null;      // Original string array
  var firstGuessCache = null; // {bestInfoGuesses: Array, bestAnswerGuesses: Array}
  var frequencyTables = null; // Reference to freq tables for tie-breaking
  var commonnessData = null;  // Reference to {scores, max} from frequencyScorer

  // --- Pre-allocated reusable buffers for computeEntropy (public API) ---
  var publicBuckets = new Uint16Array(PATTERN_COUNT);
  var publicSecretCounts = new Uint8Array(26);
  var publicPattern = new Uint8Array(5);

  // --- Math helpers ---
  var LOG2 = Math.log(2);
  function log2(x) {
    return Math.log(x) / LOG2;
  }

  // --- Core: Two-pass feedback pattern computation ---
  // Returns integer pattern ID (0-242)
  // CRITICAL: handles duplicate letters correctly via two passes
  function computePatternId(guessEnc, secretEnc, secretCounts, pattern) {
    // Pass 1: build letter counts for secret, mark greens
    for (var i = 0; i < 5; i++) {
      secretCounts[secretEnc[i]]++;
    }
    for (var i = 0; i < 5; i++) {
      if (guessEnc[i] === secretEnc[i]) {
        pattern[i] = 2;  // green
        secretCounts[guessEnc[i]]--;
      } else {
        pattern[i] = 0;  // tentatively absent
      }
    }

    // Pass 2: mark yellows for non-green positions
    for (var i = 0; i < 5; i++) {
      if (pattern[i] !== 2) {
        if (secretCounts[guessEnc[i]] > 0) {
          pattern[i] = 1;  // yellow
          secretCounts[guessEnc[i]]--;
        }
        // else remains 0 (absent)
      }
    }

    // Encode as base-3 integer
    var id = pattern[0] * POWERS_OF_3[0]
           + pattern[1] * POWERS_OF_3[1]
           + pattern[2] * POWERS_OF_3[2]
           + pattern[3] * POWERS_OF_3[3]
           + pattern[4] * POWERS_OF_3[4];

    // Reset secretCounts: only clear the indices used by this secret (hot-loop optimization)
    secretCounts[secretEnc[0]] = 0;
    secretCounts[secretEnc[1]] = 0;
    secretCounts[secretEnc[2]] = 0;
    secretCounts[secretEnc[3]] = 0;
    secretCounts[secretEnc[4]] = 0;

    return id;
  }

  // --- Core: Compute Shannon entropy for one guess against a remaining set ---
  function computeEntropy(guessIndex, remainingIndices) {
    var n = remainingIndices.length;
    if (n <= 1) { return 0; }

    var guessEnc = encodedWords[guessIndex];

    // Use pre-allocated buffers
    publicBuckets.fill(0);

    // Build partition buckets
    for (var s = 0; s < n; s++) {
      var secretIdx = remainingIndices[s];
      var patternId = computePatternId(guessEnc, encodedWords[secretIdx], publicSecretCounts, publicPattern);
      publicBuckets[patternId]++;
    }

    // Compute entropy: H = -Sum((c/n) * log2(c/n)) = Sum((c/n) * (log2(n) - log2(c)))
    var logN = log2(n);
    var entropy = 0;
    for (var b = 0; b < PATTERN_COUNT; b++) {
      var c = publicBuckets[b];
      if (c > 0) {
        entropy += (c / n) * (logN - log2(c));
      }
    }

    return entropy;
  }

  // --- Core: Rank all guesses in guessPool by entropy against remainingSet ---
  function rankGuesses(guessPool, remainingSet) {
    var n = remainingSet.length;
    if (n === 0) { return []; }

    var poolLen = guessPool.length;
    var results = new Array(poolLen);

    // Allocate working arrays ONCE outside the loop
    var buckets = new Uint16Array(PATTERN_COUNT);
    var secretCounts = new Uint8Array(26);
    var pattern = new Uint8Array(5);
    var logN = log2(n);

    for (var g = 0; g < poolLen; g++) {
      var guessIdx = guessPool[g];
      var guessEnc = encodedWords[guessIdx];

      // Reset buckets for this guess
      buckets.fill(0);

      // Build partition buckets
      for (var s = 0; s < n; s++) {
        var secretIdx = remainingSet[s];
        var patternId = computePatternId(guessEnc, encodedWords[secretIdx], secretCounts, pattern);
        buckets[patternId]++;
      }

      // Compute entropy from buckets
      var entropy = 0;
      if (n > 1) {
        for (var b = 0; b < PATTERN_COUNT; b++) {
          var c = buckets[b];
          if (c > 0) {
            entropy += (c / n) * (logN - log2(c));
          }
        }
      }

      results[g] = { wordIndex: guessIdx, entropy: entropy };
    }

    // Sort descending by entropy, tie-break by frequency score
    results.sort(function (a, b) {
      var diff = b.entropy - a.entropy;
      // If entropy is the same to 6 decimal places, use frequency tie-breaker
      if (Math.abs(diff) < 1e-6) {
        var scoreA = window.WordleBot.freq.scoreWord(dictionary[a.wordIndex], frequencyTables).composite;
        var scoreB = window.WordleBot.freq.scoreWord(dictionary[b.wordIndex], frequencyTables).composite;
        return scoreB - scoreA;
      }
      return diff;
    });

    // Map wordIndex to word string
    for (var r = 0; r < results.length; r++) {
      results[r].word = dictionary[results[r].wordIndex];
    }

    return results;
  }

  // --- Main API: Dual recommendation tracks ---
  function rankGuessesForState(remainingSet, guessesLeft) {
    if (guessesLeft === undefined || guessesLeft === null) {
      guessesLeft = 6;
    }

    var n = remainingSet.length;
    if (n === 0) {
      return { bestInfoGuesses: [], bestAnswerGuesses: [] };
    }

    // Determine urgency
    var urgency;
    if (guessesLeft >= 4) {
      urgency = URGENCY[4];
    } else if (guessesLeft <= 1) {
      urgency = URGENCY[1];
    } else {
      urgency = URGENCY[guessesLeft];
    }

    // --- bestInfoGuesses track ---
    var infoGuessPool;
    if (n <= ADAPTIVE_THRESHOLD) {
      // Remaining-only mode
      infoGuessPool = remainingSet;
    } else {
      // Full dictionary as guess pool
      var fullPool = new Array(dictionary.length);
      for (var i = 0; i < dictionary.length; i++) {
        fullPool[i] = i;
      }
      infoGuessPool = fullPool;
    }
    var bestInfoGuesses = rankGuesses(infoGuessPool, remainingSet);

    // --- bestAnswerGuesses track ---
    var bestAnswerGuesses;

    if (urgency === 1.0) {
      // guessesLeft == 1: pure commonness, skip entropy entirely
      bestAnswerGuesses = new Array(n);
      for (var i = 0; i < n; i++) {
        var idx = remainingSet[i];
        var cmn = (commonnessData && commonnessData.max > 0)
          ? commonnessData.scores[idx]
          : 0;
        bestAnswerGuesses[i] = {
          wordIndex: idx,
          word: dictionary[idx],
          entropy: 0,
          commonness: cmn,
          blendedScore: cmn
        };
      }
      // Sort descending by commonness (which equals blendedScore here)
      bestAnswerGuesses.sort(function (a, b) {
        return b.blendedScore - a.blendedScore;
      });
    } else if (urgency === 0.0) {
      // guessesLeft >= 4: pure entropy among remaining candidates (skip commonness blend)
      var answerRanked = rankGuesses(remainingSet, remainingSet);
      bestAnswerGuesses = new Array(answerRanked.length);
      for (var i = 0; i < answerRanked.length; i++) {
        var r = answerRanked[i];
        bestAnswerGuesses[i] = {
          wordIndex: r.wordIndex,
          word: r.word,
          entropy: r.entropy,
          commonness: (commonnessData && commonnessData.max > 0) ? commonnessData.scores[r.wordIndex] : 0,
          blendedScore: r.entropy  // pure entropy
        };
      }
    } else {
      // Mixed urgency: blend entropy + commonness
      var answerRanked = rankGuesses(remainingSet, remainingSet);

      // Find max entropy in this batch for normalization
      var maxEntropy = 0;
      for (var i = 0; i < answerRanked.length; i++) {
        if (answerRanked[i].entropy > maxEntropy) {
          maxEntropy = answerRanked[i].entropy;
        }
      }
      if (maxEntropy === 0) { maxEntropy = 1; }

      var maxCommon = (commonnessData && commonnessData.max > 0) ? commonnessData.max : 1;

      bestAnswerGuesses = new Array(answerRanked.length);
      for (var i = 0; i < answerRanked.length; i++) {
        var r = answerRanked[i];
        var normEntropy = r.entropy / maxEntropy;
        var cmn = commonnessData ? commonnessData.scores[r.wordIndex] : 0;
        var normCommon = cmn / maxCommon;
        var blended = (1 - urgency) * normEntropy + urgency * normCommon;

        bestAnswerGuesses[i] = {
          wordIndex: r.wordIndex,
          word: r.word,
          entropy: r.entropy,
          commonness: cmn,
          blendedScore: blended
        };
      }

      // Sort descending by blendedScore
      bestAnswerGuesses.sort(function (a, b) {
        return b.blendedScore - a.blendedScore;
      });
    }

    return {
      bestInfoGuesses: bestInfoGuesses,
      bestAnswerGuesses: bestAnswerGuesses
    };
  }

  // --- Init: Called once at load time (cache miss) ---
  // Async: offloads O(n²) entropy computation to a Web Worker so the main
  // thread stays fully responsive (spinner animates, page is interactive).
  async function init(dict, freqTables, cmnData) {
    var t0 = performance.now();

    dictionary = dict;
    frequencyTables = freqTables;
    commonnessData = cmnData;

    // Pre-encode every word as Uint8Array(5) with values 0-25
    var len = dictionary.length;
    encodedWords = new Array(len);

    // Also build a flat buffer for zero-copy transfer to the Worker
    var flatEncoded = new Uint8Array(len * 5);

    for (var w = 0; w < len; w++) {
      var word = dictionary[w];
      var enc = new Uint8Array(5);
      var off = w * 5;
      enc[0] = word.charCodeAt(0) - 97;
      enc[1] = word.charCodeAt(1) - 97;
      enc[2] = word.charCodeAt(2) - 97;
      enc[3] = word.charCodeAt(3) - 97;
      enc[4] = word.charCodeAt(4) - 97;
      encodedWords[w] = enc;
      flatEncoded[off]     = enc[0];
      flatEncoded[off + 1] = enc[1];
      flatEncoded[off + 2] = enc[2];
      flatEncoded[off + 3] = enc[3];
      flatEncoded[off + 4] = enc[4];
    }

    // Spawn Worker — computes entropy for every word against every word.
    // Content scripts share the page's origin, so we can't use chrome-extension:// URLs
    // directly. Fetch the script and create a same-origin Blob URL instead.
    var scriptUrl = chrome.runtime.getURL('src/entropyWorker.js');
    var resp = await fetch(scriptUrl);
    var scriptText = await resp.text();
    var blob = new Blob([scriptText], { type: 'application/javascript' });
    var blobUrl = URL.createObjectURL(blob);

    var entropies = await new Promise(function (resolve, reject) {
      var worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
      worker.onmessage = function (e) {
        resolve(e.data.entropies);
        worker.terminate();
      };
      worker.onerror = function (e) {
        reject(new Error('Entropy worker failed: ' + (e.message || 'unknown error')));
        worker.terminate();
      };
      // Transfer flatEncoded buffer (zero-copy, main thread releases it)
      worker.postMessage(
        { encodedWords: flatEncoded, wordCount: len },
        [flatEncoded.buffer]
      );
    });

    // Build result objects from raw entropies returned by the Worker
    var results = new Array(len);
    for (var i = 0; i < len; i++) {
      results[i] = { wordIndex: i, entropy: entropies[i] };
    }

    // Sort descending by entropy, tie-break by frequency score (main thread — fast)
    results.sort(function (a, b) {
      var diff = b.entropy - a.entropy;
      if (Math.abs(diff) < 1e-6) {
        var scoreA = window.WordleBot.freq.scoreWord(dictionary[a.wordIndex], frequencyTables).composite;
        var scoreB = window.WordleBot.freq.scoreWord(dictionary[b.wordIndex], frequencyTables).composite;
        return scoreB - scoreA;
      }
      return diff;
    });

    // Map wordIndex → word string
    for (var i = 0; i < len; i++) {
      results[i].word = dictionary[results[i].wordIndex];
    }

    // bestInfoGuesses: top results sorted by entropy
    var bestInfoGuesses = results.slice(0, FIRST_GUESS_CACHE_SIZE);

    // bestAnswerGuesses: same ranking with commonness data (urgency=0.0 → blendedScore = entropy)
    var answerCount = Math.min(len, FIRST_GUESS_CACHE_SIZE);
    var bestAnswerGuesses = new Array(answerCount);
    for (var i = 0; i < answerCount; i++) {
      var r = results[i];
      bestAnswerGuesses[i] = {
        wordIndex: r.wordIndex,
        word: r.word,
        entropy: r.entropy,
        commonness: (commonnessData && commonnessData.max > 0) ? commonnessData.scores[r.wordIndex] : 0,
        blendedScore: r.entropy
      };
    }

    firstGuessCache = {
      bestInfoGuesses: bestInfoGuesses,
      bestAnswerGuesses: bestAnswerGuesses
    };

    var t1 = performance.now();
    var elapsed = (t1 - t0).toFixed(0);
    var topWord = firstGuessCache.bestInfoGuesses.length > 0
      ? firstGuessCache.bestInfoGuesses[0].word
      : '(none)';
    var topEntropy = firstGuessCache.bestInfoGuesses.length > 0
      ? firstGuessCache.bestInfoGuesses[0].entropy.toFixed(2)
      : '0';

    console.log('[WordleBot] Entropy engine initialized in ' + elapsed + 'ms via Worker (top info guess: ' + topWord + ' at ' + topEntropy + ' bits)');
  }

  // --- Get cached first-guess rankings ---
  function getFirstGuessCache() {
    if (!firstGuessCache) {
      return { bestInfoGuesses: [], bestAnswerGuesses: [] };
    }
    return firstGuessCache;
  }

  // --- Serialize cache for chrome.storage.local ---
  function serializeCache() {
    if (!encodedWords || !firstGuessCache) {
      return null;
    }

    // Convert Uint8Array(5) to plain arrays for JSON safety
    var plainEncoded = new Array(encodedWords.length);
    for (var i = 0; i < encodedWords.length; i++) {
      var enc = encodedWords[i];
      plainEncoded[i] = [enc[0], enc[1], enc[2], enc[3], enc[4]];
    }

    return {
      firstGuessCache: firstGuessCache,
      encodedWords: plainEncoded
    };
  }

  // --- Restore from cached state (skip expensive first-guess computation) ---
  function restoreCache(cacheObj, dict, freqTables, cmnData) {
    dictionary = dict;
    frequencyTables = freqTables;
    commonnessData = cmnData;

    // Reconstruct encodedWords from plain arrays back to Uint8Array(5)
    var plainEncoded = cacheObj.encodedWords;
    var len = plainEncoded.length;
    encodedWords = new Array(len);
    for (var i = 0; i < len; i++) {
      var arr = plainEncoded[i];
      var enc = new Uint8Array(5);
      enc[0] = arr[0];
      enc[1] = arr[1];
      enc[2] = arr[2];
      enc[3] = arr[3];
      enc[4] = arr[4];
      encodedWords[i] = enc;
    }

    // Restore first-guess cache
    firstGuessCache = cacheObj.firstGuessCache;

    console.log('[WordleBot] Entropy engine restored from cache');
  }

  // --- Clear all in-memory caches ---
  function clearCache() {
    encodedWords = null;
    dictionary = null;
    firstGuessCache = null;
    frequencyTables = null;
    commonnessData = null;
    console.log('[WordleBot] Entropy engine caches cleared');
  }

  // --- Export to shared namespace ---
  window.WordleBot.entropy = {
    init: init,
    rankGuesses: rankGuesses,
    rankGuessesForState: rankGuessesForState,
    computeEntropy: computeEntropy,
    getFirstGuessCache: getFirstGuessCache,
    serializeCache: serializeCache,
    restoreCache: restoreCache,
    clearCache: clearCache,
    ADAPTIVE_THRESHOLD: ADAPTIVE_THRESHOLD,
    URGENCY: URGENCY
  };

})();
