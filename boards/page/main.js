import { createEditor } from './editor.js'
import { boardProjection } from './document.js'
import { installation, setOwner, setGeneralPath } from './installation.js'

const CHAT_BOARD_SHEET = 'boards:chat-board'
const CHAT_BOARD_INITIAL = '# Chat board\n\n'

function chatBoardIcon(size = 18, dress = null) {
  const NS = 'http://www.w3.org/2000/svg'
  const root = document.createElementNS(NS, 'svg')
  root.setAttribute('width', String(size))
  root.setAttribute('height', String(size))
  root.setAttribute('viewBox', '0 0 24 24')
  root.setAttribute('fill', 'none')
  root.setAttribute('stroke', 'currentColor')
  root.setAttribute('stroke-width', '2.3')
  root.setAttribute('stroke-linecap', 'round')
  root.setAttribute('stroke-linejoin', 'round')
  if (dress) dress(root, { flex: 'none' })
  else root.style.flex = 'none'
  for (const [tag, attrs] of [
    ['rect', { x: '8.5', y: '2.5', width: '7', height: '3.5', rx: '1.2' }],
    ['path', { d: 'M8.5 4.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-2.5' }],
    ['path', { d: 'M9 12.5l2 2 4-4' }],
  ]) {
    const el = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    root.append(el)
  }
  return root
}

async function ensureChatBoardFile(data, path) {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const createFile = () => data.request('POST', '/files/file', { root: 'vault', path, text: CHAT_BOARD_INITIAL })
  try {
    const created = await createFile()
    return { path, markdown: created.text ?? CHAT_BOARD_INITIAL, revision: created.revision ?? null }
  } catch (error) {
    if (error.status === 404 && folder) {
      try { await data.request('POST', '/files/folder', { root: 'vault', path: folder }) }
      catch (folderError) { if (folderError.status !== 409) throw folderError }
      try {
        const created = await createFile()
        return { path, markdown: created.text ?? CHAT_BOARD_INITIAL, revision: created.revision ?? null }
      } catch (retryError) {
        if (retryError.status !== 409) throw retryError
      }
    } else if (error.status !== 409) {
      throw error
    }
    const existing = await data.files.read('vault', path)
    return { path, markdown: existing.text ?? '', revision: existing.revision ?? null }
  }
}

