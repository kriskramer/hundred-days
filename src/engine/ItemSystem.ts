import {
  ItemDefinition,
  ItemCategory,
  ItemSlot,
  ItemPassiveEffect,
  ItemActiveEffect,
  InventoryItem,
  SpecialEffect,
} from './types';

import { ITEMS, getItemDef, getItemDefinition } from '../data/items';
import { getShopDef } from '../data/shops';

export const ITEM_DEFINITIONS = ITEMS;
export { getItemDef, getItemDefinition };

// ─────────────────────────────────────────
// Inventory shape
// ─────────────────────────────────────────

export interface Inventory {
  items:         InventoryItem[];
  maxSlots:      number;
  equippedItems: Partial<Record<ItemSlot, string>>;  // slot → itemId
}

export function createEmptyInventory(): Inventory {
  return { items: [], maxSlots: 8, equippedItems: {} };
}

// ─────────────────────────────────────────
// InventoryEngine — pure functions, no side-effects
// ─────────────────────────────────────────

export type InventoryResult =
  | { success: true;  inventory: Inventory;  sideEffect?: string }
  | { success: false; reason: string };

export function addItem(inv: Inventory, itemId: string): InventoryResult {
  const def = getItemDef(itemId);
  if (!def) return { success: false, reason: 'Unknown item' };

  // Try to stack
  const existing = inv.items.find(
    i => i.definitionId === itemId && i.quantity < def.maxStack,
  );
  if (existing) {
    const items = inv.items.map(i =>
      i === existing ? { ...i, quantity: i.quantity + 1 } : i,
    );
    return { success: true, inventory: { ...inv, items } };
  }

  // Need a free slot
  if (inv.items.length >= inv.maxSlots) {
    return { success: false, reason: 'Inventory is full' };
  }

  const newItem: InventoryItem = {
    definitionId: itemId,
    quantity:     1,
    isEquipped:   false,
  };

  let maxSlots = inv.maxSlots;
  if (itemId === 'travelers_pack') maxSlots = 10;

  return {
    success:   true,
    inventory: { ...inv, maxSlots, items: [...inv.items, newItem] },
  };
}

export function removeItem(inv: Inventory, itemId: string, qty = 1): InventoryResult {
  const existing = inv.items.find(i => i.definitionId === itemId);
  if (!existing || existing.quantity < qty) {
    return { success: false, reason: 'Item not in inventory' };
  }

  const newQty = existing.quantity - qty;
  const items  = newQty <= 0
    ? inv.items.filter(i => i.definitionId !== itemId)
    : inv.items.map(i => i.definitionId === itemId ? { ...i, quantity: newQty } : i);

  // Unequip if equipped
  const equippedItems = { ...inv.equippedItems };
  for (const [slot, id] of Object.entries(equippedItems)) {
    if (id === itemId) delete equippedItems[slot as ItemSlot];
  }

  return { success: true, inventory: { ...inv, items, equippedItems } };
}

export function equipItem(inv: Inventory, itemId: string): InventoryResult {
  const def = getItemDef(itemId);
  if (!def || def.isConsumable || def.slot === ItemSlot.None) {
    return { success: false, reason: 'Item cannot be equipped' };
  }
  if (!inv.items.some(i => i.definitionId === itemId)) {
    return { success: false, reason: 'Item not in inventory' };
  }

  // Unequip whatever is in this slot
  const equippedItems = { ...inv.equippedItems };
  const currentInSlot = equippedItems[def.slot];
  const items = inv.items.map(i => {
    if (i.definitionId === currentInSlot) return { ...i, isEquipped: false, equippedSlot: undefined };
    if (i.definitionId === itemId)        return { ...i, isEquipped: true,  equippedSlot: def.slot };
    return i;
  });

  equippedItems[def.slot] = itemId;

  return { success: true, inventory: { ...inv, items, equippedItems } };
}

export function unequipItem(inv: Inventory, itemId: string): InventoryResult {
  const def = getItemDef(itemId);
  if (!def) return { success: false, reason: 'Unknown item' };

  const items = inv.items.map(i =>
    i.definitionId === itemId ? { ...i, isEquipped: false, equippedSlot: undefined } : i,
  );

  const equippedItems = { ...inv.equippedItems };
  for (const [slot, id] of Object.entries(equippedItems)) {
    if (id === itemId) delete equippedItems[slot as ItemSlot];
  }

  return { success: true, inventory: { ...inv, items, equippedItems } };
}

