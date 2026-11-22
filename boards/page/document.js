// Views project the same Markdown. Keep each surviving line's hidden metadata,
// original marker and line ending alongside its visible text.
import { installation } from './installation.js'
import { boardLines, addBoardItem } from './items.js'

const ending = line => line.raw.slice(line.line.length)
const visible = line => line.item ? line.marker + line.text : line.line

function changedRange(a, b) {
  let start = 0, end = a.length, nextEnd = b.length
  while (start < end && start < nextEnd && a[start] === b[start]) start++
  while (end > start && nextEnd > start && a[end - 1] === b[nextEnd - 1]) { end--; nextEnd-- }
  return { start, end, nextEnd }
}

export function docText(markdown) {
  return boardLines(markdown).filter(line => !line.hidden).map(line => visible(line) + (ending(line) ? '\n' : '')).join('')
}

// The editor's visible offsets are UTF-16 with LF. Map them back to the
// raw Markdown for note anchors. At a hidden span, a start belongs to the
// visible character on its right and an end to the one on its left.
function docOffsets(markdown) {
  const spans = []
  let source = 0, at = 0
  function keep(from, length) {
    if (length) { spans.push({ from, at, length }); at += length }
  }
  for (const line of boardLines(markdown)) {
    if (!line.hidden) {
      if (line.item) {
        keep(source, line.marker.length)
        keep(source + line.prefix.length, line.text.length)
      } else keep(source, line.line.length)
      if (ending(line)) keep(source + line.raw.length - 1, 1)
    }
    source += line.raw.length
  }
  return {
    fromSource: offset => {
      const span = spans.find(x => offset < x.from + x.length)
      return span ? span.at + Math.max(0, offset - span.from) : at
    },
    toSource: (offset, assoc) => {
      const span = spans.find(x => offset < x.at + x.length || (assoc < 0 && offset === x.at + x.length))
      return span ? span.from + Math.max(0, offset - span.at) : source
    },
  }
}

export function boardProjection(root, path) {
  const { boards, generalBoard } = installation()
  if (root !== 'vault' || !(path === generalBoard || (path.startsWith(boards + '/') && /^[^/]+\.md$/i.test(path.slice(boards.length + 1))))) return null
  return { show: docText, write: (base, value) => applyDocText(base, value, path), offsets: docOffsets }
}

export function applyDocText(markdown, value, path, now = new Date()) {
  value = value.replace(/\r\n/g, '\n')
  if (docText(markdown) === value) return markdown
  const all = boardLines(markdown)
  const front = all.filter(l => l.hidden).map(l => l.raw).join('')
  const original = all.filter(l => !l.hidden)
  const before = original.map(l => visible(l) + (ending(l) ? '\n' : ''))
  const after = value.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const { start, end, nextEnd } = changedRange(before, after)
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const removed = original.slice(start, end)
  const middleRows = after.slice(start, nextEnd)
  // A paste, undo or block move may change several nonadjacent lines in one
  // event. Reserve exact matches before pairing the remaining edited lines.
  const positions = new Map()
  removed.forEach((line, i) => {
    const key = visible(line)
    if (!positions.has(key)) positions.set(key, [])
    positions.get(key).push(i)
  })
  const matched = middleRows.map(raw => positions.get(raw.replace(/\n$/, ''))?.shift())
  const used = new Set(matched)
  const remaining = removed.filter((line, i) => !used.has(i))
  const remainingItems = remaining.filter(line => line.item)
  const remainingText = remaining.filter(line => !line.item)
  let itemCursor = 0, textCursor = 0
  const parsedRows = boardLines(value)
  const middle = middleRows.map((raw, i) => {
    const same = matched[i] != null
    const parsed = parsedRows[start + i]
    const previous = same ? removed[matched[i]] : parsed?.item ? remainingItems[itemCursor++] : remainingText[textCursor++]
    const line = raw.replace(/\n$/, '')
    const nl = raw.endsWith('\n') ? (previous && ending(previous)) || eol : ''
    if (same) return previous.line + nl
    if (parsed?.item && previous?.item && (previous.text || previous.date || previous.metadata)) {
      return parsed.marker + previous.prefix.slice(previous.marker.length) + line.slice(parsed.marker.length) + previous.metadata + nl
    }
    if (parsed?.item && !parsed.date && !parsed.metadata) {
      const stamped = boardLines(addBoardItem('', parsed.text, 0, now, path))[0]
      if (stamped?.item) return parsed.marker + stamped.prefix.slice(stamped.marker.length) + parsed.text + stamped.metadata + nl
    }
    return line + nl
  })
  return front + original.slice(0, start).map(l => l.raw).join('') + middle.join('') + original.slice(end).map(l => l.raw).join('')
}

