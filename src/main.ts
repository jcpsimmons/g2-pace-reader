import './companion'
import {
  CreateStartUpPageContainer,
  DeviceConnectType,
  MenuContainerProperty,
  MenuItemProperty,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { formatReadingFrame, formatStatus } from './display'
import { actionForEvenHubEvent, type ReaderEventAction } from './events'
import { persistReaderProgress, SAVE_EVERY_WORDS } from './progress'
import { createReader, type Reader, type ReaderSnapshot } from './reader'

const STORAGE_KEY = 'pace-reader.session.v1'
const BRIDGE_TIMEOUT_MS = 2500

type SavedSession = {
  version: 1
  text: string
  reader: string
}

const bridge = await waitForEvenAppBridge()
let reader: Reader | null = null
let sourceText = ''
let activeBookId: string | null = null
let activeBookTitle = ''
let timer: number | undefined
let cleanedUp = false
let exiting = false
let bridgeFaulted = false
let lastSavedIndex = -1
let restartIndex = 0
let bridgeQueue: Promise<unknown> = Promise.resolve()
let progressQueue: Promise<unknown> = Promise.resolve()

const menu = new MenuContainerProperty({
  menuItems: [
    new MenuItemProperty({ itemName: 'Rewind sentence', itemID: 1 }),
    new MenuItemProperty({ itemName: 'Restart reading', itemID: 2 }),
    new MenuItemProperty({ itemName: 'Slower', itemID: 3 }),
    new MenuItemProperty({ itemName: 'Faster', itemID: 4 }),
  ],
})

const title = new TextContainerProperty({
  xPosition: 0,
  yPosition: 16,
  width: 576,
  height: 32,
  borderWidth: 0,
  borderColor: 0,
  paddingLength: 4,
  containerID: 1,
  containerName: 'title',
  content: 'PACE READER',
  textColor: 2,
  isEventCapture: 0,
})

const reading = new TextContainerProperty({
  xPosition: 0,
  yPosition: 70,
  width: 576,
  height: 200,
  borderWidth: 0,
  borderColor: 0,
  paddingLength: 4,
  containerID: 2,
  containerName: 'reading',
  content: displayContent(),
  textColor: 4,
  isEventCapture: 1,
})

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 2,
    textObject: [title, reading],
    menuObject: menu,
  }),
)

if (created !== StartUpPageCreateResult.success) {
  throw new Error(`Pace Reader display creation failed with code ${created}`)
}

const devSample = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('demo')?.trim() : ''
if (devSample) {
  await startReading(devSample, 200)
} else {
  const restored = await loadSession()
  if (restored) {
    sourceText = restored.text
    reader = createReader(sourceText, { resume: restored.reader })
    if (!reader.getState().complete) reader.actions.pause()
    await renderReader()
  }
}

const unsubscribeEvents = bridge.onEvenHubEvent(event => {
  const action = actionForEvenHubEvent(event)
  if (!action) return
  handleAction(action).catch(reportRuntimeError)
})

const unsubscribeDevice = bridge.onDeviceStatusChanged(status => {
  if (status.connectType === DeviceConnectType.Connected) window.PaceReaderCompanion?.setDeviceConnection('connected')
  else if (status.connectType === DeviceConnectType.Disconnected || status.connectType === DeviceConnectType.ConnectionFailed) window.PaceReaderCompanion?.setDeviceConnection('disconnected')
  else window.PaceReaderCompanion?.setDeviceConnection('unknown')
  if (status.connectType !== DeviceConnectType.Disconnected && status.connectType !== DeviceConnectType.ConnectionFailed) return
  cancelTimer()
  if (reader && !reader.getState().complete) reader.actions.pause()
  syncCompanion()
})

