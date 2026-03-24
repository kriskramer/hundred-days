import {
  GameState,
  MoraleTier,
  ReputationTier,
  WeatherType,
  PlayerStats,
  MoraleState,
  ReputationState,
  LevelUpChoice,
} from './types';

// ─────────────────────────────────────────
// Schema version — increment when GameState
// structure changes to trigger migration
// ─────────────────────────────────────────
export const SCHEMA_VERSION = 2;

// ─────────────────────────────────────────
// XP thresholds per level (index = level)
// ─────────────────────────────────────────
export const XP_THRESHOLDS = [
  0,    // Level 1  (starting)
  30,   // Level 2
  75,   // Level 3
  140,  // Level 4
  230,  // Level 5
  350,  // Level 6
  500,  // Level 7
  680,  // Level 8
  900,  // Level 9
  1200, // Level 10
];

// ─────────────────────────────────────────
// All possible level-up stat choices
// ─────────────────────────────────────────
export const LEVEL_UP_CHOICES: LevelUpChoice[] = [
  {
    id:          'tough',
    label:       'Toughened',
    description: '+5 max HP, +2 defense. The road makes you harder.',
    effect:      { maxHealth: 5, defense: 2 },
  },
  {
    id:          'sharp',
    label:       'Sharp Eye',
    description: '+2 perception, +3% luck. You notice what others miss.',
    effect:      { perception: 2, luckModifier: 0.03 },
  },
  {
    id:          'swift',
    label:       'Swift Footed',
    description: '+2 speed, -5% forced march food cost.',
    effect:      { speed: 2, foodCostModifier: -0.05 },
  },
  {
    id:          'leader',
    label:       'Inspiring',
    description: '+2 leadership, +1 morale per turn.',
    effect:      { leadership: 2, moralePerTurn: 1 },
  },
  {
    id:          'survivor',
    label:       'Survivor',
    description: '+2 endurance, +1 food from foraging.',
    effect:      { endurance: 2, foragingBonus: 1 },
  },
  {
    id:          'fierce',
    label:       'Fierce',
    description: '+3 attack. You hit harder than before.',
    effect:      { attack: 3 },
  },
];

// ─────────────────────────────────────────
// Boss power constants
// ─────────────────────────────────────────
export const BOSS_POWER_THRESHOLD = 180;
export const BOSS_POWER_IDEAL     = 240;

// ─────────────────────────────────────────
// createNewGameState
// ─────────────────────────────────────────
export function createNewGameState(playerName = 'The Traveler'): GameState {
  return {
    runId:             generateRunId(),
    seed:              Math.floor(Math.random() * 999_999),
    dayNumber:         1,
    currentLocationId: 1,
    isComplete:        false,
    outcome:           null,

    player: {
      name:   playerName,
      level:  1,
      xp:     0,
      health: 100,
      stats: {
        maxHealth:  100,
        attack:     8,
        defense:    4,
        speed:      5,
        endurance:  3,
        perception: 3,
        leadership: 2,
      },
      statusEffects: [],
    },

    resources: {
      food:          8,
      gold:          25,
      items:         [],
      maxSlots:      8,
      equippedItems: {},
    },

    morale: {
      value:               65,
      tier:                MoraleTier.Steady,
      tierChangedThisTurn: false,
      dreadActive:         false,
    },

    reputation: {
      value:               50,
      tier:                ReputationTier.Neutral,
      tierChangedThisTurn: false,
      notoriety:           false,
      renown:              false,
    },

    weather:            WeatherType.Neutral,
    companions:         [],
    firedEventIds:      new Set<string>(),
    visitedLocationIds: new Set<number>([1]),
    currentTurn:        null,
    turnHistory:        [],
  };
}

// ─────────────────────────────────────────
// Pure state derivation helpers
// (no side-effects — safe to call anywhere)
// ─────────────────────────────────────────

export function getMoraleTier(value: number): MoraleTier {
  if (value >= 85) return MoraleTier.Inspired;
  if (value >= 65) return MoraleTier.Steady;
  if (value >= 40) return MoraleTier.Weary;
  if (value >= 20) return MoraleTier.Desperate;
  return MoraleTier.Broken;
}

