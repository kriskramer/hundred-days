import type { CombatResult } from '@engine/types';
import { getDisplayedMoraleDelta } from '@screens/CombatScreen';

function makeResult(overrides: Partial<CombatResult> = {}): CombatResult {
  return {
    outcome: 'victory',
    roundsFought: 2,
    xpGained: 18,
    goldGained: 10,
    foodGained: 0,
    healthLost: 5,
    moraleDelta: 8,
    reputationDelta: 0,
    injuriesGained: [],
    companionInjuries: {},
    ...overrides,
  };
}

describe('getDisplayedMoraleDelta', () => {
  it('shows the net morale gain after combat fatigue', () => {
    expect(getDisplayedMoraleDelta(makeResult(), 50, 1)).toBe(5);
  });

  it('shows the clamped morale gain near the cap', () => {
    expect(getDisplayedMoraleDelta(makeResult(), 95, 0)).toBe(5);
  });

  it('preserves the raw morale gain when no adjustment applies', () => {
    expect(getDisplayedMoraleDelta(makeResult(), 50, 0)).toBe(8);
  });
});
