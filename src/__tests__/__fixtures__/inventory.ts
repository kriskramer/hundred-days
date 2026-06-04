import { createEmptyInventory, addItem, Inventory } from '@engine/ItemSystem';
import { ItemSlot } from '@engine/types';

export function makeInventory(overrides: Partial<Inventory> = {}): Inventory {
  return { ...createEmptyInventory(), ...overrides };
}

export function makeInvWithItem(itemId: string, qty = 1): Inventory {
  let inv = createEmptyInventory();
  for (let i = 0; i < qty; i++) {
    const result = addItem(inv, itemId);
    if (result.success) inv = result.inventory;
  }
  return inv;
}

export function makeFullInventory(): Inventory {
  // All maxStack:1 items to guarantee 8 unique slots
  const items = [
    'travelers_blade',
    'hunters_bow',
    'leather_armor',
    'warm_cloak',
    'lucky_coin',
    'stone_of_comfort',
    'merchants_ring',
    'amulet_of_resolve',
  ];
  let inv = createEmptyInventory();
  for (const id of items) {
    const result = addItem(inv, id);
    if (result.success) inv = result.inventory;
  }
  return inv;
}
