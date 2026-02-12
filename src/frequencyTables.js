window.WordleBot = window.WordleBot || {};

(function () {
  'use strict';

  // --- Private module state ---
  var positionalFreq = null;  // Array(26) of Array(5)
  var overallFreq = null;     // Uint16Array(26)
  var bigramFreq = null;      // Object keyed by 2-char string
  var wordCount = 0;

  // --- Core: Build frequency tables from dictionary ---
  function buildTables(dictionary) {
    wordCount = dictionary.length;

    // Initialize positional frequency: 26 letters x 5 positions
    positionalFreq = new Array(26);
    for (var li = 0; li < 26; li++) {
      positionalFreq[li] = new Array(5);
      for (var pi = 0; pi < 5; pi++) {
        positionalFreq[li][pi] = 0;
      }
    }

    // Initialize overall frequency
    overallFreq = new Uint16Array(26);

    // Initialize bigram frequency
    bigramFreq = {};

    // Single pass through dictionary
    for (var w = 0; w < dictionary.length; w++) {
      var word = dictionary[w];

      // Per-word seen tracker for overall frequency (unique per letter per word)
      var seen = new Array(26);
      for (var s = 0; s < 26; s++) {
        seen[s] = false;
      }

      for (var i = 0; i < 5; i++) {
        var code = word.charCodeAt(i) - 97;

        // Positional frequency
        positionalFreq[code][i]++;

        // Overall frequency (count each letter at most once per word)
        if (!seen[code]) {
          seen[code] = true;
          overallFreq[code]++;
        }

        // Bigram frequency (4 adjacent pairs per word)
        if (i < 4) {
          var pair = word.charAt(i) + word.charAt(i + 1);
          if (bigramFreq[pair] === undefined) {
            bigramFreq[pair] = 1;
          } else {
            bigramFreq[pair]++;
          }
        }
      }
    }

    // Expose tables object on namespace
    ns.tables = {
      positional: positionalFreq,
      overall: overallFreq,
      bigram: bigramFreq,
      wordCount: wordCount
    };

    return ns.tables;
  }

  // --- Restore tables from cached/serialized object ---
  function restoreTables(tablesObj) {
    positionalFreq = tablesObj.positional;
    bigramFreq = tablesObj.bigram;
    wordCount = tablesObj.wordCount;

    // Convert overall back to Uint16Array if it was serialized as plain array
    if (tablesObj.overall instanceof Uint16Array) {
      overallFreq = tablesObj.overall;
    } else {
      overallFreq = new Uint16Array(tablesObj.overall);
    }

    // Expose tables object on namespace
    ns.tables = {
      positional: positionalFreq,
      overall: overallFreq,
      bigram: bigramFreq,
      wordCount: wordCount
    };

    return ns.tables;
  }

  // --- Serialization helper for caching (JSON-safe) ---
  function serializeTables() {
    if (!positionalFreq) {
      return null;
    }

    // Convert Uint16Array to plain array for JSON serialization
    var overallArr = new Array(26);
    for (var i = 0; i < 26; i++) {
      overallArr[i] = overallFreq[i];
    }

    return {
      positional: positionalFreq,
      overall: overallArr,
      bigram: bigramFreq,
      wordCount: wordCount
    };
  }

  // --- Lookup helpers ---
  function getPositionalFreq(letter, position) {
    if (!positionalFreq) { return 0; }
    if (typeof letter !== 'string' || letter.length !== 1) { return 0; }
    if (position < 0 || position > 4) { return 0; }
    var code = letter.charCodeAt(0) - 97;
    if (code < 0 || code > 25) { return 0; }
    return positionalFreq[code][position];
  }

  function getOverallFreq(letter) {
    if (!overallFreq) { return 0; }
    if (typeof letter !== 'string' || letter.length !== 1) { return 0; }
    var code = letter.charCodeAt(0) - 97;
    if (code < 0 || code > 25) { return 0; }
    return overallFreq[code];
  }

  function getBigramFreq(bigram) {
    if (!bigramFreq) { return 0; }
    if (typeof bigram !== 'string' || bigram.length !== 2) { return 0; }
    return bigramFreq[bigram] || 0;
  }

  // --- Clear all in-memory tables ---
  function clearTables() {
    positionalFreq = null;
    overallFreq = null;
    bigramFreq = null;
    wordCount = 0;
    ns.tables = null;
    ns.commonness = null;
    console.log('[WordleBot] Frequency tables cleared');
  }

  // --- Export to shared namespace ---
  var ns = window.WordleBot.freq = window.WordleBot.freq || {};
  ns.buildTables = buildTables;
  ns.restoreTables = restoreTables;
  ns.serializeTables = serializeTables;
  ns.getPositionalFreq = getPositionalFreq;
  ns.getOverallFreq = getOverallFreq;
  ns.getBigramFreq = getBigramFreq;
  ns.clearTables = clearTables;
  ns.tables = null;  // populated after buildTables() or restoreTables() called

})();
