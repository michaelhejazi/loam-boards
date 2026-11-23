import test from 'node:test'
import assert from 'node:assert/strict'
import { activate } from '../boards/page/main.js'
import { boardProjection } from '../boards/page/document.js'
import { installation, setGeneralPath } from '../boards/page/installation.js'

function fakeNode(tag, attrs = {}, ...children) {
  const node = {
    tag,
    attrs: { ...attrs },
    children: children.flat().filter(c => c != null && c !== false),
    dataset: {},
    style: {},
    classList: {
      set: new Set(String(attrs.class ?? '').split(/\s+/).filter(Boolean)),
      add(...names) { for (const n of names) this.set.add(n) },
      contains(n) { return this.set.has(n) },
    },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] ?? null },
    append(...els) { this.children.push(...els) },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    scrollIntoView() {},
    setSelectionRange() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
  }
  return node
}

function makeHarness({ settings = { thread_boards: 'on', chat_board: 'on' }, chatBoardExists = false, folderExists = true } = {}) {
  const prevDoc = globalThis.document
  const prevRaf = globalThis.requestAnimationFrame
  globalThis.document = {
    hidden: false,
    activeElement: null,
    createElement: tag => fakeNode(tag),
    createElementNS: (_ns, tag) => fakeNode(tag),
    querySelector: () => null,
  }
  globalThis.requestAnimationFrame = fn => { fn(); return 0 }

  const places = {}
  const makePlace = name => {
    const entries = []
    places[name] = entries
    return { add(reg) { entries.push(reg); return { remove() {} } } }
  }
  const listeners = new Map()
  const events = {
    on(name, fn) {
      const list = listeners.get(name) ?? []
      list.push(fn)
      listeners.set(name, list)
      return { remove() {} }
    },
    emit(name, detail) {
      for (const fn of listeners.get(name) ?? []) fn(detail)
    },
  }

  let fileState = chatBoardExists ? { text: '---\ncreated_by: owner\n---\n# Chat board\n\n- [ ] Milk\n', revision: 'rev-1' } : null
  let hasFolder = folderExists
  const calls = []
  let scheduled = 0
  const sheetState = { sheet: null }

  const host = {
    state: sheetState,
    schedule: () => { scheduled++ },
    openSheet: sheet => {
      const previous = sheetState.sheet
      sheetState.sheet = sheet
      events.emit('sheet.changing', { previous, sheet })
    },
    closeSheet: () => {
      const previous = sheetState.sheet
      sheetState.sheet = null
      events.emit('sheet.changing', { previous, sheet: null })
    },
    panels: {
      available: () => false,
      openSide: item => calls.push(['openSide', item]),
      openMain: item => calls.push(['openMain', item]),
    },
    workspaceHistory: { state: { front: 'list' } },
    activeThread: () => null,
  }

  const ui = {
    h: (tag, attrs = {}, ...children) => fakeNode(tag, attrs, ...children),
    kept: node => node,
    dress: (node, styles) => Object.assign(node.style, styles),
    icon: new Proxy({}, { get: (_t, name) => (size = 18) => fakeNode('svg', { 'data-icon': String(name), width: size }) }),
    button: (label, onclick, props = {}) => fakeNode('button', { ...props, onclick }, label),
    round: (label, glyph, onclick, props = {}) => fakeNode('button', { ...props, 'aria-label': label, onclick }, glyph),
    panelHeader: ({ title, actions = [] }) => fakeNode('header', {}, fakeNode('h2', {}, title), ...actions),
    settingsRow: ({ title, onclick }) => fakeNode('button', { class: 'setrow', onclick }, title),
    menuSurface: node => node,
    markdown: text => [text],
    styles: { add: href => calls.push(['style', href]) },
    host,
  }

  const data = {
    async request(method, path, body) {
      calls.push(['request', method, path, body])
      if (method === 'GET' && path === '/owner') return { name: 'Sam', accepts: ['you'] }
      if (method === 'GET' && path === '/plugins/boards/settings') return { values: settings }
      if (method === 'GET' && path === '/threads/general/files/boards') return { path: 'Boards/General — board.md' }
      if (method === 'POST' && path === '/files/folder') {
        hasFolder = true
        return { ok: true }
      }
      if (method === 'POST' && path === '/files/file') {
        if (!hasFolder) throw Object.assign(new Error('No folder'), { status: 404 })
        if (fileState) throw Object.assign(new Error('Exists'), { status: 409 })
        fileState = { text: `---\ncreated_by: Sam\n---\n${body.text}`, revision: 'rev-created' }
        return { ...fileState }
      }
      throw Object.assign(new Error(`Unexpected ${method} ${path}`), { status: 404 })
    },
    files: {
      async read(root, path) {
        calls.push(['files.read', root, path])
        if (!fileState) throw Object.assign(new Error('Missing'), { status: 404 })
        return { ...fileState }
      },
      async write(payload) {
        calls.push(['files.write', payload])
        fileState = { text: payload.text, revision: 'rev-2' }
        return { ...fileState }
      },
    },
  }

  const loam = {
    ui,
    data,
    events,
    places: {
      rail: { action: makePlace('rail.action') },
      thread: { list: { action: makePlace('thread.list.action') }, header: { action: makePlace('thread.header.action') } },
      app: { overlay: makePlace('app.overlay') },
      files: { viewer: makePlace('files.viewer') },
    },
  }

  return {
    loam,
    places,
    calls,
    host,
    get scheduled() { return scheduled },
    get fileState() { return fileState },
    cleanup() {
      globalThis.document = prevDoc
      globalThis.requestAnimationFrame = prevRaf
    },
  }
}