// Inline editing exposes the label of a link and the words inside emphasis.
// Map a keystroke back to those words so unchanged destinations and marks survive.
function inlineRuns(source) {
  const runs = []
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)|(\*\*|__|`|\*)(.+?)\5/g
  let at = 0
  for (const m of source.matchAll(pattern)) {
    if (m.index > at) runs.push({ text: source.slice(at, m.index) })
    if (m[1]) runs.push({ text: m[2] ?? m[1], raw: m[0], wrap: s => '[[' + m[1] + '|' + s + ']]' })
    else if (m[3]) runs.push({ text: m[3], raw: m[0], wrap: s => '[' + s + '](' + m[4] + ')' })
    else runs.push({ text: m[6], raw: m[0], wrap: s => m[5] + s + m[5] })
    at = m.index + m[0].length
  }
  if (at < source.length) runs.push({ text: source.slice(at) })
  return runs
}
export const cardText = source => inlineRuns(source).map(run => run.text).join('')
export function applyCardText(markdown, index, value) {
  const lines = boardLines(markdown), item = lines[index]
  if (!item?.item) return markdown
  value = value.replace(/[\r\n]+/g, ' ')
  const plain = cardText(item.text)
  if (value === plain) return markdown
  const { start, end, nextEnd } = changedRange(plain, value)
  if (start === plain.length && end === start) {
    item.raw = item.prefix + item.text + value.slice(start) + item.metadata + ending(item)
    return lines.map(l => l.raw).join('')
  }
  let at = 0, inserted = false
  const body = inlineRuns(item.text).map(run => {
    const from = at
    at += run.text.length
    if (at < start || (start < end && at === start) || from > end) return run.raw ?? run.text
    const left = run.text.slice(0, Math.max(0, start - from))
    const right = run.text.slice(Math.max(0, end - from))
    const insert = inserted ? '' : value.slice(start, nextEnd)
    inserted = true
    const next = left + insert + right
    return next === run.text ? run.raw ?? next : next && run.wrap ? run.wrap(next) : next
  }).join('')
  item.raw = item.prefix + (inserted ? body : value) + item.metadata + ending(item)
  return lines.map(l => l.raw).join('')
}
export function setBoardExpiry(markdown, index, day) {
  const lines = boardLines(markdown), item = lines[index]
  if (!item?.item || (day && !/^\d{4}-\d{2}-\d{2}$/.test(day))) return markdown
  let meta = item.metadata
  if (item.until) {
    if (day) meta = meta.replace(/\buntil \d{4}-\d{2}-\d{2}\b/, 'until ' + day)
    else {
      meta = meta.replace(/(?:\s*·\s*)?until \d{4}-\d{2}-\d{2}/, '').replace(/<!--\s*·\s*/, '<!-- ')
      if (/^\s*<!--\s*-->\s*$/.test(meta)) meta = ''
    }
  } else if (day) meta = meta ? meta.replace(/\s*-->/, ' · until ' + day + ' -->') : ' <!-- until ' + day + ' -->'
  item.raw = item.prefix + item.text + meta + ending(item)
  return lines.map(l => l.raw).join('')
}

// Apply a contiguous local change only where its original context still
// matches uniquely. For overlapping edits offer both versions for review.
export function recoverBoard(base, draft, latest) {
  if (latest === base || latest === draft) return { markdown: draft, both: false }
  const split = s => s.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const old = split(base), next = split(draft), live = split(latest)
  const { start, end, nextEnd } = changedRange(old, next)
  const removed = old.slice(start, end), added = next.slice(start, nextEnd)
  const matches = []
  for (let i = 0; i <= live.length; i++) {
    if (!removed.every((line, n) => live[i + n] === line)) continue
    if (!removed.length && !(start && live[i - 1] === old[start - 1]) && !(end < old.length && live[i] === old[end])) continue
    matches.push(i)
  }
  if (matches.length === 1) {
    live.splice(matches[0], removed.length, ...added)
    return { markdown: live.join(''), both: false }
  }
  const eol = latest.includes('\r\n') ? '\r\n' : '\n'
  return { markdown: added.length ? latest + eol + '## Recovered edit' + eol + added.join('') : latest, both: true }
}
