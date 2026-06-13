import {
  onCompanionRecruited,
  assignCompanionQuest,
  advanceCompanionQuest,
  resolveQuestSearch,
  checkQuestDeadlinesAfterMove,
  applyQuestNeglectLoyalty,
  findQuestForDialogue,
  getActiveQuestForCompanion,
  getQuestStep,
  resolveCompanionQuestFailure,
} from '@engine/CompanionQuestSystem';
import { makeGameState, makeCompanion } from '../__fixtures__/gameState';
import { getCompanion } from '@data/companions';
import { getCompanionQuestVariant } from '@data/companionQuests';
import type { ActiveCompanionQuest, GameState } from '@engine/types';

function withDainQuest(
  overrides: Partial<GameState> = {},
  variantId = 'dain_hunt_deserter',
): GameState {
  const dain = getCompanion('dain')!;
  const base = makeGameState({
    currentLocationId: 35,
    companions: [dain],
    ...overrides,
  });
  const quest: ActiveCompanionQuest = {
    companionId: 'dain',
    variantId,
    title: getCompanionQuestVariant(variantId)!.title,
    currentStepIndex: 0,
    status: 'active',
    stepFlags: [],
    stepRetriesUsed: 0,
    pinnedLocationId: variantId === 'dain_hunt_deserter' ? 35 : 38,
    stepDeadlineLocationId: variantId === 'dain_hunt_deserter' ? 45 : 48,
  };
  return { ...base, companionQuests: [quest] };
}

describe('CompanionQuestSystem', () => {
  it('assigns a quest when a companion is recruited', () => {
    const state = makeGameState({ companionQuests: [] });
    const next = onCompanionRecruited(state, 'dain');

    expect(next.companionQuests).toHaveLength(1);
    expect(next.companionQuests![0].status).toBe('active');
    expect(next.companionQuests![0].companionId).toBe('dain');
    expect(next.companionQuests![0].pinnedLocationId).toBeDefined();
  });

  it('does not duplicate quests for the same companion', () => {
    const state = withDainQuest();
    const existing = assignCompanionQuest(state, 'dain');
    expect(existing?.variantId).toBe('dain_hunt_deserter');
    expect(assignCompanionQuest(state, 'dain')?.variantId).toBe('dain_hunt_deserter');
  });

  it('advances dialogue steps and re-pins the next location', () => {
    const state = withDainQuest();
    const next = advanceCompanionQuest(state, 'dain');
    const quest = getActiveQuestForCompanion(next, 'dain');

    expect(quest?.currentStepIndex).toBe(1);
    expect(quest?.pinnedLocationId).toBe(40);
    expect(quest?.stepDeadlineLocationId).toBe(45);
  });

  it('completes a quest on the final step and sets story flags', () => {
    let state = withDainQuest();
    state = advanceCompanionQuest(state, 'dain');
    state = advanceCompanionQuest(state, 'dain');

    const quest = state.companionQuests![0];
    expect(quest.status).toBe('completed');
    expect(state.storyFlags.has('dain_quest_complete')).toBe(true);
  });

  it('resolves search success and completes a single-step quest', () => {
    const emmy = getCompanion('emmy')!;
    const state = makeGameState({
      currentLocationId: 42,
      companions: [emmy],
      companionQuests: [{
        companionId: 'emmy',
        variantId: 'emmy_rare_herb',
        title: 'The Marsh Herb',
        currentStepIndex: 0,
        status: 'active',
        stepFlags: [],
        stepRetriesUsed: 0,
        pinnedLocationId: 42,
        stepDeadlineLocationId: 52,
      }],
    });

    const result = resolveQuestSearch(state, 'emmy', 0.0);
    expect(result.success).toBe(true);
    expect(result.state.companionQuests![0].status).toBe('completed');
    expect(result.state.storyFlags.has('emmy_quest_complete')).toBe(true);
  });

  it('applies loyalty loss on medium-stakes search failure without failing the quest', () => {
    const state = withDainQuest({}, 'dain_heirloom');
    const dainBefore = state.companions[0].loyalty.value;

    const result = resolveQuestSearch(state, 'dain', 0.99);
    expect(result.success).toBe(false);
    expect(result.state.companionQuests![0].status).toBe('active');
    expect(result.state.companions[0].loyalty.value).toBeLessThan(dainBefore);
  });

  it('removes companion on high-stakes quest failure via step_failed', () => {
    const highStakesState = withDainQuest({ currentLocationId: 35 });

    const result = resolveCompanionQuestFailure(highStakesState, 'dain', 'step_failed');
    expect(result.state.companionQuests![0].status).toBe('failed');
    expect(result.companionDeparted).toBe(true);
    expect(result.state.companions.some(c => c.id === 'dain')).toBe(false);
  });

  it('warns two locations before a quest deadline', () => {
    const state = withDainQuest({ currentLocationId: 42 });
    const { narratives } = checkQuestDeadlinesAfterMove(state, 41, 43);

    expect(narratives.some(n => n.includes('restless'))).toBe(true);
  });

  it('fails a quest when the deadline location is passed', () => {
    const state = withDainQuest({ currentLocationId: 44 });
    const { state: next, narratives } = checkQuestDeadlinesAfterMove(state, 44, 46);

    expect(next.companionQuests![0].status).toBe('failed');
    expect(next.companionQuests![0].failureReason).toBe('window_missed');
    expect(next.companions.some(c => c.id === 'dain')).toBe(false);
    expect(narratives.length).toBeGreaterThan(0);
  });

  it('does not check deadlines when moving backward', () => {
    const state = withDainQuest({ currentLocationId: 50 });
    const { state: next, narratives } = checkQuestDeadlinesAfterMove(state, 50, 48);

    expect(next.companionQuests![0].status).toBe('active');
    expect(narratives).toHaveLength(0);
  });

  it('reduces loyalty when passing a pinned quest location without completing it', () => {
    const state = withDainQuest({ currentLocationId: 36 });
    const before = state.companions[0].loyalty.value;
    const next = applyQuestNeglectLoyalty(state);

    expect(next.companions[0].loyalty.value).toBe(before - 1);
  });

  it('maps dialogue ids to active quest companions', () => {
    const state = withDainQuest();
    const step = getQuestStep(state.companionQuests![0]);
    expect(step?.type).toBe('dialogue');

    if (step?.type === 'dialogue') {
      const match = findQuestForDialogue(state, step.dialogueId);
      expect(match?.companionId).toBe('dain');
    }
  });

  it('returns null for dialogue ids that do not match an active quest step', () => {
    const state = withDainQuest();
    expect(findQuestForDialogue(state, 'unknown_dialogue')).toBeNull();
  });

  it('assigns emmy quest variant with search step at pinned location', () => {
    const state = makeGameState({ companionQuests: [], rngState: 12345 });
    const next = onCompanionRecruited(state, 'emmy');
    const quest = next.companionQuests?.find(q => q.companionId === 'emmy');

    expect(quest).toBeDefined();
    if (!quest) return;

    const step = getQuestStep(quest);
    expect(step?.type).toBe('search');
    if (step?.type === 'search') {
      expect(step.locationId).toBe(quest.pinnedLocationId);
    }
  });
});

describe('CompanionQuestSystem — companion fixture', () => {
  it('makeCompanion provides valid defaults for quest tests', () => {
    const companion = makeCompanion({ id: 'test_ally', loyalty: { value: 55, desertsBelow: 15, complainsBelow: 35 } });
    expect(companion.loyalty.value).toBe(55);
  });
});
