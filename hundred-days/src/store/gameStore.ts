import { create } from 'zustand';
import type { GameState } from '@engine/types';

interface GameStore {
  gameState: GameState | null;

  // Actions
  initGame:     (state: GameState) => void;
  setGameState: (state: GameState) => void;
  clearGame:    () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,

  initGame: (state) => set({ gameState: state }),

  setGameState: (state) => set({ gameState: state }),

  clearGame: () => set({ gameState: null }),
}));

// ─────────────────────────────────────────
// Selector hooks — prevent unnecessary re-renders
// by subscribing to slices of state rather than
// the entire gameState object.
// ─────────────────────────────────────────

export const useDay        = () => useGameStore(s => s.gameState?.dayNumber ?? 1);
export const useLocation   = () => useGameStore(s => s.gameState?.currentLocationId ?? 1);
export const useResources  = () => useGameStore(s => s.gameState?.resources);
export const useMorale     = () => useGameStore(s => s.gameState?.morale);
export const useReputation = () => useGameStore(s => s.gameState?.reputation);
export const usePlayer     = () => useGameStore(s => s.gameState?.player);
export const useCompanions = () => useGameStore(s => s.gameState?.companions ?? []);
export const useWeather    = () => useGameStore(s => s.gameState?.weather);
