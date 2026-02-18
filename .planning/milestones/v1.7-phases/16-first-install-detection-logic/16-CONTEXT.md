# Phase 16: First-Install Detection Logic - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Reliably detect whether the current user is a genuine first-time installer or a pre-v1.7 existing user, using only chrome.storage.local. Exposes a simple boolean for Phase 17 to consume. No UI, no onboarding display — just detection logic.

</domain>

<decisions>
## Implementation Decisions

### Detection heuristic
- ANY single existing storage key (wordlebot_dict OR wordlebot_cache) is sufficient to classify as existing user
- Pure storage-based detection only — no chrome.runtime APIs, no manifest checks
- Result exposed as a simple boolean: `isFirstInstall` (true/false)
- Key presence is enough — don't validate contents or structure of existing cache entries

### Init flow placement
- Piggyback on existing chrome.storage.local.get() call that loadFromCache already performs — zero extra storage I/O
- Must not delay dictionary loading or suggestion rendering (per roadmap success criteria)

### Flag storage design
- Key name: `wordlebot_onboarded` (matches existing naming convention: wordlebot_dict, wordlebot_cache)
- Value: boolean `true` (simple, no timestamps or version strings)
- Excluded from clearCaches() — Shift+Refresh dictionary reset never re-triggers onboarding (already decided in roadmap)

### Edge cases
- Cleared storage / fresh profile = treat as first install, show onboarding again (simple and correct)
- Storage read failure = fallback to "existing user" (safe default — worst case: miss showing onboarding once)
- No console logging for detection result — keep console clean

### Claude's Discretion
- Whether to set wordlebot_onboarded=false immediately at detection time vs. leaving all flag writing to Phase 17
- Whether to set wordlebot_onboarded=true for existing users at detection time vs. letting Phase 17 handle it
- Where the detection function lives (dictionary.js vs content.js) — based on code structure and separation of concerns
- Whether isFirstInstall result is stored as module-level variable or returned from function — based on codebase patterns
- Whether detection runs before or in parallel with dictionary loading — based on what Phase 17 mounting needs

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key constraint is zero additional storage I/O by piggybacking on existing reads.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-first-install-detection-logic*
*Context gathered: 2026-02-18*
