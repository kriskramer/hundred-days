import {
  ItemDefinition,
  ItemCategory,
  ItemSlot,
  ItemPassiveEffect,
  ItemActiveEffect,
  InventoryItem,
  SpecialEffect,
} from './types';

// ─────────────────────────────────────────
// Item definitions — all 30+ items
// ─────────────────────────────────────────

export const ITEM_DEFINITIONS: ItemDefinition[] = [

  // ── Consumables: Food ──────────────────────────────────────

  {
    id: 'dried_rations', name: 'Dried Rations',
    description: 'Hard bread and preserved meat. Not good, but filling.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { foodRestore: 3 },
    isConsumable: true,
    shopPrice: 5,
    foundInRegions: ['Senin Valley', 'Qanisi Borderlands'],
    maxStack: 5,
    iconId: 'rations',
    rarity: 'common',
  },
  {
    id: 'hearty_meal', name: 'Hearty Meal',
    description: 'A proper cooked meal. Restores 6 food and grants Well-Fed status for 3 turns.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { foodRestore: 6, grantsStatusEffect: 'well_fed', statusDurationTurns: 3 },
    isConsumable: true,
    shopPrice: 12,
    foundInRegions: ['Senin Valley', 'Qanisi Territory'],
    maxStack: 3,
    iconId: 'meal',
    rarity: 'uncommon',
  },
  {
    id: 'hunters_jerky', name: "Hunter's Jerky",
    description: 'Dense salted meat. Restores 5 food. Can be eaten even in combat.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { foodRestore: 5 },
    isConsumable: true,
    shopPrice: 8,
    dropsFrom: ['wolves', 'wild_dogs'],
    maxStack: 4,
    iconId: 'jerky',
    rarity: 'common',
  },

  // ── Consumables: Potions ───────────────────────────────────

  {
    id: 'healing_potion', name: 'Healing Potion',
    description: 'A red vial of alchemical preparation. Restores 25 health immediately.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { healthRestore: 25 },
    isConsumable: true,
    shopPrice: 20,
    foundInRegions: ['Qanisi Territory', 'Eastern Wilds', 'The Midlands'],
    maxStack: 3,
    iconId: 'potion_red',
    rarity: 'uncommon',
  },
  {
    id: 'greater_healing_potion', name: 'Greater Healing Potion',
    description: 'Restores 50 health and clears the Wounded status.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { healthRestore: 50, clearsStatusEffect: 'wounded' },
    isConsumable: true,
    shopPrice: 45,
    foundInRegions: ['The Midlands', 'The Dark Reaches'],
    maxStack: 2,
    iconId: 'potion_red_large',
    rarity: 'rare',
  },
  {
    id: 'spirit_tonic', name: 'Spirit Tonic',
    description: 'A bracing herbal brew. Restores 20 morale and clears Fatigued.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { moraleRestore: 20, clearsStatusEffect: 'fatigued' },
    isConsumable: true,
    shopPrice: 18,
    foundInRegions: ['Eastern Wilds', 'The Midlands'],
    maxStack: 3,
    iconId: 'potion_blue',
    rarity: 'uncommon',
  },
  {
    id: 'battle_draught', name: 'Battle Draught',
    description: 'A sharp, burning liquid. Grants +6 attack and +4 speed for 3 combat rounds.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { tempAttackBonus: 6, tempSpeedBonus: 4, buffDurationRounds: 3 },
    isConsumable: true,
    shopPrice: 25,
    foundInRegions: ['Eastern Wilds', 'The Midlands', 'The Dark Reaches'],
    maxStack: 2,
    iconId: 'potion_orange',
    rarity: 'uncommon',
  },

  // ── Consumables: Throwables ────────────────────────────────

  {
    id: 'flash_powder', name: 'Flash Powder',
    description: 'Throw at enemies to stun them for one round. Useless against undead.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { combatDamage: 0, combatEffect: SpecialEffect.Stun },
    isConsumable: true,
    shopPrice: 15,
    maxStack: 3,
    iconId: 'flash',
    rarity: 'uncommon',
  },
  {
    id: 'smoke_bomb', name: 'Smoke Bomb',
    description: 'Guarantees flee success when thrown. One use.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { combatDamage: 0, combatEffect: SpecialEffect.Stun },
    isConsumable: true,
    shopPrice: 22,
    dropsFrom: ['bandits', 'goblins'],
    maxStack: 2,
    iconId: 'smoke',
    rarity: 'uncommon',
  },
  {
    id: 'holy_water', name: 'Holy Water',
    description: 'Deals 30 damage to undead and spectral enemies. Useless against the living.',
    category: ItemCategory.Consumable, slot: ItemSlot.None,
    activeEffect: { combatDamage: 30 },
    isConsumable: true,
    shopPrice: 30,
    foundInRegions: ['Edge of the Known World', 'Colrandrir Mountains'],
    maxStack: 2,
    iconId: 'holy_water',
    rarity: 'rare',
  },

  // ── Weapons ────────────────────────────────────────────────

  {
    id: 'travelers_blade', name: "Traveler's Blade",
    description: 'A short, practical sword. Nothing fancy, nothing broken. +4 attack.',
    category: ItemCategory.Weapon, slot: ItemSlot.Hand,
    passiveEffect: { attackBonus: 4 },
    isConsumable: false,
    shopPrice: 25,
    foundInRegions: ['Senin Valley', 'Qanisi Borderlands'],
    maxStack: 1,
    iconId: 'sword_short',
    rarity: 'common',
  },
  {
    id: 'hunters_bow', name: "Hunter's Bow",
    description: '+3 attack in combat and +2 food when hunting — arrows bring down game cleanly.',
    category: ItemCategory.Weapon, slot: ItemSlot.Hand,
    passiveEffect: { attackBonus: 3, foragingBonus: 2 },
    isConsumable: false,
    shopPrice: 30,
    foundInRegions: ['Qanisi Borderlands', 'Qanisi Territory'],
    maxStack: 1,
    iconId: 'bow',
    rarity: 'common',
  },
  {
    id: 'silver_blade', name: 'Silver-Edged Blade',
    description: '+5 attack. +8 attack against undead and spectral enemies.',
    category: ItemCategory.Weapon, slot: ItemSlot.Hand,
    passiveEffect: { attackBonus: 5 },
    isConsumable: false,
    shopPrice: 65,
    foundInRegions: ['The Midlands', 'The Dark Reaches'],
    maxStack: 1,
    iconId: 'sword_silver',
    rarity: 'rare',
  },
  {
    id: 'relic_blade', name: 'The Relic Blade',
    description: 'An ancient weapon of unknown origin. +8 attack. Wraiths take full physical damage — their resistance means nothing to this blade.',
    category: ItemCategory.Weapon, slot: ItemSlot.Hand,
    passiveEffect: { attackBonus: 8, physicalResistanceBonus: 0.5 },
    isConsumable: false,
    maxStack: 1,
    iconId: 'sword_relic',
    rarity: 'unique',
  },

  // ── Armor ──────────────────────────────────────────────────

  {
    id: 'leather_armor', name: 'Leather Armor',
    description: 'Light protection. +4 defense. Does not slow you down.',
    category: ItemCategory.Armor, slot: ItemSlot.Body,
    passiveEffect: { defenseBonus: 4 },
    isConsumable: false,
    shopPrice: 20,
    foundInRegions: ['Senin Valley', 'Qanisi Borderlands'],
    maxStack: 1,
    iconId: 'armor_leather',
    rarity: 'common',
  },
  {
    id: 'chainmail', name: 'Chainmail',
    description: '+8 defense. Heavy — increases forced march food cost by 0.3.',
    category: ItemCategory.Armor, slot: ItemSlot.Body,
    passiveEffect: { defenseBonus: 8, forcedMarchCostReduction: -0.3 },
    isConsumable: false,
    shopPrice: 55,
    foundInRegions: ['Eastern Wilds', 'The Midlands'],
    maxStack: 1,
    iconId: 'armor_chain',
    rarity: 'uncommon',
  },
  {
    id: 'shadow_shroud', name: 'Shadow Shroud',
    description: '+5 defense, +3 speed. Increases flee success by 15%.',
    category: ItemCategory.Armor, slot: ItemSlot.Body,
    passiveEffect: { defenseBonus: 5, speedBonus: 3 },
    isConsumable: false,
    dropsFrom: ['bandits'],
    maxStack: 1,
    iconId: 'armor_shadow',
    rarity: 'rare',
  },

  // ── Gear ───────────────────────────────────────────────────

  {
    id: 'warm_cloak', name: 'Warm Cloak',
    description: 'Downgrades Severe weather to Poor for movement purposes. Storms slow you, but no longer stop you.',
    category: ItemCategory.Gear, slot: ItemSlot.Back,
    passiveEffect: { weatherProtection: true },
    isConsumable: false,
    shopPrice: 18,
    foundInRegions: ['Senin Valley', 'Qanisi Borderlands'],
    maxStack: 1,
    iconId: 'cloak_warm',
    rarity: 'common',
  },
  {
    id: 'travelers_pack', name: "Traveler's Pack",
    description: 'Increases inventory to 10 slots and reduces daily food consumption by 10%.',
    category: ItemCategory.Gear, slot: ItemSlot.Back,
    passiveEffect: { foodCostReduction: 0.10 },
    isConsumable: false,
    shopPrice: 35,
    foundInRegions: ['Senin Valley', 'Qanisi Territory'],
    maxStack: 1,
    iconId: 'pack',
    rarity: 'uncommon',
  },
  {
    id: 'scout_kit', name: "Scout's Kit",
    description: 'Maps, rope, a good compass. +5% luck threshold and reveals hidden cache events.',
    category: ItemCategory.Gear, slot: ItemSlot.Back,
    passiveEffect: { luckModifier: 0.05, revealHiddenLocations: true },
    isConsumable: false,
    shopPrice: 40,
    foundInRegions: ['Qanisi Territory', 'Eastern Wilds'],
    maxStack: 1,
    iconId: 'scout_kit',
    rarity: 'uncommon',
  },
  {
    id: 'foragers_satchel', name: "Forager's Satchel",
    description: 'Nets, snares, and drying racks. Adds +3 food to every hunt or forage action.',
    category: ItemCategory.Gear, slot: ItemSlot.Back,
    passiveEffect: { foragingBonus: 3 },
    isConsumable: false,
    shopPrice: 22,
    foundInRegions: ['Senin Valley', 'Qanisi Borderlands', 'Qanisi Territory'],
    maxStack: 1,
    iconId: 'satchel',
    rarity: 'common',
  },

  // ── Trinkets ───────────────────────────────────────────────

  {
    id: 'lucky_coin', name: 'Lucky Coin',
    description: 'A coin that always lands the way you want. +8% luck threshold.',
    category: ItemCategory.Trinket, slot: ItemSlot.Finger,
    passiveEffect: { luckModifier: 0.08 },
    isConsumable: false,
    shopPrice: 30,
    foundInRegions: ['Qanisi Territory', 'Eastern Wilds'],
    maxStack: 1,
    iconId: 'coin_gold',
    rarity: 'uncommon',
  },
  {
    id: 'companionship_token', name: 'Companionship Token',
    description: 'A carved wooden disc passed between friends. All companion loyalty gains +30%.',
    category: ItemCategory.Trinket, slot: ItemSlot.Neck,
    passiveEffect: { companionLoyaltyBonus: 0.30 },
    isConsumable: false,
    maxStack: 1,
    iconId: 'token',
    rarity: 'unique',
  },
  {
    id: 'amulet_of_resolve', name: 'Amulet of Resolve',
    description: 'Cold iron on a leather cord. Immune to the Terrify effect from ogres and wraiths.',
    category: ItemCategory.Trinket, slot: ItemSlot.Neck,
    passiveEffect: { immuneToTerrify: true },
    isConsumable: false,
    shopPrice: 50,
    foundInRegions: ['The Dark Reaches', 'Edge of the Known World'],
    maxStack: 1,
    iconId: 'amulet',
    rarity: 'rare',
  },
  {
    id: 'merchants_ring', name: "Merchant's Ring",
    description: 'A guild signet. Shop prices reduced by 20% and a small chance of extra gold in towns.',
    category: ItemCategory.Trinket, slot: ItemSlot.Finger,
    passiveEffect: { goldFindBonus: 3 },
    isConsumable: false,
    shopPrice: 40,
    foundInRegions: ['Senin Valley', 'Qanisi Territory'],
    maxStack: 1,
    iconId: 'ring_merchant',
    rarity: 'uncommon',
  },
  {
    id: 'stone_of_comfort', name: 'Stone of Comfort',
    description: 'A smooth river stone worn by worry. +1 morale per turn.',
    category: ItemCategory.Trinket, slot: ItemSlot.Finger,
    passiveEffect: { moralePerTurn: 1 },
    isConsumable: false,
    shopPrice: 15,
    foundInRegions: ['Senin Valley'],
    maxStack: 1,
    iconId: 'stone',
    rarity: 'common',
  },

  // ── Quest Items ────────────────────────────────────────────

  {
    id: 'letter_of_passage', name: 'Letter of Passage',
    description: 'An official document with an important seal. Allows passage through Qanisi checkpoints without incident.',
    category: ItemCategory.QuestItem, slot: ItemSlot.None,
    isConsumable: true,
    questDialogueId: 'qanisi_checkpoint',
    maxStack: 1,
    iconId: 'letter',
    rarity: 'unique',
  },
  {
    id: 'stone_figure', name: 'Stone Figure',
    description: '"For luck," a child said in Nabis. +5% luck. You will not sell this.',
    category: ItemCategory.QuestItem, slot: ItemSlot.None,
    passiveEffect: { luckModifier: 0.05 },
    isConsumable: false,
    maxStack: 1,
    iconId: 'stone_figure',
    rarity: 'unique',
  },
];

