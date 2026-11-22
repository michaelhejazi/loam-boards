import test from 'node:test'
import assert from 'node:assert/strict'
import { boardLines, editBoard, moveBoardItem, addBoardItem } from '../boards/page/items.js'
import { applyCardText, cardText, docText, applyDocText, boardProjection, recoverBoard } from '../boards/page/document.js'
import { setOwner } from '../boards/page/installation.js'

const source = '---\r\nlabels: [sample]\r\n---\r\n# Plans\r\n\r\n## Next\n* [ ] 2026-11-19 · Read **the draft** <!-- Sam · new · until 2027-01-01 · extra -->\r\n\n## Later\n'
test('Cards and Files preserve source bytes on a no-op and preserve metadata on an edit', () => {
  const item = boardLines(source).find(line => line.item)
  assert.equal(applyCardText(source,item.index,cardText(item.text)), source)
  const projection = boardProjection('vault','Boards/Plans.md')
  assert.equal(projection.write(source,projection.show(source)), source)
  assert.equal(applyCardText(source,item.index,'Read the notes'),source.replace('the draft','the notes'))
  assert.equal(applyDocText(source,docText(source).replace('draft','notes')),source.replace('draft','notes'))
  const offset = projection.show(source).indexOf('draft')
  assert.equal(projection.offsets(source).toSource(offset,1),source.indexOf('draft'))
})
test('moving or ticking a card preserves its marker, expiry, annotations and CRLF', () => {
  const item=boardLines(source).find(line=>line.item)
  assert.equal(editBoard(source,item.index,'tick'),source.replace('[ ]','[x]'))
  const moved=moveBoardItem(source,item.index,'heading:Later:0')
  assert.ok(moved.endsWith('## Later\n'+item.raw))
})
test('new entries name the owner and concurrent edits can be recovered', () => {
  setOwner({name:'Sam',accepts:['you']})
  const added=addBoardItem(source,'Call the printer',7,new Date('2026-11-21T12:00Z'))
  assert.ok(added.includes('Call the printer <!-- Sam · until 2026-11-28 -->'))
  assert.equal(recoverBoard(source,source.replace('draft','proof'),source.replace('Later','Soon')).markdown,source.replace('draft','proof').replace('Later','Soon'))
})
