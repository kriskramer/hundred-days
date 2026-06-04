import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LevelUpModal } from '@components/LevelUpModal';
import { LevelUpChoice } from '@engine/types';

const mockChoices: LevelUpChoice[] = [
  { id: 'fierce', label: 'Fierce', description: '+3 attack.', effect: { attack: 3 } },
  { id: 'tough', label: 'Toughened', description: '+5 max HP.', effect: { maxHealth: 5 } },
];

describe('LevelUpModal', () => {
  it('renders nothing when not visible', () => {
    render(
      <LevelUpModal visible={false} choices={mockChoices} playerLevel={2} onChoose={jest.fn()} />
    );
    // With visible={false}, Modal content not rendered
    expect(screen.queryByText('Level 2')).toBeNull();
  });

  it('displays level number when visible', () => {
    render(
      <LevelUpModal visible={true} choices={mockChoices} playerLevel={5} onChoose={jest.fn()} />
    );
    expect(screen.getByText('Level 5')).toBeTruthy();
  });

  it('displays all choice labels', () => {
    render(
      <LevelUpModal visible={true} choices={mockChoices} playerLevel={2} onChoose={jest.fn()} />
    );
    expect(screen.getByText('Fierce')).toBeTruthy();
    expect(screen.getByText('Toughened')).toBeTruthy();
  });

  it('calls onChoose with choice id when pressed', () => {
    const onChoose = jest.fn();
    render(
      <LevelUpModal visible={true} choices={mockChoices} playerLevel={2} onChoose={onChoose} />
    );
    fireEvent.press(screen.getByText('Fierce'));
    expect(onChoose).toHaveBeenCalledWith('fierce');
  });

  it('calls onChoose with second choice id when pressed', () => {
    const onChoose = jest.fn();
    render(
      <LevelUpModal visible={true} choices={mockChoices} playerLevel={2} onChoose={onChoose} />
    );
    fireEvent.press(screen.getByText('Toughened'));
    expect(onChoose).toHaveBeenCalledWith('tough');
  });

  it('displays choice descriptions', () => {
    render(
      <LevelUpModal visible={true} choices={mockChoices} playerLevel={2} onChoose={jest.fn()} />
    );
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
    render(
      <LevelUpModal visible={true} choices={choicesWithPreview} playerLevel={2} onChoose={jest.fn()} />
    );
    expect(screen.getByText('Attack  10 → 13')).toBeTruthy();
  });
});
