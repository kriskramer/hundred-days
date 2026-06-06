import { useCallback } from 'react';
import { saveEngine } from '@engine/SaveEngine';
import { applyMoraleDelta } from '@engine/GameState';
import type { GameState } from '@engine/types';
import {
  equipItem as equipInventoryItem,
  unequipItem as unequipInventoryItem,
  useItem as consumeInventoryItem,
  sellItem as sellInventoryItem,
  removeItem,
  getItemDef,
  inventoryFromResources,
  resourcesToInventory,
} from '@engine/ItemSystem';
import { useGameStore } from '@store/gameStore';

type ActionFailure = { success: false; reason: string };
type CommitResult = { success: true } | ActionFailure;
type EffectSummary = {
  healthRestore?: number;
  foodRestore?: number;
  moraleRestore?: number;
};

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

export function useInventoryActions() {
  const setGameState = useGameStore(s => s.setGameState);

  const commitState = useCallback((nextState: GameState) => {
    return persistGameState(nextState, setGameState);
  }, [setGameState]);

  const equipItem = useCallback(async (itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const inventory = inventoryFromResources(gameState.resources);
    const result = equipInventoryItem(inventory, itemId);
    if (!result.success) return { success: false, reason: result.reason ?? 'Cannot equip item.' } satisfies ActionFailure;

    const nextState = {
      ...gameState,
      resources: resourcesToInventory(gameState.resources, result.inventory),
    };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    return { success: true as const, itemName: getItemDef(itemId)?.name ?? itemId };
  }, [commitState]);

  const unequipItem = useCallback(async (itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const inventory = inventoryFromResources(gameState.resources);
    const result = unequipInventoryItem(inventory, itemId);
    if (!result.success) return { success: false, reason: result.reason ?? 'Cannot unequip item.' } satisfies ActionFailure;

    const nextState = {
      ...gameState,
      resources: resourcesToInventory(gameState.resources, result.inventory),
    };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    return { success: true as const };
  }, [commitState]);

  const consumeItem = useCallback(async (itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const def = getItemDef(itemId);
    if (!def) return { success: false, reason: 'Item definition missing.' } satisfies ActionFailure;

    const effect = def.activeEffect;
    if (effect && (
      effect.combatDamage !== undefined ||
      effect.combatEffect !== undefined ||
      effect.tempAttackBonus !== undefined ||
      effect.tempDefenseBonus !== undefined ||
      effect.tempSpeedBonus !== undefined
    )) {
      return { success: false, reason: 'Can only be used in combat.' } satisfies ActionFailure;
    }

    const inventory = inventoryFromResources(gameState.resources);
    const result = consumeInventoryItem(inventory, itemId);
    if (!result.success) return { success: false, reason: result.reason ?? 'Cannot use item.' } satisfies ActionFailure;

    let nextResources = resourcesToInventory(gameState.resources, result.inventory);
    let nextPlayer = { ...gameState.player };
    let nextMorale = gameState.morale;
    const activeEffect = result.effect;

    if (activeEffect?.foodRestore) {
      nextResources = { ...nextResources, food: nextResources.food + activeEffect.foodRestore };
    }

    if (activeEffect?.healthRestore) {
      nextPlayer = {
        ...nextPlayer,
        health: Math.min(
          nextPlayer.health + activeEffect.healthRestore,
          nextPlayer.stats.maxHealth,
        ),
      };
    }

    if (activeEffect?.moraleRestore) {
      nextMorale = applyMoraleDelta(nextMorale, activeEffect.moraleRestore);
    }

    if (activeEffect?.clearsStatusEffect) {
      nextPlayer = {
        ...nextPlayer,
        statusEffects: nextPlayer.statusEffects.filter(
          effectState => effectState.id !== activeEffect.clearsStatusEffect,
        ),
      };
    }

    if (activeEffect?.grantsStatusEffect) {
      const alreadyPresent = nextPlayer.statusEffects.some(
        effectState => effectState.id === activeEffect.grantsStatusEffect,
      );

      if (!alreadyPresent) {
        nextPlayer = {
          ...nextPlayer,
          statusEffects: [
            ...nextPlayer.statusEffects,
            {
              id: activeEffect.grantsStatusEffect,
              durationTurns: activeEffect.statusDurationTurns ?? 3,
            },
          ],
        };
      }
    }

    const nextState = {
      ...gameState,
      resources: nextResources,
      player: nextPlayer,
      morale: nextMorale,
    };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    const effectSummary: EffectSummary = {
      healthRestore: activeEffect?.healthRestore,
      foodRestore: activeEffect?.foodRestore,
      moraleRestore: activeEffect?.moraleRestore,
    };

    return {
      success: true as const,
      itemName: def.name,
      effectSummary,
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

  const dropItem = useCallback(async (itemId: string) => {
    const gameState = useGameStore.getState().gameState;
    if (!gameState) return { success: false, reason: 'No active game.' } satisfies ActionFailure;

    const inventory = inventoryFromResources(gameState.resources);
    const result = removeItem(inventory, itemId, 1);
    if (!result.success) {
      return { success: false, reason: result.reason } satisfies ActionFailure;
    }

    const nextState = {
      ...gameState,
      resources: resourcesToInventory(gameState.resources, result.inventory),
    };
    const persisted = await commitState(nextState);
    if (!persisted.success) return persisted;

    return { success: true as const };
  }, [commitState]);

  return {
    equipItem,
    unequipItem,
    consumeItem,
    sellItem,
    dropItem,
  };
}
