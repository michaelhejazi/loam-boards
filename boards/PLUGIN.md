---
id: boards
name: Boards
version: 0.3.0
author: Michael Hejazi
api: 0
kind: [extension]
places: [rail.action, thread.list.action, thread.header.action, app.overlay, files.viewer]
icon: assets/icon.webp
description: Keep a board beside each thread, one shared Chat board for quick thoughts, or both — as cards or Markdown.
screenshots:
  - src: assets/general-cards-1440-light.webp
    src_dark: assets/general-cards-1440-dark.webp
    caption: Keep the conversation alongside its cards
  - src: assets/general-cards-390-light.webp
    src_dark: assets/general-cards-390-dark.webp
    caption: Add and check off notes on your phone
touches:
  record: write
  memory: none
  server: true
contributes:
  settings.entry:
    - key: thread_boards
      label: Thread boards
      note: Keep a board in each thread’s header. Turning this off hides the button and keeps your board files untouched.
      choices: ["on", "off"]
      default: "on"
      control: switch
    - key: chat_board
      label: Chat board
      note: Keep one quick-capture board reachable from anywhere in Chats.
      choices: ["on", "off"]
      default: "on"
      control: switch
  vault.folder:
    - path: Boards
      when:
        setting: chat_board
        in: ["on"]
  thread.file:
    - label: board
      suffix: " — board"
      initial: "# {title} — board"
  schedule.kind:
    - name: expire
      calendar: "*-*-* *:23:00"
      run: python3 expiry.py
    - name: general-expiry
      calendar: "*-*-* 08:17:00 UTC"
      run: python3 expiry.py --general
  agent.prompt:
    - file: agent.md
      when:
        setting: thread_boards
        in: ["on"]
    - file: agent-chat.md
      when:
        setting: chat_board
        in: ["on"]
---
Keep notes and next steps as cards or Markdown — beside each thread, on one shared **Chat board** for quick thoughts, or both. Add a plain note or toggle a checkbox when it is a task, start a new thread directly from any card, move it to another list, or give it an expiry date. Choose **Open in Files** to edit the same Markdown.

## What you can do

- **Chat board:** Open one shared board from the side rail on desktop or the top bar on phone — from the threads list or inside any thread — and close it right back to where you were.
- **Thread boards:** Open **Board** in any thread’s header for notes tied to that conversation.
- **Card actions:** From any card’s menu, choose **Start a thread** to open a new unsent chat draft quoting the card, or **Add checkbox** / **Remove checkbox** to switch between a plain card and a checkable task.
- **Your choice:** Turn **Thread boards** and **Chat board** on or off independently below. Turning either off hides its controls and leaves every board file untouched.

---

## Technical details

Thread boards read and save each thread’s Markdown using the revision returned when opened. The Chat board is an ordinary vault Markdown file at `Boards/Chat board.md`, created on first open with `# Chat board` and standard vault frontmatter, and read/saved with revision checks through Files. Conflicting edits stay in the tab for recovery. Scheduled cleanup scripts (`expiry.py`) run on the server to remove expired items from thread boards and the Chat board, and aged dated lines from the General board. Requires Loam 0.2.35 or later (for optional-agent `chat.draft`, alongside `rail.action`, `thread.list.action`, settings switches, conditional `agent.prompt`, `thread.file`, thread header controls, and Markdown editing slots).
