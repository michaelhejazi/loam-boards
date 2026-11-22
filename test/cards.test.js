import test from 'node:test'
import assert from 'node:assert/strict'
import {boardLines, boardBlocks, reflowBoardQuotes, editBoard, markBoardSeen, addBoardItem} from '../boards/page/items.js'
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
test('quick add uses UTC durations and keeps prior markdown and CRLF intact', () => {
  assert.equal(addBoardItem(board, ' Walk\n outside ', 7, new Date('2026-11-08T23:59:00Z')), board + '- [ ] 2026-11-08 · Walk  outside <!-- Sam · until 2026-11-15 -->\r\n')
  assert.equal(addBoardItem('', 'Keep this'), `- [ ] ${new Date().toISOString().slice(0, 10)} · Keep this <!-- Sam -->\n`)
  assert.equal(addBoardItem(board, '  '), board)
  assert.equal(addBoardItem('A note', 'A task', 1, new Date('2026-12-31T23:59:00Z')), 'A note\n- [ ] 2026-12-31 · A task <!-- Sam · until 2027-01-01 -->\n')
})
test('General Stays is dated for the comms sweep, timed adds carry until; ordinary boards retain task checkboxes', () => {
  const date = new Date('2026-11-08T23:59:00Z'), path = '00_INBOX/from-agents/comms.md'
  assert.equal(addBoardItem('', 'Keep close', 0, date, path), '- 2026-11-08 · Keep close <!-- Sam -->\n')
  assert.equal(addBoardItem('', 'Read soon', 7, date, path), '- [ ] 2026-11-08 · Read soon <!-- Sam · until 2026-11-15 -->\n')
  assert.equal(addBoardItem('', 'Keep close', 0, date, 'boards/one.md'), '- [ ] 2026-11-08 · Keep close <!-- Sam -->\n')
})
test('board quotes retain their marker and reflow soft wraps without changing fenced examples', () => {
  const source = '# Notes\n\n> A place for things worth keeping\n> beyond this conversation.\n\n```md\n> two\n> lines\n```\n\n> ```md\n> two\n> lines\n> ```\n'
  assert.equal(reflowBoardQuotes(source), source.replace('keeping\n> beyond', 'keeping beyond'))
})
