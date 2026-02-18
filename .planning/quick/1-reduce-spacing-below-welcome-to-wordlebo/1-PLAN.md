---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/panelUI.js
autonomous: true
requirements:
  - QUICK-1
must_haves:
  truths:
    - "The Got It button is visible without scrolling when the onboarding overlay is shown"
    - "The Welcome to WordleBot header and all three tips remain readable"
  artifacts:
    - path: "src/panelUI.js"
      provides: "Onboarding CSS with reduced title spacing"
      contains: "onboarding-title"
  key_links:
    - from: "src/panelUI.js (.onboarding-title)"
      to: "src/content.js (renderOnboarding)"
      via: "CSS class applied to title element"
      pattern: "onboarding-title"
---

<objective>
Reduce the bottom margin on the `.onboarding-title` CSS rule in `panelUI.js` so the "Welcome to WordleBot!" header takes less vertical space, pushing the Got It button into view without requiring the user to scroll.

Purpose: First-time users see the onboarding overlay cut off at the Got It button, creating friction on the critical dismiss action.
Output: Updated CSS in `src/panelUI.js` — `.onboarding-title` `margin-bottom` reduced from `12px` to `4px`.
</objective>

<execution_context>
@C:/Users/avinm/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/avinm/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:\WordleBot\.planning\STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reduce onboarding title bottom margin</name>
  <files>C:\WordleBot\src\panelUI.js</files>
  <action>
In `src/panelUI.js`, find the `.onboarding-title` CSS block inside the `createStyles` function. It currently reads:

```
'.onboarding-title {\n' +
'  font-size: 15px;\n' +
'  font-weight: 600;\n' +
'  color: var(--wb-text);\n' +
'  margin-bottom: 12px;\n' +
'}\n' +
```

Change `margin-bottom: 12px` to `margin-bottom: 4px`.

This is the only change needed. Do not modify any other CSS rules, and do not touch `.onboarding-overlay`, `.onboarding-tips`, `.onboarding-tip`, or `.onboarding-dismiss-btn`.
  </action>
  <verify>
Search `src/panelUI.js` for `onboarding-title` and confirm the `margin-bottom` value is `4px`. Confirm no other onboarding CSS rules were altered.
  </verify>
  <done>`.onboarding-title` has `margin-bottom: 4px`. All other onboarding CSS values are unchanged.</done>
</task>

</tasks>

<verification>
Load the extension on a fresh Chrome profile (first-install state). The onboarding overlay should show the "Welcome to WordleBot!" header, all three tips, and the "Got it" button fully visible within the 300px panel body — no scrolling required to reach the button.
</verification>

<success_criteria>
"Got it" button is visible on screen when the onboarding overlay first appears, without any scroll interaction.
</success_criteria>

<output>
No SUMMARY.md required for quick fixes. The change is self-contained in one CSS property.
</output>
