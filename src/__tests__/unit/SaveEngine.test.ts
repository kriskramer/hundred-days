import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveEngine } from '@engine/SaveEngine';
import { createNewGameState } from '@engine/GameState';
import { makeSaveFileV0, makeSaveFileV1, makeSaveFileV3, makeSaveFileV5, makeSaveFileV7 } from '../__fixtures__/saveFile';

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

  it('round-trips runLayout without regenerating it', async () => {
    const state = createNewGameState('Layout Test');
    const originalLayout = state.runLayout;
    expect(originalLayout).toBeDefined();
    expect(originalLayout!.eliteSpawns.length).toBeGreaterThan(0);

    await saveEngine.saveRun(state);
    const result = await saveEngine.loadActiveRun();

    expect(result.state?.runLayout).toBeDefined();
    expect(result.state?.runLayout?.eliteSpawns).toEqual(originalLayout!.eliteSpawns);
    expect(result.state?.runLayout?.activeShortcuts).toEqual(originalLayout!.activeShortcuts);
    expect(result.state?.runLayout?.roamingMerchants).toEqual(originalLayout!.roamingMerchants);
    expect(result.state?.runLayout?.npcSlots).toEqual(originalLayout!.npcSlots);
  });

  it('round-trips metaProgress', async () => {
    const state = createNewGameState('Meta Test', {
      victoriesCount: 2,
      ngPlusLevel: 1,
      unlockedCompanionIds: ['rex_the_dog'],
    });
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.metaProgress).toEqual({
      victoriesCount: 2,
      ngPlusLevel: 1,
      unlockedCompanionIds: ['rex_the_dog'],
    });
  });

  it('archives completed run and removes active save', async () => {
    const state = {
      ...createNewGameState('Test', {
        victoriesCount: 1,
        ngPlusLevel: 0,
        unlockedCompanionIds: [],
      }),
      isComplete: true,
      outcome: 'victory' as const,
    };
    await saveEngine.saveRun(state);

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(false);

    const history = await saveEngine.getRunHistory();
    expect(history[0]?.metaProgress).toEqual({
      victoriesCount: 1,
      ngPlusLevel: 0,
      unlockedCompanionIds: [],
    });
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
  it('migrates v0 file to v8: adds reputation field', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.reputation).toBeDefined();
    expect(result.state?.reputation.value).toBe(50);
  });

  it('migrates v0 to v8: adds maxSlots and equippedItems', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.resources.maxSlots).toBe(8);
    expect(result.state?.resources.equippedItems).toEqual({});
  });

  it('migrates v0 to v8: adds starvationTurns = 0', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.starvationTurns).toBe(0);
  });

  it('migrates v0 to v8: adds clearedCombatLocations as Set', async () => {
    const v0 = makeSaveFileV0();
    await AsyncStorage.setItem('active_run', JSON.stringify(v0));

    const result = await saveEngine.loadActiveRun();
    expect(result.state?.clearedCombatLocations).toBeInstanceOf(Set);
  });

  it('migrates v0 to v8: adds storyFlags as Set', async () => {
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

  it('migrates v7 file to v8: adds metaProgress = null', async () => {
    const v7 = makeSaveFileV7();
    await AsyncStorage.setItem('active_run', JSON.stringify(v7));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.metaProgress).toBeNull();
  });

  it('v5 file loads through the migration ladder', async () => {
    const v5 = makeSaveFileV5();
    await AsyncStorage.setItem('active_run', JSON.stringify(v5));

    const result = await saveEngine.loadActiveRun();
    expect(result.found).toBe(true);
    expect(result.state?.dayNumber).toBe(v5.dayNumber);
    expect(result.state?.metaProgress).toBeNull();
  });

  it('migrates v10 runLayout merchantLocations into roaming merchants without changing other layout data', async () => {
    const state = createNewGameState('Legacy Merchants');
    const legacyRunLayout = {
      npcSlots: state.runLayout.npcSlots,
      merchantLocations: state.runLayout.roamingMerchants.map(merchant => merchant.locationId),
      activeShortcuts: state.runLayout.activeShortcuts,
      eliteSpawns: state.runLayout.eliteSpawns,
    };
    const legacySave = {
      schemaVersion: 10,
      savedAt: new Date().toISOString(),
      runId: state.runId,
      dayNumber: state.dayNumber,
      locationId: state.currentLocationId,
      playerLevel: state.player.level,
      isComplete: state.isComplete,
      outcome: state.outcome,
      gameState: {
        ...state,
        runLayout: legacyRunLayout,
        firedEventIds: Array.from(state.firedEventIds),
        visitedLocationIds: Array.from(state.visitedLocationIds),
        clearedCombatLocations: Array.from(state.clearedCombatLocations),
        storyFlags: Array.from(state.storyFlags),
        currentTurn: null,
      },
    };

    await AsyncStorage.setItem('active_run', JSON.stringify(legacySave));

    const result = await saveEngine.loadActiveRun();

    expect(result.found).toBe(true);
    expect(result.state?.runLayout.npcSlots).toEqual(state.runLayout.npcSlots);
    expect(result.state?.runLayout.activeShortcuts).toEqual(state.runLayout.activeShortcuts);
    expect(result.state?.runLayout.eliteSpawns).toEqual(state.runLayout.eliteSpawns);
    expect(result.state?.runLayout.roamingMerchants.map(merchant => merchant.locationId)).toEqual(
      state.runLayout.roamingMerchants.map(merchant => merchant.locationId),
    );
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
