---
phase: quick-1
plan: 1
subsystem: onboarding-ui
tags: [css, onboarding, spacing, ux]
dependency_graph:
  requires: []
  provides: [reduced-onboarding-title-margin]
  affects: [onboarding overlay layout]
tech_stack:
  added: []
  patterns: [inline CSS string concatenation in createStyles]
key_files:
  created: []
  modified:
    - src/panelUI.js
decisions:
  - "Changed .onboarding-title margin-bottom from 12px to 4px — minimal targeted fix, no layout rework needed"
metrics:
  duration: "< 1 min"
  completed: "2026-02-18"
  tasks_completed: 1
  files_modified: 1
---

# Quick Fix 1: Reduce Spacing Below Welcome to WordleBot

**One-liner:** Reduced `.onboarding-title` bottom margin from 12px to 4px so the Got It button is fully visible without scrolling.

## What Was Done

Single CSS property change in `src/panelUI.js` inside the `createStyles` function.

| Property | Before | After |
|---|---|---|
| `.onboarding-title` `margin-bottom` | `12px` | `4px` |

## Why

First-time users saw the onboarding overlay with the "Got It" button cut off at the bottom of the 300px panel. Reducing the title's bottom margin reclaims 8px of vertical space, pushing the button into view without any scroll interaction.

## Commit

- `58b9fb5`: fix(quick-1): reduce onboarding title bottom margin from 12px to 4px

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/panelUI.js` modified: confirmed
- Commit `58b9fb5` exists: confirmed
- `.onboarding-title` has `margin-bottom: 4px`: confirmed
- All other onboarding CSS rules unchanged: confirmed
