import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameState, ItemCategory } from '@engine/types';
import {
  getShopInventory,
  buyItem,
  sellItem,
  getItemDef,
  inventoryFromResources,
  resourcesToInventory,
  isItemEquipped,
  RARITY_COLOURS,
  CATEGORY_ICONS,
  ShopItem,
} from '@engine/ItemSystem';
import { useGameStore } from '@store/gameStore';
import { saveEngine }   from '@engine/SaveEngine';
import { getLocation }  from '@data/locations';

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
};

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState:  GameState;
  locationId: number;
  visible:    boolean;
  onClose:    () => void;
  onToast:    (msg: string) => void;
}

// ─────────────────────────────────────────
// ShopScreen
// ─────────────────────────────────────────

export function ShopScreen({ gameState, locationId, visible, onClose, onToast }: Props) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const setGame       = useGameStore(s => s.setGameState);

  const location         = getLocation(locationId);
  const hasMerchantsRing = isItemEquipped(gameState.resources, 'merchants_ring');
  const inventory        = inventoryFromResources(gameState.resources);
  const shopItems        = getShopInventory(locationId, gameState.resources.gold, hasMerchantsRing);

  // Only show items the player could sell (have a shop price, not quest items)
  const sellableItems = inventory.items
    .map(invItem => ({ invItem, def: getItemDef(invItem.definitionId) }))
    .filter(({ def }) => !!def?.shopPrice && def.category !== ItemCategory.QuestItem);

  function handleBuy(itemId: string) {
    const inv    = inventoryFromResources(gameState.resources);
    const result = buyItem(inv, itemId, gameState.resources.gold, hasMerchantsRing);
    if (!result.success || !result.inventory) {
      onToast(result.reason ?? 'Cannot buy');
      return;
    }
    const newResources = resourcesToInventory(
      { ...gameState.resources, gold: gameState.resources.gold - result.goldSpent! },
      result.inventory,
    );
    const newState = { ...gameState, resources: newResources };
    setGame(newState);
    saveEngine.saveRun(newState);
    const def = getItemDef(itemId);
    onToast(`Bought ${def?.name ?? itemId} · ${result.goldSpent} gold`);
  }

  function handleSell(itemId: string) {
    const inv    = inventoryFromResources(gameState.resources);
    const result = sellItem(inv, itemId);
    if (!result.success || !result.inventory) {
      onToast(result.reason ?? 'Cannot sell');
      return;
    }
    const newResources = resourcesToInventory(
      { ...gameState.resources, gold: gameState.resources.gold + result.goldGained! },
      result.inventory,
    );
    const newState = { ...gameState, resources: newResources };
    setGame(newState);
    saveEngine.saveRun(newState);
    const def = getItemDef(itemId);
    onToast(`Sold ${def?.name ?? itemId} · +${result.goldGained} gold`);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>

        {/* ── Header ─────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerTitle}>
            <Text style={s.merchantLabel}>MERCHANT</Text>
            <Text style={s.locationName}>{location.name}</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.goldBox}>
              <Text style={s.goldLabel}>GOLD</Text>
              <Text style={s.goldValue}>{Math.floor(gameState.resources.gold)}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.rule} />

        {/* ── Merchant's Ring discount notice ──── */}
        {hasMerchantsRing && (
          <View style={s.discountBanner}>
            <Text style={s.discountText}>
              Merchant's Ring — prices reduced 20%
            </Text>
          </View>
        )}

        {/* ── Tabs ─────────────────────────────── */}
        <View style={s.tabRow}>
          {(['buy', 'sell'] as const).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[s.tabBtn, tab === t && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
                {t === 'buy' ? 'BUY' : 'SELL'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Item list ────────────────────────── */}
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {tab === 'buy' && shopItems.length === 0 && (
            <Text style={s.empty}>The merchant has nothing to offer here.</Text>
          )}
          {tab === 'buy' && shopItems.map(item => (
            <BuyRow
              key={item.def.id}
              item={item}
              onBuy={() => handleBuy(item.def.id)}
            />
          ))}

          {tab === 'sell' && sellableItems.length === 0 && (
            <Text style={s.empty}>You have nothing worth selling.</Text>
          )}
          {tab === 'sell' && sellableItems.map(({ invItem, def }) => def && (
            <SellRow
              key={invItem.definitionId}
              name={def.name}
              quantity={invItem.quantity}
              salePrice={Math.floor((def.shopPrice ?? 0) * 0.5)}
              rarity={def.rarity}
              onSell={() => handleSell(invItem.definitionId)}
            />
          ))}
        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─────────────────────────────────────────
// BuyRow
// ─────────────────────────────────────────

function BuyRow({ item, onBuy }: { item: ShopItem; onBuy: () => void }) {
  const { def, finalPrice, canAfford } = item;
  const rarityColor = RARITY_COLOURS[def.rarity];
  const icon        = CATEGORY_ICONS[def.category];

  return (
    <View style={s.row}>
      <View style={[s.rarityBar, { backgroundColor: rarityColor }]} />
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.itemIcon}>{icon}</Text>
          <Text style={s.itemName} numberOfLines={1}>{def.name}</Text>
          <Text style={[s.rarityLabel, { color: rarityColor }]}>
            {def.rarity.toUpperCase()}
          </Text>
        </View>
        <Text style={s.itemDesc}>{def.description}</Text>
        <View style={s.rowBottom}>
          <Text style={s.priceText}>{finalPrice} gold</Text>
          <TouchableOpacity
            onPress={onBuy}
            disabled={!canAfford}
            style={[s.actionBtn, s.buyBtn, !canAfford && s.actionBtnDisabled]}
            activeOpacity={0.8}
          >
            <Text style={[s.actionBtnText, !canAfford && s.actionBtnTextDisabled]}>
              {canAfford ? 'BUY' : 'NO GOLD'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// SellRow
// ─────────────────────────────────────────

function SellRow({
  name, quantity, salePrice, rarity, onSell,
}: {
  name:      string;
  quantity:  number;
  salePrice: number;
  rarity:    'common' | 'uncommon' | 'rare' | 'unique';
  onSell:    () => void;
}) {
  const rarityColor = RARITY_COLOURS[rarity];

  return (
    <View style={s.row}>
      <View style={[s.rarityBar, { backgroundColor: rarityColor }]} />
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.itemName} numberOfLines={1}>{name}</Text>
          {quantity > 1 && (
            <Text style={s.qtyBadge}>×{quantity}</Text>
          )}
          <Text style={[s.rarityLabel, { color: rarityColor }]}>
            {rarity.toUpperCase()}
          </Text>
        </View>
        <View style={s.rowBottom}>
          <Text style={s.priceText}>{salePrice} gold</Text>
          <TouchableOpacity
            onPress={onSell}
            style={[s.actionBtn, s.sellBtn]}
            activeOpacity={0.8}
          >
            <Text style={[s.actionBtnText, s.sellBtnText]}>SELL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.ink,
  },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop:     16,
    paddingBottom:  16,
  },
  headerTitle: {
    flex: 1,
  },
  merchantLabel: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      10,
    letterSpacing: 2,
    color:         C.gold,
  },
  locationName: {
    fontFamily: 'Cinzel_400Regular',
    fontSize:   20,
    color:      C.parchment,
    marginTop:  2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           16,
  },
  goldBox: {
    alignItems: 'flex-end',
  },
  goldLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1,
    color:         C.mist,
  },
  goldValue: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   20,
    color:      C.goldLight,
  },
  closeBtn: {
    width:           32,
    height:          32,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    2,
  },
  closeBtnText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize:   14,
    color:      C.parchment,
  },

  // Rule
  rule: {
    height:            1,
    backgroundColor:   C.gold,
    marginHorizontal:  20,
  },

  // Discount banner
  discountBanner: {
    backgroundColor:     C.inkLight,
    borderBottomWidth:   1,
    borderBottomColor:   C.gold,
    paddingVertical:     7,
    paddingHorizontal:   20,
  },
  discountText: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    color:      C.gold,
    textAlign:  'center',
  },

  // Tabs
  tabRow: {
    flexDirection:   'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap:             8,
  },
  tabBtn: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: 9,
    borderWidth:    1,
    borderColor:    C.parchDeep,
    borderRadius:   2,
  },
  tabBtnActive: {
    backgroundColor: C.gold,
    borderColor:     C.gold,
  },
  tabBtnText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      12,
    letterSpacing: 1,
    color:         C.mist,
  },
  tabBtnTextActive: {
    color: C.ink,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom:     32,
  },
  empty: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   15,
    color:      C.mist,
    textAlign:  'center',
    marginTop:  56,
  },

  // Row shared
  row: {
    flexDirection:   'row',
    backgroundColor: C.inkLight,
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    marginBottom:    8,
    overflow:        'hidden',
  },
  rarityBar: {
    width: 3,
  },
  rowBody: {
    flex:    1,
    padding: 12,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  4,
  },
  itemIcon: {
    fontSize: 13,
    color:    C.parchDeep,
  },
  itemName: {
    fontFamily: 'Cinzel_400Regular',
    fontSize:   13,
    color:      C.parchment,
    flex:       1,
  },
  rarityLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1,
  },
  qtyBadge: {
    fontFamily: 'Cinzel_400Regular',
    fontSize:   11,
    color:      C.mist,
  },
  itemDesc: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   13,
    color:      C.mist,
    lineHeight: 19,
    marginBottom: 10,
  },
  rowBottom: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   13,
    color:      C.goldLight,
  },

  // Buttons
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical:   6,
    borderRadius:      2,
  },
  buyBtn: {
    backgroundColor: C.blood,
  },
  sellBtn: {
    borderWidth:  1,
    borderColor:  C.gold,
  },
  actionBtnDisabled: {
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     C.parchDeep,
  },
  actionBtnText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      11,
    letterSpacing: 1,
    color:         C.parchment,
  },
  sellBtnText: {
    color: C.gold,
  },
  actionBtnTextDisabled: {
    color: C.mist,
  },
});
