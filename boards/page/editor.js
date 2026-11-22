import { owner, isOwner } from './installation.js'
import { cardText, applyCardText, setBoardExpiry, recoverBoard } from './document.js'
import { boardDrag } from './drag.js'
import { boardLines, boardSections, boardItemEnd, moveBoardItem, reflowBoardQuotes, editBoard, markBoardSeen, addBoardItem } from './items.js'

export function createEditor({ ui, data, thread, onOpen, onClose, dismiss, backButton }) {
  const { h, kept, icon, menuSurface, panelHeader, selectionMark, markdown: renderText, host } = ui
  const redraw = () => host.schedule()
  const dom = document
  const name = id => host.state.agents.list.find(agent => agent.id === id)?.name ?? id
  const boardListName = section => section.name.replace(/:\s*$/, '').trim() || section.name
  const button = (text, onclick, props = {}) => h('button', { class: 'pillbtn', type: 'button', onclick, ...props }, text)
  const round = (label, glyph, action, props = {}) => button(glyph, action, { class: 'iconbtn', title: label, 'aria-label': label, ...props })
  const st = { open: { thread, board: { markdown: '', path: '' } }, boardDrafts: new Map() }
  let trigger = null
  function openBoardFile(path) {
    const item = { kind: 'file', root: 'vault', path, mode: 'edit' }
    if (host.panels.available()) {
      dismiss({ traverse: false })
      host.panels.openSide(item)
    } else host.panels.openMain({ ...item, returnThread: true })
  }
  function close() {
    finishBoardEdit()
    drag.cancel()
    st.open.boardOpen = false
    onClose()
    redraw()
    requestAnimationFrame(() => trigger?.focus())
  }
  const quick = h('input', { class: 'tt-quick', onkeydown: (e) => {
    if (e.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); addItem() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeQuick(true) }
  } })
  const drag = boardDrag({ drop: moveItem, announce: (text) => { if (st.open) { st.open.boardNotice = text; const status = dom.querySelector('.tt-board-status'); if (status) status.textContent = text } } })
  function closeQuick(focus = false) {
    const o = st.open
    if (!o) return
    if (focus) o.focusBoardAdd = o.addSection
    o.addSection = null; redraw()
  }
  function rememberBoard(o, record) {
    const id = o.thread.id
    if (record) st.boardDrafts.set(id, record)
    else st.boardDrafts.delete(id)
    try {
      if (record) sessionStorage.setItem('loam.board.draft.' + id, JSON.stringify(record))
      else sessionStorage.removeItem('loam.board.draft.' + id)
    } catch {}
  }
  function storedBoard(id) {
    try { return st.boardDrafts.get(id) ?? JSON.parse(sessionStorage.getItem('loam.board.draft.' + id)) } catch { return st.boardDrafts.get(id) }
  }
  const fileURL = o => `/threads/${encodeURIComponent(o.thread.id)}/files/boards`
  const writeBoard = async (o, text, revision) => data.request('PUT', fileURL(o), { markdown: text, base_revision: revision })
  function inputBoard(value) {
    const o = st.open
    if (!o?.editing) return
    o.editText = applyCardText(o.editText, o.inlineIndex, value)
    rememberBoard(o, o.editText === o.editBase ? null : { base: o.editBase, text: o.editText })
  }
  function finishBoardEdit() {
    const o = st.open
    if (!o?.editing || o.boardBusy) return
    if (o.editText !== o.editBase) return saveBoard(o.editText)
    o.editing = false; o.inlineIndex = null
    if (o.boardChanged) { o.boardChanged = false; refreshBoard(o) }
    redraw()
  }
  const inlineField = h('textarea', { class: 'tt-inline-field', rows: '1', 'aria-label': 'Edit item',
    oninput: () => inputBoard(inlineField.value), onblur: finishBoardEdit,
    onkeydown: e => {
      if (!e.isComposing && e.key === 'Enter') { e.preventDefault(); finishBoardEdit() }
    } })
  function beginBoardEdit(o, line) {
    if (o.editing || o.boardBusy || o.boardRefreshing || !o.board.revision || o.recovery) return
    o.editing = true; o.editBase = o.board.markdown; o.editText = o.editBase; o.inlineIndex = line.index
    inlineField.value = cardText(line.text)
    o.focusEditor = true; o.boardMenu = null; redraw()
  }
  async function refreshBoard(o) {
    if (o.boardRefreshing) return
    o.boardRefreshing = true
    try {
      const body = await data.request('GET', fileURL(o))
      if (st.open === o && !o.editing && !o.boardBusy) {
        if (body.revision !== o.board.revision) o.boardMenu = null
        o.board = body; o.boardUnavailable = false; o.boardError = ''
        const saved = storedBoard(o.thread.id)
        if (saved && saved.text !== body.markdown) o.recovery = saved
        else if (saved) rememberBoard(o, null)
      }
    } catch (e) { o.boardError = e.message; o.boardUnavailable = true }
    finally {
      o.boardRefreshing = false
      if (o.boardRefreshAfter) { o.boardRefreshAfter = false; refreshBoard(o) }
    }
    redraw()
  }
  async function saveBoard(text, after = null) {
    const o = st.open
    if (!o || o.loading || o.refreshing || o.readFailed || o.creating || o.createFailed || o.boardBusy || o.boardRefreshing || o.boardUnavailable) return
    if (!o.board.revision) return
    const base = o.board.markdown
    const pending = { base, text }
    rememberBoard(o, pending)
    o.boardBusy = true; o.boardError = ''; redraw()
    try {
      const answer = await writeBoard(o, text, o.board.revision)
      if (storedBoard(o.thread.id)?.text === text) rememberBoard(o, null)
      if (st.open !== o) return
      o.board = answer; o.recovery = null; o.editing = false; o.inlineIndex = null
      o.boardChanged = false; (after ?? o.recoveredAction)?.(); o.recoveredAction = null
    } catch (e) {
      o.recovery = pending; o.recoveredAction = after ?? o.recoveredAction; o.editing = false; o.inlineIndex = null
      o.boardError = e.status === 409 ? '' : e.message
      o.boardRefreshAfter = true
    } finally {
      o.boardBusy = false
      if (o.boardRefreshAfter && st.open === o) {
        o.boardRefreshAfter = false; o.boardChanged = false
        await refreshBoard(o)
      }
      redraw()
    }
  }
  async function removeItem(index) {
    const o = st.open
    if (!o || o.loading || o.refreshing || o.readFailed || o.boardBusy || o.boardRefreshing || o.boardUnavailable) return
    o.removing = index; o.boardBusy = true; redraw()
    await new Promise((resolve) => setTimeout(resolve, 180))
    if (st.open !== o) return
    o.boardBusy = false
    await saveBoard(editBoard(o.board.markdown, index, 'remove'))
    o.removing = null; redraw()
  }
  async function tickItem(line) {
    const o = st.open
    if (!o || o.boardBusy || o.boardRefreshing || o.boardUnavailable) return
    o.pendingTick = { index: line.index, checked: !line.checked }
    await saveBoard(editBoard(o.board.markdown, line.index, 'tick'))
    o.pendingTick = null; redraw()
  }
  function addItem() {
    const o = st.open
    if (!o || o.addSection == null || !quick.value.trim()) return
    const next = addBoardItem(o.board.markdown, quick.value, o.duration ?? 0, new Date(), o.board.path, o.addSection)
    if (next === o.board.markdown) { o.boardError = 'This list changed. Choose a list again.'; redraw(); return }
    const submitted = quick.value, section = o.addSection
    saveBoard(next, () => { if (quick.value === submitted) quick.value = ''; if (o.addSection === section) o.focusQuick = true })
  }
  async function moveItem(index, section, before = null, base = st.open?.board.markdown) {
    const o = st.open
    if (!o || o.editing) return
    if (o.boardBusy || o.boardRefreshing || o.boardUnavailable) { o.boardNotice = 'The board is updating. Please try the move again.'; redraw(); return }
    if (base !== o.board.markdown) { o.boardError = 'The board changed during this move. Please try again.'; redraw(); return }
    const next = moveBoardItem(base, index, section, before)
    o.boardMenu = null
    if (next === base) { o.focusBoardItem = index; redraw(); return }
    const target = before ?? boardItemEnd(boardSections(base).find((s) => s.key === section))
    await saveBoard(next, () => {
      o.addSection = null
      o.settleBoardItem = target - (index < target ? 1 : 0)
      o.boardNotice = `Moved to ${boardListName(boardSections(next).find((s) => s.key === section) ?? { name: 'Board' })}.`
    })
  }
  function board() {
    const o = st.open
    if (!o.boardOpen) return null
    const lines = boardLines(o.board.markdown), all = boardSections(o.board.markdown)
    const sections = all.map((section, i) => {
      const items = section.lines.filter(line => line.item).length
      const title = section.lines.find(line => line.title)?.titleText
      const level = section.level ?? (title ? 1 : 0)
      // The following heading starts a subsection only when its level is deeper.
      const group = !items && level > 0 && all[i + 1]?.level > level
      return { ...section, name: group && title ? title : section.name, level, items, group }
    }).filter(s => s.key !== 'top' || s.group || all.length === 1 || s.blocks.some(b => b.item || b.text.trim()))
    const lists = sections.filter(s => !s.group)
    const count = lines.filter(l => l.unseen).length
    const closeBoard = dismiss
    const busy = o.boardBusy || o.boardRefreshing || !o.board.revision || Boolean(o.recovery)
    const closeMenu = () => { o.boardMenu = null; o.menuPage = null; redraw() }
    const dateLabel = day => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(day + 'T00:00:00Z'))
    const taskCheck = (line) => {
      const checked = o.pendingTick?.index === line.index ? o.pendingTick.checked : line.checked
      return h('label', { class: 'tt-tick' }, h('input', { type: 'checkbox', checked, disabled: busy, 'aria-label': `Complete ${line.text}`, onchange: () => tickItem(line) }), selectionMark({ chosen: checked }))
    }
    const item = (l) => {
      const editing = o.editing && o.inlineIndex === l.index
      const mine = l.author && (isOwner(l.author) || l.author.toLocaleLowerCase() === owner().name.toLocaleLowerCase())
      const meta = [l.date && dateLabel(l.date), l.author && (mine ? 'You' : name(l.author)), l.until && 'expires ' + dateLabel(l.until)].filter(Boolean)
      const edit = () => { if (!busy) beginBoardEdit(o, l) }
      const setExpiry = day => { closeMenu(); saveBoard(setBoardExpiry(o.board.markdown, l.index, day)) }
      return h('div', { class: `tt-board-item${l.unseen ? ' is-new' : ''}${l.checked ? ' done' : ''}${editing ? ' is-editing' : ''}${o.removing === l.index ? ' removing' : ''}`, key: l.key,
        'data-board-index': l.index, onpointerdown: e => {
          if (!busy && !o.editing && !e.target.closest('button,input,label,a,textarea')) drag.start(e, l.index, o.board.markdown)
        } },
        l.checked !== null ? taskCheck(l) : null,
        h('div', { class: 'tt-item-body' },
          editing ? kept(inlineField) : h('div', { class: 'tt-item-copy', tabindex: '0', role: 'group', 'aria-label': 'Edit ' + cardText(l.text),
            onclick: e => { if (!e.target.closest('a,button')) edit() },
            onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); edit() } } }, h('div', { class: 'md' }, ...renderText(l.text, { from: { root: 'vault', path: o.board.path } }))),
          h('div', { class: `tt-item-meta${mine ? ' is-owner' : ''}` }, meta.join(' · '),
            l.unseen ? button('New', () => saveBoard(editBoard(o.board.markdown, l.index, 'seen')), { class: 'quietlink tt-newtag', disabled: busy, 'aria-label': `Mark ${l.text} seen` }) : null)),
        h('div', { class: 'tt-item-actions' }, round(`Actions for ${l.text}`, icon.dots(16), () => {
          o.boardMenu = o.boardMenu === l.index ? null : l.index; o.menuPage = null; redraw()
        }, { class: 'iconbtn content-mark tt-card-menu', disabled: busy, 'aria-expanded': String(o.boardMenu === l.index) }),
        o.boardMenu === l.index ? menuSurface(h('div', { class: 'tt-item-menu' },
          o.menuPage === 'move' ? lists.map(s => button(boardListName(s), () => moveItem(l.index, s.key), { class: 'pillbtn content-mark' })) :
          o.menuPage === 'expiry' ? h('label', { class: 'tt-expiry' }, 'Expires on', h('input', { type: 'date', value: l.until, onchange: e => setExpiry(e.target.value) })) :
          [button(l.until ? 'Change expiry' : 'Set expiry', () => { o.menuPage = 'expiry'; redraw() }),
            l.until ? button('Clear expiry', () => setExpiry('')) : null,
            button('Move to…', () => { o.menuPage = 'move'; redraw() }),
            button('Delete item', () => { closeMenu(); removeItem(l.index) }, { class: 'pillbtn tt-danger' })]),
          { title: o.menuPage === 'move' ? 'Move to section' : o.menuPage === 'expiry' ? 'Set expiry' : 'Item actions', width: 280, close: closeMenu }) : null))
    }
    const quickForm = () => h('form', { class: 'tt-board-add', key: 'board-add', onsubmit: (e) => { e.preventDefault(); addItem() }, onfocusout: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) closeQuick()
    } }, kept(quick), h('div', { class: 'tt-board-add-foot' },
      h('div', { class: 'tt-durations', role: 'group', 'aria-label': 'Keep board item for' }, ...[[0, 'Stays'], [1, '1 day'], [7, '1 week'], [14, '2 weeks']].map(([n, label]) => button(label, () => { o.duration = n; o.focusQuick = true; redraw() }, { class: 'pillbtn content-mark', 'aria-pressed': String(Number(o.duration ?? 0) === n) }))), button('Add', addItem, { class: 'pillbtn content-mark', disabled: busy })))
    const listAdd = (section) => {
      const name = boardListName(section)
      const label = 'Add a note'
      return h('div', { class: 'tt-board-list-foot', key: `add:${section.key}` },
        o.addSection === section.key ? quickForm() : button([icon.plus(15), label], () => {
          quick.setAttribute('placeholder', label)
          quick.setAttribute('aria-label', `New item in ${name}`)
          o.addSection = section.key; o.focusQuick = true; o.boardMenu = null; redraw()
        }, { class: 'tt-list-add', disabled: busy, 'aria-label': label, 'title': `Add a note to ${name}`, 'data-add-section': section.key, 'aria-expanded': 'false' }))
    }
    const description = (section, block) => {
      const key = `${section.key}:${block.key}`
      return h('details', { class: 'tt-description', key: block.key, open: o.openDescriptions?.has(key),
        ontoggle: e => {
          if (!e.currentTarget.isConnected) return
          o.openDescriptions ??= new Set()
          if (e.currentTarget.open) o.openDescriptions.add(key)
          else o.openDescriptions.delete(key)
        } }, h('summary', {}, icon.chevronRight(14), 'About this section'),
        h('div', { class: 'md tt-description-copy' }, ...renderText(reflowBoardQuotes(block.text))))
    }
    if (o.loading || o.refreshing || o.readFailed || o.boardUnavailable) return h('aside', { class: 'tt-board', 'aria-label': 'Thread board', onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeBoard() } } },
      panelHeader({ title: 'Board', back: backButton?.(), actions: [round('Close board', icon.close(14), closeBoard)], props: { class: 'chat-head plain tt-board-head' } }),
      h('div', { class: 'tt-empty', role: 'status' }, o.loading || o.refreshing ? 'Opening your board…' : 'The board could not be loaded.',
        o.boardError ? h('p', { role: 'alert', text: o.boardError }) : null,
        o.readFailed || o.boardUnavailable ? button('Try again', () => refreshBoard(o)) : null))
    const recovery = o.recovery && recoverBoard(o.recovery.base, o.recovery.text, o.board.markdown)
    inlineField.readOnly = Boolean(o.boardBusy)
    o.collapsed ??= new Set()
    const sectionView = section => {
      const { items, group, level } = section, closed = o.collapsed.has(section.key)
      const name = boardListName(section)
      const heading = `h${Math.min(6, Math.max(3, level + 2))}`
      const blocks = () => section.blocks.map(l => l.item ? item(l) : l.text.trim() ? description(section, l) : null)
      if (group) return h('div', { class: 'tt-board-group', key: section.key }, h(heading, { text: name }), blocks())
      const toggle = () => { if (closed) o.collapsed.delete(section.key); else o.collapsed.add(section.key); redraw() }
      return h('section', { class: 'tt-board-list', key: section.key, 'data-board-section': section.key, 'aria-label': name },
        section.key === 'top' && !items ? null : h(heading, { class: 'tt-board-list-head' }, button([
          h('span', { class: 'tt-board-list-title', text: name }),
          h('span', { class: 'tt-board-list-count', text: String(items) }), closed ? icon.chevronRight(12) : icon.chevronDown(12)],
          toggle, { class: 'tt-section-toggle', 'aria-expanded': String(!closed) })),
        closed ? null : [listAdd(section), blocks(), h('div', { class: 'tt-board-list-end' })])
    }
    return h('aside', { class: 'tt-board', 'aria-label': 'Thread board', onkeydown: e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (o.boardMenu != null) closeMenu(); else closeBoard() }
    } },
      panelHeader({ title: 'Board', back: backButton?.(), actions: [
        o.board.path ? button([host.panels.available() ? icon.panelRight(15) : icon.folder(15), 'Open in Files'],
          () => {
            finishBoardEdit()
            drag.cancel()
            closeMenu()
            openBoardFile(o.board.path)
          }, { class: 'tt-board-files ghost' }) : null,
        round('Close board', icon.close(16), closeBoard)], props: { class: 'chat-head plain tt-board-head' } }),
      h('span', { class: 'sr-only tt-board-status', role: 'status', text: o.boardNotice ?? '' }),
      o.boardError ? h('div', { class: 'banner', role: 'alert', text: o.boardError }) : null,
      !o.board.revision ? h('div', { class: 'banner', role: 'status' }, 'Board editing will be available after the runtime updates.',
        button('Refresh', () => refreshBoard(o))) : null,
      recovery ? h('div', { class: 'tt-recovery', role: 'status' },
        h('strong', { text: o.boardError ? 'Your edit is saved in this tab' : 'The board changed' }),
        h('p', { text: recovery.both ? 'The same passage changed. Keep both versions to review them together.' : 'Your draft is safe. Apply it to the board shown below.' }),
        button(recovery.both ? 'Keep both versions' : 'Reapply my edit', () => saveBoard(recovery.markdown), { disabled: o.boardBusy || o.boardRefreshing || !o.board.revision }),
        button('Discard draft', () => { if (globalThis.confirm('Discard your saved board edit?')) { o.recovery = null; o.recoveredAction = null; rememberBoard(o, null); redraw() } }, { class: 'quietlink' })) : null,
      count ? h('div', { class: 'tt-seen-strip' }, h('span', { text: count + ' new from the agents' }),
        button('Mark seen', () => saveBoard(markBoardSeen(o.board.markdown)), { class: 'quietlink tt-mark-seen', disabled: busy })) : null,
      h('div', { class: 'tt-board-items' }, !lines.some(l => l.item) && !sections.some(s => s.blocks.some(b => b.text.trim())) ?
          h('div', { class: 'tt-empty' }, h('h3', { text: 'Room for your first idea' }), h('p', { text: 'Keep a thought or a next step here.' })) : null,
          ...sections.map(sectionView)))
  }

  function open(event) {
    if (st.open.boardOpen) return
    onOpen()
    trigger = event?.currentTarget
    st.open.boardOpen = true
    refreshBoard(st.open)
    requestAnimationFrame(() => document.querySelector('.personal-board h2')?.focus())
  }

  function view() {
    if (!st.open.boardOpen) return null
    const panel = board()
    panel.classList.add('personal-board')
    panel.dataset.boardsThread = thread.id
    panel.setAttribute('role', 'dialog')
    requestAnimationFrame(() => {
      const o = st.open
      if (o.focusQuick) { quick.focus(); quick.scrollIntoView({ block: 'nearest' }); o.focusQuick = false }
      if (o.focusEditor) { inlineField.focus(); inlineField.setSelectionRange(inlineField.value.length, inlineField.value.length); o.focusEditor = false }
      if (o.focusBoardAdd) {
        document.querySelector(`.personal-board [data-add-section=${CSS.escape(o.focusBoardAdd)}]`)?.focus()
        o.focusBoardAdd = null
      }
      const index = o.settleBoardItem ?? o.focusBoardItem
      if (index != null) {
        document.querySelector(`.personal-board [data-board-index="${index}"] .tt-item-actions button`)?.focus()
        o.focusBoardItem = null
        o.settleBoardItem = null
      }
    })
    return [h('button', { class: 'tt-board-scrim', title: 'Dismiss board panel', tabindex: '-1', onclick: dismiss }), panel]
  }
  function refresh() {
    if (!st.open.editing && !st.open.boardBusy) refreshBoard(st.open)
  }
  const dirty = () => Boolean(storedBoard(thread.id) || quick.value.trim() || st.open.boardBusy)
  return { open, view, close, refresh, dirty, newCount: () => boardLines(st.open.board.markdown).filter(l => l.unseen).length, isOpen: () => st.open.boardOpen, dispose: () => drag.cancel() }
}
