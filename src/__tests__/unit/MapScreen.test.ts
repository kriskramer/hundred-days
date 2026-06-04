import { getVisibleMapItems } from '@screens/MapScreen';
import { REGIONS, getLocation } from '@data/locations';

describe('MapScreen visibility', () => {
  it('shows visited locations plus the next four locations in show-all mode', () => {
    const items = [
      { kind: 'region' as const, region: REGIONS[0] },
      { kind: 'location' as const, loc: getLocation(1), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(2), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(3), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(4), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(5), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(6), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(7), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(8), side: 'right' as const },
    ];

    const visibleItems = getVisibleMapItems(items, 3, new Set([1, 3]), true);
    const visibleLocationIds = visibleItems
      .filter(item => item.kind === 'location')
      .map(item => item.loc.id);

    expect(visibleItems[0]?.kind).toBe('region');
    expect(visibleLocationIds).toEqual([1, 3, 4, 5, 6, 7]);
    expect(visibleLocationIds).not.toContain(2);
    expect(visibleLocationIds).not.toContain(8);
  });

  it('keeps the nearby window behavior when show-all mode is off', () => {
    const items = [
      { kind: 'region' as const, region: REGIONS[0] },
      { kind: 'location' as const, loc: getLocation(1), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(2), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(3), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(4), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(5), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(6), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(7), side: 'left' as const },
      { kind: 'location' as const, loc: getLocation(8), side: 'right' as const },
      { kind: 'location' as const, loc: getLocation(9), side: 'left' as const },
    ];

    const visibleItems = getVisibleMapItems(items, 5, new Set([1, 5]), false);
    const visibleLocationIds = visibleItems
      .filter(item => item.kind === 'location')
      .map(item => item.loc.id);

    expect(visibleLocationIds).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
