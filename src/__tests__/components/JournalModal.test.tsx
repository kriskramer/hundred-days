import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { JournalModal } from '@components/JournalModal';
import { TurnRecord, PlayerAction, WeatherType } from '@engine/types';

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
  it('shows empty state when history is empty', () => {
    render(<JournalModal visible={true} history={[]} onClose={jest.fn()} />);
    expect(screen.getByText(/unwritten/)).toBeTruthy();
  });

  it('shows turn record day number', () => {
    const history = [makeTurnRecord(3)];
    render(<JournalModal visible={true} history={history} onClose={jest.fn()} />);
    expect(screen.getByText('DAY 3')).toBeTruthy();
  });

  it('shows narrative summary for a turn', () => {
    const history = [makeTurnRecord(5, { narrativeSummary: 'You found shelter.' })];
    render(<JournalModal visible={true} history={history} onClose={jest.fn()} />);
    expect(screen.getByText('You found shelter.')).toBeTruthy();
  });

  it('shows CHRONICLES header', () => {
    render(<JournalModal visible={true} history={[]} onClose={jest.fn()} />);
    expect(screen.getByText('CHRONICLES')).toBeTruthy();
  });

  it('calls onClose when CLOSE button pressed', () => {
    const onClose = jest.fn();
    render(<JournalModal visible={true} history={[]} onClose={onClose} />);
    fireEvent.press(screen.getByText(/CLOSE/));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders 3 records when history has 3 entries', () => {
    const history = [makeTurnRecord(1), makeTurnRecord(2), makeTurnRecord(3)];
    render(<JournalModal visible={true} history={history} onClose={jest.fn()} />);
    expect(screen.getByText('DAY 1')).toBeTruthy();
    expect(screen.getByText('DAY 2')).toBeTruthy();
    expect(screen.getByText('DAY 3')).toBeTruthy();
  });

  it('renders records in reversed chronological order (latest first)', () => {
    const history = [makeTurnRecord(1), makeTurnRecord(2), makeTurnRecord(3)];
    const { UNSAFE_getAllByType } = render(
      <JournalModal visible={true} history={history} onClose={jest.fn()} />
    );
    // "DAY {n}" renders as array children ['DAY ', n] — collect numeric day values in order
    const dayTexts = UNSAFE_getAllByType(require('react-native').Text)
      .filter((t: any) => {
        const c = t.props.children;
        return Array.isArray(c) && c[0] === 'DAY ';
      })
      .map((t: any) => Number(t.props.children[1]));
    // Should be [3, 2, 1] — reversed
    expect(dayTexts[0]).toBe(3);
    expect(dayTexts[dayTexts.length - 1]).toBe(1);
  });

  it('shows positive food delta in green color', () => {
    const record = makeTurnRecord(1, {
      deltas: [{ source: 'hunt', food: 3, narrative: '' }],
    });
    const { getByText } = render(
      <JournalModal visible={true} history={[record]} onClose={jest.fn()} />
    );
    const foodText = getByText('+3 food');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#4A8A5A' }),
    );
  });

  it('shows negative food delta in red color', () => {
    const record = makeTurnRecord(1, {
      deltas: [{ source: 'move', food: -2, narrative: '' }],
    });
    const { getByText } = render(
      <JournalModal visible={true} history={[record]} onClose={jest.fn()} />
    );
    const foodText = getByText('-2 food');
    expect(foodText.props.style).toEqual(
      expect.objectContaining({ color: '#8B1A1A' }),
    );
  });

  it('shows triggered events with underscores replaced by spaces', () => {
    const record = makeTurnRecord(1, {
      eventsTriggered: ['find_abandoned_camp'],
    });
    render(<JournalModal visible={true} history={[record]} onClose={jest.fn()} />);
    expect(screen.getByText(/find abandoned camp/)).toBeTruthy();
  });
});
