---
id: boards
name: Boards
version: 0.1.0
author: Michael Hejazi
api: 0
kind: [extension]
places: [thread.header.action, files.viewer]
description: Keep notes and next steps beside a conversation and edit them as cards or Markdown.
screenshots:
  - src: assets/general-cards-1440-light.webp
    src_dark: assets/general-cards-1440-dark.webp
    caption: Keep the conversation alongside its cards
  - src: assets/general-cards-390-light.webp
    src_dark: assets/general-cards-390-dark.webp
    caption: Add and check off notes on your phone
touches:
  record: read
  memory: none
  server: false
contributes:
  agent.prompt:
    - file: agent.md
---
Keep shared notes beside a conversation. Open **Board** in its header. Add a note under a heading, check it off, move it to another list, or give it an expiry date. Choose **Open in Files** to edit the same Markdown.

## Technical details

The page reads and saves a thread’s Markdown using the revision returned when it opened the file. Conflicting edits stay in the tab for recovery. This development version requires Loam’s existing thread storage and its new header and Markdown editing slots.
