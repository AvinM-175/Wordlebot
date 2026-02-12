# UX and Ethical Constraints

WordleBot operates within a set of firm product principles that define the boundary between helpful assistance and unwanted automation. These principles are not aspirational -- they are enforced by architectural choices and verifiable in the codebase.

---

## Principle 1: Assistance, Not Automation

**What It Means:** WordleBot shows suggestions and explanations. It never types letters, submits guesses, or interacts with game controls on the user's behalf. The user always decides which word to play and types it themselves.

**Why It Matters:** The value of Wordle is in playing it. A tool that plays for you destroys the experience it claims to enhance. The line between "coach" and "player" must be absolute -- not gated behind a setting, not available as an option. If auto-submit is possible, some users will use it, and the product becomes a cheat tool rather than a learning tool.

**How We Enforce It:**
- The manifest declares only the "storage" permission. No permissions enabling input injection (such as "activeTab" scripting or debugger access) are requested.
- No keyboard event dispatch code exists in any source file. The extension never simulates keypresses or mouse clicks on game elements.
- The extension only reads tile state from the game board. It never writes to game DOM elements, modifies game input fields, or calls game functions.
- Auto-submit is architecturally impossible -- the code paths to inject input simply do not exist.

**How to Verify:** Search all source files for "dispatchEvent", "KeyboardEvent", "keydown" dispatch, or "keypress" dispatch -- none exist (the only "keydown" reference is a listener on the extension's own panel cards for keyboard accessibility). Inspect manifest.json -- the permissions array contains only "storage".

---

## Principle 2: Privacy by Architecture

**What It Means:** WordleBot makes zero network calls. No data leaves the browser. No user behavior is tracked, logged, or transmitted. The extension works identically whether the user is online or offline (after initial installation).

**Why It Matters:** Users should not have to trust a privacy policy -- the architecture itself makes privacy violations impossible. A tool that reads game state has a responsibility to go nowhere with that data. Zero network calls means zero attack surface for data exfiltration, zero dependence on external servers, and zero risk of behavioral tracking.

**How We Enforce It:**
- No XMLHttpRequest, WebSocket, Beacon API, or external fetch calls appear in the codebase. The only fetch call loads the bundled dictionary file from the extension's own resources via a local extension URL.
- No background script exists in the manifest. There is no persistent process that could phone home on a schedule.
- The only permission requested is "storage" (used for panel collapse state and computation cache via the browser's local storage APIs).
- The content script activates only on the exact URL pattern for the NYT Wordle game page. It does not run on any other site.

**How to Verify:** Open the browser's DevTools Network panel during a full game session. The only network activity from the extension is the initial dictionary file load (a local extension resource, not an external request). Inspect manifest.json -- no "background" key exists, and the permissions array contains only "storage".

---

## Principle 3: No Solution Leaks

**What It Means:** WordleBot never reveals today's answer. It ranks candidates by information gain -- the suggestions are the best guesses to narrow down the answer space, not a lookup of the solution. The dictionary is a static bundled file with no date-specific answer logic.

**Why It Matters:** Revealing the answer eliminates the game entirely. Even if the top suggestion happens to be the correct answer, this is a side effect of good information-theoretic ranking, not an intentional reveal. The user should always feel they are solving the puzzle with the help of a coach, not looking up the answer in the back of the book.

**How We Enforce It:**
- The dictionary is a static text file bundled with the extension at build time. It contains the full valid guess list (13,751 words), not a curated answer list. There is no "today's answer" API call or date-based logic.
- No date-based filtering or answer-list separation exists. The engine treats all valid Wordle words equally -- it does not know which words are in the smaller answer pool.
- Suggestions are ranked by Shannon entropy (information gain), which measures how well a guess partitions the remaining candidate space. This is fundamentally different from "probability of being today's answer."

**How to Verify:** Inspect the dictionary data file -- it is a flat word list with no date associations. Search all source files for "Date", "today", or "answer" in the context of solution logic -- no date-based answer selection exists.

---

## Principle 4: Respectful of the New York Times

**What It Means:** WordleBot reads only the visible board state (tile letters and colors) from the public page DOM. It does not scrape hidden data, circumvent paywalls, access internal APIs, or modify the game's appearance or behavior in any way.

**Why It Matters:** WordleBot exists because Wordle exists. Aggressive scraping, API abuse, or game modification would harm the platform that makes the extension possible. Long-term sustainability requires being a good citizen of the host page.

**How We Enforce It:**
- DOM reading is limited to publicly visible tile elements and their data-state attributes on rendered game rows. No access to internal game state variables, localStorage keys belonging to the game, or hidden API endpoints.
- The extension panel is injected via Shadow DOM, which provides complete style isolation. Game CSS is never modified, and the panel's styles cannot leak into the game page.
- The content script runs at document_idle, after the page has fully loaded and become interactive. This avoids interfering with game initialization, asset loading, or first-paint performance.
- No NYT-specific API endpoints, internal JavaScript objects, or private data structures are accessed.

**How to Verify:** Review the DOM reading module -- it reads only data-state attributes on game-row tile elements. Confirm that no NYT API endpoints (e.g., nyt-games-prd, wordle-api) appear in any source file. Inspect the Shadow DOM host in DevTools -- game styles and panel styles are fully isolated.

---

## Principle 5: User Agency and Control

**What It Means:** The user controls the WordleBot experience entirely. The panel can be collapsed to a minimal toggle button and stays collapsed across page refreshes. Explanations use progressive disclosure -- a summary line is always visible, but detailed breakdowns require deliberate clicks. The extension never interrupts gameplay with modals, notifications, or forced interactions.

**Why It Matters:** A tool that demands attention while you are trying to think is worse than no tool at all. The user should be able to glance at suggestions when they want help and ignore the panel completely when they want to solve independently. Respecting attention is respecting the player.

**How We Enforce It:**
- The collapse toggle persists its state to local storage. If the user collapses the panel, it remains collapsed on the next page load. The user's preference is never overridden.
- No popups, modals, alert dialogs, or notification APIs are used anywhere in the extension.
- Progressive disclosure is implemented via click-to-expand on suggestion cards. Detailed explanations (entropy bits, frequency factors, game context) are hidden by default and revealed only on deliberate interaction.
- The panel is positioned to avoid overlapping the game board. On narrow viewports, it auto-collapses to minimize screen interference.
- No audio, vibration, badge updates, or other attention-grabbing browser APIs are used.

**How to Verify:** Collapse the panel, refresh the page -- it stays collapsed. Play an entire game without interacting with the panel -- no interruptions, popups, or sounds occur at any point.

---

## Enforcement Summary

| Principle | Key Technical Mechanism | Verifiable By |
|---|---|---|
| Assistance, not automation | No input permissions in manifest; no keyboard event dispatch code | manifest.json inspection; source code search |
| Privacy by architecture | Zero network calls; no background script | DevTools Network panel; manifest.json inspection |
| No solution leaks | Static dictionary; no date logic; entropy-based ranking | Dictionary file inspection; source code search |
| Respectful of NYT | Read-only DOM access; Shadow DOM isolation; document_idle injection | DOM reader review; DevTools inspection |
| User agency and control | Persistent collapse state; progressive disclosure; no modals or alerts | User testing; source code search |
