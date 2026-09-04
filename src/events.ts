import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'

export type ReaderEventAction =
  | 'toggle'
  | 'faster'
  | 'slower'
  | 'rewind'
  | 'restart'
  | 'pause'
  | 'exit'
  | 'cleanup'

const MENU_ACTIONS: Record<number, ReaderEventAction> = {
  1: 'rewind',
  2: 'restart',
  3: 'slower',
  4: 'faster',
}

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

export function actionForEvenHubEvent(event: EvenHubEvent): ReaderEventAction | null {
  const menuItemID = event.menuItemClickEvent?.itemID
  if (menuItemID !== undefined) return MENU_ACTIONS[menuItemID] ?? null

  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) return 'exit'
  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) return 'faster'
  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) return 'slower'
  if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) return 'pause'
  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) return 'cleanup'
  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) return 'toggle'
  return null
}