export function useItem(
  inv: Inventory,
  itemId: string,
): InventoryResult & { effect?: ItemActiveEffect } {
  const def = getItemDef(itemId);
  if (!def) return { success: false, reason: 'Unknown item' };
  if (!def.isConsumable) return { success: false, reason: 'Item must be equipped, not used' };

  const result = removeItem(inv, itemId, 1);
  if (!result.success) return result;

  return { success: true, inventory: result.inventory, effect: def.activeEffect };
}

// ─────────────────────────────────────────
// Compute all passive bonuses from equipped items
// ─────────────────────────────────────────

export function sumEquippedModifiers<K extends keyof ItemPassiveEffect>(
  equipped: ItemPassiveEffect[],
  key: K
): number {
  return equipped.reduce((sum, e) => sum + ((e[key] as number) ?? 0), 0);
}

export function computeEquippedBonuses(inv: Inventory): ItemPassiveEffect {
  const equippedEffects: ItemPassiveEffect[] = [];
  let weatherProtection = false;
  let immuneToTerrify = false;
  let revealHiddenLocations = false;

  for (const itemId of Object.values(inv.equippedItems)) {
    if (!itemId) continue;
    const def = getItemDef(itemId);
    if (!def?.passiveEffect) continue;
    equippedEffects.push(def.passiveEffect);
    if (def.passiveEffect.weatherProtection) weatherProtection = true;
    if (def.passiveEffect.immuneToTerrify)   immuneToTerrify = true;
    if (def.passiveEffect.revealHiddenLocations) revealHiddenLocations = true;
  }

  const bonuses: ItemPassiveEffect = {
    attackBonus:              sumEquippedModifiers(equippedEffects, 'attackBonus') || undefined,
    defenseBonus:             sumEquippedModifiers(equippedEffects, 'defenseBonus') || undefined,
    speedBonus:               sumEquippedModifiers(equippedEffects, 'speedBonus') || undefined,
    luckModifier:             sumEquippedModifiers(equippedEffects, 'luckModifier') || undefined,
    foodCostReduction:        sumEquippedModifiers(equippedEffects, 'foodCostReduction') || undefined,
    foragingBonus:            sumEquippedModifiers(equippedEffects, 'foragingBonus') || undefined,
    moralePerTurn:            sumEquippedModifiers(equippedEffects, 'moralePerTurn') || undefined,
    companionLoyaltyBonus:    sumEquippedModifiers(equippedEffects, 'companionLoyaltyBonus') || undefined,
    forcedMarchCostReduction: sumEquippedModifiers(equippedEffects, 'forcedMarchCostReduction') || undefined,
    physicalResistanceBonus:  sumEquippedModifiers(equippedEffects, 'physicalResistanceBonus') || undefined,
    goldFindBonus:            sumEquippedModifiers(equippedEffects, 'goldFindBonus') || undefined,
    weatherProtection:        weatherProtection || undefined,
    immuneToTerrify:          immuneToTerrify || undefined,
    revealHiddenLocations:    revealHiddenLocations || undefined,
  };

  return bonuses;
}

// ─────────────────────────────────────────
// Shop helpers
// ─────────────────────────────────────────

export interface ShopItem {
  def:        ItemDefinition;
  finalPrice: number;
  canAfford:  boolean;
}

export function getShopInventory(
  locationId: number,
  playerGold: number,
  hasMerchantsRing: boolean,
): ShopItem[] {
  const shop = getShopDef(locationId);
  if (!shop) return [];

  const discount = hasMerchantsRing ? 0.80 : 1.0;

  return shop.stock.reduce<ShopItem[]>((acc, entry) => {
    const def = getItemDef(entry.itemId);
    if (!def?.shopPrice) return acc;
    const finalPrice = Math.floor(def.shopPrice * discount);
    acc.push({ def, finalPrice, canAfford: playerGold >= finalPrice });
    return acc;
  }, []);
}

