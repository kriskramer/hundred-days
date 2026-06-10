import { getLocation } from '@data/locations';
import { TRAVEL_DIALOGUES } from '@data/travelDialogues';
import { evalConditions } from './ConditionEvaluator';
import type {
  Companion,
  GameState,
  TravelDialogueEntry,
  TravelDialogueOccurrence,
} from './types';
import { BOSS_EVENT_MAP } from './bosses';

interface TravelDialogueCandidate extends TravelDialogueOccurrence {
  weight: number;
}

const BASE_TRIGGER_CHANCE = 0.10;
const MAX_TRIGGER_CHANCE = 0.28;
const RECENT_DIALOGUE_WINDOW = 6;
const RECENT_SPEAKER_WINDOW = 2;

export function sampleTravelDialogue(
  state: GameState,
  gateRoll: number,
  selectionRoll: number,
): TravelDialogueOccurrence | null {
  if (!canShowTravelDialogue(state)) return null;

  const candidates = buildTravelDialogueCandidates(state);
  if (candidates.length === 0) return null;

  const triggerChance = getTravelDialogueTriggerChance(state);
  if (gateRoll >= triggerChance) return null;

  return pickWeightedCandidate(candidates, selectionRoll);
}

export function getTravelDialogueTriggerChance(state: GameState): number {
  let chance = BASE_TRIGGER_CHANCE;
  const location = getLocation(state.currentLocationId);

  if (state.companions.length > 0) chance += 0.01;
  if (state.morale.value <= 35 || state.morale.value >= 80) chance += 0.04;
  if (state.reputation.value <= 25 || state.reputation.value >= 75) chance += 0.03;
  if (state.companions.some(companion => companion.loyalty.value <= companion.loyalty.complainsBelow + 5)) {
    chance += 0.07;
  }
  if (location.isTown || location.type === 'settlement') {
    chance += 0.03;
  }

  return Math.min(MAX_TRIGGER_CHANCE, chance);
}

function buildTravelDialogueCandidates(state: GameState): TravelDialogueCandidate[] {
  return TRAVEL_DIALOGUES.flatMap(dialogue => buildCandidatesForEntry(dialogue, state));
}

function buildCandidatesForEntry(
  entry: TravelDialogueEntry,
  state: GameState,
): TravelDialogueCandidate[] {
  if (!evalConditions(entry.conditions, state)) return [];
  if (!entry.repeatable && wasSourceUsed(entry.id, state)) return [];

  if (entry.speakerType === 'npc') {
    return buildNpcCandidate(entry, state);
  }

  return buildCompanionCandidates(entry, state);
}

function buildNpcCandidate(
  entry: TravelDialogueEntry,
  state: GameState,
): TravelDialogueCandidate[] {
  const occurrenceId = entry.id;
  if (wasOccurrenceUsedRecently(occurrenceId, state)) return [];

  return [{
    id: occurrenceId,
    sourceId: entry.id,
    speakerType: 'npc',
    speakerName: entry.speakerName ?? 'Traveler',
    text: entry.text,
    weight: entry.weight,
  }];
}

function buildCompanionCandidates(
  entry: TravelDialogueEntry,
  state: GameState,
): TravelDialogueCandidate[] {
  const candidates: TravelDialogueCandidate[] = [];

  for (const companion of state.companions) {
    if (!matchesCompanionSpeaker(entry, companion)) continue;
    if (!matchesSpeakerSpecificConditions(entry, companion)) continue;
    if (wasSpeakerUsedRecently(companion.id, state)) continue;

    const occurrenceId = `${entry.id}:${companion.id}`;
    if (wasOccurrenceUsedRecently(occurrenceId, state)) continue;

    candidates.push({
      id: occurrenceId,
      sourceId: entry.id,
      speakerType: 'companion',
      speakerName: companion.name,
      speakerId: companion.id,
      text: formatCompanionText(companion, entry.text),
      weight: entry.weight,
    });
  }

  return candidates;
}

function matchesCompanionSpeaker(entry: TravelDialogueEntry, companion: Companion): boolean {
  if (entry.speakerId && companion.id !== entry.speakerId) return false;
  if (entry.speakerArchetype && companion.archetype !== entry.speakerArchetype) return false;
  return true;
}

function matchesSpeakerSpecificConditions(entry: TravelDialogueEntry, companion: Companion): boolean {
  const { conditions } = entry;

  if (conditions.minCompanionLoyalty !== undefined && companion.loyalty.value < conditions.minCompanionLoyalty) {
    return false;
  }
  if (conditions.maxCompanionLoyalty !== undefined && companion.loyalty.value > conditions.maxCompanionLoyalty) {
    return false;
  }
  if (conditions.requiredCompanionArchetype !== undefined && companion.archetype !== conditions.requiredCompanionArchetype) {
    return false;
  }

  return true;
}

function formatCompanionText(companion: Companion, text: string): string {
  if (companion.archetype === 'animal') {
    return `${companion.name} ${text}`;
  }

  return text;
}

function pickWeightedCandidate(
  candidates: TravelDialogueCandidate[],
  selectionRoll: number,
): TravelDialogueOccurrence {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = selectionRoll * totalWeight;

  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      const { weight: _weight, ...occurrence } = candidate;
      return occurrence;
    }
  }

  const fallback = candidates[candidates.length - 1];
  const { weight: _weight, ...occurrence } = fallback;
  return occurrence;
}

function canShowTravelDialogue(state: GameState): boolean {
  const location = getLocation(state.currentLocationId);
  const bossEventId = BOSS_EVENT_MAP[state.currentLocationId];
  if (bossEventId && !state.clearedCombatLocations.has(state.currentLocationId)) return false;

  const dangerNearby = location.mobs.some(mob => mob.aggroPct > 0 && !mob.isCompanion)
    && !state.clearedCombatLocations.has(state.currentLocationId);

  return !dangerNearby;
}

function wasSourceUsed(sourceId: string, state: GameState): boolean {
  return state.turnHistory.some(turn => turn.travelDialogue?.sourceId === sourceId);
}

function wasOccurrenceUsedRecently(occurrenceId: string, state: GameState): boolean {
  return state.turnHistory
    .slice(-RECENT_DIALOGUE_WINDOW)
    .some(turn => turn.travelDialogue?.id === occurrenceId);
}

function wasSpeakerUsedRecently(speakerId: string, state: GameState): boolean {
  return state.turnHistory
    .slice(-RECENT_SPEAKER_WINDOW)
    .some(turn => turn.travelDialogue?.speakerId === speakerId);
}
