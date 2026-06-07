import {
  GameState,
  MoraleTier,
  ReputationTier,
  WeatherType,
  PlayerStats,
  MoraleState,
  ReputationState,
  LevelUpChoice,
  MetaProgress,
  Companion,
} from './types';
import { normalizeRngState, nextMulberry32 } from './Random';
import { Location } from '../data/locations';
import { generateRunLayout } from './RunLayout';
import {
  BOSS_POWER_IDEAL_CONFIG,
  BOSS_POWER_THRESHOLD_CONFIG,
  CONFIG_LEVEL_UP_CHOICES,
  ConfigLevelUpChoice,
  STARTING_RESOURCES,
  XP_THRESHOLDS_CONFIG,
} from '@data/config';
import { GameBalance } from './GameBalance';

// ─────────────────────────────────────────
// Schema version — increment when GameState
// structure changes to trigger migration
// ─────────────────────────────────────────
export const SCHEMA_VERSION = 11;

function describeLevelUpChoice(choice: ConfigLevelUpChoice): string {
  const statLabels: Record<ConfigLevelUpChoice['stat'], string> = {
    attack: 'attack',
    defense: 'defense',
    speed: 'speed',
    leadership: 'leadership',
    maxHealth: 'max HP',
    luck: 'luck',
  };

  return `+${choice.bonus} ${statLabels[choice.stat]}.`;
}

function toLevelUpChoice(choice: ConfigLevelUpChoice): LevelUpChoice {
  const effect: LevelUpChoice['effect'] = choice.stat === 'luck'
    ? { luck: choice.bonus }
    : { [choice.stat]: choice.bonus };

  return {
    id: choice.id,
    label: choice.label,
    description: describeLevelUpChoice(choice),
    effect,
  };
}

function cloneMetaProgress(metaProgress: MetaProgress | null): MetaProgress | null {
  if (!metaProgress) return null;

  return {
    ...metaProgress,
    unlockedCompanionIds: [...metaProgress.unlockedCompanionIds],
  };
}

export const XP_THRESHOLDS = XP_THRESHOLDS_CONFIG;
export const LEVEL_UP_CHOICES: LevelUpChoice[] = CONFIG_LEVEL_UP_CHOICES.map(toLevelUpChoice);

// ─────────────────────────────────────────
// Boss power constants
// ─────────────────────────────────────────
export const BOSS_POWER_THRESHOLD = BOSS_POWER_THRESHOLD_CONFIG;
export const BOSS_POWER_IDEAL     = BOSS_POWER_IDEAL_CONFIG;

// ─────────────────────────────────────────
// createNewGameState
// ─────────────────────────────────────────
export function createNewGameState(
  playerName = 'The Traveler',
  metaProgress: MetaProgress | null = null,
): GameState {
  const seed = Date.now() % 999_999;
  const runLayout = generateRunLayout(seed);
  return {
    runId:             generateRunId(),
    seed,
    rngState:          normalizeRngState(seed),
    dayNumber:         1,
    currentLocationId: 1,
    isComplete:        false,
    outcome:           null,
    runLayout,

    player: {
      name:   playerName,
      level:  1,
      xp:     0,
      health: STARTING_RESOURCES.health,
      stats: {
        maxHealth:  STARTING_RESOURCES.health,
        attack:     8,
        defense:    4,
        speed:      5,
        endurance:  3,
        perception: 3,
        leadership: 2,
        luck:       0,
        stealing:   5,
      },
      statusEffects: [],
    },

    resources: {
      food:          STARTING_RESOURCES.food,
      gold:          STARTING_RESOURCES.gold,
      items:         [],
      maxSlots:      STARTING_RESOURCES.maxInventorySlots,
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
    storyFlags:         new Set<string>(),
    starvationTurns:        0,
    clearedCombatLocations: new Set<number>(),
    currentTurn:            null,
    turnHistory:        [],
    metaProgress:       cloneMetaProgress(metaProgress),
    consecutiveForcedMarches: 0,
    consecutiveStormDays:     0,
    consecutiveCombatDays:    0,
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
    luck:       (stats.luck      ?? 0) + (e.luck      ?? 0),
    stealing:   (stats.stealing ?? 0) + (e.stealing ?? 0),
  };
}

export function getRandomLevelUpChoicesWithRng(
  count: number,
  rng: () => number,
): LevelUpChoice[] {
  const shuffled = [...LEVEL_UP_CHOICES];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

export function isDreadActive(dayNumber: number, locationId: number): boolean {
  if (dayNumber < GameBalance.DREAD_TRIGGER_DAY) return false;
  const daysLeft      = 100 - dayNumber;
  const locationsLeft = 125 - locationId;
  return daysLeft > 0 && locationsLeft / daysLeft > GameBalance.DREAD_PACE_RATIO;
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
  return `run_${Date.now().toString(36)}`;
}

export function pickLocationText(
  location: Location,
  dayNumber: number,
  seed: number,
): string {
  if (!location.randomTexts || location.randomTexts.length === 0) {
    return location.locationText || '';
  }
  const xorState = (seed ^ location.id ^ dayNumber) >>> 0;
  const { value } = nextMulberry32(xorState);
  const index = Math.floor(value * location.randomTexts.length);
  return location.randomTexts[index] || location.locationText || '';
}

export function pickLocationRandomText(
  location: Location,
  dayNumber: number,
  seed: number,
): string | null {
  if (!location.randomTexts || location.randomTexts.length === 0) {
    return null;
  }
  const xorState = (seed ^ location.id ^ dayNumber) >>> 0;
  const { value } = nextMulberry32(xorState);
  const index = Math.floor(value * location.randomTexts.length);
  return location.randomTexts[index] || null;
}

export function tickCompanionXP(companions: Companion[], amount: number): Companion[] {
  const XP_TO_NEXT = [0, 20, 50, 95, 160];
  return companions.map(c => {
    const newXP      = c.level.xp + amount;
    const nextLevel  = c.level.current < 5 ? XP_TO_NEXT[c.level.current] : Infinity;
    const levelsUp   = newXP >= nextLevel && c.level.current < 5;
    return {
      ...c,
      level: {
        current:  levelsUp ? c.level.current + 1 : c.level.current,
        xp:       newXP,
        xpToNext: levelsUp
          ? XP_TO_NEXT[Math.min(c.level.current + 1, 4)]
          : c.level.xpToNext,
      },
    };
  });
}

export function buildLevelUpChoicePreviews(choices: LevelUpChoice[], stats: PlayerStats): LevelUpChoice[] {
  const statLabels: Record<keyof PlayerStats, string> = {
    maxHealth: 'Max HP',
    attack:    'Attack',
    defense:   'Defense',
    speed:     'Speed',
    endurance: 'Endurance',
    perception:'Perception',
    leadership:'Leadership',
    luck:      'Luck',
    stealing:  'Stealing',
  };

  return choices.map(choice => {
    const cloned = { ...choice };
    const previews: string[] = [];

    (Object.keys(statLabels) as Array<keyof PlayerStats>).forEach(key => {
      const delta = choice.effect[key];
      if (delta !== undefined && delta !== 0) {
        const before = stats[key] ?? 0;
        const after = before + delta;
        previews.push(`${statLabels[key]}  ${before} → ${after}`);
      }
    });

    if (previews.length > 0) {
      cloned.statPreview = previews.join(', ');
    }
    return cloned;
  });
}
