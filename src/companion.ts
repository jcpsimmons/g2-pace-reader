import { parseEpub } from './epub'
import { createLibrary, type Book, type BookProgress } from './library'

type MirrorUpdate = {
  title?: string
  text?: string
  progress?: string
  wpm?: number | string
  time?: string
}

type CompanionApi = {
  updateMirror: (update: MirrorUpdate) => void
  setReadingState: (state: 'ready' | 'reading' | 'paused' | 'complete') => void
  setDraft: (text: string, wpm: number, savedLabel?: string) => void
  setSavedStatus: (label: string) => void
  setLibraryStatus: (label: string, error?: boolean) => void
  setDeviceConnection: (state: 'connected' | 'disconnected' | 'unknown') => void
  saveBookProgress: (bookId: string, progress: BookProgress) => Promise<void>
  getState: () => { text: string; wpm: number; wordCount: number; estimatedMinutes: number }
  mount: () => void
}

declare global {
  interface Window {
    PaceReaderCompanion?: CompanionApi
  }
}

const DRAFT_STORAGE_KEY = 'pace-reader.saved-reading'
const MAX_EPUB_BYTES = 30 * 1024 * 1024
const library = createLibrary()
let activeBookId: string | null = null
let libraryRenderQueued = false
let libraryRenderGeneration = 0
let bridgeReady = false
let pendingStart: Record<string, unknown> | null = null

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function formatTime(count: number, wpm: number) {
  const minutes = count / wpm
  if (!count) return '0 min'
  if (minutes < 1) return '< 1 min'
  return `${Math.ceil(minutes)} min`
}

function progressPercent(book: Book) {
  if (book.progress.complete) return 100
  if (book.totalWords <= 1) return 0
  return Math.max(0, Math.min(100, Math.round((book.progress.index / (book.totalWords - 1)) * 100)))
}

function bookAction(book: Book) {
  if (book.progress.complete) return 'Read again'
  if (book.progress.index > 0) return 'Continue'
  return 'Start reading'
}

