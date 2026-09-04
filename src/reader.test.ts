import { describe, expect, it } from 'vitest'
import { createReader } from './reader'

describe('speed reader', () => {
  it('starts at 200 WPM with a rolling three-word frame', () => {
    const reader = createReader('One two three four.')

    expect(reader.getState()).toMatchObject({
      wpm: 200,
      frame: { previous: null, current: 'One', next: 'two' },
      progress: 0,
      complete: false,
      paused: false,
    })
  })

  it('advances exactly one word per tick, including punctuation', () => {
    const reader = createReader('One, two. Three four')

    reader.tick()
    expect(reader.getState().frame).toEqual({ previous: 'One,', current: 'two.', next: 'Three' })
    expect(reader.getState().dwellMs).toBeGreaterThan(reader.getState().baseDwellMs)
    reader.tick()
    expect(reader.getState().frame).toEqual({ previous: 'two.', current: 'Three', next: 'four' })
  })

  it('pauses and resumes, and clamps 25 WPM adjustments to 100..300', () => {
    const reader = createReader('one two three')
    reader.actions.adjustWpm(-1000)
    expect(reader.getState().wpm).toBe(100)
    reader.actions.pause()
    reader.tick()
    expect(reader.getState().frame.current).toBe('one')
    reader.actions.resume()
    reader.actions.adjustWpm(1000)
    expect(reader.getState().wpm).toBe(300)
    reader.tick()
    expect(reader.getState().frame.current).toBe('two')
  })

  it('rewinds to the current sentence start and serializes/resumes', () => {
    const text = 'First sentence. Second has three words. Final.'
    const reader = createReader(text)
    reader.tick(); reader.tick(); reader.tick()
    reader.actions.rewindSentence()
    expect(reader.getState().frame.current).toBe('Second')

    reader.actions.adjustWpm(25)
    const saved = reader.serialize()
    const resumed = createReader(text, { resume: saved })
    expect(resumed.getState()).toEqual(reader.getState())
  })

  it('marks the final word complete after its dwell and resumes that state', () => {
    const reader = createReader('one two')
    expect(reader.getState().complete).toBe(false)
    reader.tick()
    expect(reader.getState()).toMatchObject({ complete: false, frame: { current: 'two' } })
    reader.tick()
    expect(reader.getState()).toMatchObject({ complete: true, frame: { current: 'two' } })
    const resumed = createReader('one two', { resume: reader.serialize() })
    expect(resumed.getState().complete).toBe(true)
    resumed.tick()
    expect(resumed.getState().index).toBe(1)
  })

  it('jumps to a chapter start without marking the book complete', () => {
    const reader = createReader('zero one two three four five')
    reader.tick()
    reader.tick()
    reader.actions.jumpTo(4)
    expect(reader.getState()).toMatchObject({ index: 4, complete: false, paused: false, frame: { current: 'four' } })
  })

  it('adds capped dwell for words longer than eight letters', () => {
    const reader = createReader('short extraordinary')
    reader.tick()
    const state = reader.getState()
    expect(state.dwellMs).toBeGreaterThan(state.baseDwellMs)
    expect(state.dwellMs).toBeLessThanOrEqual(state.baseDwellMs * 1.5)
  })

  it('restarts from the beginning while preserving WPM and running', () => {
    const reader = createReader('one two three')
    reader.actions.adjustWpm(25)
    reader.tick()
    reader.actions.pause()
    reader.actions.restart()
    expect(reader.getState()).toMatchObject({ index: 0, wpm: 225, paused: false, complete: false })
    reader.tick()
    expect(reader.getState().frame.current).toBe('two')
  })

  it('rewinds after completion and clears complete', () => {
    const reader = createReader('One. Two.')
    reader.tick(); reader.tick()
    expect(reader.getState().complete).toBe(true)
    reader.actions.rewindSentence()
    expect(reader.getState()).toMatchObject({ index: 0, complete: false, paused: false })
  })
})
