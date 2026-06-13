import type { GameState, RunPremise, StatDelta } from './types';
import type { PathShortcut } from './RunLayout';
import { getRegion } from '@data/locations';
import { getShortcutScenario } from '@data/shortcutScenarios';
import { getCompanionQuestVariant } from '@data/companionQuests';

export const RUN_PREMISES: RunPremise[] = [
  {
    id: 'council_letter',
    text: 'You carry a sealed letter from the Okuna council — proof of your mandate, and a target on your back.',
    journalIntro: 'The council\'s seal weighs heavier than your pack.',
  },
  {
    id: 'refugee_escort',
    text: 'A family of refugees entrusted you with reaching the eastern garrison before the roads close.',
    journalIntro: 'Their prayers follow you eastward.',
  },
  {
    id: 'debt_collector',
    text: 'Gold you borrowed in Okuna must be repaid in Vorishy — with interest, if Roachak\'s shadow doesn\'t claim you first.',
    journalIntro: 'Every day on the road is a day closer to ruin or redemption.',
  },
  {
    id: 'lost_sibling',
    text: 'Your sibling rode east six months ago and never returned. You follow the same road, hoping answers wait at its end.',
    journalIntro: 'You tell yourself you are not chasing a ghost.',
  },
  {
    id: 'penitent_pilgrim',
    text: 'The priesthood sent you to witness Roachak\'s fall — or die trying to earn forgiveness.',
    journalIntro: 'Penance wears the shape of a hundred days.',
  },
  {
    id: 'mercenary_contract',
    text: 'A merchant consortium paid you to escort a relic to Vorishy before the hundredth day.',
    journalIntro: 'The relic is hidden. The contract is not.',
  },
  {
    id: 'village_hero',
    text: 'When bandits burned your village, you swore no one else on this road would die unprepared.',
    journalIntro: 'They called you fool. You called it duty.',
  },
  {
    id: 'scholar_mission',
    text: 'You seek forbidden texts rumoured to be in Roachak\'s vault — knowledge that could save or damn the world.',
    journalIntro: 'The scholar\'s curiosity may outlive the scholar.',
  },
];

const EPILOGUE_FLAG_PRIORITY = [
  'dain_quest_complete',
  'dain_quest_failed_departed',
  'coron_arc_complete',
  'helped_wounded_stranger',
  'wounded_stranger_ignored',
  'detour_marsh_abbey',
  'detour_refugee_trail',
  'saga_courier_complete',
  'saga_lights_complete',
] as const;

const EPILOGUE_FLAG_LINES: Record<string, string> = {
  dain_quest_complete: 'Dain found closure on the road — and chose to stand with you at the end.',
  dain_quest_failed_departed: 'Dain left to hunt the deserter alone. You heard later he caught his quarry, but never rejoined your march.',
  coron_arc_complete: 'Coron\'s blessing followed you through the darkest miles.',
  helped_wounded_stranger: 'The stranger you helped sent word ahead — allies remembered your mercy.',
  wounded_stranger_ignored: 'Some on the road still whisper about the traveler who passed a dying man.',
  detour_marsh_abbey: 'The abbey ruins haunt your memory — a detour that cost time but spared your conscience.',
  detour_refugee_trail: 'The refugee trail taught you what the main road hides.',
  saga_courier_complete: 'The missing courier\'s satchel reached its destination because of you.',
  saga_lights_complete: 'You never solved the strange lights in the marsh — but you survived them.',
};

export function pickRunPremiseId(seed: number): string {
  const index = Math.abs(seed) % RUN_PREMISES.length;
  return RUN_PREMISES[index].id;
}

export function getRunPremise(premiseId: string | undefined): RunPremise | undefined {
  if (!premiseId) return undefined;
  return RUN_PREMISES.find(p => p.id === premiseId);
}

export function getShortcutKey(shortcut: PathShortcut): string {
  return `${shortcut.from}_${shortcut.to}`;
}

export function buildShortcutScenarioDeltas(
  shortcut: PathShortcut,
  isFirstUse: boolean,
): StatDelta[] {
  if (!isFirstUse) return [];

  const scenario = getShortcutScenario(shortcut.scenarioId ?? getShortcutKey(shortcut));
  if (!scenario) return [];

  const deltas: StatDelta[] = [{
    source: 'shortcut_scenario',
    narrative: scenario.narrative,
    morale: scenario.moraleDelta,
    food: scenario.foodDelta,
    gold: scenario.goldDelta,
    health: scenario.healthDelta,
  }];

  return deltas;
}

