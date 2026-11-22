---
id: boards
name: Boards
version: 0.1.3
author: Michael Hejazi
api: 0
kind: [extension]
places: [thread.header.action, files.viewer]
icon: assets/icon.webp
description: Keep notes and next steps beside a conversation and edit them as cards or Markdown.
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
---
Keep shared notes beside a conversation. Open **Board** in its header. Add a note under a heading, check it off, move it to another list, or give it an expiry date. Choose **Open in Files** to edit the same Markdown.

## Technical details

The page reads and saves a thread’s Markdown using the revision returned when it opened the file. Conflicting edits stay in the tab for recovery. Scheduled cleanup scripts (`expiry.py`) run on the server to remove expired items and aged dated lines from the General board. Requires Loam 0.2.28 or later (which provides the `thread.file` contribution, thread header controls, and Markdown editing slots).
