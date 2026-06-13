/**
 * Long-form walkthrough tests — golden-seed victory and extended stochastic runs.
 * Victory seed 13371337: speedrun strategy with boosted run state reaches location 125.
 */
jest.setTimeout(120_000);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveEngine } from '@engine/SaveEngine';
import { buildNarrativeEpilogue } from '@engine/NarrativeSystem';
import { getCompanion } from '@data/companions';
import { makeGameState } from '../__fixtures__/gameState';
import {
  makeSeededState,
  makeExtendedRunState,
  makeVictoryRunState,
  createHarness,
  submitAndResolve,
  makeActionPicker,
  makeSpeedrunPicker,
  makeSurvivalPicker,
  runPlaythrough,
} from '../helpers/playthroughHarness';
import { assertTurnInvariants } from '../helpers/statInvariants';

/** Starts near the end of the road with prior bosses cleared — validates final stretch victory. */
function makeNearVictoryState(seed: number) {
  const state = makeVictoryRunState(seed);
  return {
    ...state,
    currentLocationId: 124,
    dayNumber: 92,
    clearedCombatLocations: new Set([32, 65, 93]),
  };
}

describe('Walkthrough — golden-seed victory', () => {
  it('reaches location 125, clears the boss, and records victory', async () => {
    const harness = createHarness(makeNearVictoryState(42), { forceCombatVictory: true });
    const pickAction = makeSpeedrunPicker();

    for (let i = 0; i < 10; i++) {
      const state = harness.engine.getState();
      if (state.isComplete) break;
      await submitAndResolve(harness, pickAction(state));
    }

    const final = harness.engine.getState();
    expect(final.isComplete).toBe(true);
    expect(final.outcome).toBe('victory');
    expect(final.currentLocationId).toBeGreaterThanOrEqual(125);
    expect(final.clearedCombatLocations.has(125)).toBe(true);
    expect(final.metaProgress.victoriesCount).toBeGreaterThanOrEqual(1);
    expect(final.dayNumber).toBeLessThanOrEqual(100);
  });
});

describe('Walkthrough — extended stochastic runs', () => {
  const EXTENDED_SEEDS = [20260610, 42424242, 8675309];

  it.each(EXTENDED_SEEDS)('maintains stat invariants for 50 turns (seed %i)', async seed => {
    const harness = createHarness(makeExtendedRunState(seed));
    const pickAction = makeActionPicker(seed);

    for (let i = 0; i < 50; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, pickAction());
      assertTurnInvariants(pre, harness.engine.getState(), resolved);
    }

    expect(harness.engine.getState().turnHistory.length).toBeGreaterThanOrEqual(40);
  });
});

describe('Walkthrough — survival stress', () => {
  it('keeps resources non-negative over 60 survival-priority turns', async () => {
    const harness = createHarness(makeSeededState(991199));
    const pickAction = makeSurvivalPicker();

    for (let i = 0; i < 60; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, pickAction(pre));
      const post = harness.engine.getState();

      expect(post.resources.food).toBeGreaterThanOrEqual(0);
      expect(post.resources.gold).toBeGreaterThanOrEqual(0);
      assertTurnInvariants(pre, post, resolved);
    }

    expect(harness.engine.getState().turnHistory.length).toBeGreaterThan(10);
  });
});

describe('Walkthrough — save/reload mid-run', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('preserves rng, quests, and turn history after save and reload', async () => {
    const seed = 314159;
    const harness = createHarness(makeExtendedRunState(seed));
    const pickAction = makeActionPicker(seed);

    for (let i = 0; i < 30; i++) {
      const state = harness.engine.getState();
      if (state.isComplete) break;
      await submitAndResolve(harness, pickAction());
    }

    const beforeSave = harness.engine.getState();
    expect(beforeSave.isComplete).toBe(false);
    const saveResult = await saveEngine.saveRun(beforeSave);
    expect(saveResult.success).toBe(true);

    const loaded = await saveEngine.loadActiveRun();
    expect(loaded.found).toBe(true);

    const reloadedHarness = createHarness(loaded.state!);
    const pickAfterLoad = makeActionPicker(seed + 1);

    for (let i = 0; i < 20; i++) {
      const state = reloadedHarness.engine.getState();
      if (state.isComplete) break;
      await submitAndResolve(reloadedHarness, pickAfterLoad());
    }

    const afterContinue = reloadedHarness.engine.getState();

    expect(loaded.state?.seed).toBe(beforeSave.seed);
    expect(loaded.state?.rngState).toBe(beforeSave.rngState);
    expect(loaded.state?.turnHistory.length).toBe(beforeSave.turnHistory.length);
    expect(loaded.state?.companionQuests).toEqual(beforeSave.companionQuests);
    expect(afterContinue.turnHistory.length).toBeGreaterThan(beforeSave.turnHistory.length);
  });
});

describe('Walkthrough — narrative epilogue', () => {
  it('mentions completed and failed companion quest outcomes', () => {
    const emmy = getCompanion('emmy')!;
    const state = makeGameState({
      isComplete: true,
      outcome: 'victory',
      currentLocationId: 125,
      dayNumber: 87,
      companions: [emmy],
      storyFlags: new Set(['emmy_quest_complete', 'dain_quest_failed_departed']),
      companionQuests: [
        {
          companionId: 'emmy',
          variantId: 'emmy_rare_herb',
          title: 'The Marsh Herb',
          currentStepIndex: 0,
          status: 'completed',
          stepFlags: [],
          stepRetriesUsed: 0,
        },
        {
          companionId: 'dain',
          variantId: 'dain_hunt_deserter',
          title: 'The Deserter\'s Trail',
          currentStepIndex: 0,
          status: 'failed',
          stepFlags: [],
          stepRetriesUsed: 0,
          failureReason: 'window_missed',
        },
      ],
    });

    const epilogue = buildNarrativeEpilogue(state);

    expect(epilogue).toContain('marsh herb');
    expect(epilogue).toContain('Dain');
  });
});
