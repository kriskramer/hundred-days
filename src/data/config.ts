import configJson from './config.json';

export type ConfigLevelUpStat =
  | 'attack'
  | 'defense'
  | 'speed'
  | 'leadership'
  | 'maxHealth'
  | 'luck';

export interface ConfigLevelUpChoice {
  id: string;
  label: string;
  stat: ConfigLevelUpStat;
  bonus: number;
}

export interface GameConfig {
  xpThresholds: number[];
  startingResources: {
    food: number;
    gold: number;
    health: number;
    maxInventorySlots: number;
  };
  bossPowerThreshold: number;
  bossPowerIdeal: number;
  levelUpChoices: ConfigLevelUpChoice[];
}

function assertGameConfig(value: unknown): asserts value is GameConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid config.json: expected an object.');
  }

  const config = value as Record<string, unknown>;
  if (!Array.isArray(config.xpThresholds) || config.xpThresholds.some(level => typeof level !== 'number')) {
    throw new Error('Invalid config.json: xpThresholds must be a number array.');
  }

  if (!config.startingResources || typeof config.startingResources !== 'object') {
    throw new Error('Invalid config.json: startingResources must be an object.');
  }

  const startingResources = config.startingResources as Record<string, unknown>;
  const resourceKeys = ['food', 'gold', 'health', 'maxInventorySlots'] as const;
  for (const key of resourceKeys) {
    if (typeof startingResources[key] !== 'number') {
      throw new Error(`Invalid config.json: startingResources.${key} must be a number.`);
    }
  }

  if (typeof config.bossPowerThreshold !== 'number' || typeof config.bossPowerIdeal !== 'number') {
    throw new Error('Invalid config.json: boss power thresholds must be numbers.');
  }

  if (!Array.isArray(config.levelUpChoices)) {
    throw new Error('Invalid config.json: levelUpChoices must be an array.');
  }

  const validStats = new Set<ConfigLevelUpStat>([
    'attack',
    'defense',
    'speed',
    'leadership',
    'maxHealth',
    'luck',
  ]);

  for (const choice of config.levelUpChoices) {
    if (!choice || typeof choice !== 'object') {
      throw new Error('Invalid config.json: each levelUpChoice must be an object.');
    }

    const levelUpChoice = choice as Record<string, unknown>;
    if (
      typeof levelUpChoice.id !== 'string'
      || typeof levelUpChoice.label !== 'string'
      || typeof levelUpChoice.stat !== 'string'
      || typeof levelUpChoice.bonus !== 'number'
      || !validStats.has(levelUpChoice.stat as ConfigLevelUpStat)
    ) {
      throw new Error('Invalid config.json: malformed levelUpChoice entry.');
    }
  }
}

assertGameConfig(configJson);

export const GAME_CONFIG = configJson;
export const XP_THRESHOLDS_CONFIG = GAME_CONFIG.xpThresholds;
export const STARTING_RESOURCES = GAME_CONFIG.startingResources;
export const CONFIG_LEVEL_UP_CHOICES = GAME_CONFIG.levelUpChoices;
export const BOSS_POWER_THRESHOLD_CONFIG = GAME_CONFIG.bossPowerThreshold;
export const BOSS_POWER_IDEAL_CONFIG = GAME_CONFIG.bossPowerIdeal;
