import { SaveFile, SerializedGameState } from '@engine/types';
import { createNewGameState } from '@engine/GameState';
import { MoraleTier, ReputationTier, WeatherType } from '@engine/types';

function makeSerializedState(overrides: Record<string, unknown> = {}): SerializedGameState {
  const base = createNewGameState('Test Hero');
  return {
    ...base,
    firedEventIds: [],
    visitedLocationIds: [1],
    clearedCombatLocations: [],
    storyFlags: [],
    currentTurn: null,
    ...overrides,
  } as unknown as SerializedGameState;
}

export function makeSaveFileV5(): SaveFile {
  return {
    schemaVersion: 5,
    savedAt: new Date().toISOString(),
    runId: 'run_test_001',
    dayNumber: 1,
    locationId: 1,
    playerLevel: 1,
    isComplete: false,
    outcome: null,
    gameState: makeSerializedState(),
  };
}

export function makeSaveFileV0(): Omit<SaveFile, 'schemaVersion'> & { schemaVersion: 0 } {
  const base = makeSerializedState();
  // v0 state has no reputation field
  const { reputation, ...stateWithoutRep } = base as any;
  return {
    schemaVersion: 0,
    savedAt: new Date().toISOString(),
    runId: 'run_v0_001',
    dayNumber: 5,
    locationId: 5,
    playerLevel: 1,
    isComplete: false,
    outcome: null,
    gameState: stateWithoutRep,
  } as any;
}

export function makeSaveFileV1(): Omit<SaveFile, 'schemaVersion'> & { schemaVersion: 1 } {
  const base = makeSerializedState();
  const resources = { food: base.resources.food, gold: base.resources.gold, items: [], /* no maxSlots */ } as any;
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    runId: 'run_v1_001',
    dayNumber: 5,
    locationId: 5,
    playerLevel: 1,
    isComplete: false,
    outcome: null,
    gameState: { ...base, resources } as any,
  };
}

export function makeSaveFileV3(): Omit<SaveFile, 'schemaVersion'> & { schemaVersion: 3 } {
  const base = makeSerializedState();
  const { clearedCombatLocations, storyFlags, ...stateWithoutNew } = base as any;
  return {
    schemaVersion: 3,
    savedAt: new Date().toISOString(),
    runId: 'run_v3_001',
    dayNumber: 5,
    locationId: 5,
    playerLevel: 1,
    isComplete: false,
    outcome: null,
    gameState: stateWithoutNew,
  } as any;
}