export function getReputationTier(value: number): ReputationTier {
  if (value >= 85) return ReputationTier.LegendaryHero;
  if (value >= 65) return ReputationTier.Honorable;
  if (value >= 40) return ReputationTier.Neutral;
  if (value >= 20) return ReputationTier.Disreputable;
  return ReputationTier.Infamous;
}

export function getLuckThreshold(morale: MoraleState): number {
  switch (morale.tier) {
    case MoraleTier.Inspired:  return 0.30;
    case MoraleTier.Steady:    return 0.25;
    case MoraleTier.Weary:     return 0.20;
    case MoraleTier.Desperate: return 0.10;
    case MoraleTier.Broken:    return 0.00;
  }
}

export function getFoodCostMultiplier(morale: MoraleState): number {
  switch (morale.tier) {
    case MoraleTier.Inspired:  return 0.85;
    case MoraleTier.Steady:    return 1.00;
    case MoraleTier.Weary:     return 1.00;
    case MoraleTier.Desperate: return 1.15;
    case MoraleTier.Broken:    return 1.25;
  }
}

export function applyMoraleDelta(state: MoraleState, delta: number): MoraleState {
  const newValue = clamp(state.value + delta, 0, 100);
  const newTier  = getMoraleTier(newValue);
  return {
    ...state,
    value:               newValue,
    tier:                newTier,
    tierChangedThisTurn: newTier !== state.tier,
  };
}

export function applyReputationDelta(state: ReputationState, delta: number): ReputationState {
  const newValue = clamp(state.value + delta, 0, 100);
  const newTier  = getReputationTier(newValue);
  return {
    ...state,
    value:               newValue,
    tier:                newTier,
    tierChangedThisTurn: newTier !== state.tier,
    notoriety: newTier === ReputationTier.Infamous
      ? (state.notoriety || delta < 0)
      : false,
    renown: newTier === ReputationTier.LegendaryHero
      ? (state.renown || delta > 0)
      : false,
  };
}

export function applyXP(
  player: GameState['player'],
  xpGained: number,
): GameState['player'] {
  const newXP      = player.xp + xpGained;
  return { ...player, xp: newXP };
}

export function applyLevelUpChoice(
  stats: PlayerStats,
  choice: LevelUpChoice,
): PlayerStats {
  const e = choice.effect;
  return {
    maxHealth:  stats.maxHealth  + (e.maxHealth  ?? 0),
    attack:     stats.attack     + (e.attack     ?? 0),
    defense:    stats.defense    + (e.defense    ?? 0),
    speed:      stats.speed      + (e.speed      ?? 0),
    endurance:  stats.endurance  + (e.endurance  ?? 0),
    perception: stats.perception + (e.perception ?? 0),
    leadership: stats.leadership + (e.leadership ?? 0),
  };
}

export function getRandomLevelUpChoices(count: number): LevelUpChoice[] {
  const shuffled = [...LEVEL_UP_CHOICES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function isDreadActive(dayNumber: number, locationId: number): boolean {
  if (dayNumber < 70) return false;
  const daysLeft      = 100 - dayNumber;
  const locationsLeft = 125 - locationId;
  return daysLeft > 0 && locationsLeft / daysLeft > 1.5;
}

export function calculateCombatPower(state: GameState): number {
  const { player, companions, morale } = state;

  let power = player.level * 12
    + player.stats.attack   * 2
    + player.stats.defense  * 1.5
    + player.stats.speed    * 1;

  for (const c of companions) {
    power += c.combatPower;
    power += c.loyalty.value * 0.1;
  }

  const moraleMultiplier: Record<MoraleTier, number> = {
    [MoraleTier.Inspired]:  1.20,
    [MoraleTier.Steady]:    1.05,
    [MoraleTier.Weary]:     0.95,
    [MoraleTier.Desperate]: 0.80,
    [MoraleTier.Broken]:    0.60,
  };

  return Math.floor(power * moraleMultiplier[morale.tier]);
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
