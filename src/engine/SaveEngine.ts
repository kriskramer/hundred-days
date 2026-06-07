import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameState,
  SaveFile,
  SerializedGameState,
  RunHistoryEntry,
  AppSettings,
  MetaProgress,
} from './types';
import { SCHEMA_VERSION } from './GameState';
import { generateRunLayout, normalizeRunLayout } from './RunLayout';
import { getRegion } from '@data/locations';

// ─────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────

const KEYS = {
  ACTIVE_RUN:     'active_run',
  BACKUP_RUN:     'active_run_backup',
  RUN_HISTORY:    'run_history',
  APP_SETTINGS:   'app_settings',
  SCHEMA_VERSION: 'schema_version',
} as const;

// ─────────────────────────────────────────
// Return types
// ─────────────────────────────────────────

export interface SaveResult {
  success: boolean;
  error?:  string;
}

export interface LoadResult {
  found:               boolean;
  state?:              GameState;
  restoredFromBackup?: boolean;
  backupDayNumber?:    number;
  recoveryFailed?:     boolean;
  reason?:             string;
}

// ─────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled:      true,
  musicVolume:       0.6,
  textSpeed:         'normal',
  showDamageNumbers: true,
  confirmActions:    true,
  lastPlayedAt:      new Date().toISOString(),
};

// ─────────────────────────────────────────
// SaveEngine
// ─────────────────────────────────────────

class SaveEngine {

  // ── Save ───────────────────────────────────────────────────

  async saveRun(state: GameState): Promise<SaveResult> {
    try {
      // Promote current → backup before overwriting
      const currentJson = await AsyncStorage.getItem(KEYS.ACTIVE_RUN);
      if (currentJson) {
        await AsyncStorage.setItem(KEYS.BACKUP_RUN, currentJson);
      }

      const saveFile: SaveFile = {
        schemaVersion: SCHEMA_VERSION,
        savedAt:       new Date().toISOString(),
        runId:         state.runId,
        dayNumber:     state.dayNumber,
        locationId:    state.currentLocationId,
        playerLevel:   state.player.level,
        isComplete:    state.isComplete,
        outcome:       state.outcome,
        gameState:     this.serialize(state),
      };

      await AsyncStorage.setItem(KEYS.ACTIVE_RUN, JSON.stringify(saveFile));

      // Archive completed runs
      if (state.isComplete) {
        await this.archiveRun(state);
        await AsyncStorage.multiRemove([KEYS.ACTIVE_RUN, KEYS.BACKUP_RUN]);
      }

      return { success: true };
    } catch (err) {
      console.error('[SaveEngine] Save failed:', err);
      return { success: false, error: String(err) };
    }
  }

  // ── Load ───────────────────────────────────────────────────

  async loadActiveRun(): Promise<LoadResult> {
    try {
      const json = await AsyncStorage.getItem(KEYS.ACTIVE_RUN);
      if (!json) return { found: false };

      const saveFile: SaveFile = JSON.parse(json);

      // Schema migration
      if (saveFile.schemaVersion !== SCHEMA_VERSION) {
        const migrated = this.migrate(saveFile);
        if (!migrated) return this.loadFromBackup('Migration failed');
        return { found: true, state: this.deserialize(migrated.gameState) };
      }

      // Validate
      const validationError = this.validate(saveFile);
      if (validationError) {
        console.warn('[SaveEngine] Validation failed:', validationError);
        return this.loadFromBackup(validationError);
      }

      return { found: true, state: this.deserialize(saveFile.gameState) };

    } catch (err) {
      console.error('[SaveEngine] Load failed:', err);
      return this.loadFromBackup('Parse error');
    }
  }

  // ── Backup recovery ────────────────────────────────────────

  private async loadFromBackup(reason: string): Promise<LoadResult> {
    console.warn('[SaveEngine] Attempting backup recovery. Reason:', reason);
    try {
      const backupJson = await AsyncStorage.getItem(KEYS.BACKUP_RUN);
      if (!backupJson) return { found: false, recoveryFailed: true, reason };

      const backup: SaveFile = JSON.parse(backupJson);
      const validationError  = this.validate(backup);

      if (validationError) {
        await this.clearActiveRun();
        return { found: false, recoveryFailed: true, reason: 'Both saves corrupt' };
      }

      // Restore backup as active
      await AsyncStorage.setItem(KEYS.ACTIVE_RUN, backupJson);

      return {
        found:               true,
        state:               this.deserialize(backup.gameState),
        restoredFromBackup:  true,
        backupDayNumber:     backup.dayNumber,
      };
    } catch (err) {
      console.error('[SaveEngine] Backup recovery failed:', err);
      await this.clearActiveRun();
      return { found: false, recoveryFailed: true, reason: 'Backup corrupt' };
    }
  }

  // ── Serialization ──────────────────────────────────────────

