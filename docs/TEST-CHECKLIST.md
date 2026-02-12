# WordleBot Manual Test Checklist

**Version:** 1.0
**Date Tested:** _______________
**Browser:** Chrome _______________
**Tester:** _______________

---

## Overview

This checklist validates the WordleBot Chrome extension across all gameplay scenarios. Execute each test in order for fresh install scenarios, or pick specific tests for regression testing.

**Estimated Time:** 20-30 minutes (full checklist) | 10-15 minutes (critical tests 1-5)

---

## Test 1: Fresh Installation

### Setup
- Remove any existing WordleBot extension from Chrome
- Have the extension source directory ready (project root with manifest.json)

### Steps
1. [ ] Open Chrome and navigate to `chrome://extensions`
2. [ ] Enable "Developer mode" toggle (top right)
3. [ ] Click "Load unpacked"
4. [ ] Select the WordleBot project root directory
5. [ ] Observe the extension card that appears

### Expected Results
- [ ] Extension card appears with name "WordleBot"
- [ ] No red error banner on the extension card
- [ ] No yellow warning indicators
- [ ] Extension shows "Enabled" status
- [ ] Unique extension ID is assigned

### Notes
```
_________________________________________________________________
_________________________________________________________________
```

---

## Test 2: First Load on Wordle Page

### Setup
- Extension installed and enabled
- No Wordle game in progress (or use incognito window)

### Steps
1. [ ] Navigate to https://www.nytimes.com/games/wordle/
2. [ ] Wait for page to fully load
3. [ ] Dismiss any NYT modals/popups if present
4. [ ] Click "Play" button to enter the game
5. [ ] Wait 2-3 seconds for panel to initialize
6. [ ] Open DevTools Console (F12 -> Console tab)

### Expected Results
- [ ] WordleBot panel appears in top-right corner of page
- [ ] Panel header shows "WordleBot" with refresh and collapse buttons
- [ ] 5 suggestion cards are displayed
- [ ] Each card shows word, percentage, and brief description
- [ ] Candidate count is shown (should be ~2,300 for fresh game)
- [ ] Console shows "Dictionary loaded" message (or similar)
- [ ] No red error messages in console
- [ ] No yellow warning messages from WordleBot

### Notes
```
_________________________________________________________________
_________________________________________________________________
```

---

## Test 3: Complete Game Session (6 Guesses)

### Setup
- Fresh game started (no guesses yet)
- Panel visible and showing suggestions

### Steps
1. [ ] Enter first guess (any 5-letter word)
2. [ ] Press Enter to submit
3. [ ] Observe panel update after tile animation completes
4. [ ] Note the candidate count after first guess
5. [ ] Enter second guess
6. [ ] Observe panel update, note candidate count
7. [ ] Continue through remaining guesses (up to 6 total)
8. [ ] Track panel behavior after each guess

### Expected Results
- [ ] Panel updates automatically after each guess (within ~1-2 seconds)
- [ ] Candidate count decreases with each guess (usually)
- [ ] Suggestions change based on tile feedback colors
- [ ] Top suggestion percentage may increase as candidates narrow
- [ ] Explanations reference actual feedback (greens, yellows, grays)
- [ ] If solved: "Solved in X guesses" message appears
- [ ] If not solved: Panel shows remaining suggestions

### Notes
Record candidate counts after each guess:
```
Guess 1: ________ -> Candidates: ________
Guess 2: ________ -> Candidates: ________
Guess 3: ________ -> Candidates: ________
Guess 4: ________ -> Candidates: ________
Guess 5: ________ -> Candidates: ________
Guess 6: ________ -> Candidates: ________
```

---

## Test 4: Mid-Game Page Refresh

### Setup
- Game in progress with 2-3 guesses already made
- Note current board state before refresh

### Steps
1. [ ] Make 2-3 guesses in a game
2. [ ] Note the current candidate count
3. [ ] Note what guesses are on the board
4. [ ] Press F5 or Ctrl+R to refresh the page
5. [ ] Wait for page to reload
6. [ ] Click "Play" to re-enter the game
7. [ ] Wait for panel to initialize

### Expected Results
- [ ] Page reloads completely
- [ ] Previous guesses are still visible on board (NYT preserves state)
- [ ] Panel appears and shows correct suggestions
- [ ] Candidate count matches pre-refresh count (same constraints)
- [ ] Suggestions are appropriate for the current board state
- [ ] No "fresh game" suggestions shown (would be wrong)

### Notes
```
Pre-refresh candidate count: ________
Post-refresh candidate count: ________
Match: [ ] Yes  [ ] No
_________________________________________________________________
```

