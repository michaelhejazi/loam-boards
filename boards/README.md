# Boards

Keep a list or a few shared notes beside a thread. Open **Board** in the header, choose **Add a note**, or select a card’s text to edit it. Use its menu to move it to another section, set its expiry date, or remove it. **Open in Files** opens the same Markdown document.

Requires Loam 0.2.28 or later (which provides the `thread.file` contribution, thread header controls, and Markdown editing slots). Each thread owns its file. The hourly schedule removes cards after their explicit expiry date. General also clears dated entries older than 14 days on a daily schedule. Imported historical lines can be retained by their content digest in the plugin data folder. The card editor and file projection are adapted from Loam under the GNU Affero General Public License, version 3. See LICENSE at the repository root.

## What changed in 0.1.1

- Declares server-side execution (`touches.server: true`) for the existing hourly and daily `expiry.py` cleanup schedules.
- Declares write access (`touches.record: write`) for editing and expiring per-thread board Markdown files.
- Documents the required host version: Loam 0.2.28 or later.
