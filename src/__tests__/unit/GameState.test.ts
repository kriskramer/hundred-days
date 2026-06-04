import {
  getMoraleTier,
  getReputationTier,
  getLuckThreshold,
  getFoodCostMultiplier,
  applyMoraleDelta,
  applyReputationDelta,
  applyXP,
  applyLevelUpChoice,
  isDreadActive,
  calculateCombatPower,
  clamp,
  createNewGameState,
  LEVEL_UP_CHOICES,
} from '@engine/GameState';
import { MoraleTier, ReputationTier } from '@engine/types';
import { makeGameState, makeCompanion } from '../__fixtures__/gameState';

// ─────────────────────────────────────────
// getMoraleTier
// ─────────────────────────────────────────

describe('getMoraleTier', () => {
  it.each([
    [0,   MoraleTier.Broken],
    [10,  MoraleTier.Broken],
    [19,  MoraleTier.Broken],
    [20,  MoraleTier.Desperate],
    [39,  MoraleTier.Desperate],
    [40,  MoraleTier.Weary],
    [64,  MoraleTier.Weary],
    [65,  MoraleTier.Steady],
    [84,  MoraleTier.Steady],
    [85,  MoraleTier.Inspired],
    [100, MoraleTier.Inspired],
  ])('value %i → %s', (value, expected) => {
    expect(getMoraleTier(value)).toBe(expected);
  });
});

// ─────────────────────────────────────────
// getReputationTier
// ─────────────────────────────────────────

describe('getReputationTier', () => {
  it.each([
    [0,   ReputationTier.Infamous],
    [19,  ReputationTier.Infamous],
    [20,  ReputationTier.Disreputable],
    [39,  ReputationTier.Disreputable],
    [40,  ReputationTier.Neutral],
    [64,  ReputationTier.Neutral],
    [65,  ReputationTier.Honorable],
    [84,  ReputationTier.Honorable],
    [85,  ReputationTier.LegendaryHero],
    [100, ReputationTier.LegendaryHero],
  ])('value %i → %s', (value, expected) => {
    expect(getReputationTier(value)).toBe(expected);
  });
});

// ─────────────────────────────────────────
// getLuckThreshold
// ─────────────────────────────────────────

describe('getLuckThreshold', () => {
  it.each([
    [MoraleTier.Inspired,  0.30],
    [MoraleTier.Steady,    0.25],
    [MoraleTier.Weary,     0.20],
    [MoraleTier.Desperate, 0.10],
    [MoraleTier.Broken,    0.00],
  ])('tier %s → %f', (tier, expected) => {
    const morale = { value: 50, tier, tierChangedThisTurn: false, dreadActive: false };
    expect(getLuckThreshold(morale)).toBeCloseTo(expected);
  });
});

// ─────────────────────────────────────────
// getFoodCostMultiplier
// ─────────────────────────────────────────

describe('getFoodCostMultiplier', () => {
  it.each([
    [MoraleTier.Inspired,  0.85],
    [MoraleTier.Steady,    1.00],
    [MoraleTier.Weary,     1.00],
    [MoraleTier.Desperate, 1.15],
    [MoraleTier.Broken,    1.25],
  ])('tier %s → %f', (tier, expected) => {
    const morale = { value: 50, tier, tierChangedThisTurn: false, dreadActive: false };
    expect(getFoodCostMultiplier(morale)).toBeCloseTo(expected);
  });
});

// ─────────────────────────────────────────
// applyMoraleDelta
// ─────────────────────────────────────────

describe('applyMoraleDelta', () => {
  const steadyMorale = { value: 65, tier: MoraleTier.Steady, tierChangedThisTurn: false, dreadActive: false };

  it('increases value and changes tier when crossing boundary', () => {
    const result = applyMoraleDelta(steadyMorale, +30);
    expect(result.value).toBe(95);
    expect(result.tier).toBe(MoraleTier.Inspired);
    expect(result.tierChangedThisTurn).toBe(true);
  });

  it('no tier change when staying in same tier', () => {
    const result = applyMoraleDelta(steadyMorale, +5);
    expect(result.value).toBe(70);
    expect(result.tier).toBe(MoraleTier.Steady);
    expect(result.tierChangedThisTurn).toBe(false);
  });

  it('clamps at 0 on large negative delta', () => {
    const result = applyMoraleDelta(steadyMorale, -100);
    expect(result.value).toBe(0);
  });

  it('clamps at 100 on large positive delta', () => {
    const inspired = { value: 90, tier: MoraleTier.Inspired, tierChangedThisTurn: false, dreadActive: false };
    const result = applyMoraleDelta(inspired, +20);
    expect(result.value).toBe(100);
  });

  it('decreases value and changes tier downward', () => {
    const result = applyMoraleDelta(steadyMorale, -30);
    expect(result.value).toBe(35);
    expect(result.tier).toBe(MoraleTier.Desperate);
    expect(result.tierChangedThisTurn).toBe(true);
  });
});

