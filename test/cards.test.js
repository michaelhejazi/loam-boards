import test from 'node:test'
import assert from 'node:assert/strict'
import {boardLines, boardBlocks, reflowBoardQuotes, editBoard, markBoardSeen, addBoardItem, formatCardThreadDraft} from '../boards/page/items.js'
import {setBoardExpiry} from '../boards/page/document.js'
import {setOwner, setGeneralPath} from '../boards/page/installation.js'
setOwner({id:'you',name:'Sam',accepts:['you']})
setGeneralPath('00_INBOX/from-agents/comms.md')
const board = '# Notes\r\n\r\n- [ ] First <!-- Scout · new · until 2026-11-22 -->\r\n* [X] Second <!-- Quill · new · future field -->\r\n- A plain note\r\n\r\n```md\r\n- [ ] A fenced example <!-- Scout · new -->\r\n```\r\n'
test('tick preserves every byte except the checkbox, including EOL metadata and fenced examples', () => {
  assert.equal(editBoard(board, 2, 'tick'), board.replace('- [ ] First', '- [x] First'))
  assert.equal(editBoard(board, 7, 'tick'), board)
  assert.equal(editBoard(board, 4, 'tick'), board)
  assert.equal(boardLines(board).filter((l) => l.item).length, 3)
  assert.equal(boardBlocks(board).at(-1).text, '\r\n```md\r\n- [ ] A fenced example <!-- Scout · new -->\r\n```\r\n')
})
test('seen edits only new metadata, never removes or checks an item; remove is separate', () => {
  const seen = markBoardSeen(board)
  assert.equal(seen, board.replace('Scout · new · until', 'Scout · until').replace('Quill · new · future', 'Quill · future'))
  assert.equal(boardLines(seen).filter((l) => l.item).length, 3)
  assert.equal(editBoard(board, 2, 'remove'), board.replace('- [ ] First <!-- Scout · new · until 2026-11-22 -->\r\n', ''))
  assert.equal(markBoardSeen(seen), seen)
  const inline = '- [ ] An <!-- inline --> example <!-- Scout · new · until 2026-11-22 -->\n'
  assert.equal(editBoard(inline, 0, 'seen'), inline.replace(' · new', ''))
})
test('quick add is plain by default, supports optional checkbox, uses UTC durations, and keeps CRLF intact', () => {
  assert.equal(addBoardItem(board, ' Walk\n outside ', 7, new Date('2026-11-08T23:59:00Z')), board + '- 2026-11-08 · Walk  outside <!-- Sam · until 2026-11-15 -->\r\n')
  assert.equal(addBoardItem(board, ' Walk\n outside ', 7, new Date('2026-11-08T23:59:00Z'), '', null, { checkbox: true }), board + '- [ ] 2026-11-08 · Walk  outside <!-- Sam · until 2026-11-15 -->\r\n')
  assert.equal(addBoardItem('', 'Keep this'), `- ${new Date().toISOString().slice(0, 10)} · Keep this <!-- Sam -->\n`)
  assert.equal(addBoardItem('', 'Tick this', 0, new Date('2026-11-08T23:59:00Z'), '', null, { checkbox: true }), '- [ ] 2026-11-08 · Tick this <!-- Sam -->\n')
  assert.equal(addBoardItem(board, '  '), board)
  assert.equal(addBoardItem('A note', 'A task', 1, new Date('2026-12-31T23:59:00Z')), 'A note\n- 2026-12-31 · A task <!-- Sam · until 2027-01-01 -->\n')
})
test('add-checkbox and remove-checkbox toggle only the checkbox and preserve checked/plain metadata and CRLF', () => {
  const plainBoard = '# Notes\r\n\r\n- 2026-11-24 · Plain idea <!-- Scout · new · until 2026-12-08 -->\r\n* [x] 2026-11-24 · Checked task <!-- Quill · new · until 2026-12-09 -->\r\n- [ ] 2026-11-24 · Open task <!-- Sam -->\r\n'
  const added = editBoard(plainBoard, 2, 'add-checkbox')
  assert.equal(added, plainBoard.replace('- 2026-11-24 · Plain idea', '- [ ] 2026-11-24 · Plain idea'))
  assert.equal(editBoard(added, 2, 'add-checkbox'), added)
  const removedChecked = editBoard(plainBoard, 3, 'remove-checkbox')
  assert.equal(removedChecked, plainBoard.replace('* [x] 2026-11-24 · Checked task', '* 2026-11-24 · Checked task'))
  assert.equal(editBoard(removedChecked, 3, 'remove-checkbox'), removedChecked)
  const removedOpen = editBoard(plainBoard, 4, 'remove-checkbox')
  assert.equal(removedOpen, plainBoard.replace('- [ ] 2026-11-24 · Open task', '- 2026-11-24 · Open task'))
  // Plain line preserves author, date, new, and expiry across seen & expiry edits.
  const line = boardLines(plainBoard)[2]
  assert.equal(line.checked, null)
  assert.equal(line.date, '2026-11-24')
  assert.equal(line.author, 'Scout')
  assert.equal(line.unseen, true)
  assert.equal(line.until, '2026-12-08')
  assert.equal(editBoard(plainBoard, 2, 'seen'), plainBoard.replace('Scout · new · until', 'Scout · until'))
  assert.equal(setBoardExpiry(plainBoard, 2, '2026-12-20'), plainBoard.replace('until 2026-12-08', 'until 2026-12-20'))
  assert.equal(setBoardExpiry(plainBoard, 2, ''), plainBoard.replace(' · until 2026-12-08', ''))
})
test('formatCardThreadDraft quotes full text with links, creator, date, and board/section cleanly', () => {
  const md = '## From the agents · important\n- 2026-11-24 · Check [[Boards/Roadmap — board|the 11-24 section]] and [docs](https://example.com) <!-- Scout · new · until 2026-12-08 -->\n'
  const line = boardLines(md)[1]
  const draft = formatCardThreadDraft(line, {
    boardName: 'Chat board',
    sectionName: 'From the agents · important',
    sectionKey: 'heading:From the agents · important:0',
    authorName: 'Scout',
  })
  assert.equal(draft, '> Check [[Boards/Roadmap — board|the 11-24 section]] and [docs](https://example.com)\n> — Scout · Nov 24, 2026 · Chat board · From the agents · important\n\n')
  const topDraft = formatCardThreadDraft({ text: 'Quick thought', date: '2026-11-24' }, {
    boardName: 'General — board',
    sectionName: 'Board',
    sectionKey: 'top',
    authorName: 'Sam',
  })
  assert.equal(topDraft, '> Quick thought\n> — Sam · Nov 24, 2026 · General — board\n\n')
  const longDraft = formatCardThreadDraft({ text: 'a'.repeat(4200), date: '2026-11-24' }, {
    boardName: 'Chat board',
    sectionName: 'Ideas',
    sectionKey: 'heading:Ideas:0',
    authorName: 'Sam',
  })
  assert.ok(longDraft.length <= 4000)
  assert.ok(longDraft.endsWith('\n> — Sam · Nov 24, 2026 · Chat board · Ideas\n\n'))
})
test('board quotes retain their marker and reflow soft wraps without changing fenced examples', () => {
  const source = '# Notes\n\n> A place for things worth keeping\n> beyond this conversation.\n\n```md\n> two\n> lines\n```\n\n> ```md\n> two\n> lines\n> ```\n'
  assert.equal(reflowBoardQuotes(source), source.replace('keeping\n> beyond', 'keeping beyond'))
})
