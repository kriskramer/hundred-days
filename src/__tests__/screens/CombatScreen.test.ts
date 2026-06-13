import type { CombatLogEntry } from '@engine/CombatEngine';
import type { CombatResult } from '@engine/types';
import {
  getCombatLogAnimationDelay,
  getDisplayedMoraleDelta,
  getEncounterTypingDurationMs,
  shouldAutoResolveCombatResult,
} from '@screens/CombatScreen';

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

describe('getCombatLogAnimationDelay', () => {
  const log: CombatLogEntry[] = [
    { round: 1, actor: 'Player', action: 'Strikes hard', type: 'normal' },
    { round: 1, actor: 'Wolf', action: 'Bites back', type: 'damage' },
    { round: 1, actor: '', action: 'Bleeding takes hold', type: 'effect' },
  ];

  it('does not animate lines before the new log range', () => {
    expect(getCombatLogAnimationDelay(log, 1, 0)).toBe(-1);
  });

  it('waits for each prior line to finish typing before starting the next one', () => {
    expect(getCombatLogAnimationDelay(log, 0, 0)).toBe(0);
    expect(getCombatLogAnimationDelay(log, 0, 1)).toBe(('Player: Strikes hard'.length * 18) + 120);
    expect(getCombatLogAnimationDelay(log, 0, 2)).toBe(
      ('Player: Strikes hard'.length * 18)
      + 120
      + ('Wolf: Bites back'.length * 18)
      + 120,
    );
  });

  it('waits for encounter narration before the first animated log line', () => {
    const encounterMs = getEncounterTypingDurationMs('A wolf blocks the path.');
    expect(getCombatLogAnimationDelay(log, 0, 0, encounterMs)).toBe(encounterMs);
    expect(getCombatLogAnimationDelay(log, 0, 1, encounterMs)).toBe(
      encounterMs + ('Player: Strikes hard'.length * 18) + 120,
    );
  });
});

describe('getEncounterTypingDurationMs', () => {
  it('includes the initial delay and per-character typing time', () => {
    expect(getEncounterTypingDurationMs('Hi')).toBe(150 + 2 * 18);
    expect(getEncounterTypingDurationMs('')).toBe(0);
  });
});

describe('shouldAutoResolveCombatResult', () => {
  it('auto-resolves defeats immediately', () => {
    expect(shouldAutoResolveCombatResult(makeResult({ outcome: 'defeat' }))).toBe(true);
  });

  it('keeps non-terminal combat outcomes on the result overlay', () => {
    expect(shouldAutoResolveCombatResult(makeResult({ outcome: 'victory' }))).toBe(false);
    expect(shouldAutoResolveCombatResult(makeResult({ outcome: 'fled' }))).toBe(false);
    expect(shouldAutoResolveCombatResult(makeResult({ outcome: 'negotiated' }))).toBe(false);
  });
});