// ─────────────────────────────────────────
// applyReputationDelta
// ─────────────────────────────────────────

describe('applyReputationDelta', () => {
  const neutralRep = {
    value: 50, tier: ReputationTier.Neutral,
    tierChangedThisTurn: false, notoriety: false, renown: false,
  };

  it('sets notoriety when entering Infamous tier', () => {
    const result = applyReputationDelta(neutralRep, -40);
    expect(result.value).toBe(10);
    expect(result.tier).toBe(ReputationTier.Infamous);
    expect(result.notoriety).toBe(true);
  });

  it('clears notoriety when leaving Infamous tier', () => {
    const infamous = { ...neutralRep, value: 10, tier: ReputationTier.Infamous, notoriety: true };
    const result = applyReputationDelta(infamous, +15);
    expect(result.tier).toBe(ReputationTier.Disreputable);
    expect(result.notoriety).toBe(false);
  });

  it('sets renown when entering LegendaryHero tier', () => {
    const honorable = { ...neutralRep, value: 80, tier: ReputationTier.Honorable };
    const result = applyReputationDelta(honorable, +10);
    expect(result.tier).toBe(ReputationTier.LegendaryHero);
    expect(result.renown).toBe(true);
  });

  it('clears renown when leaving LegendaryHero tier', () => {
    const legendary = { ...neutralRep, value: 90, tier: ReputationTier.LegendaryHero, renown: true };
    const result = applyReputationDelta(legendary, -30);
    expect(result.tier).not.toBe(ReputationTier.LegendaryHero);
    expect(result.renown).toBe(false);
  });

  it('clamps at 0', () => {
    const result = applyReputationDelta(neutralRep, -200);
    expect(result.value).toBe(0);
  });

  it('clamps at 100', () => {
    const result = applyReputationDelta(neutralRep, +200);
    expect(result.value).toBe(100);
  });

  it('tier change flag set when tier changes', () => {
    const result = applyReputationDelta(neutralRep, -35);
    expect(result.tierChangedThisTurn).toBe(true);
  });

  it('tier change flag false when tier unchanged', () => {
    const result = applyReputationDelta(neutralRep, +5);
    expect(result.tierChangedThisTurn).toBe(false);
  });
});

// ─────────────────────────────────────────
// isDreadActive
// ─────────────────────────────────────────

describe('isDreadActive', () => {
  it('returns false before day 70', () => {
    expect(isDreadActive(69, 1)).toBe(false);
  });

  it('returns true when behind schedule at day 70', () => {
    // day 70: daysLeft=30, locationsLeft=124 → 124/30 > 1.5
    expect(isDreadActive(70, 1)).toBe(true);
  });

  it('returns false when on schedule at day 70', () => {
    // day 70: daysLeft=30, locationsLeft=25 → 25/30 < 1.5
    expect(isDreadActive(70, 100)).toBe(false);
  });

  it('returns false when no days left (division-by-zero guard)', () => {
    expect(isDreadActive(100, 50)).toBe(false);
  });

  it('returns true at day 85, location 50 (behind schedule)', () => {
    // daysLeft=15, locationsLeft=75 → 75/15=5 > 1.5
    expect(isDreadActive(85, 50)).toBe(true);
  });
});

// ─────────────────────────────────────────
// calculateCombatPower
// ─────────────────────────────────────────

describe('calculateCombatPower', () => {
  it('computes base power for level 1 steady morale', () => {
    const state = makeGameState();
    // power = 1*12 + 8*2 + 4*1.5 + 5*1 = 12 + 16 + 6 + 5 = 39, × 1.05 = floor(40.95) = 40
    expect(calculateCombatPower(state)).toBe(40);
  });

  it('applies broken morale multiplier (×0.60)', () => {
    const state = makeGameState({
      morale: { value: 10, tier: MoraleTier.Broken, tierChangedThisTurn: false, dreadActive: false },
    });
    // 39 × 0.60 = floor(23.4) = 23
    expect(calculateCombatPower(state)).toBe(23);
  });

  it('applies inspired morale multiplier (×1.20)', () => {
    const state = makeGameState({
      morale: { value: 90, tier: MoraleTier.Inspired, tierChangedThisTurn: false, dreadActive: false },
    });
    // 39 × 1.20 = floor(46.8) = 46
    expect(calculateCombatPower(state)).toBe(46);
  });

  it('adds companion combat power and loyalty bonus', () => {
    const companion = makeCompanion({ combatPower: 15, loyalty: { value: 60, desertsBelow: 15, complainsBelow: 35 } });
    const state = makeGameState({ companions: [companion] });
    // power base = 39 + 15 + 60*0.1 = 39 + 15 + 6 = 60, × 1.05 = floor(63) = 63
    expect(calculateCombatPower(state)).toBe(63);
  });
});

