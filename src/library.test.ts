import { describe, expect, it } from 'vitest'
import { contentId, createLibrary, type LibraryStore } from './library'
import { createReader } from './reader'

describe('book library', () => {
  it('uses deterministic content IDs and stores metadata', async () => {
    expect(await contentId('same')).toBe(await contentId('same'))
    const library = createLibrary()
    const book = await library.add({ title: 'Title', author: 'Author', originalFilename: 'a.txt', text: 'one two three' })
    expect(book).toMatchObject({ title: 'Title', totalWords: 3, progress: { index: 0, wpm: 200, complete: false } })
    expect(await library.get(book.id)).toEqual(book)
  })
  it('updates progress, lists newest first, and deletes', async () => {
    const library = createLibrary(); const a = await library.add({ title: 'A', author: '', originalFilename: 'a', text: 'a' }); const b = await library.add({ title: 'B', author: '', originalFilename: 'b', text: 'b' })
    const saved = await library.updateProgress(a.id, { snapshot: '{"index":1}', index: 1, wpm: 225, complete: true })
    expect(saved.progress.complete).toBe(true); expect((await library.list())[0].id).toBe(a.id)
    await library.delete(b.id); expect(await library.get(b.id)).toBeUndefined()
  })
  it('restores the exact word and WPM for each book', async () => {
    const library = createLibrary()
    const first = await library.add({ title: 'First', author: 'A', originalFilename: 'first.epub', text: 'zero one two three' })
    const second = await library.add({ title: 'Second', author: 'B', originalFilename: 'second.epub', text: 'alpha beta gamma delta' })
    const firstReader = createReader(first.text, { wpm: 225 })
    firstReader.tick(); firstReader.tick(); firstReader.actions.pause()
    await library.updateProgress(first.id, { snapshot: firstReader.serialize(), index: 2, wpm: 225, complete: false })
    const secondReader = createReader(second.text, { wpm: 125 })
    secondReader.tick(); secondReader.actions.pause()
    await library.updateProgress(second.id, { snapshot: secondReader.serialize(), index: 1, wpm: 125, complete: false })

    const restoredFirst = await library.get(first.id)
    const restoredSecond = await library.get(second.id)
    expect(createReader(restoredFirst!.text, { resume: restoredFirst!.progress.snapshot }).getState()).toMatchObject({ index: 2, wpm: 225 })
    expect(createReader(restoredSecond!.text, { resume: restoredSecond!.progress.snapshot }).getState()).toMatchObject({ index: 1, wpm: 125 })
  })
  it('uses the injected backend without requiring IndexedDB', async () => {
    const data = new Map()
    const store: LibraryStore = {
      get: async id => data.get(id),
      put: async book => { data.set(book.id, book) },
      list: async () => [...data.values()],
      delete: async id => { data.delete(id) },
    }
    const library = createLibrary(store)
    const book = await library.add({ title: 'Offline', author: 'Reader', originalFilename: 'offline.epub', text: 'kept on device' })
    expect((await library.list()).map(item => item.id)).toEqual([book.id])
  })
  it('serializes progress writes and deletion', async () => {
    const library = createLibrary()
    const book = await library.add({ title: 'Queue', author: 'Reader', originalFilename: 'queue.epub', text: 'one two three' })
    const first = library.updateProgress(book.id, { snapshot: '{"index":1}', index: 1, wpm: 200, complete: false })
    const second = library.updateProgress(book.id, { snapshot: '{"index":2}', index: 2, wpm: 250, complete: true })
    await Promise.all([first, second])
    expect((await library.get(book.id))?.progress).toMatchObject({ index: 2, wpm: 250, complete: true })
    await Promise.all([library.updateProgress(book.id, { snapshot: '{"index":0}', index: 0, wpm: 100, complete: false }), library.delete(book.id)])
    expect(await library.get(book.id)).toBeUndefined()
  })
})
