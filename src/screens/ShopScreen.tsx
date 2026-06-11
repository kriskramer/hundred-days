/* eslint-disable react-native/sort-styles */
import { useState, memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import type { DialogueSessionOutcome } from '@engine/types';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemCategory } from '@engine/types';
import {
  getShopInventory,
  getMerchantAtLocation,
  getItemDef,
  inventoryFromResources,
  isItemEquipped,
  RARITY_COLOURS,
  CATEGORY_ICONS,
  ShopItem,
} from '@engine/ItemSystem';
import { getLocation }  from '@data/locations';
import { useShopActions } from '@hooks/useShopActions';
import { useGameStore, useLocation, useResources } from '@store/gameStore';
import {
  getTradePurchaseNarrative,
  getMerchantBuyReaction,
  getMerchantSellReaction,
} from '@utils/tradeJournal';
import { findShopDialogue } from '@engine/DialogueEngine';
import { CompanionDialogueModal } from '@components/CompanionDialogueModal';
import { TypewriterText } from '@components';

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
// Typewriter pacing
// ─────────────────────────────────────────

const NARRATIVE_TYPE_INTERVAL = 22;
const NARRATIVE_LINE_GAP_MS   = 150;

function getNarrativeAnimationDelay(lines: string[], animateFromIdx: number, idx: number): number {
  if (idx < animateFromIdx) return -1;

  let delay = 0;
  for (let i = animateFromIdx; i < idx; i++) {
    delay += lines[i].length * NARRATIVE_TYPE_INTERVAL + NARRATIVE_LINE_GAP_MS;
  }
  return delay;
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  visible:                boolean;
  onClose:                () => void;
  onToast:                (msg: string) => void;
  merchantEntryNarrative?: string;
}

// ─────────────────────────────────────────
// ShopScreen
// ─────────────────────────────────────────

