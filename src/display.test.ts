import { getTextWidth } from '@evenrealities/pretext'
import { describe, expect, it } from 'vitest'
import { formatReadingFrame, formatStatus } from './display'

describe('G2 reading display', () => {
  it('keeps the marked current word centered while preserving both neighbors', () => {
    const output = formatReadingFrame(
      { previous: 'we', current: 'read', next: 'quickly' },
      576,
    )

    expect(output).toContain('we')
    expect(output).toContain('▶ read ◀')
    expect(output).toContain('quickly')
    expect(getTextWidth(output)).toBeLessThanOrEqual(576)

    const focusStart = getTextWidth(output.slice(0, output.indexOf('▶ read ◀')))
    const focusWidth = getTextWidth('▶ read ◀')
    expect(Math.abs(focusStart + focusWidth / 2 - 288)).toBeLessThanOrEqual(3)
  })

  it('fits unusually long tokens without wrapping', () => {
    const output = formatReadingFrame(
      {
        previous: 'pneumonoultramicroscopicsilicovolcanoconiosis',
        current: 'https://example.com/a/very/long/path/that/keeps/going',
        next: 'antidisestablishmentarianism',
      },
      576,
    )

    expect(getTextWidth(output)).toBeLessThanOrEqual(576)
    expect(output).not.toContain('\n')
    expect(output).toContain('▶')
    expect(output).toContain('◀')
  })

  it('shows actionable status for running, paused, and complete states', () => {
    expect(formatStatus({ index: 9, totalWords: 100, wpm: 200, paused: false, complete: false }))
      .toBe('200 WPM   10 / 100   TAP: PAUSE')
    expect(formatStatus({ index: 9, totalWords: 100, wpm: 200, paused: true, complete: false }))
      .toBe('PAUSED   10 / 100   TAP: RESUME')
    expect(formatStatus({ index: 99, totalWords: 100, wpm: 200, paused: false, complete: true }))
      .toBe('COMPLETE   100 / 100')
  })
})
