import { layoutPixels } from './scale.js'

// A touch scrolls normally until the hold lifts a card.
export function boardDrag({ drop, announce }) {
  let active = null
  function cancel() {
    const a = active
    if (!a) return
    active = null; clearTimeout(a.timer); cancelAnimationFrame(a.frame)
    a.row.classList.remove('is-dragging'); a.ghost?.remove(); a.indicator?.remove()
    document.removeEventListener('touchmove', heldTouch)
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', finish)
    document.removeEventListener('pointercancel', cancel)
    document.removeEventListener('keydown', key, true)
  }
  function heldTouch(e) { if (active?.lifted && e.cancelable) e.preventDefault() }
  function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); announce('Move cancelled.') } }
  function lift() {
    const a = active
    if (!a || !a.row.isConnected) return cancel()
    a.lifted = true
    a.row.setPointerCapture?.(a.pointer)
    const box = a.row.getBoundingClientRect()
    a.box = box
    a.ghost = a.row.cloneNode(true)
    a.ghost.classList.add('tt-board-ghost'); a.ghost.setAttribute('aria-hidden', 'true')
    a.ghost.removeAttribute('data-board-index')
    Object.assign(a.ghost.style, { width: `${layoutPixels(box.width - 8)}px`, left: `${layoutPixels(box.left + 4)}px`, top: `${layoutPixels(box.top)}px` })
    a.panel.append(a.ghost)
    if (a.touch && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      a.ghost.animate?.([{ scale: '.98' }, { scale: '1.025' }, { scale: '1' }], { duration: 220, easing: 'ease-out' })
    }
    a.row.classList.add('is-dragging')
    a.indicator = document.createElement('div'); a.indicator.className = 'tt-board-drop'
    a.indicator.setAttribute('aria-hidden', 'true'); a.panel.append(a.indicator)
    announce('Moving item. Drop in a list; Escape cancels.')
    paint()
  }
  function paint() {
    const a = active
    if (!a?.lifted) return
    if (!a.row.isConnected) return cancel()
    // The page reconciles on live thread updates too. Restore transient drag
    // decorations after such a render without making them part of file state.
    a.row.classList.add('is-dragging')
    if (!a.ghost.isConnected) a.panel.append(a.ghost)
    if (!a.indicator.isConnected) a.panel.append(a.indicator)
    const viewport = a.scroller.getBoundingClientRect()
    const dx = Math.max(viewport.left - a.box.left, Math.min(viewport.right - a.box.right, a.x - a.startX))
    a.ghost.style.transform = `translate(${layoutPixels(dx)}px, ${layoutPixels(a.y - a.startY - a.box.height / 2 - 8)}px) rotate(.5deg)`
    const inPanel = a.x >= viewport.left && a.x <= viewport.right && a.y >= viewport.top && a.y <= viewport.bottom
    a.target = null; a.indicator.hidden = !inPanel
    if (inPanel) {
      const sections = [...a.scroller.querySelectorAll('[data-board-section]')]
      const section = sections.find((n) => n.getBoundingClientRect().bottom >= a.y) ?? sections.at(-1)
      if (section) {
        const rows = [...section.querySelectorAll('[data-board-index]')].filter((n) => n !== a.row)
        const next = rows.find((n) => { const r = n.getBoundingClientRect(); return a.y < r.top + r.height / 2 })
        const end = (section.querySelector('.tt-board-list-end') ?? section).getBoundingClientRect()
        const rect = (next ?? rows.at(-1))?.getBoundingClientRect()
        const y = next ? rect.top : rect ? rect.bottom : end.top
        Object.assign(a.indicator.style, { left: `${layoutPixels(viewport.left + 8)}px`, top: `${layoutPixels(Math.max(viewport.top, Math.min(viewport.bottom - 3, y)))}px`, width: `${layoutPixels(viewport.width - 16)}px` })
        a.target = { section: section.dataset.boardSection, before: next ? Number(next.dataset.boardIndex) : null }
      }
      const speed = a.y < viewport.top + 44 ? -8 : a.y > viewport.bottom - 44 ? 8 : 0
      if (speed) a.scroller.scrollTop += speed
    }
    a.frame = requestAnimationFrame(paint)
  }
  function move(e) {
    const a = active
    if (!a || e.pointerId !== a.pointer) return
    a.x = e.clientX; a.y = e.clientY
    const distance = Math.hypot(a.x - a.startX, a.y - a.startY)
    if (!a.lifted && distance > 7) {
      if (a.touch) { cancel(); return }
      lift()
    }
    if (a.lifted) e.preventDefault()
  }
  function finish(e) {
    const a = active
    if (!a || e.pointerId !== a.pointer) return
    if (a.lifted) { cancelAnimationFrame(a.frame); a.x = e.clientX; a.y = e.clientY; paint() }
    if (a.lifted) {
      const suppress = e => { e.preventDefault(); e.stopImmediatePropagation() }
      document.addEventListener('click', suppress, { once: true, capture: true })
      setTimeout(() => document.removeEventListener('click', suppress, true), 0)
    }
    const target = a.lifted && a.target
    cancel()
    if (target) drop(a.index, target.section, target.before, a.base)
  }
  return {
    cancel,
    start(e, index, base) {
      if (e.button !== 0 || active) return
      const row = e.currentTarget.closest('.tt-board-item'), panel = row.closest('.tt-board')
      active = { row, panel, scroller: panel.querySelector('.tt-board-items'), index, base, pointer: e.pointerId,
        touch: e.pointerType !== 'mouse', startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY }
      if (active.touch) document.addEventListener('touchmove', heldTouch, { passive: false })
      document.addEventListener('pointermove', move, { passive: false })
      document.addEventListener('pointerup', finish)
      document.addEventListener('pointercancel', cancel)
      document.addEventListener('keydown', key, true)
      if (active.touch) active.timer = setTimeout(lift, 380)
    },
  }
}
