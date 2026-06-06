import companionsJson from './companions.json';
import { Companion, CompanionRecruitmentRequirements } from '@engine/types';

function assertCompanions(value: unknown): asserts value is Companion[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid companions.json: expected an array.');
  }

  for (const companion of value) {
    if (!companion || typeof companion !== 'object') {
      throw new Error('Invalid companions.json: each entry must be an object.');
    }
    const entry = companion as Record<string, unknown>;
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      throw new Error('Invalid companions.json: malformed companion entry.');
    }
  }
}

assertCompanions(companionsJson);

export const COMPANIONS: Companion[] = companionsJson as unknown as Companion[];

export function getCompanion(id: string): Companion | undefined {
  return COMPANIONS.find(companion => companion.id === id);
}

export function getCompanionOrThrow(id: string): Companion {
  const companion = getCompanion(id);
  if (!companion) {
    throw new Error(`Unknown companion ID: "${id}"`);
  }
  return companion;
}

export type RecruitmentRequirements = CompanionRecruitmentRequirements;

export function canRecruit(
  companionId: string,
  repValue: number,
  moraleValue: number,
): boolean {
  const requirements = getCompanion(companionId)?.recruitRequirements;
  if (!requirements) return true;
  if (requirements.minReputation !== undefined && repValue < requirements.minReputation) return false;
  if (requirements.maxReputation !== undefined && repValue > requirements.maxReputation) return false;
  if (requirements.minMorale !== undefined && moraleValue < requirements.minMorale) return false;
  if (requirements.maxMorale !== undefined && moraleValue > requirements.maxMorale) return false;
  return true;
}
