import { renderHook, act } from '@testing-library/react-native';
import { useGameNavigation } from '@hooks/useGameNavigation';
import { makeGameState } from '../__fixtures__/gameState';
import { useGameStore } from '@store/gameStore';
import { EventType, ResolutionType, TurnPhase } from '@engine/types';

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
});
