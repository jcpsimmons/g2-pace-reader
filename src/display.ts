import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import type { Frame } from './reader'

const GAP = '   '
const SPACE_WIDTH = getTextWidth(' ')

export function formatReadingFrame(frame: Frame, width = 576): string {
  const availableWidth = Math.max(96, width)
  const current = frame.current ?? 'Ready'
  const markerWidth = getTextWidth('▶  ◀')
  const currentBudget = Math.max(24, Math.floor(availableWidth * 0.5) - markerWidth)
  const focus = `▶ ${pxTruncate(current, currentBudget)} ◀`
  const focusWidth = getTextWidth(focus)
  const focusStart = Math.max(0, availableWidth / 2 - focusWidth / 2)
  const gapWidth = getTextWidth(GAP)

  const previousBudget = Math.max(0, focusStart - gapWidth)
  const previous = frame.previous ? pxTruncate(frame.previous, previousBudget) : ''
  const left = previous ? `${previous}${GAP}` : ''
  const leftWidth = getTextWidth(left)
  const padCount = Math.max(0, Math.round((focusStart - leftWidth) / SPACE_WIDTH))
  const padding = ' '.repeat(padCount)

  const usedWidth = getTextWidth(`${padding}${left}${focus}`)
  const nextBudget = Math.max(0, availableWidth - usedWidth - gapWidth)
  const next = frame.next ? pxTruncate(frame.next, nextBudget) : ''
  const right = next ? `${GAP}${next}` : ''

  return `${padding}${left}${focus}${right}`
}

type StatusState = {
  index: number
  totalWords: number
  wpm: number
  paused: boolean
  complete: boolean
}

export function formatStatus(state: StatusState): string {
  if (!state.totalWords) return 'READY   OPEN PHONE TO ADD TEXT'
  const position = `${Math.min(state.index + 1, state.totalWords)} / ${state.totalWords}`
  if (state.complete) return `COMPLETE   ${position}`
  if (state.paused) return `PAUSED   ${position}   TAP: RESUME`
  return `${state.wpm} WPM   ${position}   TAP: PAUSE`
}
