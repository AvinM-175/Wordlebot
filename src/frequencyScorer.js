window.WordleBot = window.WordleBot || {};
window.WordleBot.freq = window.WordleBot.freq || {};

(function () {
  'use strict';

  // --- Tunable weight constants (SCR-03) ---
  // These are the ONLY place scoring weights are defined.
  var WEIGHT_POSITIONAL = 0.60;
  var WEIGHT_OVERALL    = 0.30;
  var WEIGHT_BIGRAM     = 0.10;

  var ns = window.WordleBot.freq;

  // --- Score a single word ---
  function scoreWord(word, tables) {
    var wc = tables.wordCount;

    // Positional score: average of (positionalFreq / wordCount) across 5 positions
    var positionalSum = 0;
    for (var i = 0; i < 5; i++) {
      var code = word.charCodeAt(i) - 97;
      positionalSum += tables.positional[code][i] / wc;
    }
    var positional = positionalSum / 5;

    // Overall score: sum of (overallFreq / wordCount) for each UNIQUE letter, divided by 5
    var overallSum = 0;
    var seen = new Array(26);
    for (var s = 0; s < 26; s++) {
      seen[s] = false;
    }
    for (var j = 0; j < 5; j++) {
      var oCode = word.charCodeAt(j) - 97;
      if (!seen[oCode]) {
        seen[oCode] = true;
        overallSum += tables.overall[oCode] / wc;
      }
    }
    var overall = overallSum / 5;

    // Bigram score: average of (bigramFreq / wordCount) across 4 adjacent pairs
    var bigramSum = 0;
    for (var k = 0; k < 4; k++) {
      var pair = word.charAt(k) + word.charAt(k + 1);
      bigramSum += (tables.bigram[pair] || 0) / wc;
    }
    var bigram = bigramSum / 4;

    // Composite: weighted sum
    var composite = WEIGHT_POSITIONAL * positional + WEIGHT_OVERALL * overall + WEIGHT_BIGRAM * bigram;

    return {
      composite: composite,
      positional: positional,
      overall: overall,
      bigram: bigram
    };
  }

  // --- Score all words and return sorted array ---
  function scoreWords(dictionary, tables) {
    var results = new Array(dictionary.length);
    for (var i = 0; i < dictionary.length; i++) {
      var score = scoreWord(dictionary[i], tables);
      results[i] = {
        word: dictionary[i],
        composite: score.composite,
        positional: score.positional,
        overall: score.overall,
        bigram: score.bigram
      };
    }

    // Sort descending by composite score
    results.sort(function (a, b) {
      return b.composite - a.composite;
    });

    return results;
  }

  // --- Pre-compute commonness scores for all words ---
  function computeCommonness(dictionary, tables) {
    var scores = new Array(dictionary.length);
    var max = 0;

    for (var i = 0; i < dictionary.length; i++) {
      var score = scoreWord(dictionary[i], tables).composite;
      scores[i] = score;
      if (score > max) {
        max = score;
      }
    }

    var result = { scores: scores, max: max };

    // Expose on namespace for direct access by entropy engine
    ns.commonness = result;

    return result;
  }

  // --- Export to shared namespace ---
  ns.scoreWord = scoreWord;
  ns.scoreWords = scoreWords;
  ns.computeCommonness = computeCommonness;
  ns.commonness = null;  // populated after computeCommonness() called
  ns.WEIGHTS = {
    positional: WEIGHT_POSITIONAL,
    overall: WEIGHT_OVERALL,
    bigram: WEIGHT_BIGRAM
  };

})();
