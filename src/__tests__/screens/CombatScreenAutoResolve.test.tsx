import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { makeGameState } from '../__fixtures__/gameState';

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
  const defeatResult = {
    outcome: 'defeat',
    roundsFought: 2,
    xpGained: 0,
    goldGained: 0,
    foodGained: 0,
    healthLost: 100,
    healthDelta: -100,
    moraleDelta: -12,
    reputationDelta: 0,
    injuriesGained: ['wounded'],
    companionInjuries: {},
    itemsConsumed: [],
    lootedItems: [],
  };

  class MockCombatEngine {
    private readonly state = {
      phase: 'post_combat',
      round: 2,
      player: { currentHP: 0, maxHP: 100, speed: 5, statusEffects: [] },
      playerMorale: { tier: 'steady' },
      enemies: [],
      companions: [],
      log: [{ round: 2, actor: 'Orc Warchief', action: 'Crushes your defenses.', type: 'system' }],
      itemsConsumed: [],
      result: defeatResult,
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
    ENEMY_DEFINITIONS: [],
    buildEnemiesForLocation: jest.fn(() => []),
    buildBossEnemy: jest.fn(() => []),
  };
});

import { CombatScreen } from '@screens/CombatScreen';

describe('CombatScreen auto-resolve', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('auto-completes a defeat without waiting for the result overlay continue button', async () => {
    const onComplete = jest.fn();

    render(
      <CombatScreen
        gameState={makeGameState({ currentLocationId: 32 })}
        engine={null}
        event={null}
        onComplete={onComplete}
        onToast={jest.fn()}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'defeat',
        healthDelta: -100,
      }));
    });
  });
});
