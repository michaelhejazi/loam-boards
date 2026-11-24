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
  const sheetState = {
    sheet: null,
    agents: { list: [{ id: 'scout', name: 'Scout' }, { id: 'oldbot', name: 'OldBot', archived: true }] },
  }
  const commandRuns = []

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
    selectionMark: ({ chosen }) => fakeNode('span', { class: `qmark${chosen ? ' on' : ''}` }),
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
    commands: {
      run(id, context) {
        commandRuns.push([id, context])
        if (id === 'chat.draft' && host.state.sheet) host.closeSheet()
      },
    },
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
    commandRuns,
    host,
    get scheduled() { return scheduled },
    get fileState() { return fileState },
    setFileState(next) { fileState = next },
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

function walkNodes(node, pred, out = []) {
  if (!node) return out
  if (Array.isArray(node)) { for (const child of node) walkNodes(child, pred, out); return out }
  if (typeof node === 'object') {
    if (pred(node)) out.push(node)
    for (const child of node.children ?? []) walkNodes(child, pred, out)
  }
  return out
}

test('card menu puts Start a thread first, toggles checkboxes, and composer checkbox defaults off', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: true })
  h.setFileState({
    text: '---\ncreated_by: owner\n---\n# Chat board\n\n## Ideas\n- 2026-11-24 · Plain note with [[Link]] <!-- scout · new -->\n- [x] 2026-11-24 · Checked task <!-- Sam -->\n',
    revision: 'rev-1',
  })
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    const rail = h.places['rail.action'][0]
    const overlay = h.places['app.overlay'][0]
    rail.onclick({})
    await new Promise(r => setTimeout(r, 10))

    // Open composer in Ideas -> checkbox toggle is off by default.
    let tree = overlay.render({ sheet: h.host.state.sheet })
    const addBtn = walkNodes(tree, n => n.tag === 'button' && n.attrs['data-add-section'] === 'heading:Ideas:0')[0]
    addBtn.attrs.onclick()
    tree = overlay.render({ sheet: h.host.state.sheet })
    const toggle = walkNodes(tree, n => n.tag === 'button' && n.attrs['data-boards-checkbox-toggle'] === 'true')[0]
    assert.equal(toggle.attrs['aria-pressed'], 'false')

    // Open actions menu on plain card -> Start a thread is first, Add checkbox is second.
    const menuBtns = walkNodes(tree, n => n.tag === 'button' && String(n.attrs.class ?? '').includes('tt-card-menu'))
    assert.equal(menuBtns.length, 2)
    menuBtns[0].attrs.onclick()
    tree = overlay.render({ sheet: h.host.state.sheet })
    const menuItems = walkNodes(tree, n => n.tag === 'div' && n.attrs.class === 'tt-item-menu')[0].children
    assert.equal(menuItems[0].children[0], 'Start a thread')
    assert.equal(menuItems[1].children[0], 'Add checkbox')

    // Clicking Start a thread on a persona's card passes that persona's id as agent and closes the sheet.
    menuItems[0].attrs.onclick()
    assert.equal(h.commandRuns.length, 1)
    assert.equal(h.commandRuns[0][0], 'chat.draft')
    assert.equal(h.commandRuns[0][1].agent, 'scout')
    assert.equal(h.commandRuns[0][1].text, '> Plain note with [[Link]]\n> — Scout · Nov 24, 2026 · Chat board · Ideas\n\n')
    assert.equal(h.host.state.sheet, null)

    // Re-open Chat board and test Remove checkbox on checked card.
    rail.onclick({})
    await new Promise(r => setTimeout(r, 10))
    tree = overlay.render({ sheet: h.host.state.sheet })
    walkNodes(tree, n => n.tag === 'button' && String(n.attrs.class ?? '').includes('tt-card-menu'))[1].attrs.onclick()
    tree = overlay.render({ sheet: h.host.state.sheet })
    const checkedMenu = walkNodes(tree, n => n.tag === 'div' && n.attrs.class === 'tt-item-menu')[0].children
    assert.equal(checkedMenu[1].children[0], 'Remove checkbox')
    checkedMenu[1].attrs.onclick()
    await new Promise(r => setTimeout(r, 10))
    assert.ok(h.fileState.text.includes('- 2026-11-24 · Checked task <!-- Sam -->'))
    assert.ok(!h.fileState.text.includes('- [x]'))
  } finally {
    dispose()
    h.cleanup()
  }
})

