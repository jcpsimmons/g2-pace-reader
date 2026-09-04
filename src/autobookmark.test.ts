import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createLibrary } from './library'

const companion = readFileSync(new URL('./companion.ts', import.meta.url), 'utf8')
import { persistReaderProgress, SAVE_EVERY_WORDS } from './progress'
import { createReader } from './reader'

async function autoSave(library: ReturnType<typeof createLibrary>, bookId: string, reader: ReturnType<typeof createReader>, lastSavedIndex: number, force: boolean) {
  return persistReaderProgress(reader, lastSavedIndex, force, progress => library.updateProgress(bookId, progress).then(() => undefined))
}

describe('per-book auto bookmark', () => {
  it('has no bookmark control in the companion UI', () => {
    expect(companion).not.toMatch(/bookmark/i)
  })

  it('saves each book from the reading persist path and restores its own word and WPM', async () => {
    const library = createLibrary()
    const first = await library.add({ title: 'First', author: 'A', originalFilename: 'first.epub', text: 'zero one two three four five six seven eight nine ten eleven' })
    const second = await library.add({ title: 'Second', author: 'B', originalFilename: 'second.epub', text: 'alpha beta gamma delta epsilon zeta eta theta' })

    const firstReader = createReader(first.text, { wpm: 225 })
    firstReader.tick()
    firstReader.tick()
    firstReader.actions.pause()
    await autoSave(library, first.id, firstReader, -1, true)

    const secondReader = createReader(second.text, { wpm: 125 })
    secondReader.tick()
    secondReader.actions.pause()
    await autoSave(library, second.id, secondReader, -1, true)

    const restoredFirst = await library.get(first.id)
    const restoredSecond = await library.get(second.id)
    expect(createReader(restoredFirst!.text, { resume: restoredFirst!.progress.snapshot }).getState()).toMatchObject({ index: 2, wpm: 225 })
    expect(createReader(restoredSecond!.text, { resume: restoredSecond!.progress.snapshot }).getState()).toMatchObject({ index: 1, wpm: 125 })
  })

  it('auto-saves after enough reading ticks without a bookmark action', async () => {
    const library = createLibrary()
    const words = Array.from({ length: SAVE_EVERY_WORDS + 4 }, (_, i) => `w${i}`).join(' ')
    const book = await library.add({ title: 'Long', author: 'C', originalFilename: 'long.epub', text: words })
    const reader = createReader(book.text, { wpm: 250 })
    let lastSaved = -1
    reader.tick()
    lastSaved = await autoSave(library, book.id, reader, lastSaved, false)
    expect((await library.get(book.id))?.progress.index).toBe(0)
    expect(lastSaved).toBe(-1)

    for (let i = 0; i < SAVE_EVERY_WORDS; i += 1) reader.tick()
    lastSaved = await autoSave(library, book.id, reader, lastSaved, false)
    const stored = await library.get(book.id)
    expect(stored?.progress).toMatchObject({ index: SAVE_EVERY_WORDS + 1, wpm: 250, complete: false })
    expect(createReader(stored!.text, { resume: stored!.progress.snapshot }).getState()).toMatchObject({
      index: SAVE_EVERY_WORDS + 1,
      wpm: 250,
    })
  })
})
