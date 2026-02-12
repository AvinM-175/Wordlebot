window.WordleBot = window.WordleBot || {};

(function () {
  'use strict';

  // --- Private constants ---
  var STATUS_CHARS = { correct: 'c', present: 'p', absent: 'a' };
  var VALID_STATUSES = ['correct', 'present', 'absent'];

  // --- Private memoization cache ---
  var cache = {};

  // --- Input validation ---
  // Returns null if valid, or a warning string if invalid.
  function validateBoardState(boardState) {
    if (!boardState || !Array.isArray(boardState.guesses)) {
      return 'Invalid board state: missing guesses array';
    }
    for (var g = 0; g < boardState.guesses.length; g++) {
      var guess = boardState.guesses[g];
      if (!guess.tiles || guess.tiles.length !== 5) {
        return 'Invalid guess at index ' + g + ': expected 5 tiles';
      }
      for (var t = 0; t < 5; t++) {
        var tile = guess.tiles[t];
        if (!tile.letter || tile.letter.length !== 1) {
          return 'Invalid tile letter at guess ' + g + ', tile ' + t;
        }
        if (tile.status !== 'correct' && tile.status !== 'present' && tile.status !== 'absent') {
          return 'Invalid tile status at guess ' + g + ', tile ' + t + ': ' + tile.status;
        }
      }
    }
    return null;
  }

  // --- Compact cache key ---
  // Format: WORD:cgapa|WORD:aacca (letters + single-char status codes, pipe-delimited)
  function buildCacheKey(boardState) {
    if (!boardState.guesses || boardState.guesses.length === 0) {
      return '';
    }
    var parts = new Array(boardState.guesses.length);
    for (var g = 0; g < boardState.guesses.length; g++) {
      var guess = boardState.guesses[g];
      var codes = '';
      for (var t = 0; t < guess.tiles.length; t++) {
        codes += STATUS_CHARS[guess.tiles[t].status];
      }
      parts[g] = guess.word + ':' + codes;
    }
    return parts.join('|');
  }

  // --- Per-guess constraint derivation (two-pass count-first-then-derive) ---
  // CRITICAL: Collect ALL feedback for each letter in the guess FIRST, THEN derive constraints.
  function deriveGuessConstraints(guess) {
    // Step 1: Collect counts per letter
    var letterInfo = {};

    for (var t = 0; t < guess.tiles.length; t++) {
      var tile = guess.tiles[t];
      var letter = tile.letter.toLowerCase();

      if (!letterInfo[letter]) {
        letterInfo[letter] = {
          greenCount: 0, yellowCount: 0, grayCount: 0,
          greenPositions: [], yellowPositions: []
        };
      }

      if (tile.status === 'correct') {
        letterInfo[letter].greenCount++;
        letterInfo[letter].greenPositions.push(t);
      } else if (tile.status === 'present') {
        letterInfo[letter].yellowCount++;
        letterInfo[letter].yellowPositions.push(t);
      } else {
        letterInfo[letter].grayCount++;
      }
    }

    // Step 2: Derive constraints from collected counts
    var constraints = {};
    for (var ltr in letterInfo) {
      var info = letterInfo[ltr];
      var minCount = info.greenCount + info.yellowCount;
      var maxCount = info.grayCount > 0 ? minCount : null;

      constraints[ltr] = {
        greenPositions: info.greenPositions,
        yellowPositions: info.yellowPositions,
        minCount: minCount,
        maxCount: maxCount
      };
    }

    return constraints;
  }

  // --- Merge one guess's constraints into the unified set ---
  function mergeConstraints(unified, guessConstraints) {
    for (var letter in guessConstraints) {
      var gc = guessConstraints[letter];

      if (!unified[letter]) {
        unified[letter] = {
          greenPositions: [],
          yellowPositions: [],
          minCount: 0,
          maxCount: null
        };
      }

      var u = unified[letter];

      // Union green positions
      for (var g = 0; g < gc.greenPositions.length; g++) {
        if (u.greenPositions.indexOf(gc.greenPositions[g]) === -1) {
          u.greenPositions.push(gc.greenPositions[g]);
        }
      }

      // Union yellow positions
      for (var y = 0; y < gc.yellowPositions.length; y++) {
        if (u.yellowPositions.indexOf(gc.yellowPositions[y]) === -1) {
          u.yellowPositions.push(gc.yellowPositions[y]);
        }
      }

      // Tighten minCount (take maximum)
      if (gc.minCount > u.minCount) {
        u.minCount = gc.minCount;
      }

      // Tighten maxCount (take minimum, treating null as infinity)
      if (gc.maxCount !== null) {
        if (u.maxCount === null || gc.maxCount < u.maxCount) {
          u.maxCount = gc.maxCount;
        }
      }
    }
  }

  // --- Build per-position constraint array from per-letter data ---
  function buildPerPosition(perLetter) {
    var perPosition = new Array(5);
    for (var p = 0; p < 5; p++) {
      perPosition[p] = { requiredLetter: null, excludedLetters: [] };
    }

    for (var letter in perLetter) {
      var constraint = perLetter[letter];

      // Green positions become required letters
      for (var g = 0; g < constraint.greenPositions.length; g++) {
        perPosition[constraint.greenPositions[g]].requiredLetter = letter;
      }

      // Yellow positions become excluded letters at those positions
      // (but skip if this position already requires this letter via green -- green overrides yellow)
      for (var y = 0; y < constraint.yellowPositions.length; y++) {
        var yPos = constraint.yellowPositions[y];
        if (perPosition[yPos].requiredLetter !== letter) {
          perPosition[yPos].excludedLetters.push(letter);
        }
      }

      // If maxCount === 0 (letter absent entirely), exclude from ALL non-green positions
      if (constraint.maxCount === 0) {
        for (var p = 0; p < 5; p++) {
          if (perPosition[p].requiredLetter !== letter &&
              perPosition[p].excludedLetters.indexOf(letter) === -1) {
            perPosition[p].excludedLetters.push(letter);
          }
        }
      }
    }

    return perPosition;
  }

  // --- Build per-guess breakdown showing DELTAS only ---
  function buildPerGuess(boardState, allGuessConstraints, unifiedSnapshots) {
    var perGuess = new Array(boardState.guesses.length);

    for (var g = 0; g < boardState.guesses.length; g++) {
      var gc = allGuessConstraints[g];
      var snapshot = unifiedSnapshots[g];
      var added = { greens: [], yellows: [], grays: [] };

      for (var letter in gc) {
        var gci = gc[letter];
        var snap = snapshot[letter];

        // New greens: positions in gc.greenPositions not in snapshot
        for (var gi = 0; gi < gci.greenPositions.length; gi++) {
          var pos = gci.greenPositions[gi];
          if (!snap || snap.greenPositions.indexOf(pos) === -1) {
            added.greens.push(letter + '@' + pos);
          }
        }

        // New yellows: positions in gc.yellowPositions not in snapshot
        for (var yi = 0; yi < gci.yellowPositions.length; yi++) {
          var pos = gci.yellowPositions[yi];
          if (!snap || snap.yellowPositions.indexOf(pos) === -1) {
            added.yellows.push(letter + '@' + pos);
          }
        }

        // New grays: letters where maxCount became 0 and minCount is 0
        if (gci.maxCount === 0 && gci.minCount === 0) {
          // Check if this letter was already known absent in snapshot
          if (!snap || snap.maxCount !== 0) {
            added.grays.push(letter);
          }
        }
      }

      perGuess[g] = {
        word: boardState.guesses[g].word,
        added: added
      };
    }

    return perGuess;
  }

  // --- Deep-enough snapshot of unified constraints for delta tracking ---
  function snapshotUnified(unified) {
    var snap = {};
    for (var letter in unified) {
      var u = unified[letter];
      snap[letter] = {
        greenPositions: u.greenPositions.slice(0),
        yellowPositions: u.yellowPositions.slice(0),
        minCount: u.minCount,
        maxCount: u.maxCount
      };
    }
    return snap;
  }

  // --- Test if a dictionary word passes all constraints ---
  function wordPassesConstraints(word, perPosition, perLetter) {
    // Check 1: Per-position required letters (greens) -- fastest rejection
    for (var p = 0; p < 5; p++) {
      if (perPosition[p].requiredLetter !== null) {
        if (word.charAt(p) !== perPosition[p].requiredLetter) {
          return false;
        }
      }
    }

    // Check 2: Per-position excluded letters (yellows/grays at position)
    for (var p = 0; p < 5; p++) {
      var excluded = perPosition[p].excludedLetters;
      if (excluded.length > 0) {
        var ch = word.charAt(p);
        for (var e = 0; e < excluded.length; e++) {
          if (ch === excluded[e]) {
            return false;
          }
        }
      }
    }

    // Check 3: Per-letter count constraints
    for (var letter in perLetter) {
      var constraint = perLetter[letter];
      // Count occurrences of this letter in the word
      var count = 0;
      for (var i = 0; i < 5; i++) {
        if (word.charAt(i) === letter) {
          count++;
        }
      }

      if (count < constraint.minCount) {
        return false;
      }
      if (constraint.maxCount !== null && count > constraint.maxCount) {
        return false;
      }
    }

    return true;
  }

  // --- Main public API: Pure function with internal memoization ---
  function filterCandidates(dictionary, boardState) {
    // a. Validation
    var validationError = validateBoardState(boardState);
    if (validationError) {
      return {
        candidates: [],
        unconstrained: false,
        warning: validationError,
        constraints: {
          perLetter: {},
          perPosition: [
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] }
          ],
          perGuess: []
        }
      };
    }

    // b. Empty board early return
    if (boardState.guesses.length === 0) {
      var allIndices = new Array(dictionary.length);
      for (var i = 0; i < dictionary.length; i++) {
        allIndices[i] = i;
      }
      return {
        candidates: allIndices,
        unconstrained: true,
        warning: null,
        constraints: {
          perLetter: {},
          perPosition: [
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] },
            { requiredLetter: null, excludedLetters: [] }
          ],
          perGuess: []
        }
      };
    }

    // c. Cache check
    var cacheKey = buildCacheKey(boardState);
    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    // d. Constraint derivation
    var unified = {};
    var allGuessConstraints = new Array(boardState.guesses.length);
    var unifiedSnapshots = new Array(boardState.guesses.length);

    for (var g = 0; g < boardState.guesses.length; g++) {
      allGuessConstraints[g] = deriveGuessConstraints(boardState.guesses[g]);

      // Snapshot unified BEFORE merging this guess (for delta tracking)
      unifiedSnapshots[g] = snapshotUnified(unified);

      mergeConstraints(unified, allGuessConstraints[g]);
    }

    // e. Build perPosition from final unified perLetter constraints
    var perPosition = buildPerPosition(unified);

    // f. Build perGuess breakdown from delta computation
    var perGuess = buildPerGuess(boardState, allGuessConstraints, unifiedSnapshots);

    // g. Filter dictionary
    var results = [];
    for (var i = 0; i < dictionary.length; i++) {
      if (wordPassesConstraints(dictionary[i], perPosition, unified)) {
        results.push(i);
      }
    }

    // h. Handle zero candidates
    var warning = null;
    if (results.length === 0) {
      warning = 'No candidates remaining -- board state may be invalid';
    }

    // i. Build result object
    var result = {
      candidates: results,
      unconstrained: false,
      warning: warning,
      constraints: {
        perLetter: unified,
        perPosition: perPosition,
        perGuess: perGuess
      }
    };

    // j. Store in cache and return
    cache[cacheKey] = result;
    return result;
  }

  // --- Clear memoization cache ---
  function clearCache() {
    cache = {};
    console.log('[WordleBot] Constraint engine cache cleared');
  }

  // --- Export to shared namespace ---
  window.WordleBot.constraints = {
    filterCandidates: filterCandidates,
    clearCache: clearCache
  };

})();
