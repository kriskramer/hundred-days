import {
  GameEvent,
  GameState,
  EventType,
  PassiveOutcome,
  StatDelta,
  ResolutionType,
} from './types';
import { LOCATIONS } from '@data/locations';
import { EVENT_DEFINITIONS, EVENT_POOLS_BY_TYPE } from '@data/events';
import { findDialogueForLocation, getDialogue } from './DialogueEngine';
import { evalConditions } from './ConditionEvaluator';
import { getNpcArchetypesForLocation } from '@data/npcEncounters';

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

  // Add one NPC road encounter if the turn has room
  if (fired.length < 2) {
    const npcEvent = sampleNpcEncounterForTurn(state, rng);
    if (npcEvent) fired.push(npcEvent);
  }

  return fired;
}

export function sampleNpcEncounterForTurn(
  state: GameState,
  rng: () => number,
): GameEvent | null {
  const archetypes = getNpcArchetypesForLocation(state.currentLocationId);
  if (archetypes.length === 0) return null;

  // Shuffle archetypes via rng
  const shuffled = [...archetypes].sort(() => rng() - 0.5);

  for (const archetype of shuffled) {
    if (rng() > archetype.baseProbability) continue;

    // Pick a random dialogue from this archetype's pool
    const pool = archetype.dialoguePool;
    if (pool.length === 0) continue;

    const poolIndex = Math.floor(rng() * pool.length);
    let dialogueId = pool[poolIndex];

    // Evaluate dialogue conditions — try each pool entry until one works
    let found = false;
    for (let i = 0; i < pool.length; i++) {
      const candidateId = pool[(poolIndex + i) % pool.length];
      const dialogue = getDialogue(candidateId);
      if (!dialogue) continue;
      if (state.firedEventIds.has(candidateId) && !dialogue.repeatable) continue;
      if (!evalConditions(dialogue.triggerConditions, state, { dialogueId: candidateId })) continue;
      dialogueId = candidateId;
      found = true;
      break;
    }
    if (!found) continue;

    return {
      id:                   dialogueId,
      type:                 EventType.NpcEncounter,
      resolutionType:       ResolutionType.Interactive,
      name:                 archetype.name,
      description:          `You encounter a ${archetype.name.toLowerCase()} on the road.`,
      conditions:           { probability: 1.0 },
      interactiveHandlerId: 'dialogue_handler',
      repeatable:           true,
      tags:                 ['npc_encounter', ...archetype.tags],
    };
  }

  return null;
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
