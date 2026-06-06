import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { JournalModal } from '@components/JournalModal';
import { TurnRecord, PlayerAction, WeatherType } from '@engine/types';
import { useGameStore } from '@store/gameStore';
import { makeGameState } from '../__fixtures__/gameState';

function makeTurnRecord(day: number, overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    dayNumber: day,
    locationBefore: day,
    locationAfter: day + 1,
    action: PlayerAction.Move,
    weather: WeatherType.Neutral,
    eventsTriggered: [],
    deltas: [],
    levelUpOccurred: false,
    narrativeSummary: `Day ${day} narrative.`,
    ...overrides,
  };
}

describe('JournalModal', () => {
  beforeEach(() => {
    useGameStore.getState().clearGame();
  });

  function renderJournalModal(history: TurnRecord[], onClose = jest.fn()) {
    const state = makeGameState({ turnHistory: history });
    useGameStore.getState().initGame(state);
    return render(<JournalModal visible={true} onClose={onClose} />);
  }

  it('shows empty state when history is empty', () => {
    renderJournalModal([]);
    expect(screen.getByText(/unwritten/)).toBeTruthy();
  });

  it('shows turn record day number', () => {
    const history = [makeTurnRecord(3)];
    renderJournalModal(history);
    expect(screen.getByText('DAY 3')).toBeTruthy();
  });

  it('shows narrative summary for a turn', () => {
    const history = [makeTurnRecord(5, { narrativeSummary: 'You found shelter.' })];
    renderJournalModal(history);
    expect(screen.getByText('You found shelter.')).toBeTruthy();
  });

  it('shows CHRONICLES header', () => {
    renderJournalModal([]);
    expect(screen.getByText('CHRONICLES')).toBeTruthy();
  });

  it('calls onClose when CLOSE button pressed', () => {
    const onClose = jest.fn();
    renderJournalModal([], onClose);
    fireEvent.press(screen.getByText(/CLOSE/));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders 3 records when history has 3 entries', () => {
    const history = [makeTurnRecord(1), makeTurnRecord(2), makeTurnRecord(3)];
    renderJournalModal(history);
    expect(screen.getByText('DAY 1')).toBeTruthy();
    expect(screen.getByText('DAY 2')).toBeTruthy();
    expect(screen.getByText('DAY 3')).toBeTruthy();
  });

  it('renders records in reversed chronological order (latest first)', () => {
    const history = [makeTurnRecord(1), makeTurnRecord(2), makeTurnRecord(3)];
    const { UNSAFE_getAllByType } = renderJournalModal(history);
    // "DAY {n}" renders as array children ['DAY ', n] — collect numeric day values in order
    const dayTexts = UNSAFE_getAllByType(Text)
      .filter((t) => {
        const c = t.props.children;
        return Array.isArray(c) && c[0] === 'DAY ';
      })
      .map((t) => Number(t.props.children[1]));
    // Should be [3, 2, 1] — reversed
    expect(dayTexts[0]).toBe(3);
    expect(dayTexts[dayTexts.length - 1]).toBe(1);
  });

  it('shows positive food delta in green color', () => {
    const record = makeTurnRecord(1, {
      deltas: [{ source: 'hunt', food: 3, narrative: '' }],
    });
    renderJournalModal([record]);
    const foodText = screen.getByText('+3 food');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#4A8A5A' }),
    );
  });

  it('shows negative food delta in red color', () => {
    const record = makeTurnRecord(1, {
      deltas: [{ source: 'move', food: -2, narrative: '' }],
    });
    renderJournalModal([record]);
    const foodText = screen.getByText('-2 food');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#8B1A1A' }),
    );
  });

  it('shows triggered events with underscores replaced by spaces', () => {
    const record = makeTurnRecord(1, {
      eventsTriggered: ['find_abandoned_camp'],
    });
    renderJournalModal([record]);
    expect(screen.getByText(/find abandoned camp/i)).toBeTruthy();
  });

  it('shows an outcome label for resolved interactive events', () => {
    const record = makeTurnRecord(1, {
      eventsTriggered: ['wolves'],
      eventOutcome: {
        eventId: 'wolves',
        result: 'victory',
      },
    });
    renderJournalModal([record]);
    expect(screen.getByText('Defeated Wolves')).toBeTruthy();
  });

  it('shows a journal note when a battle is won', () => {
    const record = makeTurnRecord(1, {
      eventsTriggered: ['wolves'],
      eventOutcome: {
        eventId: 'wolves',
        result: 'victory',
        summary: 'Victory! You gained 18 XP and 10 gold.',
      },
    });
    renderJournalModal([record]);
    expect(screen.getByText('Victory! You gained 18 XP and 10 gold.')).toBeTruthy();
  });
});
