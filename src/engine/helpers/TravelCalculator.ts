import { GameState, StatDelta, WeatherType } from '../types';
import { BOSS_EVENT_MAP } from '../bosses';
import { getLuckThreshold, getFoodCostMultiplier } from '../GameState';
import { GameBalance } from '../GameBalance';
import { computeEquippedBonuses, inventoryFromResources } from '../ItemSystem';
import { nextMulberry32 } from '../Random';

/**
 * Calculates the player's portion of the food cost for a movement turn.
 */
export function calculateFoodCostForMove(
  state: GameState,
  locationsToMove: number,
  forcedMarch: boolean,
  isShortcut: boolean = false,
): number {
  const itemBonuses = computeEquippedBonuses(inventoryFromResources(state.resources));
  const moraleFoodMult = getFoodCostMultiplier(state.morale);
  const itemFoodMult = 1 - (itemBonuses.foodCostReduction ?? 0);
  const marchCostAdjust = itemBonuses.forcedMarchCostReduction ?? 0;

  // Warm Cloak weather override
  const effectiveWeather = itemBonuses.weatherProtection && state.weather === WeatherType.Severe
    ? WeatherType.Poor
    : state.weather;

  let baseFoodCost: number = GameBalance.BASE_FOOD_COST_PER_MOVE;
  if (isShortcut) {
    baseFoodCost = GameBalance.SHORTCUT_FOOD_COST;
  } else {
    if (forcedMarch && state.resources.food >= GameBalance.FORCED_MARCH_FOOD_MULTIPLIER) {
      baseFoodCost = GameBalance.FORCED_MARCH_FOOD_MULTIPLIER + marchCostAdjust;
    }
    if (effectiveWeather === WeatherType.Severe) {
      baseFoodCost = 1.0;
    }
  }

  const companionFoodModifier = state.companions.reduce(
    (mult, c) => mult * (c.passiveBonus.foodCostModifier ?? 1.0), 1.0,
  );

  return baseFoodCost
    * companionFoodModifier
    * moraleFoodMult
    * itemFoodMult;
}

/**
 * Returns companion food cost delta for locations traveled.
 */
export function applyCompanionFoodCosts(state: GameState, locationsToMove: number): StatDelta {
  const companions = state.companions;
  const companionFoodPerTurn = companions.reduce((sum, c) => sum + c.foodCostPerTurn, 0);
  const companionFoodModifier = companions.reduce(
    (mult, c) => mult * (c.passiveBonus.foodCostModifier ?? 1.0), 1.0,
  );
  const moraleFoodMult = getFoodCostMultiplier(state.morale);
  const itemBonuses = computeEquippedBonuses(inventoryFromResources(state.resources));
  const itemFoodMult = 1 - (itemBonuses.foodCostReduction ?? 0);

  const companionFoodCost = companionFoodPerTurn
    * companionFoodModifier
    * moraleFoodMult
    * itemFoodMult;

  return { source: 'companion_food', food: -companionFoodCost };
}

/**
 * Returns true if the seeded RNG hits the luck threshold for a 3rd location.
 */
export function rollLucky3rdLocation(state: GameState, roll?: number): boolean {
  const itemBonuses = computeEquippedBonuses(inventoryFromResources(state.resources));
  const luckThreshold = getLuckThreshold(state.morale)
    + ((state.player.stats.luck ?? 0) / 100)
    + (itemBonuses.luckModifier ?? 0);
  const luckRoll = roll !== undefined ? roll : nextMulberry32(state.rngState).value;
  return luckRoll <= luckThreshold;
}

/**
 * Returns the first uncleared boss location in [currentLoc+1 .. targetLoc], or null.
 */
export function findBossCheckpoint(
  currentLoc: number,
  targetLoc: number,
  cleared: Set<number>
): number | null {
  const bossCheckpoint = Object.keys(BOSS_EVENT_MAP)
    .map(Number)
    .sort((a, b) => a - b)
    .find(b => b > currentLoc && b <= targetLoc && !cleared.has(b));
  return bossCheckpoint ?? null;
}
