import { owner, installation } from './installation.js'

// A board action changes only the requested bytes. Unknown metadata, spacing,
// line endings, prose and fenced examples survive whole-file saves.
export function boardLines(markdown) {
  let fence = null
  const front = /^(?:\uFEFF)?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown)?.[0] ?? ''
  let offset = 0, firstTitle = true
  return String(markdown ?? '').split(/(?<=\n)/).map((raw, index) => {
    const line = raw.replace(/\r?\n$/, '')
    const hidden = offset < front.length
    offset += raw.length
    if (hidden) return { raw, index, line, hidden }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null
      return { raw, index, line, fenced: true }
    }
    const item = !fence && /^(\s*[-*+]\s+)(?:\[([ xX])\]\s+)?(.*?)(\s*<!--([^<>]*)-->\s*)?$/.exec(line)
    if (!item) {
      const heading = !fence && /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line)
      if (!heading) return { raw, index, line, fenced: Boolean(fence) }
      const level = heading[1].length, name = heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim()
      const title = level === 1 && firstTitle
      firstTitle = false
      return { raw, index, line, fenced: false, ...(title ? { title: true, titleText: name } : { heading: name, level }) }
    }
    const parts = (item[5] ?? '').split('·').map((s) => s.trim())
    const dated = /^(\d{4}-\d{2}-\d{2})([ \t]+·[ \t]+)(?:\*\*([^*]+)\*\*[ \t]+·[ \t]+)?/.exec(item[3])
    const metadata = item[4] ?? ''
    const text = item[3].slice(dated?.[0].length ?? 0)
    const prefix = line.slice(0, line.length - metadata.length - text.length)
    return { raw, index, line, item: true, marker: prefix.slice(0, prefix.length - (dated?.[0].length ?? 0)),
      prefix, date: dated?.[1], checked: item[2] === undefined ? null : item[2].toLowerCase() === 'x',
      text, author: parts.find((s) => s && s !== 'new' && !s.startsWith('until ')) ?? dated?.[3],
      until: parts.find((s) => /^until \d{4}-\d{2}-\d{2}$/.test(s))?.slice(6),
      unseen: parts.includes('new'), metadata }
  })
}
export function editBoard(markdown, index, action) {
  const lines = boardLines(markdown)
  const item = lines[index]
  if (!item?.item) return markdown
  if (action === 'remove') lines[index].raw = ''
  if (action === 'tick' && item.checked !== null) lines[index].raw = item.raw.replace(/^(\s*[-*+]\s+\[)[ xX](\])/, `$1${item.checked ? ' ' : 'x'}$2`)
  if (action === 'seen') lines[index].raw = item.raw.replace(/<!--([^<>]*)-->(?=\s*$)/, (_, content) => {
    const fields = content.split('·')
    const at = fields.findIndex((s) => s.trim() === 'new')
    if (at < 0) return `<!--${content}-->`
    fields.splice(at, 1)
    return `<!--${fields.length ? fields.join('·').replace(/\s*$/, ' ') : ' '}-->`
  })
  return lines.map((l) => l.raw).join('')
}