// ─────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────

export function getItemDef(id: string): ItemDefinition | undefined {
  return ITEM_DEFINITIONS.find(d => d.id === id);
}

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

export function computeEquippedBonuses(inv: Inventory): ItemPassiveEffect {
  const bonuses: ItemPassiveEffect = {};

  for (const itemId of Object.values(inv.equippedItems)) {
    if (!itemId) continue;
    const def = getItemDef(itemId);
    if (!def?.passiveEffect) continue;
    const fx = def.passiveEffect;

    if (fx.attackBonus)              bonuses.attackBonus              = (bonuses.attackBonus              ?? 0) + fx.attackBonus;
    if (fx.defenseBonus)             bonuses.defenseBonus             = (bonuses.defenseBonus             ?? 0) + fx.defenseBonus;
    if (fx.speedBonus)               bonuses.speedBonus               = (bonuses.speedBonus               ?? 0) + fx.speedBonus;
    if (fx.luckModifier)             bonuses.luckModifier             = (bonuses.luckModifier             ?? 0) + fx.luckModifier;
    if (fx.foodCostReduction)        bonuses.foodCostReduction        = (bonuses.foodCostReduction        ?? 0) + fx.foodCostReduction;
    if (fx.foragingBonus)            bonuses.foragingBonus            = (bonuses.foragingBonus            ?? 0) + fx.foragingBonus;
    if (fx.moralePerTurn)            bonuses.moralePerTurn            = (bonuses.moralePerTurn            ?? 0) + fx.moralePerTurn;
    if (fx.companionLoyaltyBonus)    bonuses.companionLoyaltyBonus    = (bonuses.companionLoyaltyBonus    ?? 0) + fx.companionLoyaltyBonus;
    if (fx.forcedMarchCostReduction) bonuses.forcedMarchCostReduction = (bonuses.forcedMarchCostReduction ?? 0) + fx.forcedMarchCostReduction;
    if (fx.physicalResistanceBonus)  bonuses.physicalResistanceBonus  = (bonuses.physicalResistanceBonus  ?? 0) + fx.physicalResistanceBonus;
    if (fx.goldFindBonus)            bonuses.goldFindBonus            = (bonuses.goldFindBonus            ?? 0) + fx.goldFindBonus;
    if (fx.weatherProtection)        bonuses.weatherProtection        = true;
    if (fx.immuneToTerrify)          bonuses.immuneToTerrify          = true;
    if (fx.revealHiddenLocations)    bonuses.revealHiddenLocations    = true;
  }

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
  // Determine which items are for sale here based on region
  const forSale = ITEM_DEFINITIONS.filter(def => {
    if (!def.shopPrice) return false;
    if (def.category === ItemCategory.QuestItem) return false;
    // Early shops stock basics; late shops stock advanced items
    if (locationId <= 10 && def.rarity === 'rare')   return false;
    if (locationId <= 20 && def.rarity === 'unique')  return false;
    if (locationId >= 90 && def.rarity === 'common'
      && def.category !== ItemCategory.Consumable)    return false;
    return true;
  });

  const discount = hasMerchantsRing ? 0.80 : 1.0;

  return forSale.map(def => {
    const finalPrice = Math.floor((def.shopPrice ?? 0) * discount);
    return { def, finalPrice, canAfford: playerGold >= finalPrice };
  });
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

  return { success: true, inventory: result.inventory, goldSpent: finalPrice };
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
