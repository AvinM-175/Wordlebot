window.WordleBot = window.WordleBot || {};

(function () {
  'use strict';

  // --- Constants ---
  var EXPLORATION_THRESHOLD = 20;  // matches entropyEngine.ADAPTIVE_THRESHOLD
  var LATE_GAME_THRESHOLD = 5;
  var NEAR_TIE_PCT = 2;
  var TIGHT_CLUSTER_PCT = 3;
  var MAX_SUGGESTIONS = 5;

  // --- Helper 1: detectMode ---
  // Returns one of 5 mode strings. Check order matters.
  function detectMode(constraintResult, boardState) {
    // Error: warning present OR zero candidates
    if (constraintResult.warning || constraintResult.candidates.length === 0) {
      return 'error';
    }

    // Solved: game won
    if (boardState.status === 'won') {
      return 'solved';
    }

    // Lost: all guesses used without solving
    if (boardState.status === 'lost') {
      return 'lost';
    }

    // Opener: no guesses yet (unconstrained)
    if (constraintResult.unconstrained || boardState.guesses.length === 0) {
      return 'opener';
    }

    // Late game: 5 or fewer candidates
    if (constraintResult.candidates.length <= LATE_GAME_THRESHOLD) {
      return 'late_game';
    }

    // Default: mid game
    return 'mid_game';
  }

  // --- Helper 2: normalizeConfidence ---
  // Mutates suggestions array in-place. Top suggestion is always 100%.
  function normalizeConfidence(suggestions) {
    if (suggestions.length === 0) { return; }

    var topBlendedScore = suggestions[0].scores.blendedScore;

    // Guard: division by zero
    if (topBlendedScore === 0) {
      for (var i = 0; i < suggestions.length; i++) {
        suggestions[i].confidence = 100;
      }
      return;
    }

    for (var i = 0; i < suggestions.length; i++) {
      suggestions[i].confidence = Math.round(
        (suggestions[i].scores.blendedScore / topBlendedScore) * 100
      );
    }
  }

  // --- Helper 3: detectNearTie ---
  // Returns null or a string note. Also sets isNearTie on each suggestion.
  function detectNearTie(suggestions) {
    if (suggestions.length < 2) { return null; }

    var topConf = suggestions[0].confidence;
    var nearTieCount = 0;

    for (var i = 0; i < suggestions.length; i++) {
      if (topConf - suggestions[i].confidence <= NEAR_TIE_PCT) {
        suggestions[i].isNearTie = true;
        nearTieCount++;
      }
    }

    // Tight cluster check: spread between first and last < 3%
    var lastConf = suggestions[suggestions.length - 1].confidence;
    if (topConf - lastConf < TIGHT_CLUSTER_PCT) {
      return 'Top ' + suggestions.length + ' are nearly equivalent.';
    }

    if (nearTieCount > 1) {
      return 'Top ' + nearTieCount + ' are nearly equivalent \u2014 choice among them is effectively luck.';
    }

    return null;
  }

  // --- Helper 4: generateWhyLine ---
  // Returns a plain-language string. Adapts by mode and candidate count.
  function generateWhyLine(suggestion, candidateCount, mode) {
    // Special case: only 1 candidate
    if (candidateCount === 1) {
      return 'Only answer: ' + suggestion.word.toUpperCase();
    }

    var entropy = suggestion.scores.entropy;
    var avgRemaining = Math.max(1, Math.round(candidateCount / Math.pow(2, entropy)));

    if (mode === 'opener' || candidateCount > EXPLORATION_THRESHOLD) {
      // Exploration mode: emphasize information gain
      if (avgRemaining >= candidateCount) {
        // Entropy near 0 -- guess does not narrow the field
        return 'Tests useful letter combinations';
      }
      return 'Narrows it down to ~' + avgRemaining + ' possibilities on average';
    }

    if (candidateCount <= LATE_GAME_THRESHOLD) {
      // Late game: emphasize certainty
      if (suggestion.isPrimaryPick) {
        return 'Most likely answer';
      }
      return '1 of ' + candidateCount + ' remaining candidates';
    }

    // Answer mode (6-20 candidates)
    return 'Could be the answer \u2014 common word with strong letter matches';
  }

  // --- Helper 5: generateDetails ---
  // Returns array of 3 strings: entropy/partition, letter frequency, positional frequency.
  function generateDetails(word, entropy, candidateCount, freqTables) {
    var details = [];

    // Bullet 1: Entropy/partition info
    if (candidateCount <= 1 || entropy === 0) {
      details.push('Single remaining candidate');
    } else {
      var groups = Math.round(Math.pow(2, entropy));
      details.push(
        'Expected to split ' + candidateCount + ' candidates into ~' + groups +
        ' groups (' + entropy.toFixed(1) + ' bits of information)'
      );
    }

    // Bullet 2: Letter frequency highlights (unique letters only)
    var letterFreqs = [];
    var wc = freqTables.wordCount;
    var seen = {};
    for (var i = 0; i < 5; i++) {
      var ch = word.charAt(i);
      if (!seen[ch]) {
        seen[ch] = true;
        var code = ch.charCodeAt(0) - 97;
        var pct = Math.round((freqTables.overall[code] / wc) * 100);
        letterFreqs.push(ch.toUpperCase() + ' (' + pct + '%)');
      }
    }
    details.push('Tests high-frequency letters: ' + letterFreqs.join(', '));

    // Bullet 3: Positional frequency -- find strongest letter+position combo in the word
    var bestLetter = word.charAt(0);
    var bestPos = 0;
    var bestPct = 0;
    for (var j = 0; j < 5; j++) {
      var c = word.charAt(j);
      var cd = c.charCodeAt(0) - 97;
      var p = Math.round((freqTables.positional[cd][j] / wc) * 100);
      if (p > bestPct) {
        bestPct = p;
        bestLetter = c;
        bestPos = j;
      }
    }
    details.push(
      'Strong positional match: ' + bestLetter.toUpperCase() + ' in position ' +
      (bestPos + 1) + ' appears in ' + bestPct + '% of words'
    );

    return details;
  }

  // --- Helper 6: buildGameContext ---
  // Returns { guesses: [...] } with per-guess narrative using delta data.
  function buildGameContext(boardState, constraintResult, dictionary) {
    if (!boardState.guesses || boardState.guesses.length === 0) {
      return { guesses: [] };
    }

    var guesses = [];
    var previousRemaining = dictionary.length;

    for (var g = 0; g < boardState.guesses.length; g++) {
      var pg = constraintResult.constraints.perGuess[g];
      var added = pg.added;

      // Build "revealed" string from delta data
      var parts = [];
      if (added.grays.length > 0) {
        parts.push('Eliminated ' + added.grays.map(function (l) {
          return l.toUpperCase();
        }).join(', '));
      }
      if (added.greens.length > 0) {
        parts.push('confirmed ' + added.greens.map(function (gr) {
          var letter = gr.split('@')[0].toUpperCase();
          var pos = parseInt(gr.split('@')[1], 10) + 1;
          return letter + ' at position ' + pos;
        }).join(', '));
      }
      if (added.yellows.length > 0) {
        parts.push(added.yellows.map(function (y) {
          return y.split('@')[0].toUpperCase();
        }).join(', ') + ' present');
      }

      var revealed = parts.join('; ');

      // Compute eliminated count via incremental re-filtering
      var partialBoardState = {
        guesses: boardState.guesses.slice(0, g + 1),
        totalRows: boardState.totalRows,
        status: boardState.status
      };
      var partialResult = window.WordleBot.constraints.filterCandidates(
        dictionary, partialBoardState
      );
      var currentRemaining = partialResult.candidates.length;
      var eliminated = previousRemaining - currentRemaining;

      guesses.push({
        word: pg.word,
        eliminated: eliminated,
        revealed: revealed
      });

      previousRemaining = currentRemaining;
    }

    return { guesses: guesses };
  }

  // --- Helper 7: classifyCandidates ---
  // Mutates suggestions in-place for late_game mode.
  function classifyCandidates(suggestions, commonnessData, guessesLeft) {
    if (suggestions.length === 0) { return; }

    // Compute commonness score for each suggestion using internal _wordIndex
    var scores = [];
    for (var i = 0; i < suggestions.length; i++) {
      scores.push(suggestions[i]._wordIndex !== undefined ? commonnessData.scores[suggestions[i]._wordIndex] : 0);
    }

    // Sort scores to find median
    var sortedScores = scores.slice(0).sort(function (a, b) { return a - b; });
    var medianIdx = Math.floor(sortedScores.length / 2);
    var medianScore = sortedScores[medianIdx];

    // Classify each suggestion
    for (var j = 0; j < suggestions.length; j++) {
      var score = scores[j];
      suggestions[j].classification = score >= medianScore ? 'likely_answer' : 'rare_valid';
    }

    // When guessesLeft <= 2, re-sort so likely_answer comes first regardless of blendedScore rank
    if (guessesLeft <= 2) {
      suggestions.sort(function (a, b) {
        // Primary sort: likely_answer before rare_valid
        if (a.classification !== b.classification) {
          return a.classification === 'likely_answer' ? -1 : 1;
        }
        // Secondary sort: by blendedScore within group
        return b.scores.blendedScore - a.scores.blendedScore;
      });
    } else {
      // Normal late-game: sort by classification first, then blendedScore
      suggestions.sort(function (a, b) {
        if (a.classification !== b.classification) {
          return a.classification === 'likely_answer' ? -1 : 1;
        }
        return b.scores.blendedScore - a.scores.blendedScore;
      });
    }

    // Mark top likely_answer as isPrimaryPick, all others false
    var foundPrimary = false;
    for (var k = 0; k < suggestions.length; k++) {
      if (!foundPrimary && suggestions[k].classification === 'likely_answer') {
        suggestions[k].isPrimaryPick = true;
        foundPrimary = true;
      } else {
        suggestions[k].isPrimaryPick = false;
      }
    }
  }

  // --- Helper 8: buildSolvedSummary ---
  // Returns a narrowing journey string.
  function buildSolvedSummary(boardState, constraintResult, dictionary) {
    var numGuesses = boardState.guesses.length;
    var totalWords = dictionary.length;

    var parts = [];
    parts.push('Started with ' + totalWords + ' candidates.');

    // Compute intermediate candidate counts via incremental re-filtering
    var previousRemaining = totalWords;
    for (var g = 0; g < numGuesses; g++) {
      var partialBoardState = {
        guesses: boardState.guesses.slice(0, g + 1),
        totalRows: boardState.totalRows,
        status: boardState.status
      };
      var partialResult = window.WordleBot.constraints.filterCandidates(
        dictionary, partialBoardState
      );
      var currentRemaining = partialResult.candidates.length;
      var word = boardState.guesses[g].word;

      if (g === numGuesses - 1) {
        // Final guess solved it
        parts.push('Guess ' + (g + 1) + ' (' + word + ') solved it!');
      } else {
        parts.push('Guess ' + (g + 1) + ' (' + word + ') narrowed to ' + currentRemaining + '.');
      }

      previousRemaining = currentRemaining;
    }

    return parts.join(' ');
  }

  // --- Helper 9: getHeader ---
  // Returns the header string for the given mode.
  function getHeader(mode, boardState) {
    if (mode === 'opener') { return 'Best openers'; }
    if (mode === 'mid_game') { return 'Suggestions'; }
    if (mode === 'late_game') { return 'Remaining candidates'; }
    if (mode === 'solved') {
      var n = boardState.guesses.length;
      return 'Solved in ' + n + (n === 1 ? ' guess!' : ' guesses!');
    }
    if (mode === 'lost') { return 'Game over'; }
    if (mode === 'error') { return 'Error'; }
    return 'Suggestions';
  }

  // --- Main: buildSuggestions ---
  // Pure stateless transform. No module-level mutable state, no DOM access, no caching.
  function buildSuggestions(constraintResult, rankings, boardState, dictionary, freqTables, commonnessData) {
    // 1. Detect mode
    var mode = detectMode(constraintResult, boardState);
    var guessesLeft = boardState.totalRows - boardState.guesses.length;

    // 2. Error mode: return immediately
    if (mode === 'error') {
      return {
        mode: 'error',
        header: 'Error',
        candidateCount: 0,
        gameContext: { guesses: [] },
        suggestions: [],
        nearTieNote: null,
        solvedSummary: null
      };
    }

    // 3a. Lost mode: return with game context and remaining candidates
    if (mode === 'lost') {
      var lostCandidateCount = constraintResult.candidates.length;
      var lostSummary = buildSolvedSummary(boardState, constraintResult, dictionary);
      if (lostCandidateCount > 0) {
        lostSummary += ' ' + lostCandidateCount + (lostCandidateCount === 1 ? ' word' : ' words') + ' remained.';
      }
      return {
        mode: 'lost',
        header: getHeader('lost', boardState),
        candidateCount: lostCandidateCount,
        gameContext: buildGameContext(boardState, constraintResult, dictionary),
        suggestions: [],
        nearTieNote: null,
        solvedSummary: lostSummary
      };
    }

    // 3b. Solved mode: return with summary and game context
    if (mode === 'solved') {
      return {
        mode: 'solved',
        header: getHeader('solved', boardState),
        candidateCount: 0,
        gameContext: buildGameContext(boardState, constraintResult, dictionary),
        suggestions: [],
        nearTieNote: null,
        solvedSummary: buildSolvedSummary(boardState, constraintResult, dictionary)
      };
    }

    // 4. Build game context (narrative)
    var gameContext = buildGameContext(boardState, constraintResult, dictionary);

    // 5. Build suggestion list from rankings.bestAnswerGuesses
    var candidateCount = constraintResult.candidates.length;
    var sourceRankings = rankings.bestAnswerGuesses;
    var maxSuggestions = (mode === 'late_game') ? candidateCount : MAX_SUGGESTIONS;

    // Opener near-tie random sampling: when >MAX_SUGGESTIONS words are within
    // the near-tie threshold, randomly select MAX_SUGGESTIONS from the cluster.
    var selectedRankings;
    var openerClusterSize = 0;

    if (mode === 'opener' && sourceRankings.length > MAX_SUGGESTIONS) {
      var topScore = sourceRankings[0].blendedScore;
      var threshold = topScore > 0 ? topScore * (1 - NEAR_TIE_PCT / 100) : 0;
      var clusterSize = 0;
      for (var c = 0; c < sourceRankings.length; c++) {
        if (sourceRankings[c].blendedScore >= threshold) {
          clusterSize++;
        } else {
          break; // sorted descending
        }
      }

      if (clusterSize > MAX_SUGGESTIONS) {
        // Fisher-Yates shuffle on cluster indices, take first MAX_SUGGESTIONS
        openerClusterSize = clusterSize;
        var clusterIndices = new Array(clusterSize);
        for (var ci = 0; ci < clusterSize; ci++) {
          clusterIndices[ci] = ci;
        }
        for (var fi = clusterSize - 1; fi > 0; fi--) {
          var fj = Math.floor(Math.random() * (fi + 1));
          var tmp = clusterIndices[fi];
          clusterIndices[fi] = clusterIndices[fj];
          clusterIndices[fj] = tmp;
        }
        var sampled = clusterIndices.slice(0, MAX_SUGGESTIONS);
        sampled.sort(function (a, b) { return a - b; }); // preserve rank order

        selectedRankings = new Array(MAX_SUGGESTIONS);
        for (var si = 0; si < MAX_SUGGESTIONS; si++) {
          selectedRankings[si] = sourceRankings[sampled[si]];
        }
      } else {
        selectedRankings = sourceRankings.slice(0, Math.min(maxSuggestions, sourceRankings.length));
      }
    } else {
      selectedRankings = sourceRankings.slice(0, Math.min(maxSuggestions, sourceRankings.length));
    }

    var topCount = selectedRankings.length;
    var suggestions = [];

    for (var i = 0; i < topCount; i++) {
      var r = selectedRankings[i];
      var freqScore = window.WordleBot.freq.scoreWord(dictionary[r.wordIndex], freqTables);

      suggestions.push({
        word: r.word,
        confidence: 0,
        isNearTie: false,
        classification: null,
        isPrimaryPick: (i === 0),
        whyLine: '',
        details: [],
        scores: {
          entropy: r.entropy,
          blendedScore: r.blendedScore,
          frequency: freqScore
        },
        _wordIndex: r.wordIndex  // internal: used by classifyCandidates, stripped before return
      });
    }

    // 6. Normalize confidence
    normalizeConfidence(suggestions);

    // 7. Late game classification (may re-sort and reassign isPrimaryPick)
    if (mode === 'late_game') {
      classifyCandidates(suggestions, commonnessData, guessesLeft);
      // Re-normalize confidence after re-sort
      normalizeConfidence(suggestions);
    }

    // 8. Generate Why lines and detail bullets
    for (var j = 0; j < suggestions.length; j++) {
      suggestions[j].whyLine = generateWhyLine(suggestions[j], candidateCount, mode);
      suggestions[j].details = generateDetails(
        suggestions[j].word,
        suggestions[j].scores.entropy,
        candidateCount,
        freqTables
      );
    }

    // 9. Detect near-ties (opener mode only per Phase 12)
    var nearTieNote = null;
    if (mode === 'opener') {
      if (openerClusterSize > MAX_SUGGESTIONS) {
        // Random sampling was triggered — always show disclaimer
        nearTieNote = 'These openers are statistically very close in expected value \u2014 showing 5 of ' + openerClusterSize + ' near-tied words.';
      } else {
        nearTieNote = detectNearTie(suggestions);
      }
    }

    // 10. Strip internal _wordIndex property before returning
    for (var k = 0; k < suggestions.length; k++) {
      delete suggestions[k]._wordIndex;
    }

    // 11. Assemble and return
    return {
      mode: mode,
      header: getHeader(mode, boardState),
      candidateCount: candidateCount,
      gameContext: gameContext,
      suggestions: suggestions,
      nearTieNote: nearTieNote,
      solvedSummary: null
    };
  }

  // --- Export to shared namespace ---
  window.WordleBot.suggestions = {
    buildSuggestions: buildSuggestions
  };

})();
