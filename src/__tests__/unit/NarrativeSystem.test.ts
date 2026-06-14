import {
  pickQuestPremiseId,
  buildShortcutScenarioDeltas,
  buildNarrativeEpilogue,
  getShortcutKey,
} from '@engine/NarrativeSystem';
import { generateRunLayout } from '@engine/RunLayout';
import { makeGameState } from '../__fixtures__/gameState';
import { getCompanion } from '@data/companions';

describe('NarrativeSystem', () => {
  it('picks a deterministic quest premise template from the seed', () => {
    expect(pickQuestPremiseId(0)).toBe(pickQuestPremiseId(0));
    expect(pickQuestPremiseId(7)).toBe(pickQuestPremiseId(7));
    expect(pickQuestPremiseId(0)).not.toBe(pickQuestPremiseId(1));
  });

  it('builds shortcut scenario deltas only on first use', () => {
    const layout = generateRunLayout(99);
    const shortcut = layout.activeShortcuts[0];
    const key = getShortcutKey(shortcut);

    const first = buildShortcutScenarioDeltas(shortcut, true);
    const repeat = buildShortcutScenarioDeltas(shortcut, false);

    if (first.length > 0) {
      expect(first[0].source).toBe('shortcut_scenario');
      expect(first[0].narrative).toBeDefined();
    }
    expect(repeat).toEqual([]);
    expect(key).toContain(String(shortcut.from));
  });

  it('includes completed quest epilogue text in the narrative epilogue', () => {
    const emmy = getCompanion('emmy')!;
    const state = makeGameState({
      isComplete: true,
      outcome: 'victory',
      currentLocationId: 125,
      dayNumber: 90,
      companions: [emmy],
      companionQuests: [{
        companionId: 'emmy',
        variantId: 'emmy_rare_herb',
        title: 'The Marsh Herb',
        currentStepIndex: 0,
        status: 'completed',
        stepFlags: [],
        stepRetriesUsed: 0,
      }],
    });

    const epilogue = buildNarrativeEpilogue(state);
    expect(epilogue).toContain('marsh herb');
    expect(epilogue).toContain('Roachak');
  });

  it('includes failed quest departure epilogue when present', () => {
    const state = makeGameState({
      isComplete: true,
      outcome: 'defeat',
      currentLocationId: 60,
      dayNumber: 55,
      companions: [],
      storyFlags: new Set(['dain_quest_failed_departed']),
      companionQuests: [{
        companionId: 'dain',
        variantId: 'dain_hunt_deserter',
        title: 'The Deserter\'s Trail',
        currentStepIndex: 0,
        status: 'failed',
        stepFlags: [],
        stepRetriesUsed: 0,
        failureReason: 'window_missed',
      }],
    });

    const epilogue = buildNarrativeEpilogue(state);
    expect(epilogue.toLowerCase()).toContain('dain');
  });
});