window.addEventListener('pace-reader:start', event => {
  const detail = (event as CustomEvent<{
    text?: string
    wpm?: number
    bookId?: string
    bookTitle?: string
    resume?: string | Partial<ReaderSnapshot>
    restartIndex?: number
  }>).detail
  const text = detail?.text?.trim()
  if (!text) return
  startReading(text, detail.wpm ?? 200, {
    bookId: detail.bookId,
    bookTitle: detail.bookTitle,
    resume: detail.resume,
    restartIndex: detail.restartIndex,
  }).catch(reportRuntimeError)
})
window.addEventListener('pace-reader:ready', () => {
  syncCompanion(true)
  window.dispatchEvent(new Event('pace-reader:bridge-ready'))
})
window.addEventListener('pace-reader:book-deleted', event => {
  const bookId = (event as CustomEvent<{ bookId?: string }>).detail?.bookId
  if (!bookId || bookId !== activeBookId) return
  cancelTimer()
  reader = null
  sourceText = ''
  activeBookId = null
  activeBookTitle = ''
  restartIndex = 0
  renderReader().catch(reportRuntimeError)
  syncCompanion()
})

window.addEventListener('beforeunload', cleanup)
syncCompanion(true)
window.dispatchEvent(new Event('pace-reader:bridge-ready'))
if (reader && !reader.getState().paused && !reader.getState().complete) scheduleNext()

async function startReading(
  text: string,
  wpm: number,
  book: {
    bookId?: string
    bookTitle?: string
    resume?: string | Partial<ReaderSnapshot>
    restartIndex?: number
  } = {},
) {
  cancelTimer()
  bridgeFaulted = false
  sourceText = text
  activeBookId = book.bookId ?? null
  activeBookTitle = book.bookTitle ?? ''
  restartIndex = Math.max(0, book.restartIndex ?? 0)
  reader = createReader(text, { wpm, resume: book.resume })
  if (reader.getState().complete) reader.actions.jumpTo(restartIndex)
  else if (reader.getState().paused) reader.actions.resume()
  lastSavedIndex = -1
  await renderReader()
  await persistSession(true)
  syncCompanion()
  scheduleNext()
}

async function handleAction(action: ReaderEventAction) {
  if (action === 'exit') {
    exiting = true
    cancelTimer()
    if (reader && !reader.getState().complete) reader.actions.pause()
    await persistSession(true)
    cleanup()
    await bridge.shutDownPageContainer(1)
    return
  }
  if (action === 'cleanup') {
    exiting = true
    cleanup()
    return
  }
  if (!reader) return

  if (action === 'pause') {
    if (!reader.getState().paused && !reader.getState().complete) reader.actions.pause()
    cancelTimer()
  } else if (action === 'toggle') {
    if (reader.getState().complete) return
    if (reader.getState().paused) reader.actions.resume()
    else reader.actions.pause()
  } else if (action === 'faster') {
    reader.actions.increaseWpm()
  } else if (action === 'slower') {
    reader.actions.decreaseWpm()
  } else if (action === 'rewind') {
    reader.actions.rewindSentence()
  } else if (action === 'restart') {
    reader.actions.jumpTo(restartIndex)
  }

  await renderReader()
  await persistSession(true)
  syncCompanion()

  cancelTimer()
  if (!reader.getState().paused && !reader.getState().complete) scheduleNext()
}

function scheduleNext() {
  cancelTimer()
  if (!reader || reader.getState().paused || reader.getState().complete || bridgeFaulted || exiting) return
  const dwellMs = reader.getState().dwellMs
  timer = window.setTimeout(() => {
    advance().catch(reportRuntimeError)
  }, dwellMs)
}

async function advance() {
  if (!reader || reader.getState().paused || reader.getState().complete || bridgeFaulted || exiting) return
  reader.tick()
  await renderReader()
  await persistSession(false)
  syncCompanion()
  scheduleNext()
}

async function renderReader() {
  if (bridgeFaulted || exiting) return
  const started = performance.now()
  try {
    const accepted = await enqueueBridge(() => bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 2,
        containerName: 'reading',
        content: displayContent(),
        textColor: 4,
      }),
    ))
    if (!accepted) throw new Error('The glasses rejected a text update')

    const elapsed = performance.now() - started
    if (reader && elapsed > reader.getState().baseDwellMs) {
      reader.actions.decreaseWpm()
      window.PaceReaderCompanion?.setSavedStatus('Glasses slowed the pace for connection stability')
    }
  } catch (error) {
    bridgeFaulted = true
    cancelTimer()
    if (reader && !reader.getState().complete) reader.actions.pause()
    window.PaceReaderCompanion?.setSavedStatus('Glasses connection paused')
    throw error
  }
}

