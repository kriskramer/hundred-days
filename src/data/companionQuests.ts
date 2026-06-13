import questsJson from './companionQuests.json';
import type { CompanionQuestVariant } from '@engine/types';

function assertCompanionQuests(value: unknown): asserts value is CompanionQuestVariant[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid companionQuests.json: expected an array.');
  }
}

assertCompanionQuests(questsJson);

export const COMPANION_QUEST_VARIANTS: CompanionQuestVariant[] = questsJson as CompanionQuestVariant[];

export function getCompanionQuestVariant(id: string): CompanionQuestVariant | undefined {
  return COMPANION_QUEST_VARIANTS.find(q => q.id === id);
}

export function getCompanionQuestVariantsForCompanion(companionId: string): CompanionQuestVariant[] {
  return COMPANION_QUEST_VARIANTS.filter(q => q.companionId === companionId);
}
