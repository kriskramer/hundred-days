import travelDialoguesJson from './travelDialogues.json';
import type { TravelDialogueEntry } from '@engine/types';

function assertTravelDialogues(value: unknown): asserts value is TravelDialogueEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid travelDialogues.json: expected an array.');
  }

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid travelDialogues.json: each entry must be an object.');
    }

    const dialogue = entry as Record<string, unknown>;
    if (
      typeof dialogue.id !== 'string'
      || typeof dialogue.speakerType !== 'string'
      || typeof dialogue.text !== 'string'
      || typeof dialogue.weight !== 'number'
      || typeof dialogue.repeatable !== 'boolean'
      || !dialogue.conditions
      || typeof dialogue.conditions !== 'object'
      || !Array.isArray(dialogue.tags)
    ) {
      throw new Error('Invalid travelDialogues.json: malformed entry.');
    }

    if (dialogue.speakerType !== 'companion' && dialogue.speakerType !== 'npc') {
      throw new Error(`Invalid travelDialogues.json: entry "${dialogue.id}" has an unknown speakerType.`);
    }

    if (dialogue.speakerType === 'npc' && typeof dialogue.speakerName !== 'string') {
      throw new Error(`Invalid travelDialogues.json: npc entry "${dialogue.id}" must define speakerName.`);
    }
  }
}

assertTravelDialogues(travelDialoguesJson);

export const TRAVEL_DIALOGUES: TravelDialogueEntry[] = travelDialoguesJson as unknown as TravelDialogueEntry[];

export function getTravelDialogue(id: string): TravelDialogueEntry | undefined {
  return TRAVEL_DIALOGUES.find(dialogue => dialogue.id === id);
}
