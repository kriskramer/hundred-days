import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameState,
  SaveFile,
  SerializedGameState,
  RunHistoryEntry,
  AppSettings,
} from './types';
import { SCHEMA_VERSION } from './GameState';
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
      firedEventIds:      Array.from(state.firedEventIds),
      visitedLocationIds: Array.from(state.visitedLocationIds),
      currentTurn:        null,  // never persist mid-turn state
    };
  }

  private deserialize(saved: SerializedGameState): GameState {
    return {
      ...saved,
      firedEventIds:      new Set(saved.firedEventIds),
      visitedLocationIds: new Set(saved.visitedLocationIds),
      currentTurn:        null,
    };
  }

  // ── Validation ─────────────────────────────────────────────

  /** Returns an error string if invalid, or null if valid. */
  private validate(saveFile: SaveFile): string | null {
    const s = saveFile.gameState;
    if (!s)                                                       return 'Missing gameState';
    if (typeof s.dayNumber !== 'number' || s.dayNumber < 1)       return `Invalid dayNumber: ${s.dayNumber}`;
    if (typeof s.currentLocationId !== 'number')                  return 'Invalid locationId';
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
      const resources = current.gameState.resources as Record<string, unknown>;
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
      const state = current.gameState as Record<string, unknown>;
      if (state['starvationTurns'] === undefined) {
        state['starvationTurns'] = 0;
      }
      current = { ...current, schemaVersion: 3 };
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
