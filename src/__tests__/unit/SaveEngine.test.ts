import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveEngine } from '@engine/SaveEngine';
import { createNewGameState } from '@engine/GameState';
import { makeSaveFileV0, makeSaveFileV1, makeSaveFileV3, makeSaveFileV5 } from '../__fixtures__/saveFile';

// Mock locations for SaveEngine's archiveRun (calls getRegion)
jest.mock('@data/locations', () => ({
  LOCATIONS: [],
  getLocation: jest.fn(() => null),
  getRegion: jest.fn(() => ({ name: 'Test Region', startId: 1, endId: 20 })),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ─────────────────────────────────────────
// saveRun + loadActiveRun round-trip
// ─────────────────────────────────────────

describe('saveRun / loadActiveRun round-trip', () => {
  it('saves and reloads state preserving key fields', async () => {
    const state = createNewGameState('Save Test');
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.runId).toBe(state.runId);
    expect(result.state?.dayNumber).toBe(state.dayNumber);
    expect(result.state?.currentLocationId).toBe(state.currentLocationId);
    expect(result.state?.player.name).toBe('Save Test');
  });

  it('rehydrates firedEventIds as a Set', async () => {
    const state = createNewGameState('Test Hero');
    state.firedEventIds.add('find_abandoned_camp');
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.firedEventIds).toBeInstanceOf(Set);
    expect(result.state?.firedEventIds.has('find_abandoned_camp')).toBe(true);
  });

  it('rehydrates storyFlags as a Set', async () => {
    const state = createNewGameState('Test Hero');
    state.storyFlags.add('rex_recruited');
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.storyFlags).toBeInstanceOf(Set);
    expect(result.state?.storyFlags.has('rex_recruited')).toBe(true);
  });

  it('rehydrates visitedLocationIds as a Set', async () => {
    const state = createNewGameState('Test Hero');
    state.visitedLocationIds.add(5);
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.visitedLocationIds).toBeInstanceOf(Set);
    expect(result.state?.visitedLocationIds.has(5)).toBe(true);
  });

  it('rehydrates clearedCombatLocations as a Set', async () => {
    const state = createNewGameState('Test Hero');
    state.clearedCombatLocations.add(32);
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.clearedCombatLocations).toBeInstanceOf(Set);
    expect(result.state?.clearedCombatLocations.has(32)).toBe(true);
  });

  it('returns found: false when no save exists', async () => {
    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(false);
  });

  it('archives completed run and removes active save', async () => {
    const state = { ...createNewGameState('Test'), isComplete: true, outcome: 'victory' as const };
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(false);
  });
});

// ─────────────────────────────────────────
// Backup recovery
// ─────────────────────────────────────────

describe('backup recovery', () => {
  it('recovers from backup when active save is corrupt', async () => {
    const state = createNewGameState('Backup Test');
    // First save creates the active
    await saveEngine.saveRun(state);
    // Second save promotes first to backup, writes new active
    const state2 = { ...state, dayNumber: 6 };
    await saveEngine.saveRun(state2);

    // Corrupt the active run
    await AsyncStorage.setItem('active_run', 'INVALID_JSON_DATA');

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.restoredFromBackup).toBe(true);
    expect(result.backupDayNumber).toBeDefined();
  });

  it('returns found: false when both saves are corrupt', async () => {
    await AsyncStorage.setItem('active_run', 'CORRUPT');
    await AsyncStorage.setItem('active_run_backup', 'ALSO_CORRUPT');

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(false);
    expect(result.recoveryFailed).toBe(true);
  });
});

// ─────────────────────────────────────────
// Migration ladder
// ─────────────────────────────────────────

describe('migration', () => {
  it('migrates v0 file to v5: adds reputation field', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.reputation).toBeDefined();
    expect(result.state?.reputation.value).toBe(50);
  });

  it('migrates v0 to v5: adds maxSlots and equippedItems', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.resources.maxSlots).toBe(8);
    expect(result.state?.resources.equippedItems).toEqual({});
  });

  it('migrates v0 to v5: adds starvationTurns = 0', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.starvationTurns).toBe(0);
  });

  it('migrates v0 to v5: adds clearedCombatLocations as Set', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.clearedCombatLocations).toBeInstanceOf(Set);
  });

  it('migrates v0 to v5: adds storyFlags as Set', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.storyFlags).toBeInstanceOf(Set);
  });

  it('migrates v3 file only applies v3→v4→v5 steps', async () => {
    const v3 = makeSaveFileV3();
    await AsyncStorage.setItem('active_run', JSON.stringify(v3));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.storyFlags).toBeInstanceOf(Set);
    expect(result.state?.clearedCombatLocations).toBeInstanceOf(Set);
    // v3 already had starvationTurns if it was a v2+ file
  });

  it('v5 file loads without migration', async () => {
    const v5 = makeSaveFileV5();
    await AsyncStorage.setItem('active_run', JSON.stringify(v5));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.dayNumber).toBe(v5.dayNumber);
  });
});

// ─────────────────────────────────────────
// hasActiveRun / clearActiveRun
// ─────────────────────────────────────────

describe('hasActiveRun', () => {
  it('returns false when no save', async () => {
    expect(await saveEngine.hasActiveRun()).toBe(false);
  });

  it('returns true after a save', async () => {
    await saveEngine.saveRun(createNewGameState('Test'));
    expect(await saveEngine.hasActiveRun()).toBe(true);
  });

  it('returns false after clearActiveRun', async () => {
    await saveEngine.saveRun(createNewGameState('Test'));
    await saveEngine.clearActiveRun();
    expect(await saveEngine.hasActiveRun()).toBe(false);
  });
});
