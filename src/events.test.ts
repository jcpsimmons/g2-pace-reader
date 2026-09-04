import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { describe, expect, it } from 'vitest'
import { actionForEvenHubEvent } from './events'

describe('EvenHub input mapping', () => {
  it('treats a missing eventType inside a real envelope as a single tap', () => {
    expect(actionForEvenHubEvent({ sysEvent: {} } as EvenHubEvent)).toBe('toggle')
    expect(actionForEvenHubEvent({})).toBeNull()
  })

  it('maps scrolling and double tap to reader controls', () => {
    expect(actionForEvenHubEvent({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } } as EvenHubEvent)).toBe('faster')
    expect(actionForEvenHubEvent({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } } as EvenHubEvent)).toBe('slower')
    expect(actionForEvenHubEvent({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as EvenHubEvent)).toBe('exit')
  })

  it('pauses when the system menu opens and maps its actions', () => {
    expect(actionForEvenHubEvent({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT } } as EvenHubEvent)).toBe('pause')
    expect(actionForEvenHubEvent({ menuItemClickEvent: { itemID: 1 } } as EvenHubEvent)).toBe('rewind')
    expect(actionForEvenHubEvent({ menuItemClickEvent: { itemID: 2 } } as EvenHubEvent)).toBe('restart')
    expect(actionForEvenHubEvent({ menuItemClickEvent: { itemID: 3 } } as EvenHubEvent)).toBe('slower')
    expect(actionForEvenHubEvent({ menuItemClickEvent: { itemID: 4 } } as EvenHubEvent)).toBe('faster')
  })
})