// ─────────────────────────────────────────
// applyLevelUpChoice
// ─────────────────────────────────────────

describe('applyLevelUpChoice', () => {
  const baseStats = {
    maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2,
  };

  it('fierce adds +3 attack, no other changes', () => {
    const fierce = LEVEL_UP_CHOICES.find(c => c.id === 'fierce')!;
    const result = applyLevelUpChoice(baseStats, fierce);
    expect(result.attack).toBe(11);
    expect(result.defense).toBe(4);
    expect(result.maxHealth).toBe(100);
  });

  it('tough adds +5 maxHealth and +2 defense', () => {
    const tough = LEVEL_UP_CHOICES.find(c => c.id === 'tough')!;
    const result = applyLevelUpChoice(baseStats, tough);
    expect(result.maxHealth).toBe(105);
    expect(result.defense).toBe(6);
    expect(result.attack).toBe(8);
  });

  it('swift adds +2 speed', () => {
    const swift = LEVEL_UP_CHOICES.find(c => c.id === 'swift')!;
    const result = applyLevelUpChoice(baseStats, swift);
    expect(result.speed).toBe(7);
  });
});

// ─────────────────────────────────────────
// applyXP
// ─────────────────────────────────────────

describe('applyXP', () => {
  it('adds XP to player', () => {
    const state = makeGameState();
    const result = applyXP(state.player, 15);
    expect(result.xp).toBe(15);
  });

  it('accumulates XP', () => {
    const state = makeGameState();
    const after1 = applyXP(state.player, 10);
    const after2 = applyXP(after1, 25);
    expect(after2.xp).toBe(35);
  });
});

// ─────────────────────────────────────────
// clamp
// ─────────────────────────────────────────

describe('clamp', () => {
  it('returns value within range unchanged', () => expect(clamp(50, 0, 100)).toBe(50));
  it('clamps to minimum', () => expect(clamp(-10, 0, 100)).toBe(0));
  it('clamps to maximum', () => expect(clamp(150, 0, 100)).toBe(100));
  it('returns min when value equals min', () => expect(clamp(0, 0, 100)).toBe(0));
  it('returns max when value equals max', () => expect(clamp(100, 0, 100)).toBe(100));
});

// ─────────────────────────────────────────
// createNewGameState
// ─────────────────────────────────────────

describe('createNewGameState', () => {
  it('sets expected starting values', () => {
    const state = createNewGameState('Test Hero');
    expect(state.dayNumber).toBe(1);
    expect(state.currentLocationId).toBe(1);
    expect(state.isComplete).toBe(false);
    expect(state.outcome).toBeNull();
    expect(state.resources.food).toBe(8);
    expect(state.resources.gold).toBe(25);
    expect(state.morale.value).toBe(65);
    expect(state.morale.tier).toBe(MoraleTier.Steady);
    expect(state.reputation.value).toBe(50);
    expect(state.reputation.tier).toBe(ReputationTier.Neutral);
    expect(state.player.level).toBe(1);
    expect(state.player.xp).toBe(0);
    expect(state.player.health).toBe(100);
    expect(state.player.name).toBe('Test Hero');
  });

  it('initializes firedEventIds as a Set', () => {
    const state = createNewGameState('Test Hero');
    expect(state.firedEventIds).toBeInstanceOf(Set);
    expect(state.firedEventIds.size).toBe(0);
  });

  it('initializes visitedLocationIds containing location 1', () => {
    const state = createNewGameState('Test Hero');
    expect(state.visitedLocationIds).toBeInstanceOf(Set);
    expect(state.visitedLocationIds.has(1)).toBe(true);
  });

  it('initializes storyFlags as an empty Set', () => {
    const state = createNewGameState('Test Hero');
    expect(state.storyFlags).toBeInstanceOf(Set);
    expect(state.storyFlags.size).toBe(0);
  });

  it('initializes clearedCombatLocations as an empty Set', () => {
    const state = createNewGameState('Test Hero');
    expect(state.clearedCombatLocations).toBeInstanceOf(Set);
    expect(state.clearedCombatLocations.size).toBe(0);
  });
});
