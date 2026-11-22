import { createEditor } from './editor.js'
import { boardProjection } from './document.js'
import { setOwner, setGeneralPath } from './installation.js'

export async function activate(loam) {
  const { h, icon, settingsRow } = loam.ui
  const editors = new WeakMap()
  const active = new Set()
  const mounted = new Map()
  const poll = setInterval(() => {
    if (document.hidden) return
    for (const [entry, id] of mounted) {
      if (document.querySelector(`[data-boards-thread="${CSS.escape(id)}"]`)) entry.refresh()
      else mounted.delete(entry)
    }
  }, 2500)
  const owner = await loam.data.request('GET', '/owner')
  setOwner(owner)
  try {
    const general = await loam.data.request('GET', '/threads/general/files/boards')
    setGeneralPath(general.path)
  } catch (error) {
    if (error.status !== 404) throw error
  }
  loam.ui.styles.add('page/style.css')
  function editor(context) {
    const { thread, state } = context
    let entry = editors.get(state)
    if (!entry) {
      entry = createEditor({ thread, ui: loam.ui, data: loam.data,
        onOpen() {
          active.add(entry)
        },
        onClose() { active.delete(entry) },
        dismiss: () => context.selectView(null), backButton: context.backButton,
      })
      editors.set(state, entry)
    }
    if (!mounted.has(entry)) {
      mounted.set(entry, thread.id)
      if (!state.creating) queueMicrotask(() => entry.refresh())
    }
    return entry
  }
  loam.places.thread.header.action.add({ id: 'open', slot: 'control', render(context) {
    const entry = editor(context)
    const count = entry.newCount()
    const open = event => { context.closeMenu(); context.selectView('board'); editor(context).open(event) }
    if (context.placement === 'menu') return settingsRow({ title: 'Board', lead: icon.list(18), onclick: open })
    return h('button', { type: 'button', class: 'iconbtn ghost', title: 'Board', 'aria-label': 'Board', 'data-plugin': 'boards', 'data-boards-thread': context.thread.id,
      'aria-description': count ? `${count} new board items` : 'Open thread board',
      'aria-expanded': String(context.view === 'board'), onclick: open }, icon.list(18),
      count ? h('span', { class: 'navdot', 'aria-label': `${count} new board items` }) : null)
  } })
  loam.places.thread.header.action.add({ id: 'cards', view: 'board', dirty: ({ state }) => editors.get(state)?.dirty(), render(context) {
    const entry = context.view === 'board' ? editor(context) : editors.get(context.state)
    if (!entry) return null
    if (context.view === 'board' && !entry.isOpen()) entry.open()
    if (context.view !== 'board' && entry.isOpen()) entry.close()
    return entry.view()
  } })
  loam.places.files.viewer.add({ id: 'document', slot: 'projection', render: ({ root, path }) => boardProjection(root, path) })
  return () => { clearInterval(poll); mounted.clear(); for (const entry of active) entry.dispose() }
}