function mountCompanion() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app || app.dataset.paceReaderMounted === 'true') return
  app.dataset.paceReaderMounted = 'true'

  app.innerHTML = `
    <main class="companion-shell">
      <header class="app-header">
        <div>
          <p class="app-kicker">Even G2</p>
          <h1>Pace Reader</h1>
        </div>
        <span class="connection-status"><span aria-hidden="true"></span>Glasses</span>
      </header>

      <section class="continue-section" aria-labelledby="continueTitle">
        <div class="section-heading">
          <h2 id="continueTitle">Continue reading</h2>
          <span id="libraryCount" class="muted-label">0 books</span>
        </div>
        <div id="continueBook"></div>
      </section>

      <section class="library-section" aria-labelledby="libraryTitle">
        <div class="section-heading">
          <h2 id="libraryTitle">Library</h2>
          <button id="importBook" class="icon-button" type="button" aria-label="Import EPUB">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <input id="epubFile" class="sr-only" type="file" accept=".epub,application/epub+zip" />
        </div>
        <p id="libraryStatus" class="library-status" role="status"></p>
        <div id="bookList" class="book-list"></div>
      </section>

      <section class="control-card" aria-labelledby="paceTitle">
        <div class="section-heading pace-heading">
          <div><h2 id="paceTitle">Reading pace</h2><p>Use the glasses to adjust while reading</p></div>
          <strong><span id="wpmValue">200</span> WPM</strong>
        </div>
        <label class="sr-only" for="wpmSlider">Words per minute</label>
        <input id="wpmSlider" type="range" min="100" max="300" step="25" value="200" />
        <div class="range-labels" aria-hidden="true"><span>100</span><span>200</span><span>300</span></div>
      </section>

      <details class="quick-read">
        <summary>Quick read pasted text <span aria-hidden="true">+</span></summary>
        <div class="quick-read-body">
          <label for="readingText">Text</label>
          <textarea id="readingText" placeholder="Paste an article or notes…" spellcheck="true"></textarea>
          <div class="reading-meta"><span id="wordCount">0 words</span><span id="estimatedTime">0 min</span><span id="savedStatus" role="status">Not saved</span></div>
          <button id="startReading" class="secondary-button" type="button">Start quick read</button>
        </div>
      </details>

      <section class="mirror-card" aria-labelledby="mirrorTitle">
        <div class="mirror-topline"><span id="mirrorState" class="state-label">Ready</span><span id="mirrorProgress">0 / 0</span></div>
        <h2 id="mirrorTitle">Ready for a book</h2>
        <p id="mirrorText">Import an EPUB or continue from your library.</p>
        <div class="mirror-details"><span id="mirrorWpm">200 WPM</span><span id="mirrorTime">0 min</span></div>
      </section>

      <aside class="safety-note"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.8 8.7 7 10 4.2-1.3 7-5.4 7-10V6l-7-3Z"/><path d="M12 8v5M12 16.5v.5"/></svg><p><strong>Read while stationary.</strong> Stop if you feel eye strain, dizziness, or reduced awareness.</p></aside>
      <p class="privacy-note">Books stay on this device. No account, analytics, or network access.</p>
    </main>`

  const textInput = document.querySelector<HTMLTextAreaElement>('#readingText')!
  const slider = document.querySelector<HTMLInputElement>('#wpmSlider')!
  const savedStatus = document.querySelector<HTMLSpanElement>('#savedStatus')!
  const fileInput = document.querySelector<HTMLInputElement>('#epubFile')!
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function renderMeta() {
    const count = words(textInput.value)
    const wpm = Number(slider.value)
    document.querySelector('#wordCount')!.textContent = `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
    document.querySelector('#estimatedTime')!.textContent = formatTime(count, wpm)
    document.querySelector('#wpmValue')!.textContent = String(wpm)
    document.querySelector('#mirrorWpm')!.textContent = `${wpm} WPM`
    document.querySelector('#mirrorTime')!.textContent = formatTime(count, wpm)
    slider.style.setProperty('--range-progress', `${(wpm - 100) / 2}%`)
  }

  textInput.addEventListener('input', () => {
    renderMeta()
    savedStatus.textContent = 'Saving…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE_KEY, textInput.value)
      savedStatus.textContent = 'Saved'
    }, 450)
  })
  slider.addEventListener('input', renderMeta)
  document.querySelector('#startReading')!.addEventListener('click', () => {
    if (!textInput.value.trim()) {
      textInput.focus()
      savedStatus.textContent = 'Add text to begin'
      return
    }
    activeBookId = null
    localStorage.setItem(DRAFT_STORAGE_KEY, textInput.value)
    startWhenReady(api.getState())
  })
  document.querySelector('#importBook')!.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) void importBook(file)
    fileInput.value = ''
  })

  const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
  if (saved) {
    textInput.value = saved
    savedStatus.textContent = 'Saved'
  }
  renderMeta()
  void renderLibrary()
}

async function importBook(file: File) {
  setLibraryStatus('Importing…')
  try {
    if (!file.name.toLowerCase().endsWith('.epub')) throw new Error('Choose an EPUB file')
    if (file.size > MAX_EPUB_BYTES) throw new Error('EPUB must be smaller than 30 MB')
    const parsed = parseEpub(await file.arrayBuffer())
    if (!parsed.text.trim()) throw new Error('No readable text was found in this EPUB')
    const fallbackTitle = file.name.replace(/\.epub$/i, '') || 'Untitled book'
    const book = await library.add({
      title: parsed.title || fallbackTitle,
      author: parsed.author || 'Unknown author',
      originalFilename: file.name,
      text: parsed.text,
    })
    setLibraryStatus(`${book.title} added`)
    await renderLibrary()
  } catch (error) {
    setLibraryStatus(error instanceof Error ? error.message : 'EPUB could not be imported', true)
  }
}

async function renderLibrary() {
  const list = document.querySelector<HTMLDivElement>('#bookList')
  const continueSlot = document.querySelector<HTMLDivElement>('#continueBook')
  const count = document.querySelector<HTMLSpanElement>('#libraryCount')
  if (!list || !continueSlot || !count) return
  const generation = ++libraryRenderGeneration
  const books = await library.list()
  if (generation !== libraryRenderGeneration) return
  count.textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'}`
  list.replaceChildren()
  continueSlot.replaceChildren()

  if (!books.length) {
    const empty = document.createElement('button')
    empty.type = 'button'
    empty.className = 'empty-library'
    empty.innerHTML = '<span class="empty-icon" aria-hidden="true">+</span><strong>Add your first EPUB</strong><small>Choose a book from Files. It stays on this device.</small>'
    empty.addEventListener('click', () => document.querySelector<HTMLInputElement>('#epubFile')?.click())
    continueSlot.append(empty)
    return
  }

  continueSlot.append(createContinueCard(books[0]))
  for (const book of books) list.append(createBookRow(book))
}