---

## Test 5: Theme Toggle (Light/Dark)

### Setup
- Game page loaded with panel visible
- Know how to access NYT theme settings

### Steps
1. [ ] Verify current theme (light or dark)
2. [ ] Note panel appearance (background, text colors)
3. [ ] Open NYT settings/menu
4. [ ] Toggle theme to opposite mode
5. [ ] Observe panel appearance change
6. [ ] Toggle theme back to original mode
7. [ ] Observe panel appearance change

### Expected Results
- [ ] In light mode: Panel has light background (white/light gray)
- [ ] In light mode: Text is dark (readable contrast)
- [ ] In dark mode: Panel has dark background (dark gray/near-black)
- [ ] In dark mode: Text is light (readable contrast)
- [ ] Theme change is immediate (no page refresh needed)
- [ ] Panel remains functional after theme change
- [ ] Theme toggle can be repeated multiple times

### Notes
```
Light mode panel colors: ____________________
Dark mode panel colors: ____________________
_________________________________________________________________
```

---

## Test 6: Panel Collapse/Expand

### Setup
- Panel visible and expanded (showing suggestions)

### Steps
1. [ ] Locate the collapse button in panel header (arrow or minimize icon)
2. [ ] Click the collapse button
3. [ ] Observe panel state change
4. [ ] Click the expand button (same location)
5. [ ] Observe panel state change
6. [ ] Collapse the panel again
7. [ ] Refresh the page (F5)
8. [ ] Click "Play" to re-enter game
9. [ ] Check panel state

### Expected Results
- [ ] Collapse button is visible in panel header
- [ ] Clicking collapse: Panel minimizes to header only (or small bar)
- [ ] Clicking expand: Panel shows full suggestions again
- [ ] Collapsed panel takes up minimal screen space
- [ ] Expanded panel shows all 5 suggestions
- [ ] Collapse state persists after page refresh (localStorage)

### Notes
```
Collapse state persists: [ ] Yes  [ ] No
_________________________________________________________________
```

---

## Test 7: Progressive Disclosure

### Setup
- Panel expanded and showing suggestions
- At least one guess made (so explanations have content)

### Steps
1. [ ] Click on the first suggestion card
2. [ ] Observe what additional information appears
3. [ ] Click the same card again
4. [ ] Observe what additional information appears
5. [ ] Click the same card a third time
6. [ ] Observe card state
7. [ ] Try clicking a different card
8. [ ] Observe that card's behavior

### Expected Results
- [ ] First click: "Why" line appears (brief explanation)
- [ ] Second click: Detailed bullets appear (full explanation)
- [ ] Third click: Card collapses back to minimal state
- [ ] Clicking different card expands that card
- [ ] Multiple cards can be expanded simultaneously (or one at a time based on design)
- [ ] Explanation content is relevant to current game state

### Notes
```
Disclosure levels work: [ ] Yes  [ ] No
Explanation content is accurate: [ ] Yes  [ ] No
_________________________________________________________________
```

---

## Test 8: Refresh Button

### Setup
- Panel visible with suggestions displayed
- DevTools Console open

### Steps
1. [ ] Locate the refresh button in panel header (circular arrow icon)
2. [ ] Click the refresh button (normal click, no modifier keys)
3. [ ] Observe panel behavior
4. [ ] Check console for refresh message
5. [ ] Repeat refresh click 2-3 times

### Expected Results
- [ ] Refresh button is visible and clickable
- [ ] Spinner/loading indicator appears briefly after click
- [ ] Spinner displays for at least ~500ms (perceptible)
- [ ] Suggestions reload (may be same values if no board change)
- [ ] Console shows refresh triggered message
- [ ] Multiple refreshes work without errors
- [ ] Panel returns to normal state after refresh completes

### Notes
```
Spinner appears: [ ] Yes  [ ] No
Spinner duration feels right: [ ] Yes  [ ] No
_________________________________________________________________
```

---

## Test 9: Hard Refresh (Shift+Click)

### Setup
- Panel visible with suggestions displayed
- DevTools Console open and cleared

### Steps
1. [ ] Hold Shift key
2. [ ] While holding Shift, click the Refresh button
3. [ ] Release Shift key
4. [ ] Observe panel behavior
5. [ ] Check console for hard refresh messages
6. [ ] Verify suggestions display correctly

### Expected Results
- [ ] Shift+Click triggers hard refresh (different from normal click)
- [ ] Console shows "Forced rebuild" or cache clearing message
- [ ] Loading takes slightly longer than normal refresh (rebuilding caches)
- [ ] Suggestions display correctly after rebuild
- [ ] No errors in console
- [ ] Panel fully functional after hard refresh