export async function activate(loam) {
  const { h, icon, settingsRow, dress, host } = loam.ui
  const editors = new WeakMap()
  const active = new Set()
  const mounted = new Map()
  const prefs = { thread_boards: 'on', chat_board: 'on' }
  const threadBoardsOn = () => prefs.thread_boards !== 'off'
  const chatBoardOn = () => prefs.chat_board !== 'off'
  const isChatBoardOpen = () => host?.state?.sheet?.kind === CHAT_BOARD_SHEET
  let disposed = false
  let navigatingToFile = false

  function applySettings(values) {
    if (!values || typeof values !== 'object') return
    const hadThread = threadBoardsOn()
    const hadChat = chatBoardOn()
    if (values.thread_boards === 'on' || values.thread_boards === 'off') prefs.thread_boards = values.thread_boards
    if (values.chat_board === 'on' || values.chat_board === 'off') prefs.chat_board = values.chat_board
    if (hadThread && !threadBoardsOn()) {
      for (const entry of [...active]) {
        if (entry !== chatEditor) entry.dismiss?.({ traverse: false })
      }
    }
    if (hadChat && !chatBoardOn() && isChatBoardOpen()) {
      host.closeSheet()
    }
    if (!hadChat && chatBoardOn()) {
      chatEditor.refresh({ create: false })
    }
    host?.schedule?.()
  }

  async function refreshSettings() {
    if (disposed) return
    try {
      const res = await loam.data.request('GET', '/plugins/boards/settings')
      if (!disposed) applySettings(res?.values)
    } catch (error) {
      if (error.status !== 404 && error.status !== 405) return
    }
  }

  const chatEditor = createEditor({
    id: '__chat_board__',
    title: 'Chat board',
    ariaLabel: 'Chat board',
    mode: 'modal',
    emptyBody: 'Jot a quick thought or next step here.',
    ui: loam.ui,
    data: loam.data,
    read: async ({ create = false } = {}) => {
      const path = installation().chatBoard
      try {
        const res = await loam.data.files.read('vault', path)
        return { path, markdown: res.text ?? '', revision: res.revision ?? null }
      } catch (error) {
        if (error.status !== 404) throw error
        if (!create) return { path, markdown: '', revision: null, absent: true }
        return ensureChatBoardFile(loam.data, path)
      }
    },
    write: async (markdown, base_revision) => {
      const path = installation().chatBoard
      const res = await loam.data.files.write({ root: 'vault', path, text: markdown, base_revision })
      return { path, markdown: res.text ?? markdown, revision: res.revision ?? null }
    },
    openFile: path => {
      navigatingToFile = true
      const item = { kind: 'file', root: 'vault', path, mode: 'edit' }
      if (host.panels.available()) {
        host.closeSheet()
        host.panels.openSide(item)
      } else {
        const inThread = host.workspaceHistory?.state?.front !== 'list' && Boolean(host.activeThread?.())
        host.panels.openMain(inThread ? { ...item, returnThread: true } : item)
      }
    },
    onOpen() { active.add(chatEditor) },
    onClose() { active.delete(chatEditor) },
    dismiss: () => { if (isChatBoardOpen()) host.closeSheet(); else chatEditor.close() },
  })

  function openChatBoard(event) {
    if (!chatBoardOn()) return
    if (isChatBoardOpen()) { host.closeSheet(); return }
    chatEditor.open(event)
    host.openSheet({ kind: CHAT_BOARD_SHEET })
  }

  const poll = setInterval(() => {
    if (document.hidden || disposed) return
    if (threadBoardsOn()) {
      for (const [entry, id] of mounted) {
        const escaped = globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&')
        if (document.querySelector(`[data-boards-thread="${escaped}"]`)) entry.refresh()
        else mounted.delete(entry)
      }
    }
    if (chatBoardOn() && isChatBoardOpen()) {
      chatEditor.refresh({ create: false })
    }
  }, 2500)

  const [owner] = await Promise.all([
    loam.data.request('GET', '/owner'),
    refreshSettings(),
  ])
  if (disposed) return () => { clearInterval(poll) }
  setOwner(owner)
  try {
    const general = await loam.data.request('GET', '/threads/general/files/boards')
    setGeneralPath(general.path)
  } catch (error) {
    if (error.status !== 404) throw error
  }
  if (disposed) return () => { clearInterval(poll) }
  if (chatBoardOn()) queueMicrotask(() => { if (!disposed) chatEditor.refresh({ create: false }) })

  loam.ui.styles.add('page/style.css')

  function editor(context) {
    const { thread, state } = context
    let entry = editors.get(state)
    if (!entry) {
      entry = createEditor({ thread, ui: loam.ui, data: loam.data,
        onOpen() { active.add(entry) },
        onClose() { active.delete(entry) },
        dismiss: options => context.selectView(null, options), backButton: context.backButton,
      })
      editors.set(state, entry)
    }
    if (!mounted.has(entry)) {
      mounted.set(entry, thread.id)
      if (!state.creating) queueMicrotask(() => entry.refresh())
    }
    return entry
  }

  function chatBoardButton(ghost = false) {
    const count = chatEditor.newCount()
    const expanded = isChatBoardOpen()
    return h('button', {
      key: 'boards:chat-board',
      type: 'button',
      class: `iconbtn${ghost ? ' ghost' : ''}${expanded ? ' on' : ''}`,
      title: 'Chat board',
      'aria-label': 'Chat board',
      'data-plugin': 'boards',
      'data-boards-chat': 'true',
      'aria-description': count ? `${count} new chat board items` : 'Open chat board',
      'aria-expanded': String(expanded),
      onclick: openChatBoard,
    }, chatBoardIcon(18, dress),
    count ? h('span', { class: 'navdot', 'aria-label': `${count} new chat board items` }) : null)
  }

  loam.events.on('plugin.settings.changed', ({ id, values }) => {
    if (id === 'boards') applySettings(values)
  })
  loam.events.on('sheet.changing', ({ previous, sheet }) => {
    if (previous?.kind === CHAT_BOARD_SHEET && sheet?.kind !== CHAT_BOARD_SHEET) {
      chatEditor.close({ restoreFocus: !navigatingToFile && !sheet })
      navigatingToFile = false
    }
  })
  loam.events.on('page.visible', () => {
    refreshSettings()
    if (chatBoardOn()) chatEditor.refresh({ create: false })
  })
  loam.events.on('turn.ended', () => {
    if (chatBoardOn()) chatEditor.refresh({ create: false })
  })
  loam.events.on('file.changed', detail => {
    if (chatBoardOn() && detail?.root === 'vault' && detail?.path === installation().chatBoard) {
      chatEditor.refresh({ create: false })
    }
  })
  const onFocus = () => {
    refreshSettings()
    if (chatBoardOn()) chatEditor.refresh({ create: false })
  }
  globalThis.addEventListener?.('focus', onFocus)

  if (loam.places.rail?.action) {
    loam.places.rail.action.add({
      id: 'chat-board',
      title: 'Board',
      label: 'Chat board',
      when: () => chatBoardOn(),
      icon: size => chatBoardIcon(size, dress),
      active: () => isChatBoardOpen(),
      badge: () => { const count = chatEditor.newCount(); return count ? `${count} new chat board items` : null },
      onclick: openChatBoard,
    })
  }

  if (loam.places.thread?.list?.action) {
    loam.places.thread.list.action.add({
      id: 'chat-board',
      when: ({ wide }) => chatBoardOn() && !wide,
      render: () => chatBoardButton(false),
    })
  }

  loam.places.thread.header.action.add({ id: 'open', slot: 'control', when: () => threadBoardsOn(), render(context) {
    const entry = editor(context)
    const count = entry.newCount()
    const label = chatBoardOn() ? 'Thread board' : 'Board'
    const open = event => { context.closeMenu(); context.selectView('board'); editor(context).open(event) }
    if (context.placement === 'menu') return settingsRow({ title: label, lead: icon.list(18), onclick: open })
    return h('button', { type: 'button', class: 'iconbtn ghost', title: label, 'aria-label': label, 'data-plugin': 'boards', 'data-boards-thread': context.thread.id,
      'aria-description': count ? `${count} new board items` : 'Open thread board',
      'aria-expanded': String(context.view === 'board'), onclick: open }, icon.list(18),
      count ? h('span', { class: 'navdot', 'aria-label': `${count} new board items` }) : null)
  } })

  loam.places.thread.header.action.add({
    id: 'chat-board', slot: 'control', order: 10,
    when: context => chatBoardOn() && !context.wide && context.placement !== 'menu',
    render: () => chatBoardButton(true),
  })

  loam.places.thread.header.action.add({ id: 'cards', view: 'board', dirty: ({ state }) => editors.get(state)?.dirty(), render(context) {
    if (!threadBoardsOn()) {
      const entry = editors.get(context.state)
      if (entry?.isOpen()) entry.close({ restoreFocus: false })
      return null
    }
    const entry = context.view === 'board' ? editor(context) : editors.get(context.state)
    if (!entry) return null
    if (context.view === 'board' && !entry.isOpen()) entry.open()
    if (context.view !== 'board' && entry.isOpen()) entry.close()
    return entry.view()
  } })

  loam.places.app.overlay.add({
    id: 'chat-board', slot: 'sheet',
    render: ({ sheet }) => sheet?.kind === CHAT_BOARD_SHEET && chatBoardOn() ? chatEditor.view() : null,
  })

  loam.places.files.viewer.add({ id: 'document', slot: 'projection', render: ({ root, path }) => boardProjection(root, path) })

  return () => {
    disposed = true
    clearInterval(poll)
    globalThis.removeEventListener?.('focus', onFocus)
    mounted.clear()
    if (isChatBoardOpen()) host.closeSheet()
    for (const entry of active) entry.dispose()
  }
}