function createContinueCard(book: Book) {
  const percent = progressPercent(book)
  const card = document.createElement('article')
  card.className = 'continue-card'
  const cover = document.createElement('div')
  cover.className = 'book-cover'
  cover.setAttribute('aria-hidden', 'true')
  cover.textContent = book.title.slice(0, 1).toUpperCase()
  const content = document.createElement('div')
  content.className = 'continue-content'
  const title = document.createElement('h3')
  title.textContent = book.title
  const author = document.createElement('p')
  author.textContent = book.author
  const meta = document.createElement('div')
  meta.className = 'book-meta'
  const remaining = Math.max(0, book.totalWords - book.progress.index - 1)
  meta.textContent = `${percent}% · ${formatTime(remaining, book.progress.wpm)} left`
  const progress = createProgress(percent, book.title)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'primary-button'
  button.textContent = bookAction(book)
  button.addEventListener('click', () => void startBook(book))
  content.append(title, author, meta, progress, button)
  card.append(cover, content)
  return card
}

function createBookRow(book: Book) {
  const percent = progressPercent(book)
  const row = document.createElement('article')
  row.className = `book-row${activeBookId === book.id ? ' active-book' : ''}`
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'book-open'
  const copy = document.createElement('span')
  copy.className = 'book-copy'
  const title = document.createElement('strong')
  title.textContent = book.title
  const meta = document.createElement('small')
  meta.textContent = `${book.author} · ${percent}%`
  copy.append(title, meta)
  const chevron = document.createElement('span')
  chevron.className = 'chevron'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.textContent = '›'
  open.append(copy, chevron)
  open.addEventListener('click', () => void startBook(book))
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'delete-button'
  remove.setAttribute('aria-label', `Delete ${book.title}`)
  remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>'
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Delete “${book.title}” and its saved place?`)) return
    await library.delete(book.id)
    if (activeBookId === book.id) {
      activeBookId = null
      window.dispatchEvent(new CustomEvent('pace-reader:book-deleted', { detail: { bookId: book.id } }))
    }
    setLibraryStatus(`${book.title} deleted`)
    await renderLibrary()
  })
  row.append(open, remove)
  return row
}

function createProgress(percent: number, title: string) {
  const track = document.createElement('div')
  track.className = 'progress-track'
  track.setAttribute('role', 'progressbar')
  track.setAttribute('aria-valuemin', '0')
  track.setAttribute('aria-valuemax', '100')
  track.setAttribute('aria-valuenow', String(percent))
  track.setAttribute('aria-label', `${title} reading progress`)
  const fill = document.createElement('span')
  fill.style.width = `${percent}%`
  track.append(fill)
  return track
}

async function startBook(book: Book) {
  activeBookId = book.id
  const quickRead = document.querySelector<HTMLDetailsElement>('.quick-read')
  if (quickRead) quickRead.open = false
  const slider = document.querySelector<HTMLInputElement>('#wpmSlider')
  const wpm = book.progress.wpm || Number(slider?.value ?? 200)
  if (slider) {
    slider.value = String(wpm)
    slider.dispatchEvent(new Event('input'))
  }
  startWhenReady({
    text: book.text,
    wpm,
    bookId: book.id,
    bookTitle: book.title,
    resume: book.progress.complete ? undefined : book.progress.snapshot,
  })
  await renderLibrary()
}

function startWhenReady(detail: Record<string, unknown>) {
  if (!bridgeReady) {
    pendingStart = detail
    setLibraryStatus('Connecting to the Even app…')
    return
  }
  api.setReadingState('reading')
  window.dispatchEvent(new CustomEvent('pace-reader:start', { detail }))
}

function setLibraryStatus(message: string, error = false) {
  const status = document.querySelector<HTMLElement>('#libraryStatus')
  if (!status) return
  status.textContent = message
  status.classList.toggle('error', error)
}

function queueLibraryRender() {
  if (libraryRenderQueued) return
  libraryRenderQueued = true
  window.setTimeout(() => {
    libraryRenderQueued = false
    void renderLibrary()
  }, 500)
}

const api: CompanionApi = {
  mount: mountCompanion,
  getState: () => {
    const input = document.querySelector<HTMLTextAreaElement>('#readingText')
    const slider = document.querySelector<HTMLInputElement>('#wpmSlider')
    const text = input?.value ?? ''
    const wpm = Number(slider?.value ?? 200)
    const wordCount = words(text)
    return { text, wpm, wordCount, estimatedMinutes: wordCount / wpm }
  },
  setReadingState: state => {
    const label = document.querySelector('#mirrorState')
    if (label) {
      label.textContent = state === 'reading' ? 'On glasses' : state.charAt(0).toUpperCase() + state.slice(1)
      label.className = `state-label state-${state}`
    }
  },
  setDraft: (text, wpm, savedLabel = 'Saved') => {
    const input = document.querySelector<HTMLTextAreaElement>('#readingText')
    const slider = document.querySelector<HTMLInputElement>('#wpmSlider')
    if (!input || !slider) return
    input.value = text
    slider.value = String(Math.min(300, Math.max(100, wpm)))
    input.dispatchEvent(new Event('input'))
    slider.dispatchEvent(new Event('input'))
    api.setSavedStatus(savedLabel)
  },
  setSavedStatus: label => {
    const status = document.querySelector('#savedStatus')
    if (status) status.textContent = label
  },
  setLibraryStatus,
  setDeviceConnection: state => {
    const status = document.querySelector<HTMLElement>('.connection-status')
    if (!status) return
    status.classList.toggle('connected', state === 'connected')
    status.classList.toggle('disconnected', state === 'disconnected')
    status.lastChild!.textContent = state === 'connected' ? 'Connected' : state === 'disconnected' ? 'No glasses' : 'Glasses'
  },
  saveBookProgress: async (bookId, progress) => {
    await library.updateProgress(bookId, progress)
    queueLibraryRender()
  },
  updateMirror: update => {
    const fields: Record<string, string | undefined> = {
      mirrorTitle: update.title,
      mirrorText: update.text,
      mirrorProgress: update.progress,
      mirrorWpm: update.wpm === undefined ? undefined : `${update.wpm} WPM`,
      mirrorTime: update.time,
    }
    Object.entries(fields).forEach(([id, value]) => {
      if (value === undefined) return
      const node = document.getElementById(id)
      if (node) node.textContent = value
    })
  },
}

window.PaceReaderCompanion = api
window.addEventListener('pace-reader:bridge-ready', () => {
  bridgeReady = true
  if (pendingStart) {
    const detail = pendingStart
    pendingStart = null
    setLibraryStatus('')
    startWhenReady(detail)
  }
})
mountCompanion()
window.dispatchEvent(new Event('pace-reader:ready'))

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot) {
  new MutationObserver(() => {
    if (!appRoot.querySelector('.companion-shell')) {
      delete appRoot.dataset.paceReaderMounted
      mountCompanion()
    }
  }).observe(appRoot, { childList: true })
}