### Notes
```
Hard refresh distinguishable from normal: [ ] Yes  [ ] No
Console message seen: ____________________
_________________________________________________________________
```

---

## Test 10: Edge Case - Zero Candidates

### Setup
- This test requires creating an impossible game state
- May be difficult to trigger naturally

### Steps
1. [ ] If using a test/debug mode: Enter contradictory constraints
2. [ ] OR: If you encounter this naturally, document it
3. [ ] Observe panel behavior when no words match

### Expected Results
- [ ] Panel shows appropriate message: "No words match" or similar
- [ ] Panel does not crash or show errors
- [ ] Refresh button still works
- [ ] Panel recovers if constraints become valid again

### Notes
```
Zero candidates state achieved: [ ] Yes  [ ] No  [ ] N/A
Error message shown: ____________________
_________________________________________________________________
```

---

## Test 11: Extension Reload

### Setup
- Extension installed and working
- Wordle page open (can be mid-game)

### Steps
1. [ ] Open new tab and go to `chrome://extensions`
2. [ ] Find the WordleBot extension card
3. [ ] Click the refresh/reload icon on the card
4. [ ] Return to the Wordle tab
5. [ ] Observe page state (may need to refresh)
6. [ ] If panel not visible, refresh page and click "Play"

### Expected Results
- [ ] Extension reloads without errors
- [ ] Returning to Wordle page: Panel may need page refresh
- [ ] After page refresh: Panel re-initializes correctly
- [ ] Previous game state (if any) is picked up
- [ ] No console errors from reload

### Notes
```
Extension reload clean: [ ] Yes  [ ] No
Panel recovers: [ ] Yes  [ ] No
_________________________________________________________________
```

---

## Test 12: Console Verification

### Setup
- DevTools Console open (F12 -> Console tab)
- Filter set to show all messages (or at least errors/warnings)
- Clear console before starting

### Steps
1. [ ] Clear console (Ctrl+L or clear button)
2. [ ] Refresh the Wordle page
3. [ ] Click "Play" to enter game
4. [ ] Play through at least 2-3 guesses
5. [ ] Observe console messages throughout
6. [ ] Filter to errors only, check for red messages
7. [ ] Filter to warnings only, check for yellow messages

### Expected Results
- [ ] No red error messages from WordleBot code
- [ ] No unhandled promise rejections
- [ ] No "undefined" or "null" errors
- [ ] No yellow warnings from WordleBot (some browser warnings OK)
- [ ] Info/debug messages show expected flow:
  - Dictionary loaded
  - Board state detected
  - Suggestions computed
- [ ] No excessive logging (not spamming console)

### Notes
```
Errors found: [ ] None  [ ] Some (list below)
Warnings found: [ ] None  [ ] Some (list below)
_________________________________________________________________
_________________________________________________________________
```

---

## Test Results Summary

| Test | Name | Pass | Fail | Skip | Notes |
|------|------|------|------|------|-------|
| 1 | Fresh Installation | [ ] | [ ] | [ ] | |
| 2 | First Load | [ ] | [ ] | [ ] | |
| 3 | Complete Game | [ ] | [ ] | [ ] | |
| 4 | Mid-Game Refresh | [ ] | [ ] | [ ] | |
| 5 | Theme Toggle | [ ] | [ ] | [ ] | |
| 6 | Collapse/Expand | [ ] | [ ] | [ ] | |
| 7 | Progressive Disclosure | [ ] | [ ] | [ ] | |
| 8 | Refresh Button | [ ] | [ ] | [ ] | |
| 9 | Hard Refresh | [ ] | [ ] | [ ] | |
| 10 | Zero Candidates | [ ] | [ ] | [ ] | |
| 11 | Extension Reload | [ ] | [ ] | [ ] | |
| 12 | Console Verification | [ ] | [ ] | [ ] | |

**Total:** _____ Pass / _____ Fail / _____ Skip

---

## Issues Found

### Critical (Blocks Release)
```
_________________________________________________________________
_________________________________________________________________
```

### Major (Should Fix)
```
_________________________________________________________________
_________________________________________________________________
```

### Minor (Nice to Fix)
```
_________________________________________________________________
_________________________________________________________________
```

### Observations
```
_________________________________________________________________
_________________________________________________________________
```

---

## Sign-Off

**Tested By:** _______________________
**Date:** _______________________
**Verdict:** [ ] Ready for Release  [ ] Needs Fixes  [ ] Major Issues

**Comments:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```