test('installation tracks Chat board inside the configured boards folder and projection matches it', () => {
  setGeneralPath('Notes/Boards/General — board.md')
  assert.equal(installation().chatBoard, 'Notes/Boards/Chat board.md')
  assert.ok(boardProjection('vault', 'Notes/Boards/Chat board.md'))
  setGeneralPath('Boards/General — board.md')
  assert.equal(installation().chatBoard, 'Boards/Chat board.md')
  assert.ok(boardProjection('vault', 'Boards/Chat board.md'))
})

test('activate registers all places, honors both switches live, and adapts labels', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: false })
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    // Background refresh checked the file, did NOT create it on 404.
    assert.equal(h.fileState, null)
    assert.ok(h.calls.some(([k, root, p]) => k === 'files.read' && root === 'vault' && p === 'Boards/Chat board.md'))
    assert.ok(!h.calls.some(([k, m, p]) => k === 'request' && m === 'POST' && p === '/files/file'))

    const rail = h.places['rail.action'][0]
    const listAction = h.places['thread.list.action'][0]
    const threadOpen = h.places['thread.header.action'].find(e => e.id === 'open')
    const headerChat = h.places['thread.header.action'].find(e => e.id === 'chat-board')

    // Both on: desktop rail active; phone list & thread header show Chat board; thread button says "Thread board".
    assert.equal(rail.when(), true)
    assert.equal(listAction.when({ wide: false }), true)
    assert.equal(listAction.when({ wide: true }), false)
    assert.equal(headerChat.when({ wide: false, placement: 'header' }), true)
    assert.equal(headerChat.when({ wide: true, placement: 'header' }), false)
    assert.equal(headerChat.when({ wide: false, placement: 'menu' }), false)
    assert.equal(threadOpen.when(), true)

    const threadCtx = { thread: { id: 't-1', title: 'Topic' }, state: {}, placement: 'header', view: null, closeMenu() {}, selectView() {} }
    assert.equal(threadOpen.render(threadCtx).attrs['aria-label'], 'Thread board')

    // Turn Chat board off live -> rail/list/header chat buttons hide; Thread board label simplifies to "Board".
    h.loam.events.emit('plugin.settings.changed', { id: 'boards', values: { thread_boards: 'on', chat_board: 'off' } })
    assert.equal(rail.when(), false)
    assert.equal(listAction.when({ wide: false }), false)
    assert.equal(headerChat.when({ wide: false, placement: 'header' }), false)
    assert.equal(threadOpen.when(), true)
    assert.equal(threadOpen.render(threadCtx).attrs['aria-label'], 'Board')

    // Turn Thread boards off, Chat board on -> only Chat board controls are active.
    h.loam.events.emit('plugin.settings.changed', { id: 'boards', values: { thread_boards: 'off', chat_board: 'on' } })
    assert.equal(threadOpen.when(), false)
    assert.equal(rail.when(), true)
    assert.equal(listAction.when({ wide: false }), true)
    assert.equal(headerChat.when({ wide: false, placement: 'header' }), true)

    // Both off -> every control hides.
    h.loam.events.emit('plugin.settings.changed', { id: 'boards', values: { thread_boards: 'off', chat_board: 'off' } })
    assert.equal(threadOpen.when(), false)
    assert.equal(rail.when(), false)
    assert.equal(listAction.when({ wide: false }), false)
    assert.equal(headerChat.when({ wide: false, placement: 'header' }), false)
  } finally {
    dispose()
    h.cleanup()
  }
})

test('opening Chat board lazily creates Boards/Chat board.md (and folder if needed) and closes when switched off', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: false, folderExists: false })
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    assert.equal(h.fileState, null)

    const rail = h.places['rail.action'][0]
    rail.onclick({})
    await new Promise(r => setTimeout(r, 10))

    assert.equal(h.host.state.sheet?.kind, 'boards:chat-board')
    assert.ok(h.calls.some(([k, m, p]) => k === 'request' && m === 'POST' && p === '/files/folder'))
    assert.ok(h.calls.some(([k, m, p, b]) => k === 'request' && m === 'POST' && p === '/files/file' && b.path === 'Boards/Chat board.md' && b.text === '# Chat board\n\n'))
    assert.ok(h.fileState?.text.includes('# Chat board'))

    const overlay = h.places['app.overlay'][0]
    const nodes = overlay.render({ sheet: h.host.state.sheet })
    assert.equal(Array.isArray(nodes), true)
    assert.equal(nodes.length, 2)

    // Switching Chat board off closes the open sheet automatically.
    h.loam.events.emit('plugin.settings.changed', { id: 'boards', values: { thread_boards: 'on', chat_board: 'off' } })
    assert.equal(h.host.state.sheet, null)
  } finally {
    dispose()
    h.cleanup()
  }
})
