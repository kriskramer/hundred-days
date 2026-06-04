import { EventType, type GameEvent } from '@engine/types';

export function isCombatEvent(event: GameEvent | null | undefined): boolean {
  if (!event) {
    return false;
  }

  return event.type === EventType.Combat
    || event.type === EventType.BossEncounter
    || event.interactiveHandlerId === 'combat_handler'
    || event.tags?.includes('combat') === true;
}
