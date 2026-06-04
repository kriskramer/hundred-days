import {
  createEmptyInventory,
  addItem,
  removeItem,
  equipItem,
  unequipItem,
  useItem,
  computeEquippedBonuses,
  getShopInventory,
  sellItem,
  buyItem,
  Inventory,
} from '@engine/ItemSystem';
import { ItemSlot, ItemCategory } from '@engine/types';
import { makeInventory, makeInvWithItem, makeFullInventory } from '../__fixtures__/inventory';

// ─────────────────────────────────────────
// addItem
// ─────────────────────────────────────────

describe('addItem', () => {
  it('adds a new item to empty inventory', () => {
    const inv = createEmptyInventory();
    const result = addItem(inv, 'dried_rations');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.items).toHaveLength(1);
    expect(result.inventory.items[0].definitionId).toBe('dried_rations');
    expect(result.inventory.items[0].quantity).toBe(1);
  });

  it('stacks when same item added again (below maxStack)', () => {
    const inv = makeInvWithItem('dried_rations', 1);
    const result = addItem(inv, 'dried_rations');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const slot = result.inventory.items.find(i => i.definitionId === 'dried_rations');
    expect(slot?.quantity).toBe(2);
    expect(result.inventory.items).toHaveLength(1);
  });

  it('creates new slot when maxStack reached', () => {
    // dried_rations maxStack = 5
    const inv = makeInvWithItem('dried_rations', 5);
    expect(inv.items[0].quantity).toBe(5);
    const result = addItem(inv, 'dried_rations');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.items).toHaveLength(2);
  });

  it('fails when inventory is full (8 slots)', () => {
    const full = makeFullInventory();
    expect(full.items).toHaveLength(8);
    // silver_blade has maxStack:1 and is not in the full inventory, so it needs a new slot
    const result = addItem(full, 'silver_blade');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toMatch(/full/i);
  });

  it('expands maxSlots to 10 when Traveler\'s Pack is added', () => {
    const inv = createEmptyInventory();
    const result = addItem(inv, 'travelers_pack');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.maxSlots).toBe(10);
  });

  it('fails for unknown item id', () => {
    const result = addItem(createEmptyInventory(), 'nonexistent_item');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// removeItem
// ─────────────────────────────────────────

describe('removeItem', () => {
  it('decrements quantity by 1', () => {
    const inv = makeInvWithItem('dried_rations', 3);
    const result = removeItem(inv, 'dried_rations', 1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.items[0].quantity).toBe(2);
  });

  it('removes the slot entirely when qty reaches 0', () => {
    const inv = makeInvWithItem('dried_rations', 1);
    const result = removeItem(inv, 'dried_rations', 1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.items).toHaveLength(0);
  });

  it('fails when item is not in inventory', () => {
    const result = removeItem(createEmptyInventory(), 'dried_rations', 1);
    expect(result.success).toBe(false);
  });

  it('fails when requested qty exceeds available', () => {
    const inv = makeInvWithItem('dried_rations', 2);
    const result = removeItem(inv, 'dried_rations', 5);
    expect(result.success).toBe(false);
  });

  it('clears equippedItems entry when removing an equipped item', () => {
    let inv = makeInvWithItem('travelers_blade', 1);
    const equipResult = equipItem(inv, 'travelers_blade');
    expect(equipResult.success).toBe(true);
    if (!equipResult.success) return;
    inv = equipResult.inventory;
    expect(inv.equippedItems[ItemSlot.Hand]).toBe('travelers_blade');

    const removeResult = removeItem(inv, 'travelers_blade', 1);
    expect(removeResult.success).toBe(true);
    if (!removeResult.success) return;
    expect(removeResult.inventory.equippedItems[ItemSlot.Hand]).toBeUndefined();
  });
});

// ─────────────────────────────────────────
// equipItem
// ─────────────────────────────────────────

describe('equipItem', () => {
  it('equips a weapon and updates item flags and equippedItems', () => {
    const inv = makeInvWithItem('travelers_blade', 1);
    const result = equipItem(inv, 'travelers_blade');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const item = result.inventory.items.find(i => i.definitionId === 'travelers_blade');
    expect(item?.isEquipped).toBe(true);
    expect(item?.equippedSlot).toBe(ItemSlot.Hand);
    expect(result.inventory.equippedItems[ItemSlot.Hand]).toBe('travelers_blade');
  });

  it('swaps body slot when equipping a second piece of armor', () => {
    let inv = makeInvWithItem('leather_armor', 1);
    const result1 = equipItem(inv, 'leather_armor');
    expect(result1.success).toBe(true);
    if (!result1.success) return;
    inv = result1.inventory;

    const result2 = addItem(inv, 'chainmail');
    expect(result2.success).toBe(true);
    if (!result2.success) return;
    inv = result2.inventory;

    const result3 = equipItem(inv, 'chainmail');
    expect(result3.success).toBe(true);
    if (!result3.success) return;
    inv = result3.inventory;

    expect(inv.equippedItems[ItemSlot.Body]).toBe('chainmail');
    const oldArmor = inv.items.find(i => i.definitionId === 'leather_armor');
    expect(oldArmor?.isEquipped).toBe(false);
  });

  it('rejects consumable items', () => {
    const inv = makeInvWithItem('healing_potion', 1);
    const result = equipItem(inv, 'healing_potion');
    expect(result.success).toBe(false);
  });

  it('rejects item not in inventory', () => {
    const result = equipItem(createEmptyInventory(), 'travelers_blade');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// unequipItem
// ─────────────────────────────────────────

describe('unequipItem', () => {
  it('unequips an equipped item', () => {
    let inv = makeInvWithItem('travelers_blade', 1);
    const eq = equipItem(inv, 'travelers_blade');
    if (!eq.success) throw new Error('equip failed');
    inv = eq.inventory;

    const result = unequipItem(inv, 'travelers_blade');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const item = result.inventory.items.find(i => i.definitionId === 'travelers_blade');
    expect(item?.isEquipped).toBe(false);
    expect(result.inventory.equippedItems[ItemSlot.Hand]).toBeUndefined();
  });
});

// ─────────────────────────────────────────
// useItem
// ─────────────────────────────────────────

describe('useItem', () => {
  it('consumes item and returns its active effect', () => {
    const inv = makeInvWithItem('healing_potion', 1);
    const result = useItem(inv, 'healing_potion');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.effect?.healthRestore).toBe(25);
    expect(result.inventory.items).toHaveLength(0);
  });

  it('decrements quantity rather than removing slot when qty > 1', () => {
    const inv = makeInvWithItem('healing_potion', 2);
    const result = useItem(inv, 'healing_potion');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory.items[0].quantity).toBe(1);
  });

  it('rejects non-consumable item', () => {
    const inv = makeInvWithItem('travelers_blade', 1);
    const result = useItem(inv, 'travelers_blade');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// computeEquippedBonuses
// ─────────────────────────────────────────

describe('computeEquippedBonuses', () => {
  it('returns empty object when nothing equipped', () => {
    const bonuses = computeEquippedBonuses(createEmptyInventory());
    expect(bonuses.attackBonus).toBeUndefined();
    expect(bonuses.defenseBonus).toBeUndefined();
  });

  it('aggregates attack and defense from two equipped items', () => {
    let inv = makeInvWithItem('travelers_blade', 1);
    const r1 = equipItem(inv, 'travelers_blade');
    if (!r1.success) throw new Error();
    inv = r1.inventory;

    inv = addItem(inv, 'leather_armor').success
      ? (addItem(inv, 'leather_armor') as any).inventory
      : inv;
    const r2 = equipItem(inv, 'leather_armor');
    if (!r2.success) throw new Error();
    inv = r2.inventory;

    const bonuses = computeEquippedBonuses(inv);
    expect(bonuses.attackBonus).toBe(4);
    expect(bonuses.defenseBonus).toBe(4);
  });

  it('sets immuneToTerrify flag from Amulet of Resolve', () => {
    let inv = makeInvWithItem('amulet_of_resolve', 1);
    const r = equipItem(inv, 'amulet_of_resolve');
    if (!r.success) throw new Error();
    inv = r.inventory;

    const bonuses = computeEquippedBonuses(inv);
    expect(bonuses.immuneToTerrify).toBe(true);
  });

  it('stacks luck bonus from Lucky Coin and Scout Kit', () => {
    let inv = makeInvWithItem('lucky_coin', 1);
    const r1 = equipItem(inv, 'lucky_coin');
    if (!r1.success) throw new Error();
    inv = r1.inventory;

    const r2 = addItem(inv, 'scout_kit');
    if (!r2.success) throw new Error();
    inv = r2.inventory;
    const r3 = equipItem(inv, 'scout_kit');
    if (!r3.success) throw new Error();
    inv = r3.inventory;

    const bonuses = computeEquippedBonuses(inv);
    expect(bonuses.luckModifier).toBeCloseTo(0.13); // 0.08 + 0.05
  });

  it('sets weatherProtection from Warm Cloak', () => {
    let inv = makeInvWithItem('warm_cloak', 1);
    const r = equipItem(inv, 'warm_cloak');
    if (!r.success) throw new Error();
    inv = r.inventory;

    const bonuses = computeEquippedBonuses(inv);
    expect(bonuses.weatherProtection).toBe(true);
  });
});

// ─────────────────────────────────────────
// getShopInventory
// ─────────────────────────────────────────

describe('getShopInventory', () => {
  it('excludes rare items in early shops (location ≤ 10)', () => {
    const items = getShopInventory(5, 100, false);
    const rarities = items.map(i => i.def.rarity);
    expect(rarities).not.toContain('rare');
  });

  it('excludes non-consumable common items in late shops (location ≥ 90)', () => {
    const items = getShopInventory(95, 100, false);
    const badItems = items.filter(
      i => i.def.rarity === 'common' && i.def.category !== ItemCategory.Consumable,
    );
    expect(badItems).toHaveLength(0);
  });

  it('never includes quest items', () => {
    const items = getShopInventory(50, 100, false);
    const questItems = items.filter(i => i.def.category === ItemCategory.QuestItem);
    expect(questItems).toHaveLength(0);
  });

  it('applies 20% discount with Merchant\'s Ring', () => {
    const withRing    = getShopInventory(5, 100, true);
    const withoutRing = getShopInventory(5, 100, false);

    const withItem    = withRing.find(i => i.def.id === 'dried_rations');
    const withoutItem = withoutRing.find(i => i.def.id === 'dried_rations');

    expect(withItem).toBeDefined();
    expect(withoutItem).toBeDefined();
    expect(withItem!.finalPrice).toBe(Math.floor(withoutItem!.finalPrice * 0.8));
  });

  it('marks item as unaffordable when player gold is insufficient', () => {
    const items = getShopInventory(5, 0, false);
    const affordable = items.filter(i => i.canAfford);
    expect(affordable).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// sellItem
// ─────────────────────────────────────────

describe('sellItem', () => {
  it('returns 50% of shopPrice (floored)', () => {
    // travelers_blade shopPrice = 25 → sell for 12
    const inv = makeInvWithItem('travelers_blade', 1);
    const result = sellItem(inv, 'travelers_blade');
    expect(result.success).toBe(true);
    expect(result.goldGained).toBe(12);
  });

  it('removes item from inventory', () => {
    const inv = makeInvWithItem('travelers_blade', 1);
    const result = sellItem(inv, 'travelers_blade');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.inventory!.items).toHaveLength(0);
  });

  it('rejects items not in inventory', () => {
    const result = sellItem(createEmptyInventory(), 'travelers_blade');
    expect(result.success).toBe(false);
  });

  it('rejects quest items (no shopPrice / QuestItem category)', () => {
    const inv = makeInvWithItem('letter_of_passage', 1);
    const result = sellItem(inv, 'letter_of_passage');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// buyItem
// ─────────────────────────────────────────

describe('buyItem', () => {
  it('purchases item and deducts correct gold', () => {
    // dried_rations shopPrice = 5
    const inv = createEmptyInventory();
    const result = buyItem(inv, 'dried_rations', 50, false);
    expect(result.success).toBe(true);
    expect(result.goldSpent).toBe(5);
    expect(result.inventory!.items).toHaveLength(1);
  });

  it('applies Merchant\'s Ring discount', () => {
    const inv = createEmptyInventory();
    const result = buyItem(inv, 'dried_rations', 50, true);
    expect(result.success).toBe(true);
    expect(result.goldSpent).toBe(Math.floor(5 * 0.8)); // 4
  });

  it('fails when player cannot afford the item', () => {
    const result = buyItem(createEmptyInventory(), 'healing_potion', 5, false);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/gold/i);
  });
});
