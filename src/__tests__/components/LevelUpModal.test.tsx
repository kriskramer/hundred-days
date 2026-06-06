import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LevelUpModal } from '@components/LevelUpModal';
import { LevelUpChoice } from '@engine/types';
import { useGameStore } from '@store/gameStore';
import { makeGameState } from '../__fixtures__/gameState';

const mockChoices: LevelUpChoice[] = [
  { id: 'fierce', label: 'Fierce', description: '+3 attack.', effect: { attack: 3 } },
  { id: 'tough', label: 'Toughened', description: '+5 max HP.', effect: { maxHealth: 5 } },
];

describe('LevelUpModal', () => {
  beforeEach(() => {
    useGameStore.getState().clearGame();
  });

  function renderLevelUpModal(level: number, choices: LevelUpChoice[], visible: boolean, onChoose = jest.fn()) {
    const state = makeGameState({
      player: {
        name: 'Test Player',
        level,
        xp: 0,
        health: 100,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
    });
    useGameStore.getState().initGame(state);
    return render(<LevelUpModal visible={visible} choices={choices} onChoose={onChoose} />);
  }

  it('renders nothing when not visible', () => {
    renderLevelUpModal(2, mockChoices, false);
    // With visible={false}, Modal content not rendered
    expect(screen.queryByText('Level 2')).toBeNull();
  });

  it('displays level number when visible', () => {
    renderLevelUpModal(5, mockChoices, true);
    expect(screen.getByText('Level 5')).toBeTruthy();
  });

  it('displays all choice labels', () => {
    renderLevelUpModal(2, mockChoices, true);
    expect(screen.getByText('Fierce')).toBeTruthy();
    expect(screen.getByText('Toughened')).toBeTruthy();
  });

  it('calls onChoose with choice id when pressed', () => {
    const onChoose = jest.fn();
    renderLevelUpModal(2, mockChoices, true, onChoose);
    fireEvent.press(screen.getByText('Fierce'));
    expect(onChoose).toHaveBeenCalledWith('fierce');
  });

  it('calls onChoose with second choice id when pressed', () => {
    const onChoose = jest.fn();
    renderLevelUpModal(2, mockChoices, true, onChoose);
    fireEvent.press(screen.getByText('Toughened'));
    expect(onChoose).toHaveBeenCalledWith('tough');
  });

  it('displays choice descriptions', () => {
    renderLevelUpModal(2, mockChoices, true);
    expect(screen.getByText('+3 attack.')).toBeTruthy();
  });

  it('displays statPreview when provided', () => {
    const choicesWithPreview: LevelUpChoice[] = [
      {
        id: 'fierce',
        label: 'Fierce',
        description: '+3 attack.',
        effect: { attack: 3 },
        statPreview: 'Attack  10 → 13'
      }
    ];
    renderLevelUpModal(2, choicesWithPreview, true);
    expect(screen.getByText('Attack  10 → 13')).toBeTruthy();
  });
});
