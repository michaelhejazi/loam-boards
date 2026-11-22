import { createEditor } from './editor.js'
import { boardProjection } from './document.js'
import { setOwner } from './installation.js'

export async function activate(loam) {
  const { h, icon, settingsRow } = loam.ui
  const editors = new WeakMap()
  const active = new Set()
  const owner = await loam.data.request('GET', '/owner')
  setOwner(owner)
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
    return entry
  }
  loam.places.thread.header.action.add({ id: 'open', slot: 'control', render(context) {
    const open = event => { context.closeMenu(); context.selectView('board'); editor(context).open(event) }
    if (context.placement === 'menu') return settingsRow({ title: 'Board', lead: icon.list(18), onclick: open })
    return h('button', { type: 'button', class: 'iconbtn ghost', title: 'Board', 'aria-label': 'Board', 'data-plugin': 'boards', onclick: open }, icon.list(18))
  } })
  loam.places.thread.header.action.add({ id: 'cards', view: 'board', render(context) {
    const entry = context.view === 'board' ? editor(context) : editors.get(context.state)
    if (!entry) return null
    if (context.view === 'board' && !entry.isOpen()) entry.open()
    if (context.view !== 'board' && entry.isOpen()) entry.close()
    return entry.view()
  } })
  loam.places.files.viewer.add({ id: 'document', slot: 'projection', render: ({ root, path }) => boardProjection(root, path) })
  return () => { for (const entry of active) entry.dispose() }
}
