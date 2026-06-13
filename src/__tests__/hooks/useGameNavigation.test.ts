import { renderHook, act } from '@testing-library/react-native';
import { useGameNavigation } from '@hooks/useGameNavigation';
import { makeGameState } from '../__fixtures__/gameState';
import { useGameStore } from '@store/gameStore';
import { EventType, ResolutionType, TurnPhase, PlayerAction } from '@engine/types';
import { getCompanion } from '@data/companions';
import { playDialogueEncounter } from '../helpers/playthroughHarness';

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: {
    saveRun: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('useGameNavigation', () => {
  beforeEach(() => {
    useGameStore.setState({ gameState: null });
  });

  function mountHook(initialState = makeGameState()) {
    useGameStore.setState({ gameState: initialState });
    return renderHook(() => {
      const gameState = useGameStore(s => s.gameState);
      const setGame = useGameStore(s => s.setGameState);
      return useGameNavigation({ gameState, setGame });
    });
  }

  it('starts on the road with no active interaction', () => {
    const { result } = mountHook();
    expect(result.current.hubTab).toBe('road');
    expect(result.current.interaction.kind).toBe('none');
    expect(result.current.roadVisible).toBe(true);
  });

  it('opens merchant interaction from handleOpenShop', () => {
    const { result } = mountHook(makeGameState({ currentLocationId: 27 }));

    act(() => {
      result.current.handleOpenShop('Test Merchant', 'Welcome traveler.');
    });

    expect(result.current.interaction).toEqual({
      kind: 'merchant',
      entryNarrative: 'Welcome traveler.',
      merchantName: 'Test Merchant',
    });
    expect(result.current.roadVisible).toBe(false);
  });

  it('returns to road and bumps merchantCloseKey when merchant closes', () => {
    const { result } = mountHook(makeGameState({ currentLocationId: 27 }));

    act(() => {
      result.current.handleOpenShop('Test Merchant', 'Welcome traveler.');
    });

    act(() => {
      result.current.handleMerchantClose();
    });

    expect(result.current.interaction.kind).toBe('none');
    expect(result.current.roadVisible).toBe(true);
    expect(result.current.merchantCloseKey).toBe(1);
  });

  it('opens npc interaction with event context', () => {
    const activeEvent = {
      id: 'merchant_road_01',
      type: EventType.Dialogue,
      resolutionType: ResolutionType.Interactive,
      name: 'Trader',
      description: 'A trader blocks the road.',
      conditions: {},
      interactiveHandlerId: 'dialogue_handler',
      repeatable: true,
      tags: ['dialogue'],
    };

    const { result } = mountHook();

    act(() => {
      result.current.handleOpenNpc('merchant_road_01', activeEvent);
    });

    expect(result.current.interaction).toEqual({
      kind: 'npc',
      dialogueId: 'merchant_road_01',
      event: activeEvent,
    });
  });

  it('reports blocking interaction during combat alert', () => {
    const { result } = mountHook(makeGameState({ currentLocationId: 27 }));

    act(() => {
      result.current.handleOpenCombat();
    });

    expect(result.current.combatAlertVisible).toBe(true);
    expect(result.current.isBlockingInteraction()).toBe(true);
  });

  it('locks road actions while awaiting player input', () => {
    const state = makeGameState({
      currentTurn: {
        action: 'move' as never,
        phase: TurnPhase.AwaitingPlayer,
        activeInteractiveEvent: {
          id: 'wolf_pack',
          type: EventType.Combat,
          resolutionType: ResolutionType.Interactive,
          name: 'Wolves',
          description: 'Wolves attack.',
          conditions: {},
          interactiveHandlerId: 'combat_handler',
          repeatable: true,
          tags: ['combat'],
        },
        eventsQueue: [],
        triggeredEventIds: [],
        deltas: [],
        levelUpOccurred: false,
      },
    });

    const { result } = mountHook(state);
    expect(result.current.actionsLocked).toBe(true);
  });

  it('advances companion quest after turn-bound NPC dialogue completes', async () => {
    const dain = getCompanion('dain')!;
    const questEvent = {
      id: 'dain_quest_deserter_1',
      type: EventType.NpcEncounter,
      resolutionType: ResolutionType.Interactive,
      name: 'Dain Quest',
      description: 'Dain wants to talk.',
      conditions: {},
      interactiveHandlerId: 'dialogue_handler',
      repeatable: false,
      tags: ['dialogue'],
    };

    const state = makeGameState({
      currentLocationId: 35,
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
      currentTurn: {
        action: PlayerAction.Move,
        phase: TurnPhase.AwaitingPlayer,
        executedForcedMarch: false,
        locationBefore: 34,
        activeInteractiveEvent: questEvent,
        eventsQueue: [],
        triggeredEventIds: [],
        pendingDeltas: [],
        log: [],
        levelUpOccurred: false,
      },
    });

    const { result } = mountHook(state);

    act(() => {
      result.current.handleOpenNpc('dain_quest_deserter_1', questEvent);
    });

    const dialogueOutcome = playDialogueEncounter(state, 'dain_quest_deserter_1');

    await act(async () => {
      await result.current.handleNpcInteractionComplete(dialogueOutcome);
    });

    const updated = useGameStore.getState().gameState;
    expect(updated?.companionQuests?.[0].currentStepIndex).toBe(1);
    expect(updated?.companionQuests?.[0].pinnedLocationId).toBe(40);
  });
});
