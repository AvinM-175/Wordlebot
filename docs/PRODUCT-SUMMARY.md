# WordleBot Product Summary

## What WordleBot Is

WordleBot is a Chrome extension (Manifest V3) that provides real-time, entropy-based word suggestions directly on the New York Times Wordle page. It runs in-context alongside the game, reading the current board state and ranking possible guesses by information gain. Each suggestion includes a plain-language explanation of why it is a strong choice, helping players understand the mathematical structure behind optimal Wordle play.

## Who It Serves

WordleBot is for Wordle players who enjoy the game and want to sharpen their strategy. The target user is someone who plays Wordle regularly, wants to understand why certain guesses are mathematically better than others, and is curious about the information theory behind the game.

WordleBot is not for players who want the game played for them. It never enters guesses or reveals the answer. The player stays in control at all times.

## The Problem It Solves

No existing in-context tool teaches Wordle players *why* certain guesses are better. Available tools either auto-play the game (defeating the purpose), require leaving the game page to use a separate website, or only provide analysis after the game is already over. WordleBot fills this gap by delivering ranked, explained suggestions during active play, right on the game page.

## How It Works

WordleBot reads the board state directly from the live Wordle page. After each guess, it:

1. **Filters** a bundled 13,751-word dictionary by the constraints revealed so far (green, yellow, and gray tiles).
2. **Ranks** remaining candidates using Shannon entropy, which measures how much information each possible guess provides. Every guess is evaluated against all 243 possible feedback patterns to determine which one most evenly partitions the remaining word space.
3. **Shows** the top 5 suggestions in a floating side panel, each with a confidence percentage and a "Why" explanation describing what makes it a strong pick.
4. **Adapts** its strategy as the game progresses. Early guesses emphasize information gain (exploration). Late guesses blend in word commonness (urgency) so suggestions shift toward likely answers when few guesses remain.
5. **Updates** automatically after each guess with no manual input required.

## What WordleBot Does NOT Do

- Does **not** type or submit guesses. The player always enters their own words.
- Does **not** reveal today's answer. Suggestions are ranked candidates, not spoilers.
- Does **not** make network calls or send data anywhere. All processing happens locally in the browser.
- Does **not** track user behavior or collect analytics.
- Does **not** require any account, login, or API key.
- Does **not** run background processes. It activates only on the Wordle page.

## Technical Posture

WordleBot runs entirely within the browser. It requests a single permission ("storage") to cache precomputed data for faster loading. The suggestion panel is rendered inside a Shadow DOM container, isolating it from the host page's styles. There are no background scripts, no service workers, and no external network requests. The bundled dictionary and all scoring logic ship with the extension.
