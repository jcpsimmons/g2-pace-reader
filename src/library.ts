export type BookProgress = {
  snapshot: string
  index: number
  wpm: number
  complete: boolean
}

export type BookChapter = {
  title: string
  startIndex: number
  wordCount: number
  frontMatter: boolean
}

export type Book = {
  id: string
  title: string
  author: string
  originalFilename: string
  text: string
  chapters: BookChapter[]
  totalWords: number
  addedAt: number
  updatedAt: number
  progress: BookProgress
}

export type BookInput = Pick<Book, 'title' | 'author' | 'originalFilename' | 'text'> & { chapters?: BookChapter[] }
export type LibraryStore = { get(id: string): Promise<Book | undefined>; put(book: Book): Promise<void>; list(): Promise<Book[]>; delete(id: string): Promise<void> }

export async function contentId(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('')
  }
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 16777619)
  return `fnv-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function createLibrary(store?: LibraryStore) {
  const backend = store ?? (typeof indexedDB !== 'undefined' ? resilientStore(indexedDbStore(), memoryStore()) : memoryStore())
  let mutationQueue: Promise<unknown> = Promise.resolve()
  const mutate = <T>(operation: () => Promise<T>) => {
    const pending = mutationQueue.then(operation, operation)
    mutationQueue = pending.then(() => undefined, () => undefined)
    return pending
  }
  return {
    add(input: BookInput): Promise<Book> {
      return mutate(async () => {
        const id = await contentId(input.text)
        const now = Date.now()
        const prior = await backend.get(id)
        const book: Book = {
          ...input,
          id,
          chapters: input.chapters ?? prior?.chapters ?? [],
          totalWords: wordCount(input.text),
          addedAt: prior?.addedAt ?? now,
          updatedAt: now,
          progress: prior?.progress ?? { snapshot: '', index: 0, wpm: 200, complete: false },
        }
        await backend.put(book)
        return book
      })
    },
    async list() {
      await mutationQueue
      return (await backend.list()).map(normalizeBook).sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async get(id: string) {
      await mutationQueue
      const book = await backend.get(id)
      return book ? normalizeBook(book) : undefined
    },
    updateProgress(id: string, progress: BookProgress) {
      return mutate(async () => {
        const book = await backend.get(id)
        if (!book) throw new Error(`Book not found: ${id}`)
        const updated = { ...book, progress, updatedAt: Date.now() }
        await backend.put(updated)
        return updated
      })
    },
    delete(id: string) {
      return mutate(() => backend.delete(id))
    },
  }
}

function normalizeBook(book: Book): Book {
  return { ...book, chapters: book.chapters ?? [] }
}
function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0 }
function memoryStore(): LibraryStore {
  const data = new Map<string, Book>()
  return {
    get: async id => data.get(id),
    put: async book => { data.set(book.id, book) },
    list: async () => [...data.values()],
    delete: async id => { data.delete(id) },
  }
}
function resilientStore(primary: LibraryStore, fallback: LibraryStore): LibraryStore {
  let useFallback = false
  return {
    async get(id) {
      if (useFallback) return fallback.get(id)
      try {
        const book = await primary.get(id)
        if (book) await fallback.put(book)
        return book
      } catch {
        useFallback = true
        return fallback.get(id)
      }
    },
    async list() {
      if (useFallback) return fallback.list()
      try {
        const books = await primary.list()
        await Promise.all(books.map(book => fallback.put(book)))
        return books
      } catch {
        useFallback = true
        return fallback.list()
      }
    },
    async put(book) {
      await fallback.put(book)
      if (useFallback) return
      try { await primary.put(book) } catch { useFallback = true }
    },
    async delete(id) {
      await fallback.delete(id)
      if (useFallback) return
      try { await primary.delete(id) } catch { useFallback = true }
    },
  }
}
function indexedDbStore(): LibraryStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pace-reader-library', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const run = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest) => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('books', mode)
      const request = operation(transaction.objectStore('books'))
      let result: T
      request.onsuccess = () => { result = request.result as T }
      transaction.oncomplete = () => { db.close(); resolve(result) }
      transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error) }
      transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Library transaction aborted')) }
    })
  }
  return {
    get: id => run<Book | undefined>('readonly', store => store.get(id)),
    list: () => run<Book[]>('readonly', store => store.getAll()),
    put: book => run('readwrite', store => store.put(book)).then(() => undefined),
    delete: id => run('readwrite', store => store.delete(id)).then(() => undefined),
  }
}
