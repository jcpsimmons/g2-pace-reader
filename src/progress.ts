import type { BookProgress } from './library'
import type { Reader } from './reader'

export const SAVE_EVERY_WORDS = 10

export function shouldSaveProgress(input: {
  force: boolean
  complete: boolean
  index: number
  lastSavedIndex: number
}): boolean {
  if (input.force || input.complete) return true
  return input.index - input.lastSavedIndex >= SAVE_EVERY_WORDS
}

export function progressFromReader(reader: Reader): BookProgress {
  const state = reader.getState()
  return {
    snapshot: reader.serialize(),
    index: state.index,
    wpm: state.wpm,
    complete: state.complete,
  }
}

export async function persistReaderProgress(
  reader: Reader,
  lastSavedIndex: number,
  force: boolean,
  save: (progress: BookProgress) => Promise<void>,
): Promise<number> {
  const state = reader.getState()
  if (!shouldSaveProgress({ force, complete: state.complete, index: state.index, lastSavedIndex })) {
    return lastSavedIndex
  }
  await save(progressFromReader(reader))
  return state.index
}
