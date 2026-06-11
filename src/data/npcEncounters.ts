import npcEncountersJson from './npc_encounters.json';

export interface NpcArchetype {
  id:              string;
  name:            string;
  tags:            string[];
  regionRange:     [number, number];
  baseProbability: number;
  dialoguePool:    string[];
}

function assertNpcArchetypes(value: unknown): asserts value is NpcArchetype[] {
  if (!Array.isArray(value)) throw new Error('Invalid npc_encounters.json: expected an array.');
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid npc_encounters.json: each entry must be an object.');
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.name !== 'string' || !Array.isArray(e.dialoguePool)) {
      throw new Error(`Invalid npc_encounters.json: malformed archetype "${e.id}".`);
    }
  }
}

assertNpcArchetypes(npcEncountersJson);

export const NPC_ARCHETYPES: NpcArchetype[] = npcEncountersJson as NpcArchetype[];

export function getNpcArchetype(id: string): NpcArchetype | undefined {
  return NPC_ARCHETYPES.find(a => a.id === id);
}

export function getNpcArchetypesForLocation(locationId: number): NpcArchetype[] {
  return NPC_ARCHETYPES.filter(a => locationId >= a.regionRange[0] && locationId <= a.regionRange[1]);
}
