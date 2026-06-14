import premisesJson from './questPremises.json';
import type { QuestPremiseTemplate } from '@engine/types';

function assertQuestPremises(value: unknown): asserts value is QuestPremiseTemplate[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid questPremises.json: expected an array.');
  }
}

assertQuestPremises(premisesJson);

export const QUEST_PREMISE_TEMPLATES: QuestPremiseTemplate[] = premisesJson as QuestPremiseTemplate[];

export function getQuestPremise(id: string | undefined): QuestPremiseTemplate | undefined {
  if (!id) return undefined;
  return QUEST_PREMISE_TEMPLATES.find(p => p.id === id);
}

/** Deterministic pick for a future per-run optional questline (not assigned at game start yet). */
export function pickQuestPremiseId(seed: number): string {
  const index = Math.abs(seed) % QUEST_PREMISE_TEMPLATES.length;
  return QUEST_PREMISE_TEMPLATES[index].id;
}
