import { createEditor } from './editor.js'
import { boardProjection } from './document.js'
import { setOwner } from './installation.js'

export async function activate(loam) {
  const { h, icon, settingsRow } = loam.ui
  const editors = new WeakMap()
  let visible = null
  const owner = await loam.data.request('GET', '/owner')
  setOwner(owner)
  loam.ui.styles.add('page/style.css')
  function editor({ thread, state }) {
    let entry = editors.get(state)
    if (!entry) {
      entry = createEditor({ thread, ui: loam.ui, data: loam.data,
        onOpen() {
          if (visible !== entry) visible?.close()
          visible = entry
        },
        onClose() { if (visible === entry) visible = null },
      })
      editors.set(state, entry)
    }
    return entry
  }
  loam.places.thread.header.action.add({ id: 'open', slot: 'control', render(context) {
    const open = event => { context.closeMenu(); editor(context).open(event) }
    if (context.placement === 'menu') return settingsRow({ title: 'Board', lead: icon.list(18), onclick: open })
    return h('button', { type: 'button', class: 'iconbtn ghost', title: 'Board', 'aria-label': 'Board', 'data-plugin': 'boards', onclick: open }, icon.list(18))
  } })
  loam.places.thread.header.action.add({ id: 'cards', render: context => editors.get(context.state)?.view() ?? null })
  loam.places.files.viewer.add({ id: 'document', slot: 'projection', render: ({ root, path }) => boardProjection(root, path) })
  return () => visible?.dispose()
}