test('thread board card Start a thread quotes thread board name and section and closes cleanly', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: false })
  const origReq = h.loam.data.request
  h.loam.data.request = async (method, path, body) => {
    if (method === 'GET' && path === '/threads/t-roadmap/files/boards') {
      return {
        path: 'Boards/Roadmap — board.md',
        markdown: '# Roadmap — board\n\n## Decisions\n- 2026-11-24 · Ship milestone in January · [[Notes/Plan|plan notes]] <!-- scout -->\n',
        revision: 'rev-thread-1',
      }
    }
    return origReq(method, path, body)
  }
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    const cardsPlace = h.places['thread.header.action'].find(e => e.id === 'cards')
    const state = { thread: { id: 't-roadmap', title: 'Roadmap' }, creating: false }
    let selectedView = 'board'
    const ctx = {
      thread: state.thread,
      state,
      view: 'board',
      panel: 'main',
      selectView: v => { selectedView = v },
    }
    cardsPlace.render(ctx)
    await new Promise(r => setTimeout(r, 10))
    let tree = cardsPlace.render(ctx)
    const menuBtn = walkNodes(tree, n => n.tag === 'button' && String(n.attrs.class ?? '').includes('tt-card-menu'))[0]
    menuBtn.attrs.onclick()
    tree = cardsPlace.render(ctx)
    const menuItems = walkNodes(tree, n => n.tag === 'div' && n.attrs.class === 'tt-item-menu')[0].children
    assert.equal(menuItems[0].children[0], 'Start a thread')
    menuItems[0].attrs.onclick()
    assert.equal(h.commandRuns.length, 1)
    assert.equal(h.commandRuns[0][0], 'chat.draft')
    assert.equal(h.commandRuns[0][1].agent, 'scout')
    assert.equal(h.commandRuns[0][1].text, '> Ship milestone in January · [[Notes/Plan|plan notes]]\n> — Scout · Nov 24, 2026 · Roadmap — board · Decisions\n\n')
    assert.equal(selectedView, 'board')
  } finally {
    dispose()
    h.cleanup()
  }
})

test('Start a thread resolves persona display names, omits agent for owner, unknown, archived, and authorless cards', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: true })
  h.setFileState({
    text: [
      '# Chat board',
      '',
      '## Notes',
      '- 2026-11-24 · Display-named persona card <!-- Scout · new -->',
      '- 2026-11-24 · Owner card <!-- Sam -->',
      '- 2026-11-24 · Non-persona system card <!-- Loam -->',
      '- 2026-11-24 · Archived persona card <!-- OldBot -->',
      '- 2026-11-24 · Authorless card',
      '',
    ].join('\n'),
    revision: 'rev-authors',
  })
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    const rail = h.places['rail.action'][0]
    const overlay = h.places['app.overlay'][0]
    for (let i = 0; i < 5; i++) {
      rail.onclick({})
      await new Promise(r => setTimeout(r, 10))
      let tree = overlay.render({ sheet: h.host.state.sheet })
      const menuBtns = walkNodes(tree, n => n.tag === 'button' && String(n.attrs.class ?? '').includes('tt-card-menu'))
      menuBtns[i].attrs.onclick()
      tree = overlay.render({ sheet: h.host.state.sheet })
      const menuItems = walkNodes(tree, n => n.tag === 'div' && n.attrs.class === 'tt-item-menu')[0].children
      menuItems[0].attrs.onclick()
    }
    assert.equal(h.commandRuns.length, 5)
    assert.equal(h.commandRuns[0][1].agent, 'scout')
    assert.equal('agent' in h.commandRuns[1][1], false)
    assert.equal('agent' in h.commandRuns[2][1], false)
    assert.equal('agent' in h.commandRuns[3][1], false)
    assert.equal('agent' in h.commandRuns[4][1], false)
  } finally {
    dispose()
    h.cleanup()
  }
})

test('Start a thread surfaces a clear version message if an older host rejects an agentless chat.draft', async () => {
  const h = makeHarness({ settings: { thread_boards: 'on', chat_board: 'on' }, chatBoardExists: true })
  h.setFileState({
    text: '# Chat board\n\n## Notes\n- 2026-11-24 · Owner card <!-- Sam -->\n',
    revision: 'rev-old-host',
  })
  h.loam.commands.run = (_id, payload) => {
    if (!payload?.agent) throw new Error('Choose an agent and a draft of up to 4,000 characters.')
  }
  const dispose = await activate(h.loam)
  try {
    await new Promise(r => setTimeout(r, 10))
    const rail = h.places['rail.action'][0]
    const overlay = h.places['app.overlay'][0]
    rail.onclick({})
    await new Promise(r => setTimeout(r, 10))
    let tree = overlay.render({ sheet: h.host.state.sheet })
    const menuBtn = walkNodes(tree, n => n.tag === 'button' && String(n.attrs.class ?? '').includes('tt-card-menu'))[0]
    menuBtn.attrs.onclick()
    tree = overlay.render({ sheet: h.host.state.sheet })
    const menuItems = walkNodes(tree, n => n.tag === 'div' && n.attrs.class === 'tt-item-menu')[0].children
    assert.doesNotThrow(() => menuItems[0].attrs.onclick())
    assert.notEqual(h.host.state.sheet, null)
    tree = overlay.render({ sheet: h.host.state.sheet })
    const errText = JSON.stringify(tree)
    assert.match(errText, /Loam 0\.2\.35 or later/)
  } finally {
    dispose()
    h.cleanup()
  }
})
