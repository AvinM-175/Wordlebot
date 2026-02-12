WordleBot

  A Chrome extension that coaches you through Wordle using information theory. It reads your board in real time, scores
  every possible guess by Shannon entropy, and shows you the top 5 picks with plain-English explanations — without ever
  typing a letter for you or revealing the answer.

  How It Works

  WordleBot watches the NYT Wordle board as you play. After each guess, it:

  1. Reads the board — extracts tile colors (green/yellow/gray) and letters from the DOM
  2. Filters the dictionary — narrows ~13,750 words down to only valid candidates using a two-pass constraint engine
  that correctly handles tricky duplicate letters (TEETH, EERIE, SPEED)
  3. Ranks by entropy — scores every candidate by Shannon entropy (how evenly it splits remaining possibilities across
  all 243 feedback patterns). The word that eliminates the most uncertainty wins
  4. Blends in letter frequency — breaks ties using a composite of positional frequency, overall frequency, and bigram
  patterns
  5. Adapts to urgency — early guesses favor pure information gain; as guesses run out, the engine increasingly weights
  common/likely answers so you don't waste your last guess on an obscure word
  6. Shows a floating panel — top 5 suggestions with confidence scores and expandable explanations for why each word is
  strong

  Features

  - Entropy-based ranking — mathematically optimal word selection, not just "common letters"
  - Adaptive strategy — shifts from exploration (early game) to exploitation (late game) automatically
  - Human-readable explanations — every suggestion comes with reasoning, not just a score
  - Dark/light theme — auto-matches the NYT page theme
  - Fully offline — zero network calls, no analytics, no data collection
  - No auto-submit — architecturally cannot type for you; you stay in full control
  - Fast — entropy calculations run in a Web Worker so the page never freezes; first-guess results are pre-cached

  Installation
    Option 1: Directly from Chrome Web Store:
      https://chromewebstore.google.com/detail/wordlebot/igkkkejcelpgeeefjgbnbdmabhdcegbm
    
    Option 2:
      1. Clone or download this repo
      2. Open chrome://extensions in Chrome
      3. Enable Developer mode (top-right toggle)
      4. Click Load unpacked and select the project folder
      5. Navigate to https://www.nytimes.com/games/wordle/index.html and start playing — the suggestion panel appears automatically      

  Project Structure

  ├── manifest.json            # Chrome Extension (Manifest V3)
  ├── src/
  │   ├── content.js           # Main orchestrator — staged initialization
  │   ├── domReader.js         # Board state extraction from NYT DOM
  │   ├── dictionary.js        # 3-tier dictionary loading (live → cached → bundled)
  │   ├── dictExtractor.js     # Extracts word list from NYT page source
  │   ├── constraintEngine.js  # Filters candidates by green/yellow/gray constraints
  │   ├── entropyEngine.js     # Shannon entropy scoring (primary signal)
  │   ├── entropyWorker.js     # Web Worker for heavy entropy math
  │   ├── frequencyTables.js   # Letter frequency table construction
  │   ├── frequencyScorer.js   # Frequency-based tie-breaking (secondary signal)
  │   ├── suggestionEngine.js  # Blends signals, builds ranked suggestions
  │   ├── panelUI.js           # Shadow DOM panel (isolated from NYT styles)
  │   └── panelRenderer.js     # Renders suggestions into the panel
  ├── data/
  │   └── NYTWordleList.txt    # Bundled fallback dictionary (~13,750 words)
  ├── icons/                   # Extension icons (16/48/128px)
  └── docs/                    # Design decisions, ethics, and roadmap

  Design Principles

  - Assistance, not automation — teaches you to think in information theory, never plays for you
  - Privacy by architecture — no network calls, no telemetry, runs entirely in your browser
  - No solution leaks — never reveals today's answer
  - Transparency — shows why, not just what

  Tech Stack

  - Vanilla JavaScript (no build tools, no dependencies)
  - Chrome Extension Manifest V3
  - Shadow DOM for style isolation
  - Web Workers for off-thread computation
  - chrome.storage.local for caching

  License

  This project is provided as-is for educational and personal use.