export function buildNarrativeEpilogue(state: GameState): string {
  const region = getRegion(state.currentLocationId).name;
  const companions = state.companions.map(c => c.name);
  const premise = getRunPremise(state.runPremiseId);

  let frame: string;
  switch (state.outcome) {
    case 'victory':
      frame = `On day ${state.dayNumber}, you reached Roachak and broke his hold on the world.`;
      break;
    case 'defeat':
      frame = `Your journey ended in ${region} on day ${state.dayNumber}.`;
      break;
    case 'timeout':
      frame = `Day ${state.dayNumber} found you at location ${state.currentLocationId} — ${125 - state.currentLocationId} miles short.`;
      break;
    default:
      frame = `The road claimed your journey at ${region}, day ${state.dayNumber}.`;
  }

  const highlights: string[] = [];
  if (premise) highlights.push(premise.text);

  for (const flag of EPILOGUE_FLAG_PRIORITY) {
    if (state.storyFlags.has(flag) && EPILOGUE_FLAG_LINES[flag]) {
      highlights.push(EPILOGUE_FLAG_LINES[flag]);
    }
  }

  for (const quest of state.companionQuests ?? []) {
    if (quest.status !== 'completed' && quest.status !== 'failed') continue;
    const variant = getCompanionQuestVariant(quest.variantId);
    if (!variant) continue;
    if (quest.status === 'completed' && variant.epilogueComplete) {
      highlights.push(variant.epilogueComplete);
    } else if (quest.status === 'failed' && variant.epilogueFailedDeparted) {
      highlights.push(variant.epilogueFailedDeparted);
    }
  }

  const partyLine = companions.length > 0
    ? `Those who walked with you: ${companions.join(', ')}.`
    : 'You walked the final miles alone.';

  const shortcutCount = state.usedShortcutKeys?.length ?? 0;
  const routeLine = shortcutCount > 0
    ? `You took ${shortcutCount} hidden path${shortcutCount !== 1 ? 's' : ''} others might have missed.`
    : '';

  return [frame, ...highlights.slice(0, 3), partyLine, routeLine].filter(Boolean).join(' ');
}

export function buildRunSummary(state: GameState): string {
  return buildNarrativeEpilogue(state);
}

export function getNpcSlotDialogueId(
  npcEventId: string,
  arcStage: number,
): string {
  return arcStage <= 1 ? npcEventId : `${npcEventId}_${arcStage}`;
}

export function getNpcSlotFiredKey(
  npcEventId: string,
  arcStage: number,
  locationId: number,
): string {
  const dialogueId = getNpcSlotDialogueId(npcEventId, arcStage);
  return `${dialogueId}_loc${locationId}`;
}

export function canShowNpcSlot(
  slot: { npcEventId: string; arcStage: number; locationId: number },
  storyFlags: Set<string>,
  firedEventIds: Set<string>,
): boolean {
  const firedKey = getNpcSlotFiredKey(slot.npcEventId, slot.arcStage, slot.locationId);
  if (firedEventIds.has(firedKey)) return false;
  if (slot.arcStage <= 1) return true;
  const prevFlag = `${slot.npcEventId}_stage_${slot.arcStage - 1}_done`;
  return storyFlags.has(prevFlag);
}

export function getNpcArcStageFlag(npcEventId: string, arcStage: number): string {
  return `${npcEventId}_stage_${arcStage}_done`;
}

interface RumorTarget {
  id: string;
  text: string;
}

export function pickTownRumor(state: GameState, roll: number): RumorTarget | null {
  const candidates: RumorTarget[] = [];
  const revealed = new Set(state.revealedRumorIds ?? []);
  const perception = state.player.stats.perception ?? 0;

  for (const shortcut of state.runLayout.activeShortcuts) {
    const id = `rumor_shortcut_${getShortcutKey(shortcut)}`;
    if (revealed.has(id)) continue;
    if (state.currentLocationId >= shortcut.from) continue;
    candidates.push({
      id,
      text: `At the inn, they whisper about "${shortcut.label}" — somewhere near location ${shortcut.from}, if your eyes are sharp enough.`,
    });
  }

  for (const detour of state.runLayout.activeDetours ?? []) {
    const id = `rumor_detour_${detour.threadId}`;
    if (revealed.has(id)) continue;
    if (state.currentLocationId >= detour.forkAt) continue;
    candidates.push({
      id,
      text: detour.rumor ?? `Travelers mention a side path near location ${detour.forkAt}: ${detour.label}.`,
    });
  }

  if (candidates.length === 0) return null;
  const index = Math.floor(roll * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

export function sampleSagaEventId(state: GameState, roll: number): string | null {
  if (roll > 0.35) return null;

  const loc = state.currentLocationId;
  for (const thread of state.runLayout.sagaThreads ?? []) {
    for (const beat of thread.beats) {
      if (loc < beat.minLoc || loc > beat.maxLoc) continue;
      if (beat.requiredFlag && !state.storyFlags.has(beat.requiredFlag)) continue;
      if (beat.forbiddenFlag && state.storyFlags.has(beat.forbiddenFlag)) continue;
      const firedKey = `saga_fired_${beat.eventId}`;
      if (state.firedEventIds.has(firedKey)) continue;
      return beat.eventId;
    }
  }
  return null;
}
