let currentOwner = { name: 'You', accepts: [] }
export function setOwner(value) { currentOwner = value }
export const owner = () => currentOwner
export const isOwner = id => currentOwner.accepts.includes(id)

let generalPath
export function setGeneralPath(path) { generalPath = path }

export function installation() {
  const config = globalThis.LOAM_INSTALLATION ?? {}
  const boards = config.boards || 'Boards'
  return { boards, generalBoard: generalPath ?? boards + '/general.md' }
}
