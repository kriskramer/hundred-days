import {
  createHarness,
  makeSeededState,
  submitAndResolve,
  resolveLocationQuestDialogue,
  makeActionPicker,
  advanceQuestAfterDialogue,
} from '../helpers/playthroughHarness';
import { getCompanion } from '@data/companions';
import { onCompanionRecruited } from '@engine/CompanionQuestSystem';
import { getQuestStep } from '@engine/CompanionQuestSystem';
import { PlayerAction } from '@engine/types';
import { makeGameState } from '../__fixtures__/gameState';

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

function withDainDeserterQuest(locationId: number) {
  const dain = getCompanion('dain')!;
  return makeGameState({
    currentLocationId: locationId,
    companions: [dain],
    companionQuests: [{
      companionId: 'dain',
      variantId: 'dain_hunt_deserter',
      title: 'The Deserter\'s Trail',
      currentStepIndex: 0,
      status: 'active',
      stepFlags: [],
      stepRetriesUsed: 0,
      pinnedLocationId: 35,
      stepDeadlineLocationId: 45,
    }],
  });
}

describe('CompanionQuest — integration scenarios', () => {
  it('completes Dain dialogue + miniboss quest steps', async () => {
    let state = withDainDeserterQuest(35);
    const harness = createHarness(state, { forceCombatVictory: true });

    resolveLocationQuestDialogue(harness, 'dain_quest_deserter_1');
    state = harness.engine.getState();

    expect(state.companionQuests![0].currentStepIndex).toBe(1);
    expect(state.companionQuests![0].pinnedLocationId).toBe(40);
    expect(getQuestStep(state.companionQuests![0])?.type).toBe('miniboss');

    harness.engine.syncExternalState({
      ...harness.engine.getState(),
      currentLocationId: 40,
    });

    await submitAndResolve(harness, {
      action: PlayerAction.Hunt,
      method: 'hunt',
      questCompanionId: 'dain',
      questFight: true,
    });

    state = harness.engine.getState();
    expect(state.companionQuests![0].status).toBe('completed');
    expect(state.storyFlags.has('dain_quest_complete')).toBe(true);
    expect(state.pendingQuestCombat).toBeUndefined();
    const dain = state.companions.find(c => c.id === 'dain');
    expect(dain!.loyalty.value).toBeGreaterThan(60);
  });

  it('completes Emmy search quest with deterministic hunt success', async () => {
    const emmy = getCompanion('emmy')!;
    let state = makeGameState({
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
    expect(state.companionQuests![0].pinnedLocationId).toBe(42);

    const harness = createHarness(state, { randomOverride: () => 0.0 });
    const loyaltyBefore = harness.engine.getState().companions[0].loyalty.value;

    await submitAndResolve(harness, {
      action: PlayerAction.Hunt,
      method: 'forage',
      questCompanionId: 'emmy',
    });

    state = harness.engine.getState();
    expect(state.companionQuests![0].status).toBe('completed');
    expect(state.storyFlags.has('emmy_quest_complete')).toBe(true);
    expect(state.companions[0].loyalty.value).toBeGreaterThan(loyaltyBefore);
  });

  it('fails a high-stakes quest when the deadline is missed on move', async () => {
    let state = withDainDeserterQuest(44);
    const harness = createHarness(state);

    await submitAndResolve(harness, { action: PlayerAction.Move, forcedMarch: true });

    state = harness.engine.getState();
    expect(state.companionQuests![0].status).toBe('failed');
    expect(state.companionQuests![0].failureReason).toBe('window_missed');
    expect(state.companions.some(c => c.id === 'dain')).toBe(false);
    expect(state.storyFlags.has('dain_quest_failed_departed')).toBe(true);
  });

  it('advances quest after turn-bound dialogue via harness helper', () => {
    const harness = createHarness(withDainDeserterQuest(35));

    advanceQuestAfterDialogue(harness.engine, 'dain_quest_deserter_1');

    const state = harness.engine.getState();
    expect(state.companionQuests![0].currentStepIndex).toBe(1);
    expect(state.companionQuests![0].pinnedLocationId).toBe(40);
  });

  it('performs normal forage when hunt quest is at the wrong location', async () => {
    const emmy = getCompanion('emmy')!;
    const state = makeGameState({
      currentLocationId: 30,
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
    const harness = createHarness(state);

    await submitAndResolve(harness, {
      action: PlayerAction.Hunt,
      method: 'forage',
      questCompanionId: 'emmy',
    });

    const post = harness.engine.getState();
    expect(post.companionQuests![0].status).toBe('active');
    expect(post.companionQuests![0].currentStepIndex).toBe(0);
    const record = post.turnHistory[post.turnHistory.length - 1];
    expect(record.deltas.some(d => d.source === 'quest_search')).toBe(false);
  });
});

describe('CompanionQuest — recruitment smoke', () => {
  it('assigns companion quests after recruitment from a seeded playthrough', async () => {
    const seed = 13013;
    const harness = createHarness(makeSeededState(seed));
    const pickAction = makeActionPicker(seed);

    let recruited = false;

    for (let i = 0; i < 30 && !recruited; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      await submitAndResolve(harness, pickAction());
      const post = harness.engine.getState();

      if (post.companions.length > pre.companions.length) {
        expect(post.companionQuests?.length).toBeGreaterThan(0);
        recruited = true;
      }
    }

    if (!recruited) {
      const dain = getCompanion('dain')!;
      harness.engine.addCompanion(dain);
      expect(harness.engine.getState().companionQuests?.length).toBeGreaterThan(0);
    }
  });
});
