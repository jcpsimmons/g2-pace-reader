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
  getState: () => { text: string; wpm: number; wordCount: number; estimatedMinutes: number }
  mount: () => void
}

declare global {
  interface Window {
    PaceReaderCompanion?: CompanionApi
  }
}

const STORAGE_KEY = 'pace-reader.saved-reading'
function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function formatTime(count: number, wpm: number) {
  const minutes = count / wpm
  if (!count) return '0 min'
  if (minutes < 1) return '< 1 min'
  return `${Math.ceil(minutes)} min`
}

function mountCompanion() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app || app.dataset.paceReaderMounted === 'true') return
  app.dataset.paceReaderMounted = 'true'

  app.innerHTML = `
    <main class="companion-shell">
      <header class="app-header">
        <div class="brand-mark" aria-hidden="true">PR</div>
        <div><p class="eyebrow">PACE READER</p><h1>Read at your pace.</h1></div>
        <span class="live-dot" title="Connected to glasses"><span></span><span class="sr-only">Connected</span></span>
      </header>

      <section class="compose-card" aria-labelledby="compose-title">
        <div class="section-heading"><div><p class="eyebrow">NEW READING</p><h2 id="compose-title">What are you reading?</h2></div><span id="savedStatus" class="saved-status" role="status">Not saved yet</span></div>
        <label class="sr-only" for="readingText">Paste text to read</label>
        <textarea id="readingText" placeholder="Paste an article, notes, or anything you want to read…" spellcheck="true"></textarea>
        <div class="reading-meta"><span id="wordCount">0 words</span><span aria-hidden="true">•</span><span id="estimatedTime">0 min</span></div>
      </section>

      <section class="pace-card" aria-labelledby="pace-title">
        <div class="section-heading"><div><p class="eyebrow">READING SPEED</p><h2 id="pace-title"><span id="wpmValue">200</span> WPM</h2></div><span class="pace-hint">Adjust anytime</span></div>
        <label class="sr-only" for="wpmSlider">Words per minute</label>
        <input id="wpmSlider" type="range" min="100" max="300" step="25" value="200" />
        <div class="range-labels" aria-hidden="true"><span>100</span><span>200</span><span>300</span></div>
      </section>

      <button id="startReading" class="start-button" type="button"><span class="play-icon" aria-hidden="true">▶</span><span>Start reading</span><span class="button-arrow" aria-hidden="true">→</span></button>

      <section class="mirror-card" aria-labelledby="mirrorTitle">
        <div class="section-heading"><div><p class="eyebrow">GLASSES MIRROR</p><h2 id="mirrorTitle">Ready when you are</h2></div><span id="mirrorState" class="state-pill">READY</span></div>
        <p id="mirrorText" class="mirror-text">Your reading will appear on the glasses.</p>
        <div class="mirror-details"><span id="mirrorProgress">0 / 0</span><span id="mirrorWpm">200 WPM</span><span id="mirrorTime">0 min</span></div>
      </section>

      <aside class="safety-note"><span class="shield-icon" aria-hidden="true">⌁</span><p><strong>Stationary use only.</strong> Pace Reader is designed for reading while seated or stopped. Never use it while walking, driving, or operating machinery.</p></aside>
      <p class="privacy-note">No account, analytics, or network permission.</p>
    </main>`

  const textInput = document.querySelector<HTMLTextAreaElement>('#readingText')!
  const slider = document.querySelector<HTMLInputElement>('#wpmSlider')!
  const savedStatus = document.querySelector<HTMLSpanElement>('#savedStatus')!
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function renderMeta() {
    const count = words(textInput.value)
    const wpm = Number(slider.value)
    document.querySelector('#wordCount')!.textContent = `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
    document.querySelector('#estimatedTime')!.textContent = formatTime(count, wpm)
    document.querySelector('#wpmValue')!.textContent = String(wpm)
    document.querySelector('#mirrorWpm')!.textContent = `${wpm} WPM`
    document.querySelector('#mirrorTime')!.textContent = formatTime(count, wpm)
    slider.style.background = `linear-gradient(90deg, #c7f36b ${(wpm - 100) / 2}%, #374138 ${(wpm - 100) / 2}%)`
  }

  textInput.addEventListener('input', () => {
    renderMeta()
    savedStatus.textContent = 'Saving…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { localStorage.setItem(STORAGE_KEY, textInput.value); savedStatus.textContent = 'Saved just now' }, 450)
  })
  slider.addEventListener('input', renderMeta)
  document.querySelector('#startReading')!.addEventListener('click', () => {
    if (!textInput.value.trim()) { textInput.focus(); savedStatus.textContent = 'Add text to begin'; return }
    localStorage.setItem(STORAGE_KEY, textInput.value)
    api.setReadingState('reading')
    window.dispatchEvent(new CustomEvent('pace-reader:start', { detail: api.getState() }))
  })

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) { textInput.value = saved; savedStatus.textContent = 'Saved reading'; renderMeta() }
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
    const pill = document.querySelector('#mirrorState')
    if (pill) { pill.textContent = state.toUpperCase(); pill.className = `state-pill state-${state}` }
  },
  setDraft: (text, wpm, savedLabel = 'Saved reading') => {
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
    const savedStatus = document.querySelector('#savedStatus')
    if (savedStatus) savedStatus.textContent = label
  },
  updateMirror: update => {
    const fields: Record<string, string | undefined> = { mirrorTitle: update.title, mirrorText: update.text, mirrorProgress: update.progress, mirrorWpm: update.wpm === undefined ? undefined : `${update.wpm} WPM`, mirrorTime: update.time }
    Object.entries(fields).forEach(([id, value]) => { if (value !== undefined) { const node = document.getElementById(id); if (node) node.textContent = value } })
  },
}

window.PaceReaderCompanion = api
mountCompanion()
window.dispatchEvent(new Event('pace-reader:ready'))

// main.ts renders its glasses mirror into #app as part of startup. Keep the
// phone surface present if that startup render completes after this module.
const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot) {
  new MutationObserver(() => {
    if (!appRoot.querySelector('.companion-shell')) {
      delete appRoot.dataset.paceReaderMounted
      mountCompanion()
    }
  }).observe(appRoot, { childList: true })
}
