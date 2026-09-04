/** Pure, deterministic state machine for a rolling speed reader. */

export type Frame = {
  previous: string | null
  current: string | null
  next: string | null
}

export type ReaderState = {
  frame: Frame
  /** Alias useful to renderers that prefer positional data. */
  frameWords: [string | null, string | null, string | null]
  /** Positional alias: [previous, current, next]. */
  rollingFrame: [string | null, string | null, string | null]
  index: number
  totalWords: number
  progress: number
  complete: boolean
  wpm: number
  paused: boolean
  baseDwellMs: number
  dwellMs: number
}

export type ReaderSnapshot = Pick<ReaderState, 'index' | 'wpm' | 'paused' | 'complete'>

export type ReaderOptions = {
  wpm?: number
  resume?: string | Partial<ReaderSnapshot>
}

export type Reader = {
  getState: () => ReaderState
  tick: () => ReaderState
  serialize: () => string
  actions: {
    tick: () => ReaderState
    pause: () => ReaderState
    resume: () => ReaderState
    adjustWpm: (delta?: number) => ReaderState
    increaseWpm: () => ReaderState
    decreaseWpm: () => ReaderState
    restart: () => ReaderState
    rewindSentence: () => ReaderState
  }
}

const MIN_WPM = 100
const MAX_WPM = 300
const DEFAULT_WPM = 200

export function createReader(text: string, options: ReaderOptions | string = {}): Reader {
  const normalizedOptions: ReaderOptions = typeof options === 'string' ? { resume: options } : options
  const words = text.trim() ? text.trim().split(/\s+/) : []
  const restored = readResume(normalizedOptions.resume)
  let index = clampInt(restored?.index ?? 0, 0, Math.max(0, words.length - 1))
  let wpm = clampWpm(restored?.wpm ?? normalizedOptions.wpm ?? DEFAULT_WPM)
  let paused = restored?.paused ?? false
  let complete = restored?.complete ?? words.length === 0

  const snapshot = (): ReaderState => {
    const previous = words[index - 1] ?? null
    const current = words[index] ?? null
    const next = words[index + 1] ?? null
    const baseDwellMs = 60000 / wpm
    return {
      frame: { previous, current, next },
      frameWords: [previous, current, next],
      rollingFrame: [previous, current, next],
      index,
      totalWords: words.length,
      progress: words.length <= 1 ? (words.length ? 0 : 1) : index / (words.length - 1),
      complete,
      wpm,
      paused,
      baseDwellMs,
      dwellMs: baseDwellMs * dwellMultiplier(current),
    }
  }

  const tick = (): ReaderState => {
    if (!paused && !complete) {
      if (index < words.length - 1) index += 1
      else complete = true
    }
    return snapshot()
  }
  const pause = (): ReaderState => { paused = true; return snapshot() }
  const resume = (): ReaderState => { paused = false; return snapshot() }
  const adjustWpm = (delta = 25): ReaderState => {
    wpm = clampWpm(wpm + delta)
    return snapshot()
  }
  const restart = (): ReaderState => {
    index = 0
    complete = false
    paused = false
    return snapshot()
  }
  const rewindSentence = (): ReaderState => {
    complete = false
    if (!words.length) return snapshot()
    let start = index
    while (start > 0 && !isSentenceEnd(words[start - 1])) start -= 1
    // Rewind again when already at the beginning of this sentence.
    if (start === index && index > 0) {
      start = index - 1
      while (start > 0 && !isSentenceEnd(words[start - 1])) start -= 1
    }
    index = start
    return snapshot()
  }

  const reader: Reader = {
    getState: snapshot,
    tick,
    serialize: () => JSON.stringify({ version: 1, index, wpm, paused, complete }),
    actions: {
      tick,
      pause,
      resume,
      adjustWpm,
      increaseWpm: () => adjustWpm(25),
      decreaseWpm: () => adjustWpm(-25),
      restart,
      rewindSentence,
    },
  }
  return reader
}

function readResume(value: ReaderOptions['resume']): Partial<ReaderSnapshot> | undefined {
  if (!value) return undefined
  if (typeof value === 'object') return value
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return undefined
    return parsed as Partial<ReaderSnapshot>
  } catch {
    return undefined
  }
}

function clampWpm(value: number): number {
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Number.isFinite(value) ? value : DEFAULT_WPM))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min))
}

function isSentenceEnd(word: string): boolean { return /[.!?]["')\]]*$/.test(word) }

function dwellMultiplier(word: string | null): number {
  if (!word) return 1
  if (/[.!?]["')\]]*$/.test(word)) return 1.75
  if (/[,;:]["')\]]*$/.test(word)) return 1.25
  if (/^[A-Za-z]{9,}$/.test(word)) return 1.5
  return 1
}
