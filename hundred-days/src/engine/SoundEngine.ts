import { Audio } from 'expo-av';
import type { AppSettings } from './types';

// ─────────────────────────────────────────
// Sound IDs
// ─────────────────────────────────────────

export type SoundId =
  | 'combat_hit'
  | 'combat_hit_heavy'
  | 'combat_victory'
  | 'combat_defeat'
  | 'ui_button'
  | 'ui_equip'
  | 'item_use'
  | 'level_up'
  | 'step_road'
  | 'storm_ambient';

// ─────────────────────────────────────────
// Asset map — add require() paths here once
// audio files are placed in src/assets/sfx/
// ─────────────────────────────────────────

// const SOUND_ASSETS: Partial<Record<SoundId, number>> = {
//   combat_hit:       require('@assets/sfx/combat_hit.mp3'),
//   combat_hit_heavy: require('@assets/sfx/combat_hit_heavy.mp3'),
//   combat_victory:   require('@assets/sfx/victory.mp3'),
//   combat_defeat:    require('@assets/sfx/defeat.mp3'),
//   ui_button:        require('@assets/sfx/ui_click.mp3'),
//   ui_equip:         require('@assets/sfx/equip.mp3'),
//   item_use:         require('@assets/sfx/item_use.mp3'),
//   level_up:         require('@assets/sfx/level_up.mp3'),
//   step_road:        require('@assets/sfx/step.mp3'),
// };

// ─────────────────────────────────────────
// SoundEngine
// ─────────────────────────────────────────

class SoundEngine {
  private enabled: boolean  = true;
  private volume:  number   = 0.6;
  private cache:   Map<SoundId, Audio.Sound> = new Map();

  // ── Configuration ──────────────────────────────────────────

  configure(settings: AppSettings): void {
    this.enabled = settings.soundEnabled;
    this.volume  = settings.musicVolume;
  }

  // ── Playback ───────────────────────────────────────────────

  async play(id: SoundId): Promise<void> {
    if (!this.enabled) return;

    // TODO: uncomment once audio assets are present
    // const asset = SOUND_ASSETS[id];
    // if (!asset) return;
    // try {
    //   // Reuse cached Sound object if available
    //   let sound = this.cache.get(id);
    //   if (!sound) {
    //     const { sound: s } = await Audio.Sound.createAsync(asset, { volume: this.volume });
    //     sound = s;
    //     this.cache.set(id, sound);
    //   }
    //   await sound.setVolumeAsync(this.volume);
    //   await sound.replayAsync();
    // } catch (err) {
    //   console.warn('[SoundEngine] Failed to play', id, err);
    // }
  }

  async stopAll(): Promise<void> {
    for (const sound of this.cache.values()) {
      try { await sound.stopAsync(); } catch { /* ignore */ }
    }
  }

  async unloadAll(): Promise<void> {
    for (const sound of this.cache.values()) {
      try { await sound.unloadAsync(); } catch { /* ignore */ }
    }
    this.cache.clear();
  }

  // ── Audio session setup (call once at app start) ──────────

  static async setup(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS:    false,
        staysActiveInBackground: false,
      });
    } catch (err) {
      console.warn('[SoundEngine] Audio setup failed:', err);
    }
  }
}

export const soundEngine = new SoundEngine();
