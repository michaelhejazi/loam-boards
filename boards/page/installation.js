let currentOwner = { name: 'You', accepts: [] }
export function setOwner(value) { currentOwner = value }
export const owner = () => currentOwner
export const isOwner = id => currentOwner.accepts.includes(id)

export function installation() {
  const config = globalThis.LOAM_INSTALLATION ?? {}
  const inbox = config.inbox || 'Inbox'
  return { boards: config.boards ?? inbox + '/boards', generalBoard: config.generalBoard ?? inbox + '/boards/general.md' }
}
