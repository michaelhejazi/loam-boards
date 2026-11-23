let currentOwner = { name: 'You', accepts: [] }
export function setOwner(value) { currentOwner = value }
export const owner = () => currentOwner
export const isOwner = id => currentOwner.accepts.includes(id)

let generalPath
export function setGeneralPath(path) { generalPath = path }

export function installation() {
  const config = globalThis.LOAM_INSTALLATION ?? {}
  const inferred = generalPath && generalPath.includes('/') ? generalPath.slice(0, generalPath.lastIndexOf('/')) : ''
  const boards = config.boards || inferred || 'Boards'
  return {
    boards,
    generalBoard: generalPath ?? boards + '/general.md',
    chatBoard: boards + '/Chat board.md',
  }
}
