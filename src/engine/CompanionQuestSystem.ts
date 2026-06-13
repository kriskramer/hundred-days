import type {
  ActiveCompanionQuest,
  Companion,
  CompanionQuestFailureReason,
  CompanionQuestStep,
  CompanionQuestVariant,
  GameState,
  QuestFailureOutcome,
} from './types';
import {
  getCompanionQuestVariant,
  getCompanionQuestVariantsForCompanion,
} from '@data/companionQuests';
import { getCompanion } from '@data/companions';
import { nextMulberry32 } from './Random';

export function assignCompanionQuest(
  state: GameState,
  companionId: string,
): ActiveCompanionQuest | null {
  const existing = state.companionQuests?.find(q => q.companionId === companionId);
  if (existing) return existing;

  const variants = getCompanionQuestVariantsForCompanion(companionId);
  if (variants.length === 0) return null;

  let rngState = (state.rngState ^ Math.imul(companionId.length, 0x9e3779b1)) >>> 0;
  const roll = nextMulberry32(rngState);
  const variant = variants[Math.floor(roll.value * variants.length)];

  return createActiveQuest(variant, state.currentLocationId);
}

function createActiveQuest(
  variant: CompanionQuestVariant,
  _recruitLocationId: number,
): ActiveCompanionQuest {
  const quest: ActiveCompanionQuest = {
    companionId: variant.companionId,
    variantId: variant.id,
    title: variant.title,
    currentStepIndex: 0,
    status: 'active',
    stepFlags: [],
    stepRetriesUsed: 0,
  };
  return applyStepPins(quest, variant);
}

function applyStepPins(
  quest: ActiveCompanionQuest,
  variant: CompanionQuestVariant,
): ActiveCompanionQuest {
  const step = variant.steps[quest.currentStepIndex];
  if (!step) return quest;

  return {
    ...quest,
    pinnedLocationId: getStepLocationId(step),
    stepDeadlineLocationId: step.maxLocationId,
  };
}

function getStepLocationId(step: CompanionQuestStep): number {
  return step.locationId;
}

export function getActiveQuestForCompanion(
  state: GameState,
  companionId: string,
): ActiveCompanionQuest | undefined {
  return state.companionQuests?.find(
    q => q.companionId === companionId && q.status === 'active',
  );
}

export function getQuestAtLocation(state: GameState, locationId: number): ActiveCompanionQuest | undefined {
  return state.companionQuests?.find(
    q => q.status === 'active' && q.pinnedLocationId === locationId,
  );
}

export function getQuestStep(quest: ActiveCompanionQuest): CompanionQuestStep | undefined {
  const variant = getCompanionQuestVariant(quest.variantId);
  return variant?.steps[quest.currentStepIndex];
}

export function getQuestRecruitHint(companionId: string, variantId: string): string | undefined {
  return getCompanionQuestVariant(variantId)?.recruitHint;
}

export function advanceCompanionQuest(
  state: GameState,
  companionId: string,
): GameState {
  const quests = [...(state.companionQuests ?? [])];
  const index = quests.findIndex(q => q.companionId === companionId && q.status === 'active');
  if (index < 0) return state;

  const quest = quests[index];
  const variant = getCompanionQuestVariant(quest.variantId);
  if (!variant) return state;

  const storyFlags = new Set(state.storyFlags);
  variant.stakes.onComplete.flags?.forEach(f => storyFlags.add(f));
  variant.completionFlags.forEach(f => storyFlags.add(f));

  const nextIndex = quest.currentStepIndex + 1;
  if (nextIndex >= variant.steps.length) {
    quests[index] = { ...quest, status: 'completed', stepFlags: [...quest.stepFlags, `step_${quest.currentStepIndex}_done`] };
    return applyQuestRewards({ ...state, companionQuests: quests, storyFlags }, variant, 'complete');
  }

  const updated: ActiveCompanionQuest = applyStepPins({
    ...quest,
    currentStepIndex: nextIndex,
    stepFlags: [...quest.stepFlags, `step_${quest.currentStepIndex}_done`],
  }, variant);

  quests[index] = updated;
  return applyQuestRewards({ ...state, companionQuests: quests, storyFlags }, variant, 'step');
}

function applyQuestRewards(
  state: GameState,
  variant: CompanionQuestVariant,
  phase: 'step' | 'complete',
): GameState {
  const profile = phase === 'complete' ? variant.stakes.onComplete : variant.stakes.onStepFail;
  const loyaltyDelta = phase === 'complete' ? (variant.stakes.onComplete.loyalty ?? 5) : 0;
  const moraleDelta = phase === 'complete' ? (variant.stakes.onComplete.morale ?? 0) : 0;

  if (loyaltyDelta === 0 && moraleDelta === 0) return state;

  const companions = state.companions.map(c => {
    if (c.id !== variant.companionId) return c;
    return {
      ...c,
      loyalty: {
        ...c.loyalty,
        value: Math.min(100, c.loyalty.value + loyaltyDelta),
      },
    };
  });

  let morale = state.morale;
  if (moraleDelta !== 0) {
    const newValue = Math.min(100, Math.max(0, morale.value + moraleDelta));
    morale = { ...morale, value: newValue };
  }

  void profile;
  return { ...state, companions, morale };
}

