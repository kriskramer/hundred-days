import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StatusBar } from '@components/StatusBar';
import { makeGameState } from '../__fixtures__/gameState';
import { useGameStore } from '@store/gameStore';

describe('StatusBar', () => {
  beforeEach(() => {
    useGameStore.getState().clearGame();
  });

  it('renders day number', () => {
    const state = makeGameState({ dayNumber: 42 });
    useGameStore.getState().initGame(state);
    render(<StatusBar />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders gold amount', () => {
    const state = makeGameState({ resources: { food: 8, gold: 99, items: [], maxSlots: 8, equippedItems: {} } });
    useGameStore.getState().initGame(state);
    render(<StatusBar />);
    expect(screen.getByText('99')).toBeTruthy();
  });

  it('renders player level', () => {
    const state = makeGameState({
      player: {
        name: 'Test', level: 5, xp: 0, health: 100,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
    });
    useGameStore.getState().initGame(state);
    render(<StatusBar />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('renders food value with one decimal', () => {
    const state = makeGameState({ resources: { food: 8, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    useGameStore.getState().initGame(state);
    render(<StatusBar />);
    expect(screen.getByText('8.0')).toBeTruthy();
  });

  it('renders the current location number', () => {
    const state = makeGameState({ currentLocationId: 47 });
    useGameStore.getState().initGame(state);
    render(<StatusBar />);
    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByText('/125')).toBeTruthy();
  });

  it('renders food in red when below 3', () => {
    const state = makeGameState({ resources: { food: 2.5, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    useGameStore.getState().initGame(state);
    const { getByText } = render(<StatusBar />);
    const foodText = getByText('2.5');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#ff8080' }),
    );
  });

  it('renders food in yellow when between 3 and 5', () => {
    const state = makeGameState({ resources: { food: 4.0, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    useGameStore.getState().initGame(state);
    const { getByText } = render(<StatusBar />);
    const foodText = getByText('4.0');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#ffcc44' }),
    );
  });

  it('renders food with no color warning when at or above 5', () => {
    const state = makeGameState({ resources: { food: 5.0, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    useGameStore.getState().initGame(state);
    const { getByText } = render(<StatusBar />);
    const foodText = getByText('5.0');
    // No explicit warning color — valueColor prop is undefined
    // The color defaults to Colors.parchment, not a warning color
    const style = foodText.props.style;
    expect(style).not.toEqual(expect.objectContaining({ color: '#ff8080' }));
    expect(style).not.toEqual(expect.objectContaining({ color: '#ffcc44' }));
  });

  it('opens character sheet modal when clicking level pill', () => {
    const state = makeGameState({
      player: {
        name: 'Galahad', level: 3, xp: 85, health: 80,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
      companions: [],
    });
    useGameStore.getState().initGame(state);
    const { getByText, queryByText } = render(<StatusBar />);

    // The modal content should not be visible initially
    expect(queryByText('GALAHAD')).toBeFalsy();

    // Find the level pill and press it
    const lvPill = getByText('LV');
    fireEvent.press(lvPill);

    // Now the modal with player name and level info should be visible
    expect(screen.getByText('GALAHAD')).toBeTruthy();
    expect(screen.getByText('LEVEL 3')).toBeTruthy();
    expect(screen.getByText('XP: 85 / 140')).toBeTruthy();
    expect(screen.getByText('55 XP needed for next level.')).toBeTruthy();
  });
});
