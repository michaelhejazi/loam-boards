# Boards

Keep notes and next steps as cards or Markdown — beside each thread, on one shared **Chat board** for quick thoughts, or both.

- **Thread boards:** Open **Board** (or **Thread board** when both are on) in a thread’s header to view cards tied to that conversation. Choose **Add a note**, select a card’s text to edit it, or use its menu to move it to another section, set an expiry date, or remove it.
- **Chat board:** Open one shared board from anywhere in Chats — from the side rail on desktop or the top bar on phone (from the threads list or inside any thread) — as an overlay over what you are looking at. Closing it puts you right back where you were.
- **Independent switches:** Turn **Thread boards** and **Chat board** on or off separately in **Settings → Plugins → Boards**. Turning either off hides its controls and leaves every board file untouched; turning it back on brings everything back. Agent guidance follows the active switches automatically.
- **Open in Files:** Opens the underlying Markdown file (`Boards/<Thread> — board.md` or `Boards/Chat board.md`) in Files.

Requires Loam 0.2.33 or later (which provides `rail.action`, `thread.list.action`, switch settings, and conditional `agent.prompt`, alongside `thread.file`, thread header controls, and Markdown editing slots). Each thread owns its file; `Boards/Chat board.md` is created on first open with `# Chat board` and standard vault frontmatter. The hourly schedule removes cards after their explicit expiry date across thread boards and the Chat board. General also clears dated entries older than 14 days on a daily schedule. Imported historical lines can be retained by their content digest in the plugin data folder. The card editor and file projection are adapted from Loam under the GNU Affero General Public License, version 3. See LICENSE at the repository root.

## What changed in 0.2.0

- Adds a shared **Chat board** (`Boards/Chat board.md`), created lazily on first open and reachable in one tap from the desktop side rail or the phone top bar (threads list and open threads).
- **New reach since 0.1.3:** Reads and writes `Boards/Chat board.md` in your vault through Loam’s Files API (creating `Boards/` and `Boards/Chat board.md` on first open), sweeps expired `until YYYY-MM-DD` items from `Boards/Chat board.md` in the hourly server cleanup script (`expiry.py`), reads its own plugin settings (`/plugins/boards/settings`), and adds UI controls to `rail.action`, `thread.list.action`, and `app.overlay`. Also moves the default boards root from Inbox into `Boards/`.
- Adds independent **Thread boards** and **Chat board** switches in Settings (both on by default).
- Splits agent instructions so personas receive thread-board guidance, Chat board guidance, both, or neither depending on the switches.
- Requires Loam 0.2.33 or later.

## What changed in 0.1.1

- Declares server-side execution (`touches.server: true`) for the existing hourly and daily `expiry.py` cleanup schedules.
- Declares write access (`touches.record: write`) for editing and expiring per-thread board Markdown files.
- Documents the required host version: Loam 0.2.28 or later.
