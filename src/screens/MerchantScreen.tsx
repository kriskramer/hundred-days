/* eslint-disable react-native/sort-styles */
import { useState, memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { DialogueSessionOutcome } from '@engine/types';

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
import { findShopDialogue, getDialogue } from '@engine/DialogueEngine';
import { CompanionDialogueModal } from '@components/CompanionDialogueModal';
import { TypewriterText } from '@components';

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

interface Props {
  onBackToRoad:           () => void;
  onToast:                (msg: string) => void;
  merchantEntryNarrative?: string;
}

export function MerchantScreen({ onBackToRoad, onToast, merchantEntryNarrative }: Props) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [narrativeLines, setNarrativeLines] = useState<string[]>([]);
  const [animateFromIdx, setAnimateFromIdx] = useState(0);
  const [shopDialogueId, setShopDialogueId] = useState<string | null>(null);
  const narrativeScrollRef = useRef<ScrollView>(null);
  const { buyItem, sellItem } = useShopActions();

  useEffect(() => {
    if (merchantEntryNarrative) {
      setNarrativeLines([merchantEntryNarrative]);
      setAnimateFromIdx(0);
    }
  }, [merchantEntryNarrative]);

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
    <View style={s.root}>
      <View style={s.topHeader}>
        <View>
          <Text style={s.kicker}>MERCHANT</Text>
          <Text style={s.title}>{merchant?.merchantName ?? location.name}</Text>
          {merchant && (
            <Text style={s.subtitle}>{location.name}</Text>
          )}
        </View>
        <View style={s.headerActions}>
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
            activeOpacity={0.8}
            onPress={onBackToRoad}
            style={s.backButton}
          >
            <Text style={s.backButtonText}>ROAD</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.rule} />

      {hasMerchantsRing && (
        <View style={s.discountBanner}>
          <Text style={s.discountText}>
            {"Merchant's Ring — prices reduced 20%"}
          </Text>
        </View>
      )}

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

      <CompanionDialogueModal
        visible={shopDialogueId !== null}
        dialogue={shopDialogueId ? (getDialogue(shopDialogueId) ?? null) : null}
        gameState={gameState}
        onComplete={(_outcome: DialogueSessionOutcome) => setShopDialogueId(null)}
        onClose={() => setShopDialogueId(null)}
      />
    </View>
  );
}

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

const s = StyleSheet.create({
  actionBtn: {
    borderRadius:      2,
    paddingHorizontal: 16,
    paddingVertical:   6,
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
  actionBtnTextDisabled: {
    color: C.mist,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: C.parchDark,
    borderColor: C.parchDeep,
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButtonText: {
    color: C.ink,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  buyBtn: {
    backgroundColor: C.blood,
  },
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
  empty: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   15,
    marginTop:  56,
    textAlign:  'center',
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
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  itemDesc: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   13,
    lineHeight: 19,
    marginBottom: 10,
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
  kicker: {
    color: C.gold,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom:     32,
    paddingHorizontal: 20,
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
  priceText: {
    color:      C.goldLight,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   13,
  },
  qtyBadge: {
    color:      C.mist,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   11,
  },
  rarityBar: {
    width: 3,
  },
  rarityLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1,
  },
  root: {
    backgroundColor: C.ink,
    flex: 1,
  },
  row: {
    backgroundColor: C.inkLight,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    flexDirection:   'row',
    marginBottom:    8,
    minHeight:       60,
    overflow:        'hidden',
  },
  rowBody: {
    flex:    1,
    padding: 12,
  },
  rowBottom: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'space-between',
  },
  rowTop: {
    alignItems:    'center',
    flexDirection: 'row',
    gap:           6,
    marginBottom:  4,
  },
  rule: {
    backgroundColor:   C.gold,
    height:            1,
    marginHorizontal:  20,
  },
  sellBtn: {
    borderColor:  C.gold,
    borderWidth:  1,
  },
  sellBtnText: {
    color: C.gold,
  },
  subtitle: {
    color:      C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    marginTop:  2,
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
  tabRow: {
    flexDirection:   'row',
    gap:             8,
    paddingHorizontal: 20,
    paddingVertical: 14,
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
  title: {
    color:      C.parchment,
    fontFamily: 'Cinzel_400Regular',
    fontSize:   20,
    marginTop:  2,
  },
  topHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