export function ShopScreen({ visible, onClose, onToast, merchantEntryNarrative }: Props) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [narrativeLines, setNarrativeLines] = useState<string[]>([]);
  const [animateFromIdx, setAnimateFromIdx] = useState(0);
  const [shopDialogueId, setShopDialogueId] = useState<string | null>(null);
  const narrativeScrollRef = useRef<ScrollView>(null);
  const { buyItem, sellItem } = useShopActions();

  useEffect(() => {
    if (visible && merchantEntryNarrative) {
      setNarrativeLines([merchantEntryNarrative]);
      setAnimateFromIdx(0);
    }
    if (!visible) {
      setNarrativeLines([]);
      setAnimateFromIdx(0);
    }
  }, [visible, merchantEntryNarrative]);

  useEffect(() => {
    narrativeScrollRef.current?.scrollToEnd({ animated: true });
  }, [narrativeLines]);

  const locationId = useLocation();
  const resources = useResources();
  const runLayout = useGameStore(s => s.gameState?.runLayout);
  const gameState = useGameStore(s => s.gameState);

  if (!resources || !gameState) return null;

  const location         = getLocation(locationId);
  const merchant         = getMerchantAtLocation(locationId, runLayout);
  const hasMerchantsRing = isItemEquipped(resources, 'merchants_ring');
  const inventory        = inventoryFromResources(resources);
  const shopItems        = getShopInventory(locationId, resources.gold, hasMerchantsRing, runLayout);

  // Only show items the player could sell (have a shop price, not quest items)
  const sellableItems = inventory.items
    .map(invItem => ({ invItem, def: getItemDef(invItem.definitionId) }))
    .filter(({ def }) => !!def?.shopPrice && def.category !== ItemCategory.QuestItem);

  async function handleBuy(itemId: string) {
    const result = await buyItem(locationId, itemId);
    if (!result.success) {
      onToast(result.reason);
      return;
    }

    if (result.foodGained) {
      const foodText = `+${result.foodGained} food · ${result.goldSpent} gold`;
      onToast(foodText);
      setAnimateFromIdx(narrativeLines.length);
      setNarrativeLines(prev => [...prev, foodText, getMerchantBuyReaction(result.itemName)]);
      return;
    }

    const purchaseText = getTradePurchaseNarrative(result.itemName, result.goldSpent, result.autoEquipped);
    onToast(purchaseText);
    setAnimateFromIdx(narrativeLines.length);
    setNarrativeLines(prev => [...prev, purchaseText, getMerchantBuyReaction(result.itemName)]);
  }

  async function handleSell(itemId: string) {
    const result = await sellItem(itemId);
    if (!result.success) {
      onToast(result.reason);
      return;
    }

    const sellText = `You sell the ${result.itemName} for ${result.goldGained} gold.`;
    onToast(`Sold ${result.itemName} · +${result.goldGained} gold`);
    setAnimateFromIdx(narrativeLines.length);
    setNarrativeLines(prev => [...prev, sellText, getMerchantSellReaction(result.goldGained)]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>

        {/* ── Header ─────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerTitle}>
            <Text style={s.merchantLabel}>MERCHANT</Text>
            <Text style={s.locationName}>{merchant?.merchantName ?? location.name}</Text>
            {merchant && (
              <Text style={s.locationSubtitle}>{location.name}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            {findShopDialogue(locationId, gameState) && (
              <TouchableOpacity
                onPress={() => {
                  const d = findShopDialogue(locationId, gameState);
                  if (d) setShopDialogueId(d.id);
                }}
                style={s.talkBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.talkBtnText}>TALK</Text>
              </TouchableOpacity>
            )}
            <View style={s.goldBox}>
              <Text style={s.goldLabel}>GOLD</Text>
              <Text style={s.goldValue}>{Math.floor(resources.gold)}</Text>
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
              {"Merchant's Ring — prices reduced 20%"}
            </Text>
          </View>
        )}

        {/* ── Narrative panel ──────────────────── */}
        {narrativeLines.length > 0 && (
          <View style={s.narrativePanel}>
            <ScrollView
              ref={narrativeScrollRef}
              style={s.narrativeScroll}
              contentContainerStyle={s.narrativeContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {narrativeLines.map((line, i) => {
                const animDelay = getNarrativeAnimationDelay(narrativeLines, animateFromIdx, i);
                return animDelay >= 0 ? (
                  <TypewriterText
                    key={i}
                    text={line}
                    style={s.narrativeLine}
                    interval={NARRATIVE_TYPE_INTERVAL}
                    delay={animDelay}
                  />
                ) : (
                  <Text key={i} style={s.narrativeLine}>{line}</Text>
                );
              })}
            </ScrollView>
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
          {tab === 'buy' && shopItems.map((item, index) => (
            <BuyRow
              key={`${item.def.id}_${index}`}
              item={item}
              onBuy={() => handleBuy(item.def.id)}
            />
          ))}

          {tab === 'sell' && sellableItems.length === 0 && (
            <Text style={s.empty}>You have nothing worth selling.</Text>
          )}
          {tab === 'sell' && sellableItems.map(({ invItem, def }, index) => def && (
            <SellRow
              key={`${invItem.definitionId}_${index}`}
              name={def.name}
              quantity={invItem.quantity}
              salePrice={Math.floor((def.shopPrice ?? 0) * 0.5)}
              rarity={def.rarity}
              onSell={() => handleSell(invItem.definitionId)}
            />
          ))}
        </ScrollView>

      </SafeAreaView>
      <CompanionDialogueModal
        visible={shopDialogueId !== null}
        dialogue={shopDialogueId ? (require('@engine/DialogueEngine').getDialogue(shopDialogueId) ?? null) : null}
        gameState={gameState}
        onComplete={(_outcome: DialogueSessionOutcome) => setShopDialogueId(null)}
        onClose={() => setShopDialogueId(null)}
      />
    </Modal>
  );
}

// ─────────────────────────────────────────
// BuyRow
// ─────────────────────────────────────────

const BuyRow = memo(function BuyRow({ item, onBuy }: { item: ShopItem; onBuy: () => void }) {
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
        <Text style={s.itemDesc} numberOfLines={2}>{def.description}</Text>
        <View style={s.rowBottom}>
          <Text style={s.priceText}>{finalPrice} gold</Text>
          <TouchableOpacity
            onPress={onBuy}
            disabled={!canAfford}
            style={[s.actionBtn, s.buyBtn, !canAfford && s.actionBtnDisabled]}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[s.actionBtnText, !canAfford && s.actionBtnTextDisabled]}>
              {canAfford ? 'BUY' : 'NO GOLD'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────
// SellRow
// ─────────────────────────────────────────

const SellRow = memo(function SellRow({
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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[s.actionBtnText, s.sellBtnText]}>SELL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingBottom:  16,
    paddingHorizontal: 20,
    paddingTop:     16,
  },
  headerTitle: {
    flex: 1,
  },

  root: {
    backgroundColor: C.ink,
    flex: 1,
  },
  merchantLabel: {
    color:         C.gold,
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      10,
    letterSpacing: 2,
  },
  locationName: {
    color:      C.parchment,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   20,
    marginTop:  2,
  },
  locationSubtitle: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    marginTop:  2,
  },
  headerRight: {
    alignItems:    'center',
    flexDirection: 'row',
    gap:           16,
  },
  goldBox: {
    alignItems: 'flex-end',
  },
  goldLabel: {
    color:         C.mist,
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1,
  },
  goldValue: {
    color:      C.goldLight,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   20,
  },
  talkBtn: {
    backgroundColor: C.parchDark,
    borderRadius:    4,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  talkBtnText: {
    color:      C.ink,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   10,
    letterSpacing: 1.5,
  },
  closeBtn: {
    alignItems:      'center',
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    height:          32,
    justifyContent:  'center',
    width:           32,
  },
  closeBtnText: {
    color:      C.parchment,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   14,
  },

  // Rule
  rule: {
    backgroundColor:   C.gold,
    height:            1,
    marginHorizontal:  20,
  },

  // Discount banner
  discountBanner: {
    backgroundColor:     C.inkLight,
    borderBottomColor:   C.gold,
    borderBottomWidth:   1,
    paddingHorizontal:   20,
    paddingVertical:     7,
  },
  discountText: {
    color:      C.gold,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    textAlign:  'center',
  },

  // Narrative panel
  narrativePanel: {
    backgroundColor:   'rgba(245, 234, 214, 0.07)',
    borderBottomColor: C.gold,
    borderBottomWidth: 1,
    maxHeight:         110,
    paddingBottom:     10,
    paddingHorizontal: 20,
    paddingTop:        10,
  },
  narrativeScroll: {
    flex: 1,
  },
  narrativeContent: {
    gap: 4,
  },
  narrativeLine: {
    color:      '#D4C5A0',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   14,
    lineHeight: 20,
  },

  // Tabs
  tabRow: {
    flexDirection:   'row',
    gap:             8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  tabBtn: {
    alignItems:     'center',
    borderColor:    C.parchDeep,
    borderRadius:   2,
    borderWidth:    1,
    flex:           1,
    paddingVertical: 9,
  },
  tabBtnActive: {
    backgroundColor: C.gold,
    borderColor:     C.gold,
  },
  tabBtnText: {
    color:         C.mist,
    fontFamily:    'Cinzel_400Regular',
    fontSize:      12,
    letterSpacing: 1,
  },
  tabBtnTextActive: {
    color: C.ink,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom:     32,
    paddingHorizontal: 20,
  },
  empty: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   15,
    marginTop:  56,
    textAlign:  'center',
  },

  // Row shared
  row: {
    backgroundColor: C.inkLight,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    flexDirection:   'row',
    marginBottom:    8,
    overflow:        'hidden',
    minHeight:       60,
  },
  rarityBar: {
    width: 3,
  },
  rowBody: {
    flex:    1,
    padding: 12,
  },
  rowTop: {
    alignItems:    'center',
    flexDirection: 'row',
    gap:           6,
    marginBottom:  4,
  },
  itemIcon: {
    color:    C.parchDeep,
    fontSize: 13,
  },
  itemName: {
    color:      C.parchment,
    flex:       1,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   14,
  },
  rarityLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1,
  },
  qtyBadge: {
    color:      C.mist,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   11,
  },
  itemDesc: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   13,
    lineHeight: 19,
    marginBottom: 10,
  },
  rowBottom: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'space-between',
  },
  priceText: {
    color:      C.goldLight,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   13,
  },

  // Buttons
  actionBtn: {
    borderRadius:      2,
    paddingHorizontal: 16,
    paddingVertical:   6,
  },
  buyBtn: {
    backgroundColor: C.blood,
  },
  sellBtn: {
    borderColor:  C.gold,
    borderWidth:  1,
  },
  actionBtnDisabled: {
    backgroundColor: 'transparent',
    borderColor:     C.parchDeep,
    borderWidth:     1,
  },
  actionBtnText: {
    color:         C.parchment,
    fontFamily:    'Cinzel_400Regular',
    fontSize:      11,
    letterSpacing: 1,
  },
  sellBtnText: {
    color: C.gold,
  },
  actionBtnTextDisabled: {
    color: C.mist,
  },
});
