# WordleBot Problem Statement

## The Problem

Wordle is, at its core, an information theory puzzle. Each guess partitions the solution space based on the feedback it generates: green, yellow, and gray tiles. The mathematically optimal strategy is to choose guesses that maximize the information gained from each response, narrowing the field as efficiently as possible.

Most players do not see Wordle this way. They play by intuition, picking words with "common letters" or favorite openers without understanding why one guess outperforms another. A player who opens with HELLO does not know that it provides substantially less information than alternatives with more distinct, high-frequency letters. The gap is not intelligence -- it is visibility. Players lack an accessible way to see the mathematical structure of the game while they are playing it.

This creates a core pain point: Wordle rewards information-theoretic thinking, but no tool helps players develop that thinking in real time. The learning opportunity exists in every guess, but players miss it because the math is invisible.

## Existing Solutions and Their Shortcomings

The Wordle ecosystem includes several categories of tools, each with significant limitations.

**Auto-solvers.** Bot scripts and automated solvers play the entire game without human input. They type guesses, read feedback, and converge on the answer algorithmically. While technically impressive, they remove the player from the experience entirely. Using an auto-solver is indistinguishable from not playing. It defeats the fundamental purpose of Wordle as a daily puzzle.

**Web-based solvers.** Online solver tools require the player to leave the Wordle page, navigate to a separate website, and manually enter their guesses and tile colors. Some simply reveal today's answer outright. The context-switching tax is high: toggling between tabs, transcribing tile states, and interpreting results on a different page breaks the flow of play. The manual data entry is tedious and error-prone, especially on mobile.

**Raw statistical tools.** Letter frequency analyzers show charts of how often each letter appears in the English language or in five-letter words. While informative in the abstract, they provide no actionable suggestions. A player looking at a frequency chart still has no idea which specific word to guess next. The user must interpret the data themselves and translate it into a decision, which is the hard part.

**Word list filters.** Pattern-matching tools let players enter known letters, excluded letters, and positional constraints to filter a word list. The input process is tedious: the player must manually specify every constraint from every guess. These tools provide no ranking intelligence. A filtered list of 47 matching words, presented alphabetically with no indication of which is strongest, is marginally more useful than no tool at all.

**Browser extensions.** Existing Chrome extensions for Wordle vary widely in quality and approach. Most fall into two camps: auto-solvers that play the game for the user (which is cheating by another name) or minimal helpers that display unranked word lists without explanations. Few attempt to educate the player, and none provide entropy-based ranking with explanations.

**Post-game analysis tools.** The most prominent tool in this category is the analysis feature built into the New York Times Wordle experience itself, which provides feedback only after the game is over. It assigns metrics like "luck" and "skill" scores but offers limited explanation of what those numbers mean or how to improve. A player learns that a particular guess was "lucky" but not why it was strong or weak in information-theoretic terms. The feedback is retrospective and opaque. This is the closest existing tool to what players actually need, but its post-game-only timing means the learning arrives too late -- when the player can no longer act on it. It is a missed opportunity for real-time education.

## The Gap

No existing tool provides all four of the following:

1. **Real-time operation** during the game, not after it ends.
2. **In-context delivery** on the actual game page, with no tab-switching or manual data entry.
3. **Mathematically rigorous ranking** using entropy-based information gain, not heuristics or alphabetical ordering.
4. **Human-readable explanations** that teach the player why a suggestion is strong, not just what to guess.

The landscape falls into three buckets: "do it for me" (auto-solvers), "figure it out yourself" (raw tools and filters), and "we will tell you how you did after it is too late to learn" (post-game analysis). The gap between these is where real-time, explanatory guidance belongs.

## WordleBot's Approach

WordleBot fills this gap across all four dimensions.

**In-context.** WordleBot runs directly on the New York Times Wordle page as a content script. It renders a floating panel via Shadow DOM overlay, appearing alongside the game board. There is no tab switching, no copy-paste, and no manual data entry. The player sees suggestions without leaving the game.

**Information-theoretic ranking.** WordleBot uses Shannon entropy to rank guesses. For each candidate guess, it evaluates all 243 possible feedback patterns (every combination of green, yellow, and gray across five tiles) and measures how evenly the remaining words distribute across those patterns. The guess that most evenly partitions the candidate space -- maximizing expected information gain -- ranks highest. This is the same mathematical framework popularized by 3Blue1Brown's analysis of optimal Wordle strategy.

**Explanatory.** Every suggestion includes a "Why" line that describes what makes it a strong pick, referencing how many possibilities it narrows the field to on average. Clicking a suggestion reveals a detailed breakdown: the expected number of groups the guess creates, which high-frequency letters it tests, and its strongest positional letter match. This progressive disclosure keeps the default view clean while making the full reasoning available on demand.

**Non-automating.** WordleBot never types a guess and never submits an answer. The player remains in full control of every keystroke. WordleBot is a coach, not a player. It explains what is strong and why, then steps back and lets the player decide.

**Adaptive.** WordleBot adjusts its strategy as the game progresses. In the early game (four or more guesses remaining), it emphasizes pure information gain -- exploration. As guesses run out, it blends in word commonness so suggestions shift toward likely answers. On the final guess, it prioritizes the most common remaining word, because there is no more information to gather. This mirrors the strategic shift that skilled players make intuitively.

## The 3Blue1Brown Connection

The entropy-based approach is grounded in established information theory. Shannon entropy measures the expected information content of an event. In Wordle terms, a guess with high entropy is one where the 243 possible feedback patterns are distributed as evenly as possible across the remaining candidates. This means no single outcome is overwhelmingly likely, so every response teaches the player something substantial. This is not a custom heuristic -- it is the same mathematical framework that 3Blue1Brown demonstrated in his widely-viewed analysis of optimal Wordle strategy. WordleBot applies this framework in real time, directly on the game page, with explanations that make the math accessible to non-technical players.
