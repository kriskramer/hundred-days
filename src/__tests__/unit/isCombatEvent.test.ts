import { EventType, ResolutionType, type GameEvent } from '@engine/types';
import { isCombatEvent } from '@utils/isCombatEvent';

function makeEvent(overrides: Partial<GameEvent>): GameEvent {
  return {
    id: 'test_event',
    type: EventType.ResourceFind,
    resolutionType: ResolutionType.Interactive,
    name: 'Test Event',
    description: 'Test description',
    conditions: { probability: 1 },
    repeatable: true,
    tags: [],
    ...overrides,
  };
}

describe('isCombatEvent', () => {
  it('recognizes standard combat events', () => {
    expect(isCombatEvent(makeEvent({ type: EventType.Combat }))).toBe(true);
  });

  it('recognizes boss encounter events', () => {
    expect(isCombatEvent(makeEvent({ type: EventType.BossEncounter, tags: ['boss', 'combat'] }))).toBe(true);
  });

  it('recognizes combat handler events even when the type differs', () => {
    expect(isCombatEvent(makeEvent({ interactiveHandlerId: 'combat_handler' }))).toBe(true);
  });

  it('does not treat non-combat dialogue as combat', () => {
    expect(isCombatEvent(makeEvent({ type: EventType.Dialogue, interactiveHandlerId: 'dialogue_handler' }))).toBe(false);
  });
});
