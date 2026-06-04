import React from 'react';
import { render } from '@testing-library/react-native';
import { JourneyBar } from '@components/JourneyBar';
import { Colors } from '@theme';

describe('JourneyBar', () => {
  it('renders a View with width 0% at location 0', () => {
    const { UNSAFE_getAllByType } = render(<JourneyBar locationId={0} />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    // The inner progress bar view has the percentage width
    const innerBar = views.find(v =>
      v.props.style && JSON.stringify(v.props.style).includes('%')
    );
    expect(innerBar).toBeDefined();
    expect(innerBar?.props.style.width).toBe('0%');
  });

  it('renders width 100% at location 125', () => {
    const { UNSAFE_getAllByType } = render(<JourneyBar locationId={125} />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    const innerBar = views.find(v =>
      v.props.style && JSON.stringify(v.props.style).includes('%')
    );
    expect(innerBar?.props.style.width).toBe('100%');
  });

  it('renders approximately 49.6% width at location 62', () => {
    const { UNSAFE_getAllByType } = render(<JourneyBar locationId={62} />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    const innerBar = views.find(v =>
      v.props.style && JSON.stringify(v.props.style).includes('%') && v.props.style.width !== '100%'
    );
    const pct = parseFloat(innerBar?.props.style.width ?? '0');
    expect(pct).toBeCloseTo(49.6, 0);
  });

  it('uses gold color when dreadActive is false', () => {
    const { UNSAFE_getAllByType } = render(<JourneyBar locationId={50} dreadActive={false} />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    const barWithColor = views.find(v =>
      v.props.style?.backgroundColor === Colors.gold ||
      v.props.style?.backgroundColor === Colors.blood
    );
    expect(barWithColor?.props.style.backgroundColor).toBe(Colors.gold);
  });

  it('uses blood red color when dreadActive is true', () => {
    const { UNSAFE_getAllByType } = render(<JourneyBar locationId={50} dreadActive={true} />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    const barWithColor = views.find(v =>
      v.props.style?.backgroundColor === Colors.gold ||
      v.props.style?.backgroundColor === Colors.blood
    );
    expect(barWithColor?.props.style.backgroundColor).toBe(Colors.blood);
  });
});
