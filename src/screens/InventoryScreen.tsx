/* eslint-disable react-native/sort-styles */
import {
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import {
  GameState,
  ItemSlot,
  ItemCategory,
  ItemPassiveEffect,
  ItemActiveEffect,
  InventoryItem,
  ItemDefinition,
} from '@engine/types';

import {
  ITEM_DEFINITIONS,
  getItemDef,
  equipItem,
  unequipItem,
  useItem as consumeItem,
  sellItem,
  computeEquippedBonuses,
  inventoryFromResources,
  resourcesToInventory,
  RARITY_COLOURS,
  RARITY_BG,
  SLOT_LABELS,
  CATEGORY_ICONS,
  Inventory,
} from '@engine/ItemSystem';

import { useGameStore }     from '@store/gameStore';
import { saveEngine }        from '@engine/SaveEngine';
import { applyMoraleDelta }  from '@engine/GameState';
import { confirmAction }     from '@utils/confirmAction';
import * as Haptics          from 'expo-haptics';

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState: GameState;
  onToast:   (msg: string) => void;
}

// ─────────────────────────────────────────
// Palette
// ─────────────────────────────────────────

const C = {
  ink:       '#1A1208',
  inkLight:  '#2D1F0A',
  parchment: '#F5EAD6',
  parchDark: '#E8D5B0',
  parchDeep: '#D4B880',
  blood:     '#8B1A1A',
  gold:      '#B8860B',
  goldLight: '#D4A017',
  mist:      '#6B7C6E',
  greenDark: '#2A5A3A',
  green:     '#4A8A5A',
};

// ─────────────────────────────────────────
// InventoryScreen
// ─────────────────────────────────────────

