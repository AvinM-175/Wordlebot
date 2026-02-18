---
phase: 16-first-install-detection-logic
plan: 01
subsystem: extension-storage
tags: [chrome-storage, first-install, detection, content-script]

# Dependency graph
requires:
  - phase: 15-content-js-wiring-background-update-check
    provides: loadDictionaryAndCaches function structure and storage patterns
provides:
  - window.WordleBot.isFirstInstall boolean (null->true/false) for Phase 17 onboarding UI
  - detectFirstInstall(stored) helper function in content.js
  - Pre-v1.7 user normalization via wordlebot_onboarded=true fire-and-forget write
affects:
  - 17-onboarding-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Storage-before-extraction ordering: detection reads storage keys before loadDictionary can write wordlebot_dict"
    - "Null-safe ternary for storage failure: detectionStored ? detectFirstInstall(detectionStored) : false"
    - "Fire-and-forget normalization: chrome.storage.local.set().catch() without await"
    - "Three-state heuristic: onboarded flag, legacy keys, or nothing present"

key-files:
  created: []
  modified:
    - src/content.js

key-decisions:
  - "detectFirstInstall placed in content.js (not dictionary.js) — detection is a content script concern, not a dictionary concern"
  - "window.WordleBot.isFirstInstall initialized to null at module level — null means not-yet-determined; Phase 17 checks === true"
  - "Storage read failure defaults isFirstInstall to false — safe default: worst case is missing onboarding once, not showing it incorrectly"
  - "catch sets detectionStored = null (not {}) — distinguishes storage failure from empty storage (fresh install)"
  - "Normalization write is fire-and-forget (.catch, no await) — does not block dictionary loading or suggestion rendering"
  - "Normalization guard also checks detectionStored !== null — skip write if storage read failed (we cannot know user state)"

patterns-established:
  - "Phase 17 must check window.WordleBot.isFirstInstall === true (not truthy) — null is the pre-detection state"

requirements-completed:
  - ONBD-01
  - ONBD-02

# Metrics
duration: 1min
completed: 2026-02-18
---

# Phase 16 Plan 01: First-Install Detection Logic Summary

**Storage-based first-install detection in content.js: three-state heuristic reads wordlebot_dict/wordlebot_cache/wordlebot_onboarded before loadDictionary runs, exposes window.WordleBot.isFirstInstall boolean, normalizes pre-v1.7 users**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-18T06:29:52Z
- **Completed:** 2026-02-18T06:31:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `detectFirstInstall(stored)` function with three-state heuristic above `loadDictionaryAndCaches`
- Initialized `window.WordleBot.isFirstInstall = null` at module level for Phase 17 consumption
- Wired detection block at top of `loadDictionaryAndCaches` before `loadDictionary` call (critical ordering)
- Storage read failure safely defaults to `false` (existing user) via null-safe ternary
- Pre-v1.7 existing users normalized with fire-and-forget `wordlebot_onboarded=true` write
- `clearCaches()` unchanged — `wordlebot_onboarded` deliberately excluded

## Task Commits

Each task was committed atomically:

1. **Task 1: Add detectFirstInstall helper and initialize namespace property** - `b4d5e99` (feat)
2. **Task 2: Wire detection into loadDictionaryAndCaches with pre-loadDictionary storage read** - `95349c0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/content.js` - Added isFirstInstall namespace init, detectFirstInstall function, and detection block in loadDictionaryAndCaches

## Decisions Made
- `detectFirstInstall` placed in `content.js` rather than `dictionary.js` — detection is a content script concern about user state, not a dictionary extraction concern
- `window.WordleBot.isFirstInstall` initialized to `null` (not `false`) — null signals "not yet detected"; Phase 17 checks `=== true` so null correctly maps to "don't show onboarding"
- Catch block sets `detectionStored = null` not `{}` — this is critical: an empty object `{}` would look like a fresh install (all keys absent = true), but a storage failure should default to false (safe)
- Normalization guard checks `detectionStored` is non-null before accessing `.wordlebot_onboarded` — prevents attempting a write when we don't know the user's state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `window.WordleBot.isFirstInstall` is available immediately after `loadDictionaryAndCaches` resolves
- Phase 17 (onboarding UI) can check `window.WordleBot.isFirstInstall === true` to show overlay
- Mounting strategy decision (Option A: isOnboardingActive guard vs Option B: shadow root sibling) still needed before Phase 17 UI code

---
*Phase: 16-first-install-detection-logic*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: src/content.js
- FOUND: .planning/phases/16-first-install-detection-logic/16-01-SUMMARY.md
- FOUND commit: b4d5e99 (feat(16-01): add detectFirstInstall helper and initialize namespace property)
- FOUND commit: 95349c0 (feat(16-01): wire detectFirstInstall into loadDictionaryAndCaches)
