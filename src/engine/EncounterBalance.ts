import { GameBalance } from './GameBalance';
import { clamp } from './GameState';
import { EventType, GameEvent } from './types';

export interface EncounterProgressMultipliers {
  npc: number;
  combat: number;
}

export function getEncounterProgressMultipliers(locationId: number): EncounterProgressMultipliers {
  const {
    ROAD_TOTAL_LOCATIONS,
    LATE_ROAD_LOCATION_START,
    ENCOUNTER_NPC_CHANCE_EARLY,
    ENCOUNTER_NPC_CHANCE_LATE,
    ENCOUNTER_COMBAT_CHANCE_EARLY,
    ENCOUNTER_COMBAT_CHANCE_LATE,
    LATE_ROAD_NPC_EXTRA_MULT,
    LATE_ROAD_COMBAT_EXTRA_MULT,
  } = GameBalance;

  const progress = clamp((locationId - 1) / (ROAD_TOTAL_LOCATIONS - 1), 0, 1);
  let npc = ENCOUNTER_NPC_CHANCE_EARLY + progress * (ENCOUNTER_NPC_CHANCE_LATE - ENCOUNTER_NPC_CHANCE_EARLY);
  let combat = ENCOUNTER_COMBAT_CHANCE_EARLY + progress * (ENCOUNTER_COMBAT_CHANCE_LATE - ENCOUNTER_COMBAT_CHANCE_EARLY);

  if (locationId >= LATE_ROAD_LOCATION_START) {
    const lateSpan = ROAD_TOTAL_LOCATIONS - LATE_ROAD_LOCATION_START;
    const lateProgress = clamp((locationId - LATE_ROAD_LOCATION_START) / lateSpan, 0, 1);
    npc *= 1 + lateProgress * (LATE_ROAD_NPC_EXTRA_MULT - 1);
    combat *= 1 + lateProgress * (LATE_ROAD_COMBAT_EXTRA_MULT - 1);
  }

  return { npc, combat };
}

export function getEventEncounterKind(event: GameEvent): 'npc' | 'combat' | null {
  if (event.type === EventType.Combat || event.interactiveHandlerId === 'combat_handler') {
    return 'combat';
  }
  if (event.type === EventType.NpcEncounter || event.tags?.includes('npc_encounter')) {
    return 'npc';
  }
  return null;
}

export function scaleEncounterProbability(
  baseProbability: number,
  locationId: number,
  kind: 'npc' | 'combat',
): number {
  const mult = getEncounterProgressMultipliers(locationId)[kind];
  return Math.min(1, baseProbability * mult);
}