export function InventoryScreen({ gameState, onToast }: Props) {
  // Inventory is now derived from GameState — no local state needed.
  // All mutations write back through the Zustand store and auto-save.
  const setGame   = useGameStore(s => s.setGameState);
  const inventory = inventoryFromResources(gameState.resources);

  function persistInventory(inv: Inventory) {
    const newResources = resourcesToInventory(gameState.resources, inv);
    const newState     = { ...gameState, resources: newResources };
    setGame(newState);
    saveEngine.saveRun(newState);  // auto-save after every inventory change
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<'inventory' | 'equipped' | 'stats'>('inventory');

  const detailSlide = useRef(new Animated.Value(0)).current;

  // ── Select an item ────────────────────────────────────────

  const handleSelect = useCallback((itemId: string) => {
    setSelectedId(prev => {
      if (prev === itemId) return null;
      Animated.sequence([
        Animated.timing(detailSlide, { toValue: 8,  duration: 60,  useNativeDriver: true }),
        Animated.timing(detailSlide, { toValue: 0,  duration: 120, useNativeDriver: true }),
      ]).start();
      return itemId;
    });
  }, [detailSlide]);

  // ── Equip ────────────────────────────────────────────────

  const handleEquip = useCallback((itemId: string) => {
    const result = equipItem(inventory, itemId);
    if (!result.success) { onToast(result.reason!); return; }
    persistInventory(result.inventory);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const def = getItemDef(itemId);
    onToast(`${def?.name ?? itemId} equipped.`);
  }, [inventory, gameState]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unequip ──────────────────────────────────────────────

  const handleUnequip = useCallback((itemId: string) => {
    const result = unequipItem(inventory, itemId);
    if (!result.success) { onToast(result.reason!); return; }
    persistInventory(result.inventory);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onToast('Item unequipped.');
  }, [inventory, gameState]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Use ──────────────────────────────────────────────────

  const handleUse = useCallback((itemId: string) => {
    const def = getItemDef(itemId);
    if (!def) return;

    // Combat-only items (throwables and temp-buff draughts) cannot be used
    // from the pack screen — they are consumed during combat via the Skill action.
    const fx = def.activeEffect;
    if (fx && (
      fx.combatDamage !== undefined ||
      fx.combatEffect !== undefined ||
      fx.tempAttackBonus !== undefined ||
      fx.tempDefenseBonus !== undefined ||
      fx.tempSpeedBonus !== undefined
    )) {
      onToast('Can only be used in combat.');
      return;
    }

    confirmAction(
      `Use ${def.name}?`,
      def.description,
      () => {
        const result = consumeItem(inventory, itemId);
        if (!result.success) { onToast(result.reason!); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        const fx = result.effect;

        // Build updated resources (inventory change)
        let newResources = resourcesToInventory(gameState.resources, result.inventory);
        let newPlayer    = { ...gameState.player };
        let newMorale    = gameState.morale;

        if (fx) {
          // Food restore
          if (fx.foodRestore) {
            newResources = { ...newResources, food: newResources.food + fx.foodRestore };
          }
          // Health restore (clamped to max HP)
          if (fx.healthRestore) {
            newPlayer = {
              ...newPlayer,
              health: Math.min(newPlayer.health + fx.healthRestore, newPlayer.stats.maxHealth),
            };
          }
          // Morale restore (recalculates tier)
          if (fx.moraleRestore) {
            newMorale = applyMoraleDelta(newMorale, fx.moraleRestore);
          }
          // Clear a status effect
          if (fx.clearsStatusEffect) {
            newPlayer = {
              ...newPlayer,
              statusEffects: newPlayer.statusEffects.filter(
                e => e.id !== fx.clearsStatusEffect,
              ),
            };
          }
          // Grant a status effect
          if (fx.grantsStatusEffect) {
            const already = newPlayer.statusEffects.some(e => e.id === fx.grantsStatusEffect);
            if (!already) {
              newPlayer = {
                ...newPlayer,
                statusEffects: [
                  ...newPlayer.statusEffects,
                  { id: fx.grantsStatusEffect!, durationTurns: fx.statusDurationTurns ?? 3 },
                ],
              };
            }
          }
        }

        const newState = { ...gameState, resources: newResources, player: newPlayer, morale: newMorale };
        setGame(newState);
        saveEngine.saveRun(newState);
        setSelectedId(null);

        const parts = [
          fx?.healthRestore ? `+${fx.healthRestore} HP`     : null,
          fx?.foodRestore   ? `+${fx.foodRestore} food`     : null,
          fx?.moraleRestore ? `+${fx.moraleRestore} morale` : null,
        ].filter(Boolean).join(', ');
        onToast(parts ? `${def.name} used. ${parts}` : `${def.name} used.`);
      },
      { confirmText: 'Use' },
    );
  }, [inventory, gameState]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sell ─────────────────────────────────────────────────

  const handleSell = useCallback((itemId: string) => {
    const def = getItemDef(itemId);
    if (!def) return;

    const salePrice = def.shopPrice ? Math.floor(def.shopPrice * 0.5) : 0;
    if (!salePrice) { onToast('This item cannot be sold.'); return; }

    confirmAction(
      `Sell ${def.name}?`,
      `Sell for ${salePrice} gold?`,
      () => {
        const result = sellItem(inventory, itemId);
        if (!result.success) { onToast(result.reason!); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        // Merge inventory change AND gold gain back into resources
        const newResources = resourcesToInventory(
          { ...gameState.resources, gold: gameState.resources.gold + (result.goldGained ?? 0) },
          result.inventory!,
        );
        const newState = { ...gameState, resources: newResources };
        setGame(newState);
        saveEngine.saveRun(newState);
        setSelectedId(null);
        onToast(`Sold for ${result.goldGained} gold.`);
      },
      { confirmText: `Sell (+${salePrice}g)` },
    );
  }, [inventory, gameState]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drop ─────────────────────────────────────────────────

  const handleDrop = useCallback((itemId: string) => {
    const def = getItemDef(itemId);
    confirmAction(
      'Drop item?',
      `Drop ${def?.name ?? itemId}? This cannot be undone.`,
      () => {
        const result = sellItem(inventory, itemId);  // reuse remove logic
        if (!result.success) return;
        persistInventory(result.inventory!);          // no gold gain — just remove
        setSelectedId(null);
        onToast('Item dropped.');
      },
      { confirmText: 'Drop', destructive: true },
    );
  }, [inventory, gameState]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────

  const selectedDef   = selectedId ? getItemDef(selectedId) : null;
  const selectedInvItem = selectedId
    ? inventory.items.find(i => i.definitionId === selectedId) ?? null
    : null;
  const equippedBonuses = computeEquippedBonuses(inventory);
  const usedSlots       = inventory.items.length;

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  return (
    <View style={s.root}>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Pack</Text>
        <Text style={s.headerSlots}>
          {usedSlots} / {inventory.maxSlots} slots
        </Text>
      </View>

      {/* ── TABS ── */}
      <View style={s.tabs}>
        {(['inventory', 'equipped', 'stats'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[s.tab, activeTab === tab && s.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'inventory' ? 'All Items'
               : tab === 'equipped' ? 'Equipped'
               : 'Bonuses'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.body}>

        {/* ── LEFT: Grid or equipped list or stat summary ── */}
        <View style={s.leftPane}>

          {activeTab === 'inventory' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <ItemGrid
                inventory={inventory}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
              {/* Empty slot fillers */}
              <EmptySlots
                used={usedSlots}
                max={inventory.maxSlots}
              />
            </ScrollView>
          )}

          {activeTab === 'equipped' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <EquippedList
                inventory={inventory}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            </ScrollView>
          )}

          {activeTab === 'stats' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <BonusList bonuses={equippedBonuses} gameState={gameState} />
            </ScrollView>
          )}
        </View>

        {/* ── RIGHT: Detail panel ── */}
        <Animated.View
          style={[s.rightPane, { transform: [{ translateY: detailSlide }] }]}
        >
          {selectedDef && selectedInvItem ? (
            <ItemDetail
              def={selectedDef}
              invItem={selectedInvItem}
              inventory={inventory}
              onEquip={handleEquip}
              onUnequip={handleUnequip}
              onUse={handleUse}
              onSell={handleSell}
              onDrop={handleDrop}
            />
          ) : (
            <View style={s.detailEmpty}>
              <Text style={s.detailEmptyIcon}>◈</Text>
              <Text style={s.detailEmptyText}>
                Select an item to inspect it.
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// Item grid
// ─────────────────────────────────────────

function ItemGrid({
  inventory, selectedId, onSelect,
}: {
  inventory:  Inventory;
  selectedId: string | null;
  onSelect:   (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const slotSize = Math.floor((width - 32) / 4); // 4 columns, 16px side padding each

  return (
    <View style={s.grid}>
      {inventory.items.map((item) => {
        const def       = getItemDef(item.definitionId);
        if (!def) return null;
        const isSelected = item.definitionId === selectedId;
        const isEquipped = item.isEquipped;
        const rarityColor = RARITY_COLOURS[def.rarity];

        return (
          <TouchableOpacity
            key={item.definitionId}
            onPress={() => onSelect(item.definitionId)}
            activeOpacity={0.75}
            style={[
              s.gridSlot,
              { width: slotSize, height: slotSize },
              isSelected && s.gridSlotSelected,
              isEquipped && s.gridSlotEquipped,
              { borderColor: isSelected ? rarityColor : isEquipped ? C.gold : C.parchDeep },
            ]}
          >
            {/* Category icon */}
            <Text style={[s.gridIcon, { color: rarityColor }]}>
              {CATEGORY_ICONS[def.category]}
            </Text>

            {/* Item name */}
            <Text style={s.gridName} numberOfLines={2}>{def.name}</Text>

            {/* Quantity badge */}
            {item.quantity > 1 && (
              <View style={s.qtyBadge}>
                <Text style={s.qtyText}>×{item.quantity}</Text>
              </View>
            )}

            {/* Equipped indicator */}
            {isEquipped && <View style={s.equippedDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function EmptySlots({ used, max }: { used: number; max: number }) {
  const { width } = useWindowDimensions();
  const empty = max - used;
  if (empty <= 0) return null;
  const slotSize = Math.floor((width - 32) / 4); // 4 columns, 16px side padding each

  return (
    <View style={s.grid}>
      {Array.from({ length: empty }).map((_, i) => (
        <View key={`empty_${i}`} style={[s.gridSlot, { width: slotSize, height: slotSize }, s.gridSlotEmpty]}>
          <Text style={s.gridEmptyPlus}>+</Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────
// Equipped list — shows only equipped items in slot order
// ─────────────────────────────────────────

const SLOT_ORDER: ItemSlot[] = [
  ItemSlot.Hand, ItemSlot.Body, ItemSlot.Back,
  ItemSlot.Neck, ItemSlot.Finger,
];

function EquippedList({
  inventory, selectedId, onSelect,
}: {
  inventory:  Inventory;
  selectedId: string | null;
  onSelect:   (id: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {SLOT_ORDER.map(slot => {
        const equippedId = inventory.equippedItems[slot];
        const def        = equippedId ? getItemDef(equippedId) : undefined;
        const isSelected = equippedId === selectedId;

        return (
          <TouchableOpacity
            key={slot}
            onPress={() => equippedId && onSelect(equippedId)}
            disabled={!equippedId}
            activeOpacity={0.75}
            style={[
              s.equippedRow,
              equippedId && isSelected && { borderColor: C.gold, backgroundColor: '#F5E8C0' },
              !equippedId && { opacity: 0.4 },
            ]}
          >
            <View style={s.equippedSlotLabel}>
              <Text style={s.equippedSlotText}>{SLOT_LABELS[slot]}</Text>
            </View>
            <View style={s.equippedSlotContent}>
              {def ? (
                <>
                  <Text style={[s.equippedItemIcon, { color: RARITY_COLOURS[def.rarity] }]}>
                    {CATEGORY_ICONS[def.category]}
                  </Text>
                  <Text style={s.equippedItemName}>{def.name}</Text>
                </>
              ) : (
                <Text style={s.equippedEmpty}>— empty —</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────
// Bonus summary
// ─────────────────────────────────────────

function BonusList({ bonuses, gameState }: { bonuses: ItemPassiveEffect; gameState: GameState }) {
  const lines: { label: string; value: string; positive?: boolean }[] = [];

  const base   = gameState.player.stats;
  const push   = (label: string, value: number | undefined, unit = '') => {
    if (!value) return;
    lines.push({ label, value: `${value > 0 ? '+' : ''}${value}${unit}`, positive: value > 0 });
  };
  const pushBool = (label: string, value: boolean | undefined) => {
    if (!value) return;
    lines.push({ label, value: 'Active', positive: true });
  };

  push('Attack',              bonuses.attackBonus);
  push('Defense',             bonuses.defenseBonus);
  push('Speed',               bonuses.speedBonus);
  push('Luck threshold',      bonuses.luckModifier ? Math.round(bonuses.luckModifier * 100) : undefined, '%');
  push('Food cost',           bonuses.foodCostReduction ? -Math.round(bonuses.foodCostReduction * 100) : undefined, '%');
  push('Foraging bonus',      bonuses.foragingBonus, ' food');
  push('Morale per turn',     bonuses.moralePerTurn);
  push('Gold find chance',    bonuses.goldFindBonus);
  push('Phys. resist bypass', bonuses.physicalResistanceBonus
    ? Math.round(bonuses.physicalResistanceBonus * 100) : undefined, '%');
  push('March food cost',     bonuses.forcedMarchCostReduction
    ? Math.round(bonuses.forcedMarchCostReduction * 100) : undefined, '%');
  push('Loyalty bonus',       bonuses.companionLoyaltyBonus
    ? Math.round(bonuses.companionLoyaltyBonus * 100) : undefined, '%');
  pushBool('Weather protection',      bonuses.weatherProtection);
  pushBool('Terrify immunity',        bonuses.immuneToTerrify);
  pushBool('Reveals hidden caches',   bonuses.revealHiddenLocations);

  if (lines.length === 0) {
    return (
      <View style={s.bonusEmpty}>
        <Text style={s.bonusEmptyText}>No bonuses active. Equip items to see their effects.</Text>
      </View>
    );
  }

  return (
    <View style={s.bonusBox}>
      <Text style={s.bonusTitle}>Equipment bonuses</Text>
      <View style={s.bonusDivider} />
      {lines.map((line, i) => (
        <View key={i} style={s.bonusRow}>
          <Text style={s.bonusLabel}>{line.label}</Text>
          <Text style={[s.bonusValue, { color: line.positive ? C.green : '#FF9999' }]}>
            {line.value}
          </Text>
        </View>
      ))}

      <View style={[s.bonusDivider, { marginTop: 12 }]} />
      <Text style={s.bonusSectionTitle}>Base stats</Text>
      {[
        ['Attack',     base.attack],
        ['Defense',    base.defense],
        ['Speed',      base.speed],
        ['Endurance',  base.endurance],
        ['Perception', base.perception],
        ['Leadership', base.leadership],
      ].map(([label, val]) => (
        <View key={label as string} style={s.bonusRow}>
          <Text style={s.bonusLabel}>{label as string}</Text>
          <Text style={s.bonusValueNeutral}>{val as number}</Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────
// Item detail panel
// ─────────────────────────────────────────

function ItemDetail({
  def, invItem, inventory, onEquip, onUnequip, onUse, onSell, onDrop,
}: {
  def:       ItemDefinition;
  invItem:   InventoryItem;
  inventory: Inventory;
  onEquip:   (id: string) => void;
  onUnequip: (id: string) => void;
  onUse:     (id: string) => void;
  onSell:    (id: string) => void;
  onDrop:    (id: string) => void;
}) {
  const isEquipped  = invItem.isEquipped;
  const isEquipable = !def.isConsumable && def.slot !== ItemSlot.None;
  const isUsable    = def.isConsumable;
  const canSell     = !!def.shopPrice && def.category !== ItemCategory.QuestItem;
  const rarityColor = RARITY_COLOURS[def.rarity];
  const rarityBg    = RARITY_BG[def.rarity];

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.detailScroll}>
      {/* Rarity badge */}
      <View style={[s.rarityBadge, { backgroundColor: rarityBg, borderColor: rarityColor }]}>
        <Text style={[s.rarityText, { color: rarityColor }]}>
          {def.rarity.toUpperCase()}
        </Text>
      </View>

      {/* Name */}
      <Text style={s.detailName}>{def.name}</Text>

      {/* Category + slot */}
      <Text style={s.detailMeta}>
        {def.category.replace(/_/g, ' ')}
        {def.slot !== ItemSlot.None ? ` · ${SLOT_LABELS[def.slot]}` : ''}
        {invItem.quantity > 1 ? `  ×${invItem.quantity}` : ''}
      </Text>

      {/* Description */}
      <Text style={s.detailDesc}>{def.description}</Text>

      {/* Passive effects */}
      {def.passiveEffect && (
        <View style={s.effectBox}>
          <Text style={s.effectTitle}>Passive effects</Text>
          <PassiveEffectList fx={def.passiveEffect} />
        </View>
      )}

      {/* Active effects */}
      {def.activeEffect && (
        <View style={s.effectBox}>
          <Text style={s.effectTitle}>On use</Text>
          <ActiveEffectList fx={def.activeEffect} />
        </View>
      )}

      {/* Sale price */}
      {canSell && (
        <Text style={s.salePriceText}>
          Sell value: {Math.floor((def.shopPrice ?? 0) * 0.5)} gold
        </Text>
      )}

      {/* Action buttons */}
      <View style={s.detailActions}>
        {isEquipable && !isEquipped && (
          <DetailBtn label="Equip" color={C.gold} textColor={C.ink}
            onPress={() => onEquip(def.id)} />
        )}
        {isEquipable && isEquipped && (
          <DetailBtn label="Unequip" color={C.inkLight} textColor={C.parchment}
            onPress={() => onUnequip(def.id)} />
        )}
        {isUsable && (
          <DetailBtn label="Use" color={C.blood} textColor={C.parchment}
            onPress={() => onUse(def.id)} />
        )}
        {canSell && (
          <DetailBtn label="Sell" color={C.inkLight} textColor={C.parchment}
            onPress={() => onSell(def.id)} />
        )}
        {!canSell && (
          <DetailBtn label="Drop" color={C.inkLight} textColor={C.mist}
            onPress={() => onDrop(def.id)} />
        )}
      </View>
    </ScrollView>
  );
}

function DetailBtn({
  label, color, textColor, onPress,
}: {
  label:     string;
  color:     string;
  textColor: string;
  onPress:   () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.detailBtn, { backgroundColor: color }]}
    >
      <Text style={[s.detailBtnText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PassiveEffectList({ fx }: { fx: ItemPassiveEffect }) {
  const lines: string[] = [];
  if (fx.attackBonus)             lines.push(`+${fx.attackBonus} attack`);
  if (fx.defenseBonus)            lines.push(`+${fx.defenseBonus} defense`);
  if (fx.speedBonus)              lines.push(`+${fx.speedBonus} speed`);
  if (fx.luckModifier)            lines.push(`+${Math.round(fx.luckModifier * 100)}% luck threshold`);
  if (fx.foodCostReduction)       lines.push(`−${Math.round(fx.foodCostReduction * 100)}% food cost`);
  if (fx.foragingBonus)           lines.push(`+${fx.foragingBonus} food from foraging`);
  if (fx.moralePerTurn)           lines.push(`+${fx.moralePerTurn} morale/turn`);
  if (fx.companionLoyaltyBonus)   lines.push(`+${Math.round(fx.companionLoyaltyBonus * 100)}% companion loyalty gains`);
  if (fx.forcedMarchCostReduction)lines.push(`${Math.round(fx.forcedMarchCostReduction * 100)}% march food cost`);
  if (fx.physicalResistanceBonus) lines.push(`Bypasses ${Math.round(fx.physicalResistanceBonus * 100)}% phys resist`);
  if (fx.goldFindBonus)           lines.push(`+${fx.goldFindBonus} gold find`);
  if (fx.weatherProtection)       lines.push('Severe weather → Poor for movement');
  if (fx.immuneToTerrify)         lines.push('Immune to Terrify');
  if (fx.revealHiddenLocations)   lines.push('Reveals hidden cache events');

  return (
    <View style={{ gap: 3 }}>
      {lines.map((l, i) => (
        <Text key={i} style={s.effectLine}>· {l}</Text>
      ))}
    </View>
  );
}

function ActiveEffectList({ fx }: { fx: ItemActiveEffect }) {
  const lines: string[] = [];
  const f = fx as any;
  if (f.healthRestore)     lines.push(`Restore ${f.healthRestore} HP`);
  if (f.foodRestore)       lines.push(`Restore ${f.foodRestore} food`);
  if (f.moraleRestore)     lines.push(`Restore ${f.moraleRestore} morale`);
  if (f.tempAttackBonus)   lines.push(`+${f.tempAttackBonus} attack for ${f.buffDurationRounds} rounds`);
  if (f.tempSpeedBonus)    lines.push(`+${f.tempSpeedBonus} speed for ${f.buffDurationRounds} rounds`);
  if (f.clearsStatusEffect)lines.push(`Clears: ${f.clearsStatusEffect.replace(/_/g, ' ')}`);
  if (f.grantsStatusEffect)lines.push(`Grants: ${f.grantsStatusEffect.replace(/_/g, ' ')}` +
    (f.statusDurationTurns ? ` (${f.statusDurationTurns} turns)` : ''));
  if (f.combatDamage > 0)  lines.push(`${f.combatDamage} combat damage`);
  if (f.combatEffect)      lines.push(`Effect: ${f.combatEffect.replace(/_/g, ' ')}`);

  return (
    <View style={{ gap: 3 }}>
      {lines.map((l, i) => (
        <Text key={i} style={s.effectLine}>· {l}</Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    backgroundColor: C.parchment,
    flex:            1,
  },

  // Header
  header: {
    alignItems:      'center',
    borderBottomColor: C.parchDeep,
    borderBottomWidth: 1,
    flexDirection:   'row',
    justifyContent:  'space-between',
    paddingBottom:   8,
    paddingHorizontal: 14,
    paddingTop:      12,
  },
  headerTitle: {
    color:       C.ink,
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    18,
    letterSpacing: 1,
  },
  headerSlots: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    13,
  },

  // Tabs
  tabs: {
    borderBottomColor: C.parchDeep,
    borderBottomWidth: 1,
    flexDirection:  'row',
  },
  tab: {
    alignItems:      'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex:            1,
    paddingVertical: 9,
  },
  tabActive: {
    borderBottomColor: C.gold,
  },
  tabText: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    letterSpacing: 0.8,
  },
  tabTextActive: {
    color: C.ink,
  },

  // Body: left + right panes
  body: {
    flex:          1,
    flexDirection: 'row',
  },
  leftPane: {
    borderRightColor: C.parchDeep,
    borderRightWidth: 1,
    padding:     10,
    width:       '55%',
  },
  rightPane: {
    flex:    1,
    padding: 12,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           7,
  },
  gridSlot: {
    alignItems:      'center',
    backgroundColor: C.parchDark,
    borderColor:     C.parchDeep,
    borderRadius:    3,
    borderWidth:     1,
    justifyContent:  'center',
    padding:         6,
    position:        'relative',
  },
  gridSlotSelected: {
    backgroundColor: '#F5E8C0',
    borderWidth:     2,
  },
  gridSlotEquipped: {
    backgroundColor: '#EEE4C8',
  },
  gridSlotEmpty: {
    borderStyle:  'dashed',
    opacity:      0.4,
  },
  gridIcon: {
    fontSize:     20,
    marginBottom: 4,
  },
  gridName: {
    color:       C.inkLight,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    8,
    letterSpacing: 0.2,
    lineHeight:  11,
    textAlign:   'center',
  },
  gridEmptyPlus: {
    color:       C.parchDeep,
    fontSize:    22,
  },
  qtyBadge: {
    backgroundColor: C.ink,
    borderRadius:    3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    position:        'absolute',
    right:           3,
    top:             3,
  },
  qtyText: {
    color:       C.parchment,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    8,
  },
  equippedDot: {
    backgroundColor: C.gold,
    borderRadius:    3,
    bottom:          3,
    height:          6,
    left:            3,
    position:        'absolute',
    width:           6,
  },

  // Equipped list
  equippedRow: {
    alignItems:     'center',
    backgroundColor:C.parchDark,
    borderColor:    C.parchDeep,
    borderRadius:   2,
    borderWidth:    1,
    flexDirection:  'row',
    overflow:       'hidden',
  },
  equippedSlotLabel: {
    alignItems:     'center',
    backgroundColor:C.parchDeep,
    paddingVertical: 10,
    width:          52,
  },
  equippedSlotText: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    letterSpacing: 0.5,
  },
  equippedSlotContent: {
    alignItems:   'center',
    flex:         1,
    flexDirection:'row',
    gap:          8,
    paddingHorizontal: 10,
  },
  equippedItemIcon: {
    fontSize: 16,
  },
  equippedItemName: {
    color:       C.ink,
    flex:        1,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
  },
  equippedEmpty: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
  },

  // Bonus list
  bonusEmpty: {
    alignItems: 'center',
    padding:    16,
  },
  bonusEmptyText: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    lineHeight: 20,
    textAlign:  'center',
  },
  bonusBox: {
    backgroundColor: C.parchDark,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    padding:         12,
  },
  bonusTitle: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bonusSectionTitle: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop:   10,
    textTransform: 'uppercase',
  },
  bonusDivider: {
    backgroundColor: C.parchDeep,
    height:          1,
    marginBottom:    8,
  },
  bonusRow: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  bonusLabel: {
    color:       C.ink,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
  },
  bonusValue: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    11,
  },
  bonusValueNeutral: {
    color:       C.inkLight,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
  },

  // Detail panel
  detailScroll: {
    flex: 1,
  },
  detailEmpty: {
    alignItems:     'center',
    flex:           1,
    gap:            10,
    justifyContent: 'center',
    opacity:        0.5,
  },
  detailEmptyIcon: {
    color:    C.parchDeep,
    fontSize: 28,
  },
  detailEmptyText: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    13,
    lineHeight:  20,
    textAlign:   'center',
  },
  rarityBadge: {
    alignSelf:       'flex-start',
    borderRadius:    2,
    borderWidth:     1,
    marginBottom:    8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rarityText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    letterSpacing: 1,
  },
  detailName: {
    color:       C.ink,
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    15,
    lineHeight:  22,
    marginBottom: 3,
  },
  detailMeta: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    marginBottom: 8,
  },
  detailDesc: {
    color:       C.inkLight,
    fontFamily:  'CrimsonText_400Regular',
    fontSize:    13,
    lineHeight:  20,
    marginBottom: 10,
  },
  effectBox: {
    backgroundColor: C.parchDark,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    marginBottom:    8,
    padding:         8,
  },
  effectTitle: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  effectLine: {
    color:       C.ink,
    fontFamily:  'CrimsonText_400Regular',
    fontSize:    12,
    lineHeight:  18,
  },
  salePriceText: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    marginBottom: 10,
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginTop:     4,
  },
  detailBtn: {
    alignItems:        'center',
    borderRadius:      2,
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  detailBtnText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    letterSpacing: 1,
  },
});
