import { CompanionArchetype, PlayerAction, WeatherType } from '@engine/types';
import { getTravelDialogueTriggerChance, sampleTravelDialogue } from '@engine/RoadDialogueSystem';
import { makeCompanion, makeGameState, makeMoraleState, makeReputationState } from '../__fixtures__/gameState';

jest.mock('@data/locations', () => ({
  getLocation: jest.fn(() => ({
    id: 60,
    name: 'Test Wilderness',
    type: 'wilderness',
    region: 'Test Region',
    isTown: false,
    hasShop: false,
    mobs: [],
    actions: { canSteal: false, huntYield: 1.0, restQuality: 1.0, travelDifficulty: 1.0, hasBossFight: false },
    bossLevel: null,
    locationText: '',
    randomTexts: [],
    eventPool: [],
  })),
}));

describe('RoadDialogueSystem', () => {
  it('returns null when the gate roll misses the trigger chance', () => {
    const state = makeGameState({
      currentLocationId: 60,
      morale: makeMoraleState(65),
      reputation: makeReputationState(50),
      companions: [
        makeCompanion({
          id: 'sage_one',
          name: 'Ilya',
          archetype: CompanionArchetype.Sage,
        }),
      ],
    });

    expect(sampleTravelDialogue(state, 0.99, 0.1)).toBeNull();
  });

  it('selects an eligible late-road sage line', () => {
    const state = makeGameState({
      currentLocationId: 60,
      morale: makeMoraleState(65),
      reputation: makeReputationState(50),
      companions: [
        makeCompanion({
          id: 'sage_one',
          name: 'Ilya',
          archetype: CompanionArchetype.Sage,
        }),
      ],
    });

    const dialogue = sampleTravelDialogue(state, 0.01, 0.2);

    expect(dialogue).not.toBeNull();
    expect(dialogue?.sourceId).toBe('companion_sage_late_road_01');
    expect(dialogue?.speakerName).toBe('Ilya');
  });

  it('suppresses a recently used dialogue occurrence', () => {
    const state = makeGameState({
      currentLocationId: 60,
      morale: makeMoraleState(65),
      reputation: makeReputationState(50),
      companions: [
        makeCompanion({
          id: 'sage_one',
          name: 'Ilya',
          archetype: CompanionArchetype.Sage,
        }),
      ],
      turnHistory: [
        {
          dayNumber: 3,
          locationBefore: 59,
          locationAfter: 60,
          action: PlayerAction.Move,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          travelDialogue: {
            id: 'companion_sage_late_road_01:sage_one',
            sourceId: 'companion_sage_late_road_01',
            speakerType: 'companion',
            speakerName: 'Ilya',
            speakerId: 'sage_one',
            text: 'Every league east strips away another illusion. I suppose that is its own kind of mercy.',
          },
          levelUpOccurred: false,
          narrativeSummary: 'The road stretches ahead.',
        },
      ],
    });

    expect(sampleTravelDialogue(state, 0.01, 0.2)).toBeNull();
  });

  it('raises the trigger chance when morale, reputation, and loyalty are volatile', () => {
    const state = makeGameState({
      currentLocationId: 60,
      morale: makeMoraleState(25),
      reputation: makeReputationState(20),
      companions: [
        makeCompanion({
          id: 'merc_one',
          name: 'Varro',
          archetype: CompanionArchetype.Mercenary,
          loyalty: { value: 18, desertsBelow: 10, complainsBelow: 30 },
        }),
      ],
    });

    expect(getTravelDialogueTriggerChance(state)).toBeGreaterThan(0.2);
  });
});