export function resolveCompanionQuestFailure(
  state: GameState,
  companionId: string,
  reason: CompanionQuestFailureReason,
): { state: GameState; narrative: string; companionDeparted: boolean } {
  const quests = [...(state.companionQuests ?? [])];
  const index = quests.findIndex(q => q.companionId === companionId && q.status === 'active');
  if (index < 0) {
    return { state, narrative: '', companionDeparted: false };
  }

  const quest = quests[index];
  const variant = getCompanionQuestVariant(quest.variantId);
  if (!variant) {
    return { state, narrative: '', companionDeparted: false };
  }

  const outcome = variant.stakes.onQuestFail;
  const storyFlags = new Set(state.storyFlags);
  storyFlags.add(`${companionId}_quest_failed`);

  quests[index] = {
    ...quest,
    status: 'failed',
    failureReason: reason,
  };

  let companions = [...state.companions];
  let narrative = outcome.narrative;
  let companionDeparted = false;

  if (outcome.type === 'companion_departure') {
    companions = companions.filter(c => c.id !== companionId);
    storyFlags.add(outcome.epilogueFlag);
    narrative = outcome.departureNarrative;
    companionDeparted = true;
  } else if (outcome.type === 'loyalty_crash' || outcome.type === 'loyalty_loss') {
    companions = applyLoyaltyLoss(companions, companionId, outcome.amount);
  }

  return {
    state: { ...state, companionQuests: quests, companions, storyFlags },
    narrative,
    companionDeparted,
  };
}

function applyLoyaltyLoss(
  companions: Companion[],
  companionId: string,
  amount: number,
): Companion[] {
  return companions.map(c => {
    if (c.id !== companionId) return c;
    return {
      ...c,
      loyalty: {
        ...c.loyalty,
        value: Math.max(0, c.loyalty.value - amount),
      },
    };
  });
}

export function checkQuestDeadlinesAfterMove(
  state: GameState,
  previousLocationId: number,
  newLocationId: number,
): { state: GameState; narratives: string[] } {
  if (newLocationId <= previousLocationId) {
    return { state, narratives: [] };
  }

  const narratives: string[] = [];
  let current = state;

  for (const quest of state.companionQuests ?? []) {
    if (quest.status !== 'active' || !quest.stepDeadlineLocationId) continue;

    const warnLoc = quest.stepDeadlineLocationId - 2;
    if (previousLocationId < warnLoc && newLocationId >= warnLoc && newLocationId <= quest.stepDeadlineLocationId) {
      const companion = getCompanion(quest.companionId);
      narratives.push(`${companion?.name ?? 'Your companion'} grows restless — the trail is going cold.`);
    }

    if (newLocationId > quest.stepDeadlineLocationId) {
      const result = resolveCompanionQuestFailure(current, quest.companionId, 'window_missed');
      current = result.state;
      if (result.narrative) narratives.push(result.narrative);
    }
  }

  return { state: current, narratives };
}

export function applyQuestNeglectLoyalty(state: GameState): GameState {
  let companions = state.companions;
  for (const quest of state.companionQuests ?? []) {
    if (quest.status !== 'active' || !quest.pinnedLocationId) continue;
    if (state.currentLocationId <= quest.pinnedLocationId) continue;
    companions = applyLoyaltyLoss(companions, quest.companionId, 1);
  }
  return { ...state, companions };
}

export function resolveQuestSearch(
  state: GameState,
  companionId: string,
  successRoll: number,
): { state: GameState; success: boolean; narrative: string } {
  const quest = getActiveQuestForCompanion(state, companionId);
  if (!quest) return { state, success: false, narrative: '' };

  const step = getQuestStep(quest);
  if (!step || step.type !== 'search') {
    return { state, success: false, narrative: '' };
  }

  const companion = state.companions.find(c => c.id === companionId);
  const bonus = (companion?.passiveBonus.foragingBonus ?? 0) * 0.05;
  const success = successRoll < 0.55 + bonus;

  if (success) {
    return {
      state: advanceCompanionQuest(state, companionId),
      success: true,
      narrative: `${companion?.name ?? 'Your companion'} finds what you were searching for.`,
    };
  }

  const variant = getCompanionQuestVariant(quest.variantId);
  if (!variant) return { state, success: false, narrative: 'The search turns up nothing.' };

  if (variant.stakes.level === 'high') {
    const result = resolveCompanionQuestFailure(state, companionId, 'step_failed');
    return { state: result.state, success: false, narrative: result.narrative || step.failDialogueId || 'The search fails.' };
  }

  const loyaltyLoss = variant.stakes.onStepFail.loyalty ?? 5;
  return {
    state: {
      ...state,
      companions: applyLoyaltyLoss(state.companions, companionId, loyaltyLoss),
    },
    success: false,
    narrative: 'The search turns up nothing useful.',
  };
}

export function onCompanionRecruited(state: GameState, companionId: string): GameState {
  const quest = assignCompanionQuest(state, companionId);
  if (!quest) return state;
  return {
    ...state,
    companionQuests: [...(state.companionQuests ?? []), quest],
  };
}

export function findQuestForDialogue(
  state: GameState,
  dialogueId: string,
): { companionId: string } | null {
  for (const quest of state.companionQuests ?? []) {
    if (quest.status !== 'active') continue;
    const step = getQuestStep(quest);
    if (!step) continue;
    if ((step.type === 'dialogue' || step.type === 'visit') && step.dialogueId === dialogueId) {
      return { companionId: quest.companionId };
    }
  }
  return null;
}

export function getQuestDialogueId(state: GameState, quest: ActiveCompanionQuest): string | null {
  const step = getQuestStep(quest);
  if (!step) return null;
  if (step.type === 'dialogue' || step.type === 'visit') return step.dialogueId;
  return null;
}

export function getQuestActionLabel(quest: ActiveCompanionQuest): string | null {
  const step = getQuestStep(quest);
  if (!step) return null;
  const companion = getCompanion(quest.companionId);
  const name = companion?.name ?? 'Companion';

  switch (step.type) {
    case 'search':
      return `Search with ${name}`;
    case 'miniboss':
      return `Confront ${quest.title}`;
    case 'visit':
    case 'dialogue':
      return `${name}'s Quest`;
    default:
      return null;
  }
}
