import { useCallback } from 'react';
import { saveEngine } from '@engine/SaveEngine';
import type { GameState } from '@engine/types';
import {
  buyItem as buyInventoryItem,
  sellItem as sellInventoryItem,
  getItemDef,
  getShopInventory,
  inventoryFromResources,
  isItemEquipped,
  resourcesToInventory,
} from '@engine/ItemSystem';
import { useGameStore } from '@store/gameStore';

type ActionFailure = { success: false; reason: string };
type CommitResult = { success: true } | ActionFailure;

async function persistGameState(
  nextState: GameState,
  setGameState: (state: GameState) => void,
): Promise<CommitResult> {
  setGameState(nextState);
  const saveResult = await saveEngine.saveRun(nextState);

  if (!saveResult.success) {
    return { success: false, reason: saveResult.error ?? 'Failed to save run.' };
  }

  return { success: true };
}

export function useShopActions() {
  const setGameState = useGameStore(s => s.setGameState);

  const commitState = useCallback((nextState: GameState) => {
    return persistGameState(nextState, setGameState);
  }, [setGameState]);

  const buyItem = useCallback(async (locationId: number, itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const hasMerchantsRing = isItemEquipped(gameState.resources, 'merchants_ring');
    const def = getItemDef(itemId);
    if (!def) return { success: false, reason: 'Item definition missing.' } satisfies ActionFailure;


    const inventory = inventoryFromResources(gameState.resources);
    const result = buyInventoryItem(
      inventory,
      itemId,
      gameState.resources.gold,
      hasMerchantsRing,
    );
    if (!result.success || !result.inventory) {
      return { success: false, reason: result.reason ?? 'Cannot buy item.' } satisfies ActionFailure;
    }

    const nextResources = resourcesToInventory(
      {
        ...gameState.resources,
        gold: gameState.resources.gold - (result.goldSpent ?? 0),
      },
      result.inventory,
    );
    const nextState = { ...gameState, resources: nextResources };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    return {
      success: true as const,
      goldSpent: result.goldSpent ?? 0,
      itemName: def.name,
    };
  }, [commitState]);

  const sellItem = useCallback(async (itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const inventory = inventoryFromResources(gameState.resources);
    const result = sellInventoryItem(inventory, itemId);
    if (!result.success || !result.inventory) {
      return { success: false, reason: result.reason ?? 'Cannot sell item.' } satisfies ActionFailure;
    }

    const nextResources = resourcesToInventory(
      {
        ...gameState.resources,
        gold: gameState.resources.gold + (result.goldGained ?? 0),
      },
      result.inventory,
    );
    const nextState = { ...gameState, resources: nextResources };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    return {
      success: true as const,
      goldGained: result.goldGained ?? 0,
      itemName: getItemDef(itemId)?.name ?? itemId,
    };
  }, [commitState]);

  return {
    buyItem,
    sellItem,
  };
}
