import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatusBar } from '@components/StatusBar';
import { makeGameState } from '../__fixtures__/gameState';

describe('StatusBar', () => {
  it('renders day number', () => {
    const state = makeGameState({ dayNumber: 42 });
    render(<StatusBar gameState={state} />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders gold amount', () => {
    const state = makeGameState({ resources: { food: 8, gold: 99, items: [], maxSlots: 8, equippedItems: {} } });
    render(<StatusBar gameState={state} />);
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
    render(<StatusBar gameState={state} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('renders food value with one decimal', () => {
    const state = makeGameState({ resources: { food: 8, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    render(<StatusBar gameState={state} />);
    expect(screen.getByText('8.0')).toBeTruthy();
  });

  it('renders the current location number', () => {
    const state = makeGameState({ currentLocationId: 47 });
    render(<StatusBar gameState={state} />);
    expect(screen.getByText('47')).toBeTruthy();
    expect(screen.getByText('/125')).toBeTruthy();
  });

  it('renders food in red when below 3', () => {
    const state = makeGameState({ resources: { food: 2.5, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const { getByText } = render(<StatusBar gameState={state} />);
    const foodText = getByText('2.5');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#ff8080' }),
    );
  });

  it('renders food in yellow when between 3 and 5', () => {
    const state = makeGameState({ resources: { food: 4.0, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const { getByText } = render(<StatusBar gameState={state} />);
    const foodText = getByText('4.0');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#ffcc44' }),
    );
  });

  it('renders food with no color warning when at or above 5', () => {
    const state = makeGameState({ resources: { food: 5.0, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const { getByText } = render(<StatusBar gameState={state} />);
    const foodText = getByText('5.0');
    // No explicit warning color — valueColor prop is undefined
    // The color defaults to Colors.parchment, not a warning color
    const style = foodText.props.style;
    expect(style).not.toEqual(expect.objectContaining({ color: '#ff8080' }));
    expect(style).not.toEqual(expect.objectContaining({ color: '#ffcc44' }));
  });
});