function displayContent(): string {
  if (!reader) return '\nOPEN THE EVEN APP\n\nImport an EPUB or continue a book.\n\nUse only while stationary.'
  const state = reader.getState()
  return `\n${formatReadingFrame(state.frame)}\n\n\n${formatStatus(state)}`
}

function enqueueBridge<T>(operation: () => Promise<T>): Promise<T> {
  const pending = bridgeQueue.then(operation, operation)
  bridgeQueue = pending.then(() => undefined, () => undefined)

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Glasses update timed out')), BRIDGE_TIMEOUT_MS)
    pending.then(
      value => { window.clearTimeout(timeout); resolve(value) },
      error => { window.clearTimeout(timeout); reject(error) },
    )
  })
}

async function loadSession(): Promise<SavedSession | null> {
  try {
    const value = await bridge.getLocalStorage(STORAGE_KEY)
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<SavedSession>
    if (candidate.version !== 1 || typeof candidate.text !== 'string' || typeof candidate.reader !== 'string') return null
    return candidate as SavedSession
  } catch {
    return null
  }
}

async function persistSession(force: boolean) {
  if (!reader) return
  if (activeBookId) {
    const bookId = activeBookId
    try {
      const pending = progressQueue.then(() => persistReaderProgress(
        reader!,
        lastSavedIndex,
        force,
        progress => window.PaceReaderCompanion?.saveBookProgress(bookId, progress) ?? Promise.resolve(),
      ))
      progressQueue = pending.then(() => undefined, () => undefined)
      lastSavedIndex = await pending
    } catch (error) {
      console.error('Pace Reader book progress save failed:', error)
      window.PaceReaderCompanion?.setLibraryStatus('Book progress save delayed', true)
    }
    return
  }
  const state = reader.getState()
  if (!force && !state.complete && state.index - lastSavedIndex < SAVE_EVERY_WORDS) return
  if (bridgeFaulted) return
  const value: SavedSession = { version: 1, text: sourceText, reader: reader.serialize() }
  try {
    const saved = await enqueueBridge(() => bridge.setLocalStorage(STORAGE_KEY, JSON.stringify(value)))
    if (saved) lastSavedIndex = state.index
  } catch (error) {
    console.error('Pace Reader progress save failed:', error)
    window.PaceReaderCompanion?.setSavedStatus('Progress save delayed')
  }
}

function syncCompanion(includeDraft = false) {
  const companion = window.PaceReaderCompanion
  if (!companion) return
  if (includeDraft && sourceText) companion.setDraft(sourceText, reader?.getState().wpm ?? 200)
  if (!reader) {
    companion.setReadingState('ready')
    companion.updateMirror({ title: 'Ready for a book', text: 'Import an EPUB or continue from your library.', progress: '0 / 0', wpm: 200, time: '0 min' })
    return
  }

  const state = reader.getState()
  const frameText = [state.frame.previous, state.frame.current, state.frame.next].filter(Boolean).join(' ')
  const remainingMinutes = Math.max(0, (state.totalWords - state.index - 1) / state.wpm)
  companion.setReadingState(state.complete ? 'complete' : state.paused ? 'paused' : 'reading')
  companion.updateMirror({
    title: activeBookTitle || (state.complete ? 'Reading complete' : state.paused ? 'Paused' : 'Reading now'),
    text: frameText,
    progress: `${Math.min(state.index + 1, state.totalWords)} / ${state.totalWords}`,
    wpm: state.wpm,
    time: remainingMinutes < 1 ? '< 1 min' : `${Math.ceil(remainingMinutes)} min`,
  })
}

function cancelTimer() {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
}

function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  exiting = true
  cancelTimer()
  unsubscribeEvents()
  unsubscribeDevice()
  window.removeEventListener('beforeunload', cleanup)
}

function reportRuntimeError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  console.error(`Pace Reader runtime error: ${message}`)
  syncCompanion()
}
