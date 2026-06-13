import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { makeGameState } from '../__fixtures__/gameState';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@components', () => {
  const mockReact = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    TypewriterText: ({ text, onComplete, style }: { text: string; onComplete?: () => void; style?: unknown }) => {
      mockReact.useEffect(() => {
        onComplete?.();
      }, [onComplete]);
      return mockReact.createElement(Text, { style }, text);
    },
  };
});

jest.mock('@engine/CombatEngine', () => {
  const victoryResult = {
    outcome: 'victory',
    roundsFought: 2,
    xpGained: 18,
    goldGained: 10,
    foodGained: 0,
    healthLost: 5,
    healthDelta: -5,
    moraleDelta: 8,
    reputationDelta: 0,
    injuriesGained: [],
    companionInjuries: {},
    itemsConsumed: [],
    lootedItems: [],
  };

  class MockCombatEngine {
    private readonly state = {
      phase: 'post_combat',
      round: 2,
      player: { currentHP: 80, maxHP: 100, speed: 5, statusEffects: [] },
      playerMorale: { tier: 'steady' },
      enemies: [],
      companions: [],
      log: [{ round: 2, actor: 'Player', action: 'Delivers the final blow.', type: 'normal' }],
      itemsConsumed: [],
      result: victoryResult,
      isPlayerStunned: false,
      resourceSideEffects: {},
    };

    constructor(_enemies: unknown[], _gameState: unknown, onStateChange: (state: unknown) => void) {
      onStateChange(this.state);
    }

    getState() {
      return this.state;
    }

    submitAction() {}
  }

  return {
    CombatEngine: MockCombatEngine,
    ENEMY_DEFINITIONS: [{ id: 'wolf', encounterTexts: ['A wolf blocks the path.'] }],
    buildEnemiesForLocation: jest.fn(() => [{ enemyId: 'wolf', name: 'Wolf', currentHP: 0, maxHP: 20 }]),
    buildBossEnemy: jest.fn(() => []),
  };
});

import { CombatScreen } from '@screens/CombatScreen';

describe('CombatScreen victory overlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows the victory overlay after combat ends even when onComplete identity changes', async () => {
    const onComplete = jest.fn();
    const { rerender, getByText } = render(
      <CombatScreen
        gameState={makeGameState({ currentLocationId: 32 })}
        engine={null}
        event={null}
        onComplete={onComplete}
        onToast={jest.fn()}
      />
    );

    rerender(
      <CombatScreen
        gameState={makeGameState({ currentLocationId: 32 })}
        engine={null}
        event={null}
        onComplete={jest.fn()}
        onToast={jest.fn()}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(getByText('VICTORY')).toBeTruthy();
    });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