  private serialize(state: GameState): SerializedGameState {
    return {
      ...state,
      metaProgress:           this.cloneMetaProgress(state.metaProgress),
      firedEventIds:          Array.from(state.firedEventIds),
      visitedLocationIds:     Array.from(state.visitedLocationIds),
      clearedCombatLocations: Array.from(state.clearedCombatLocations),
      storyFlags:             Array.from(state.storyFlags),
      currentTurn:            null,  // never persist mid-turn state
    };
  }

  private deserialize(saved: SerializedGameState): GameState {
    return {
      ...saved,
      runLayout:              normalizeRunLayout(saved.runLayout, saved.seed),
      metaProgress:           this.cloneMetaProgress(saved.metaProgress ?? null),
      rngState:               saved.rngState ?? (saved.seed >>> 0),
      firedEventIds:          new Set(saved.firedEventIds),
      visitedLocationIds:     new Set(saved.visitedLocationIds),
      clearedCombatLocations: new Set(saved.clearedCombatLocations ?? []),
      storyFlags:             new Set(saved.storyFlags ?? []),
      currentTurn:            null,
    };
  }

  private cloneMetaProgress(metaProgress: MetaProgress | null): MetaProgress | null {
    if (!metaProgress) return null;

    return {
      ...metaProgress,
      unlockedCompanionIds: [...metaProgress.unlockedCompanionIds],
    };
  }

  // ── Validation ─────────────────────────────────────────────

  /** Returns an error string if invalid, or null if valid. */
  private validate(saveFile: SaveFile): string | null {
    const s = saveFile.gameState;
    if (!s)                                                       return 'Missing gameState';
    if (typeof s.dayNumber !== 'number' || s.dayNumber < 1)       return `Invalid dayNumber: ${s.dayNumber}`;
    if (typeof s.currentLocationId !== 'number')                  return 'Invalid locationId';
    if (typeof s.rngState !== 'number')                           return 'Invalid rngState';
    if (!s.player || typeof s.player.level !== 'number')          return 'Invalid player data';
    if (!s.resources || typeof s.resources.food !== 'number')     return 'Invalid resources';
    if (!Array.isArray(s.firedEventIds))                          return 'firedEventIds not array';
    if (!Array.isArray(s.companions))                             return 'companions not array';
    return null;
  }

  // ── Migration ──────────────────────────────────────────────