export function buyItem(
  inv:         Inventory,
  itemId:      string,
  playerGold:  number,
  hasMerchantsRing: boolean,
): { success: boolean; inventory?: Inventory; goldSpent?: number; reason?: string } {
  const def = getItemDef(itemId);
  if (!def?.shopPrice) return { success: false, reason: 'Not for sale' };

  const discount   = hasMerchantsRing ? 0.80 : 1.0;
  const finalPrice = Math.floor(def.shopPrice * discount);

  if (playerGold < finalPrice) {
    return { success: false, reason: `Need ${finalPrice} gold` };
  }

  const result = addItem(inv, itemId);
  if (!result.success) return { success: false, reason: result.reason };

  let finalInventory = result.inventory;
  if (!def.isConsumable && def.slot !== ItemSlot.None) {
    const isSlotEmpty = !finalInventory.equippedItems[def.slot];
    if (isSlotEmpty) {
      const equipResult = equipItem(finalInventory, itemId);
      if (equipResult.success) {
        finalInventory = equipResult.inventory;
      }
    }
  }

  return { success: true, inventory: finalInventory, goldSpent: finalPrice };
}

export function sellItem(
  inv:    Inventory,
  itemId: string,
): { success: boolean; inventory?: Inventory; goldGained?: number; reason?: string } {
  const def = getItemDef(itemId);
  if (!def?.shopPrice || def.category === ItemCategory.QuestItem) {
    return { success: false, reason: 'Item cannot be sold' };
  }

  const salePrice = Math.floor(def.shopPrice * 0.5);
  const result    = removeItem(inv, itemId, 1);
  if (!result.success) return { success: false, reason: result.reason };

  return { success: true, inventory: result.inventory, goldGained: salePrice };
}

// ─────────────────────────────────────────
// Rarity display helpers
// ─────────────────────────────────────────

export const RARITY_COLOURS: Record<ItemDefinition['rarity'], string> = {
  common:   '#888780',
  uncommon: '#4A7C59',
  rare:     '#2A4A8A',
  unique:   '#B8860B',
};

export const RARITY_BG: Record<ItemDefinition['rarity'], string> = {
  common:   '#E8E8E0',
  uncommon: '#E0E8E0',
  rare:     '#E0E0F0',
  unique:   '#F5E8C0',
};

// ─────────────────────────────────────────
// Slot display names
// ─────────────────────────────────────────

export const SLOT_LABELS: Record<ItemSlot, string> = {
  [ItemSlot.Hand]:   'Hand',
  [ItemSlot.Body]:   'Body',
  [ItemSlot.Back]:   'Back',
  [ItemSlot.Neck]:   'Neck',
  [ItemSlot.Finger]: 'Finger',
  [ItemSlot.None]:   'Consumable',
};

// ─────────────────────────────────────────
// Category icons (text-only, no emoji in RN)
// ─────────────────────────────────────────

export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  [ItemCategory.Consumable]: '◇',
  [ItemCategory.Weapon]:     '⚔',
  [ItemCategory.Armor]:      '◈',
  [ItemCategory.Gear]:       '▲',
  [ItemCategory.Trinket]:    '★',
  [ItemCategory.QuestItem]:  '✦',
};

// ─────────────────────────────────────────
// Bridge helpers — convert between GameState
// resources and the Inventory shape that all
// ItemSystem functions operate on.
// Import these instead of constructing
// Inventory objects manually.
// ─────────────────────────────────────────

import type { PlayerResources } from './types';

/**
 * Pull a live Inventory view from GameState.resources.
 * Zero-cost — no copying, just reshaping the reference.
 */
export function inventoryFromResources(resources: PlayerResources): Inventory {
  return {
    items:         resources.items,
    maxSlots:      resources.maxSlots,
    equippedItems: resources.equippedItems,
  };
}

/**
 * Merge an updated Inventory back into a PlayerResources object.
 * Returns a new resources object; does not mutate the original.
 */
export function resourcesToInventory(
  resources: PlayerResources,
  inv:       Inventory,
): PlayerResources {
  return {
    ...resources,
    items:         inv.items,
    maxSlots:      inv.maxSlots,
    equippedItems: inv.equippedItems,
  };
}

/**
 * Convenience: check whether a specific item is equipped
 * in its designated slot, given a resources object.
 */
export function isItemEquipped(resources: PlayerResources, itemId: string): boolean {
  return Object.values(resources.equippedItems).includes(itemId);
}
