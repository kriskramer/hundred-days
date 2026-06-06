import {
  GameEvent,
  GameState,
  EventType,
  PassiveOutcome,
  StatDelta,
} from './types';
import { LOCATIONS } from '@data/locations';
import { EVENT_DEFINITIONS, EVENT_POOLS_BY_TYPE } from '@data/events';
import { findDialogueForLocation } from './DialogueEngine';
import { evalConditions } from './ConditionEvaluator';

export { EVENT_DEFINITIONS, EVENT_POOLS_BY_TYPE };

export function buildEventRegistry(events: GameEvent[]): Map<string, GameEvent> {
  return new Map(events.map(event => [event.id, event]));
}

export function sampleEventsForTurn(
  state: GameState,
  rng: () => number,
): GameEvent[] {
  const location = LOCATIONS.find(entry => entry.id === state.currentLocationId);
  if (!location) return [];

  const pool = location.eventPool ?? EVENT_POOLS_BY_TYPE[location.type];

  const eligible = EVENT_DEFINITIONS.filter(event => {
    const conditions = event.conditions;

    if (!event.repeatable && state.firedEventIds.has(event.id)) return false;
    if (!evalConditions(conditions, state)) return false;

    if (pool && conditions.locationTypes && !pool.includes(event.id)) return false;

    return true;
  });

  const fired: GameEvent[] = [];
  for (const event of eligible) {
    if (rng() < event.conditions.probability) {
      fired.push(event);
      if (fired.length >= 2) break;
    }
  }

  return fired;
}

export function hasEligibleDialogue(state: GameState): boolean {
  const location = LOCATIONS.find(entry => entry.id === state.currentLocationId);
  if (!location) return false;

  return EVENT_DEFINITIONS.some(event => {
    if (event.type !== EventType.Dialogue && event.type !== EventType.CompanionMeet) return false;
    if (!event.repeatable && state.firedEventIds.has(event.id)) return false;

    return evalConditions(event.conditions, state);
  }) || findDialogueForLocation(state.currentLocationId, state) !== null;
}

export function passiveOutcomeToDelta(
  event: GameEvent,
  outcome: PassiveOutcome,
): StatDelta {
  return {
    source:               `event:${event.id}`,
    food:                 outcome.resourceDelta?.food,
    gold:                 outcome.resourceDelta?.gold,
    health:               outcome.resourceDelta?.health,
    morale:               outcome.resourceDelta?.morale,
    statusEffectsAdded:   outcome.statusEffectsAdded,
    statusEffectsRemoved: outcome.statusEffectsRemoved,
    weatherOverride:      outcome.weatherOverride,
    narrative:            outcome.narrativeText,
  };
}