  private migrate(saveFile: SaveFile): SaveFile | null {
    let current = { ...saveFile };

    // v0 → v1: add reputation field if missing
    if (current.schemaVersion === 0) {
      const state = current.gameState as SerializedGameState & { reputation?: unknown };
      if (!state.reputation) {
        (current.gameState as unknown as Record<string, unknown>)['reputation'] = {
          value:               50,
          tier:                'neutral',
          tierChangedThisTurn: false,
          notoriety:           false,
          renown:              false,
        };
      }
      current = { ...current, schemaVersion: 1 };
    }

    // v1 → v2: add maxSlots and equippedItems to resources if missing
    if (current.schemaVersion === 1) {
      const resources = current.gameState.resources as unknown as Record<string, unknown>;
      if (resources['maxSlots'] === undefined) {
        resources['maxSlots'] = 8;
      }
      if (resources['equippedItems'] === undefined) {
        resources['equippedItems'] = {};
      }
      current = { ...current, schemaVersion: 2 };
    }

    // v2 → v3: add starvationTurns if missing
    if (current.schemaVersion === 2) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['starvationTurns'] === undefined) {
        state['starvationTurns'] = 0;
      }
      current = { ...current, schemaVersion: 3 };
    }

    // v3 → v4: add clearedCombatLocations if missing
    if (current.schemaVersion === 3) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['clearedCombatLocations'] === undefined) {
        state['clearedCombatLocations'] = [];
      }
      current = { ...current, schemaVersion: 4 };
    }

    // v4 → v5: add storyFlags if missing
    if (current.schemaVersion === 4) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['storyFlags'] === undefined) {
        state['storyFlags'] = [];
      }
      current = { ...current, schemaVersion: 5 };
    }

    // v5 → v6: add rngState if missing
    if (current.schemaVersion === 5) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['rngState'] === undefined) {
        const seed = typeof state['seed'] === 'number' ? Number(state['seed']) : 0;
        state['rngState'] = seed >>> 0;
      }
      current = { ...current, schemaVersion: 6 };
    }

    // v6 → v7: add stealing: 5 to player stats and generate runLayout if missing
    if (current.schemaVersion === 6) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['player'] && typeof state['player'] === 'object') {
        const playerObj = state['player'] as Record<string, unknown>;
        if (playerObj['stats'] && typeof playerObj['stats'] === 'object') {
          const statsObj = playerObj['stats'] as Record<string, unknown>;
          if (statsObj['stealing'] === undefined) {
            statsObj['stealing'] = 5;
          }
        }
      }
      if (state['runLayout'] === undefined) {
        const seed = typeof state['seed'] === 'number' ? state['seed'] : 0;
        state['runLayout'] = generateRunLayout(seed);
      }
      current = { ...current, schemaVersion: 7 };
    }

    // v7 → v8: add metaProgress if missing
    if (current.schemaVersion === 7) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['metaProgress'] === undefined) {
        state['metaProgress'] = null;
      }
      current = { ...current, schemaVersion: 8 };
    }

    // v8 → v9: add consecutiveForcedMarches if missing
    if (current.schemaVersion === 8) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['consecutiveForcedMarches'] === undefined) {
        state['consecutiveForcedMarches'] = 0;
      }
      current = { ...current, schemaVersion: 9 };
    }

    // v9 → v10: add consecutiveStormDays and consecutiveCombatDays if missing
    if (current.schemaVersion === 9) {
      const state = current.gameState as unknown as Record<string, unknown>;
      if (state['consecutiveStormDays'] === undefined) {
        state['consecutiveStormDays'] = 0;
      }
      if (state['consecutiveCombatDays'] === undefined) {
        state['consecutiveCombatDays'] = 0;
      }
      current = { ...current, schemaVersion: 10 };
    }

    // v10 → v11: upgrade runLayout merchantLocations into roamingMerchants
    if (current.schemaVersion === 10) {
      const state = current.gameState as SerializedGameState & { runLayout?: unknown; seed?: unknown };
      if (state.runLayout && typeof state.runLayout === 'object') {
        const seed = typeof state.seed === 'number' ? state.seed : 0;
        state.runLayout = normalizeRunLayout(
          state.runLayout as Parameters<typeof normalizeRunLayout>[0],
          seed,
        );
      }
      current = { ...current, schemaVersion: 11 };
    }

    if (current.schemaVersion !== SCHEMA_VERSION) return null;
    return current;
  }

  // ── Run history ────────────────────────────────────────────

  private async archiveRun(state: GameState): Promise<void> {
    try {
      const json    = await AsyncStorage.getItem(KEYS.RUN_HISTORY);
      const history: RunHistoryEntry[] = json ? JSON.parse(json) : [];

      const entry: RunHistoryEntry = {
        runId:               state.runId,
        startedAt:           new Date(Date.now() - state.dayNumber * 86_400_000).toISOString(),
        endedAt:             new Date().toISOString(),
        outcome:             state.outcome ?? 'abandoned',
        finalDay:            state.dayNumber,
        finalLocation:       state.currentLocationId,
        finalLevel:          state.player.level,
        companionsRecruited: state.companions.map(c => c.name),
        turnsPlayed:         state.turnHistory.length,
        summary:             this.buildSummary(state),
        metaProgress:        this.cloneMetaProgress(state.metaProgress),
      };

      const trimmed = [entry, ...history].slice(0, 20);
      await AsyncStorage.setItem(KEYS.RUN_HISTORY, JSON.stringify(trimmed));
    } catch (err) {
      console.error('[SaveEngine] Archive failed (non-critical):', err);
    }
  }

  private buildSummary(state: GameState): string {
    const region     = getRegion(state.currentLocationId).name;
    const companions = state.companions.length;

    switch (state.outcome) {
      case 'victory':
        return `Defeated the Dread Sovereign on day ${state.dayNumber}. `
             + `Level ${state.player.level}, ${companions} companion${companions !== 1 ? 's' : ''}.`;
      case 'defeat':
        return `Fell in ${region} on day ${state.dayNumber} at level ${state.player.level}.`;
      case 'timeout':
        return `Ran out of days at location ${state.currentLocationId}. `
             + `${125 - state.currentLocationId} locations short.`;
      default:
        return `Abandoned at ${region}, day ${state.dayNumber}.`;
    }
  }

  // ── Settings ───────────────────────────────────────────────

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.APP_SETTINGS, JSON.stringify(settings));
    } catch (err) {
      console.error('[SaveEngine] Settings save failed:', err);
    }
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const json = await AsyncStorage.getItem(KEYS.APP_SETTINGS);
      if (!json) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  // ── Utilities ──────────────────────────────────────────────

  async hasActiveRun(): Promise<boolean> {
    const json = await AsyncStorage.getItem(KEYS.ACTIVE_RUN);
    return json !== null;
  }

  async getActiveSaveInfo(): Promise<SaveFile | null> {
    try {
      const json = await AsyncStorage.getItem(KEYS.ACTIVE_RUN);
      if (!json) return null;
      const save: SaveFile = JSON.parse(json);
      return save;
    } catch {
      return null;
    }
  }

  async getRunHistory(): Promise<RunHistoryEntry[]> {
    try {
      const json = await AsyncStorage.getItem(KEYS.RUN_HISTORY);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  async clearActiveRun(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.ACTIVE_RUN, KEYS.BACKUP_RUN]);
  }
}

// ─────────────────────────────────────────
// Singleton export — import everywhere as:
//   import { saveEngine } from '@engine/SaveEngine';
// ─────────────────────────────────────────

export const saveEngine = new SaveEngine();
