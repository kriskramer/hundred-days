import { createNewGameState } from '@engine/GameState';
import { GameState, Companion, CompanionArchetype, MoraleTier, ReputationTier, WeatherType } from '@engine/types';

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  const base = createNewGameState('Test Hero');
  return { ...base, ...overrides };
}

export function makeCompanion(overrides: Partial<Companion> = {}): Companion {
  return {
    id: 'test_companion',
    name: 'Test Ally',
    archetype: CompanionArchetype.Warrior,
    description: 'A test companion',
    portraitId: 'portrait_test',
    level: { current: 1, xp: 0, xpToNext: 20 },
    loyalty: { value: 60, desertsBelow: 15, complainsBelow: 35 },
    passiveBonus: {},
    foodCostPerTurn: 1.0,
    combatPower: 15,
    loyaltyGains: { onMoraleHigh: 2, onReputationMatch: 1, onRally: 3, onCombatVictory: 4 },
    loyaltyLosses: { onStarvation: 5, onMoraleLow: 2, onReputationMismatch: 2, onBrokenPromise: 8 },
    recruitNarrative: 'They join.',
    departureNarrative: 'They leave.',
    ...overrides,
  };
}

export function makeMoraleState(value: number, overrides = {}) {
  const { getMoraleTier } = require('@engine/GameState');
  return {
    value,
    tier: getMoraleTier(value),
    tierChangedThisTurn: false,
    dreadActive: false,
    ...overrides,
  };
}

export function makeReputationState(value: number, overrides = {}) {
  const { getReputationTier } = require('@engine/GameState');
  return {
    value,
    tier: getReputationTier(value),
    tierChangedThisTurn: false,
    notoriety: false,
    renown: false,
    ...overrides,
  };
}
