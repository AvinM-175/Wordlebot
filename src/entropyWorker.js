// Web Worker: computes Shannon entropy for every word against all words.
// Receives a flat Uint8Array of encoded words and returns Float64Array of entropies.
// Self-contained — no dependencies on main-thread code.
(function () {
  'use strict';

  var PATTERN_COUNT = 243; // 3^5
  var LOG2 = Math.log(2);

  function log2(x) {
    return Math.log(x) / LOG2;
  }

  // Two-pass feedback pattern using flat buffer offsets (fully unrolled for hot-loop perf)
  // Returns pattern ID 0-242
  function computePatternId(gOff, sOff, enc, sc, pat) {
    var s0 = enc[sOff];
    var s1 = enc[sOff + 1];
    var s2 = enc[sOff + 2];
    var s3 = enc[sOff + 3];
    var s4 = enc[sOff + 4];

    // Build secret letter counts
    sc[s0]++;
    sc[s1]++;
    sc[s2]++;
    sc[s3]++;
    sc[s4]++;

    var g0 = enc[gOff];
    var g1 = enc[gOff + 1];
    var g2 = enc[gOff + 2];
    var g3 = enc[gOff + 3];
    var g4 = enc[gOff + 4];

    // Pass 1: greens
    if (g0 === s0) { pat[0] = 2; sc[g0]--; } else { pat[0] = 0; }
    if (g1 === s1) { pat[1] = 2; sc[g1]--; } else { pat[1] = 0; }
    if (g2 === s2) { pat[2] = 2; sc[g2]--; } else { pat[2] = 0; }
    if (g3 === s3) { pat[3] = 2; sc[g3]--; } else { pat[3] = 0; }
    if (g4 === s4) { pat[4] = 2; sc[g4]--; } else { pat[4] = 0; }

    // Pass 2: yellows
    if (pat[0] !== 2 && sc[g0] > 0) { pat[0] = 1; sc[g0]--; }
    if (pat[1] !== 2 && sc[g1] > 0) { pat[1] = 1; sc[g1]--; }
    if (pat[2] !== 2 && sc[g2] > 0) { pat[2] = 1; sc[g2]--; }
    if (pat[3] !== 2 && sc[g3] > 0) { pat[3] = 1; sc[g3]--; }
    if (pat[4] !== 2 && sc[g4] > 0) { pat[4] = 1; sc[g4]--; }

    // Base-3 encode
    var id = pat[0] + pat[1] * 3 + pat[2] * 9 + pat[3] * 27 + pat[4] * 81;

    // Reset only the slots this secret touched
    sc[s0] = 0;
    sc[s1] = 0;
    sc[s2] = 0;
    sc[s3] = 0;
    sc[s4] = 0;

    return id;
  }

  self.onmessage = function (e) {
    var encoded = e.data.encodedWords; // Uint8Array(n*5), flat
    var n = e.data.wordCount;

    var buckets = new Uint16Array(PATTERN_COUNT);
    var secretCounts = new Uint8Array(26);
    var pattern = new Uint8Array(5);
    var logN = log2(n);
    var entropies = new Float64Array(n);

    for (var g = 0; g < n; g++) {
      var gOff = g * 5;
      buckets.fill(0);

      for (var s = 0; s < n; s++) {
        var sOff = s * 5;
        buckets[computePatternId(gOff, sOff, encoded, secretCounts, pattern)]++;
      }

      var entropy = 0;
      for (var b = 0; b < PATTERN_COUNT; b++) {
        var c = buckets[b];
        if (c > 0) {
          entropy += (c / n) * (logN - log2(c));
        }
      }

      entropies[g] = entropy;
    }

    self.postMessage({ entropies: entropies }, [entropies.buffer]);
  };
})();