// Prose is rendered together so a fenced example or table stays markdown.
export function boardBlocks(text) {
  return blocksOf(boardLines(text))
}
function blocksOf(lines) {
  const blocks = []
  const copies = new Map()
  for (const line of lines) {
    if (line.hidden || line.title || (!line.fenced && /^\s*---\s*$/.test(line.line))) continue
    if (line.item) {
      const n = copies.get(line.text) ?? 0
      copies.set(line.text, n + 1)
      blocks.push({ ...line, key: `item:${line.text}:${n}` })
    } else if (blocks.at(-1)?.prose) blocks.at(-1).text += line.raw
    else blocks.push({ prose: true, text: line.raw, key: `prose:${line.index}` })
  }
  return blocks
}
// Heading identities survive insertions in earlier lists. Repeated names remain
// separate destinations, and headings in fenced examples never split a list.
export function boardSections(markdown) {
  const lines = boardLines(markdown), copies = new Map()
  const sections = [{ key: 'top', name: 'Board', start: 0, end: lines.length, lines: [] }]
  for (const line of lines) {
    if (line.heading) {
      sections.at(-1).end = line.index
      const n = copies.get(line.heading) ?? 0; copies.set(line.heading, n + 1)
      sections.push({ key: `heading:${line.heading}:${n}`, name: line.heading, level: line.level, start: line.index + 1, end: lines.length, lines: [] })
    } else sections.at(-1).lines.push(line)
  }
  return sections.map((s) => ({ ...s, blocks: blocksOf(s.lines) }))
}
function boardInsert(markdown, index, raw) {
  const lines = boardLines(markdown), eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const before = lines.slice(0, index).map((l) => l.raw).join(''), after = lines.slice(index).map((l) => l.raw).join('')
  return before + (before && !before.endsWith('\n') ? eol : '') + raw + (after && !raw.endsWith('\n') ? eol : '') + after
}
// Move the original line, never reconstruct its checkbox, marker or metadata.
// `before` is an original source-line index; null means the destination's end.
export function moveBoardItem(markdown, index, destination, before = null) {
  const lines = boardLines(markdown), item = lines[index], section = boardSections(markdown).find((s) => s.key === destination)
  if (!item?.item || !section) return markdown
  const target = before ?? boardItemEnd(section)
  if (!Number.isInteger(target) || target < section.start || target > section.end) return markdown
  if (target === index || target === index + 1) return markdown
  const remaining = lines.filter((l) => l.index !== index).map((l) => l.raw).join('')
  return boardInsert(remaining, target - (index < target ? 1 : 0), item.raw)
}
export function boardItemEnd(section) {
  const last = section.lines.findLast((l) => l.item)
  return last ? last.index + 1 : section.key === 'top' ? section.end : section.start
}
// Display-only soft wrapping. Keep the quote marker and leave examples intact;
// board writes always use the original markdown.
export function reflowBoardQuotes(text) {
  const out = []
  let fence = null, previousQuote = false
  for (const line of String(text).split(/\r?\n/)) {
    const marker = /^\s*(?:>\s*)?(`{3,}|~{3,})/.exec(line)
    if (marker) { fence = fence === marker[1][0] ? null : fence ?? marker[1][0]; previousQuote = false; out.push(line); continue }
    const quote = !fence && /^\s*>[ \t]+(.+)$/.exec(line)
    const prose = quote && !/^(?:#|[-*+]\s|\d+[.)]\s)/.test(quote[1])
    if (prose && previousQuote) out[out.length - 1] += ` ${quote[1].trim()}`
    else out.push(line)
    previousQuote = Boolean(prose)
  }
  return out.join('\n')
}
export function markBoardSeen(markdown) {
  return boardLines(markdown).filter((l) => l.unseen).reduce((text, line) => editBoard(text, line.index, 'seen'), markdown)
}
export function addBoardItem(markdown, text, days = 0, now = new Date(), path = '', destination = null) {
  const clean = text.trim().replace(/\r?\n/g, ' ')
  if (!clean) return markdown
  const until = new Date(now); until.setUTCDate(until.getUTCDate() + Number(days))
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const section = destination === null ? null : boardSections(markdown).find((s) => s.key === destination)
  if (destination !== null && !section) return markdown
  const marker = path === installation().generalBoard && !Number(days) ? '- ' : '- [ ] '
  const author = owner().name.replace(/-->|[\r\n]/g, ' ')
  const expiry = Number(days) ? ` · until ${until.toISOString().slice(0, 10)}` : ''
  const raw = `${marker}${now.toISOString().slice(0, 10)} · ${clean} <!-- ${author}${expiry} -->${eol}`
  return boardInsert(markdown, section ? boardItemEnd(section) : boardLines(markdown).length, raw)
}

