import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Animated } from 'react-native';
import { GameState, PlayerAction, ACTION_LABELS, WeatherType, CompanionArchetype, TurnRecord, Companion, CompanionPassiveBonus } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation } from '@data/locations';
import { pickLocationText, pickLocationRandomText } from '@engine/GameState';
import { isBossLocation } from '@engine/bosses';
import { hasEligibleDialogue } from '@engine/EventSystem';
import { canStealFromDialogue, findDialogueForLocation, getDialogueDisplayName, isNpcDialogue } from '@engine/DialogueEngine';
import { Colors } from '@theme';
import { confirmAction } from '@utils/confirmAction';
import { TypewriterText, CompanionDetailModal } from '@components';
import { getLuckThreshold, computeEquippedBonuses, inventoryFromResources } from '@engine';
import { hasMerchantAtLocation } from '@engine/ItemSystem';
import * as Haptics from 'expo-haptics';

interface Props {
  gameState:       GameState;
  engine:          TurnEngine | null;
  onToast:         (msg: string) => void;
  onOpenShop?:     () => void;
  onOpenCombat?:   () => void;
  onOpenDialogue?: () => void;
  onOpenNpc?:      (dialogueId: string) => void;
  canTalk?:        boolean;
  textInterval?: number;
  confirmActions?: boolean;
}

function getForageLabel(huntYield: number | null): string | null {
  if (huntYield === null)       return null;
  if (huntYield === 0)          return '❧ BARREN';
  if (huntYield < 0.5)          return '❧ SCARCE';
  if (huntYield < 1.0)          return '❧ MEAGRE';
  if (huntYield < 1.5)          return '❧ ADEQUATE';
  if (huntYield < 2.0)          return '❧ PLENTIFUL';
  return '❧ BOUNTIFUL';
}

const WEATHER_LABEL: Record<WeatherType, string> = {
  [WeatherType.Severe]:  'Severe Storm',
  [WeatherType.Poor]:    'Poor Weather',
  [WeatherType.Neutral]: 'Overcast',
  [WeatherType.Good]:    'Good Weather',
  [WeatherType.Ideal]:   'Ideal Conditions',
};

const WEATHER_TEXT_STYLE: Record<WeatherType, { color: string; label: string }> = {
  [WeatherType.Severe]:  { color: '#8B1A1A', label: '⛈ Severe Storm' },
  [WeatherType.Poor]:    { color: '#A04A00', label: '☁ Poor Weather' },
  [WeatherType.Neutral]: { color: Colors.mist, label: '☁ Overcast' },
  [WeatherType.Good]:    { color: '#1E4E2C', label: '☀ Good Weather' },
  [WeatherType.Ideal]:   { color: '#1B5232', label: '✨ Ideal Conditions' },
};

function getForageTextColor(huntYield: number | null): string {
  if (huntYield === null) return Colors.mist;
  if (huntYield === 0)    return '#8B1A1A';
  if (huntYield < 0.5)    return '#A04A00';
  if (huntYield < 1.0)    return '#86600B';
  if (huntYield < 1.5)    return Colors.mist;
  if (huntYield < 2.0)    return '#1E4E2C';
  return '#1B5232';
}


interface ShakingBadgeProps {
  children: React.ReactNode;
  style: any;
  delay?: number;
}

function ShakingBadge({ children, style, delay = 150 }: ShakingBadgeProps) {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    shakeAnim.setValue(0);
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [shakeAnim, delay]);

  return (
    <Animated.View style={[style, { transform: [{ translateX: shakeAnim }] }]}>
      {children}
    </Animated.View>
  );
}

interface FlashingBadgeProps {
  children: React.ReactNode;
  style: any;
  delay?: number;
}

function FlashingBadge({ children, style, delay = 150 }: FlashingBadgeProps) {
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    opacityAnim.setValue(1);
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [opacityAnim, delay]);

  return (
    <Animated.View style={[style, { opacity: opacityAnim }]}>
      {children}
    </Animated.View>
  );
}

const DIALOGUE_CUES: Record<string, string> = {
  rex_the_dog: 'A dog runs up to you and barks, looking for attention.',
  dain_recruitment: 'A Qanisi warrior stands near the road, observing you with a steady gaze.',
  lefty_recruitment: 'A lean man with a missing finger leans against the wall nearby, sizing you up.',
  branniks_tent: 'An old man sits quietly by a campfire nearby, gesturing for you to sit.',
};

export function RoadScreen({
  gameState,
  engine,
  onToast,
  onOpenShop,
  onOpenCombat,
  onOpenDialogue,
  onOpenNpc,
  canTalk,
  textInterval = 22,
  confirmActions = true,
}: Props) {
  const location       = getLocation(gameState.currentLocationId);
  const dialogueNearby = hasEligibleDialogue(gameState);
  const dangerNearby   = location.mobs.some(m => m.aggroPct > 0 && !m.isCompanion)
                      && !gameState.clearedCombatLocations.has(gameState.currentLocationId);
  const bossNearby     = isBossLocation(gameState.currentLocationId)
                      && !gameState.clearedCombatLocations.has(gameState.currentLocationId);

  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
  const [showingLastEntry, setShowingLastEntry]       = useState(false);
  const [forceComplete, setForceComplete]             = useState(false);
  const [lastEntryFinished, setLastEntryFinished]     = useState(false);
  const [locDescFinished, setLocDescFinished]         = useState(false);
  const [randomTextFinished, setRandomTextFinished]   = useState(false);

  const activeDialogue = findDialogueForLocation(gameState.currentLocationId, gameState);
  const dialogueCue    = activeDialogue ? (DIALOGUE_CUES[activeDialogue.id] || 'Someone is nearby, looking to speak with you.') : null;
  const currentNpcSlot = gameState.runLayout?.npcSlots.find(
    slot => slot.locationId === gameState.currentLocationId && !gameState.firedEventIds.has(slot.npcEventId)
  ) ?? null;
  const currentNpcDialogueId = activeDialogue && isNpcDialogue(activeDialogue.id)
    ? activeDialogue.id
    : currentNpcSlot?.npcEventId ?? null;
  const currentNpcName = currentNpcDialogueId ? getDialogueDisplayName(currentNpcDialogueId) : null;
  const currentNpcCanSteal = currentNpcDialogueId ? canStealFromDialogue(currentNpcDialogueId) : false;

  const baseLocationText = location.locationText || '';
  const randomText = pickLocationRandomText(location, gameState.dayNumber, gameState.seed);

  const displayLocationText = (dialogueCue && !randomText)
    ? `${baseLocationText}\n\n${dialogueCue}`
    : baseLocationText;
  const displayRandomText = (dialogueCue && randomText)
    ? `${randomText}\n\n${dialogueCue}`
    : randomText;

  const lastTurn = gameState.turnHistory[gameState.turnHistory.length - 1];
  const lastTurnKey = lastTurn ? `${lastTurn.dayNumber}_${lastTurn.action}` : null;
  const prevTurnKeyRef = useRef<string | null>(lastTurnKey);

  useEffect(() => {
    if (!lastTurnKey) {
      setShowingLastEntry(false);
      prevTurnKeyRef.current = null;
    } else if (lastTurnKey !== prevTurnKeyRef.current) {
      setShowingLastEntry(true);
      prevTurnKeyRef.current = lastTurnKey;
    }
  }, [lastTurnKey]);

  useEffect(() => {
    setForceComplete(false);
    setLastEntryFinished(false);
    setLocDescFinished(false);
    setRandomTextFinished(false);
  }, [gameState.currentLocationId, showingLastEntry]);

  const isJournalEntryTyping = showingLastEntry && !lastEntryFinished;
  const isLocationTyping = !showingLastEntry && (!locDescFinished || (randomText !== null && !randomTextFinished));
  const isTyping = isJournalEntryTyping || isLocationTyping;
  const showAlertBadges = !showingLastEntry && (dangerNearby || dialogueNearby || bossNearby);

  let netFood = 0;
  let netGold = 0;
  let netHealth = 0;
  let netMorale = 0;

  if (lastTurn) {
    for (const d of lastTurn.deltas) {
      netFood   += d.food   ?? 0;
      netGold   += d.gold   ?? 0;
      netHealth += d.health ?? 0;
      netMorale += d.morale ?? 0;
    }
  }

  const hasDelta = lastTurn && [netFood, netGold, netHealth, netMorale].some(v => Math.abs(v) >= 0.1);

  const activeShortcuts = gameState.runLayout?.activeShortcuts.filter(
    s => s.from === gameState.currentLocationId && (gameState.player.stats.perception ?? 0) >= s.perceptionThreshold
  ) ?? [];

  const itemBonuses = computeEquippedBonuses(inventoryFromResources(gameState.resources));
  const luckThreshold = getLuckThreshold(gameState.morale)
    + ((gameState.player.stats.luck ?? 0) / 100)
    + (itemBonuses.luckModifier ?? 0);
  const isLucky = luckThreshold > 0.25;
  const hasMerchant = hasMerchantAtLocation(gameState.currentLocationId, gameState.runLayout);

  const actionButtons = (bossNearby
    ? [
        {
          label: 'Fight Boss',
          sub: 'Begin combat',
          variant: 'primary' as const,
          onPress: () => onOpenCombat?.(),
        },
        ...(((canTalk ?? (activeDialogue !== null)) && !currentNpcDialogueId) ? [{ label: 'Talk', sub: 'Start dialogue', variant: 'secondary' as const, onPress: () => onOpenDialogue?.() }] : []),
      ]
    : [
        ...(dangerNearby ? [{ label: 'Combat', sub: 'Face nearby danger', variant: 'primary' as const, onPress: () => onOpenCombat?.() }] : []),
        ...(((canTalk ?? (activeDialogue !== null)) && !currentNpcDialogueId) ? [{ label: 'Talk', sub: 'Start dialogue', variant: 'secondary' as const, onPress: () => onOpenDialogue?.() }] : []),
        { label: 'Move',         sub: '1 loc · 1 food',    variant: 'move' as const,       onPress: () => submit({ action: PlayerAction.Move, forcedMarch: false }), isLucky },
        { label: 'Force March',  sub: '2 locs · 1.5 food', variant: 'forceMarch' as const, onPress: () => submit({ action: PlayerAction.Move, forcedMarch: true  }) },
        ...activeShortcuts.map(s => ({
          label: s.label,
          sub: `To loc ${s.to} · 2 food`,
          variant: 'primary' as const,
          onPress: () => submit({ action: PlayerAction.Move, forcedMarch: false, shortcutTo: s.to })
        })),
        ...(hasMerchant ? [{ label: 'Trade',      sub: 'Buy · Sell',     variant: 'secondary' as const, onPress: () => onOpenShop?.()                                    }] : []),
        ...(location.isTown  ? [{ label: 'Rest at Inn', sub: '+25 HP · 10g', variant: 'default'   as const, onPress: () => submit({ action: PlayerAction.Rest, atInn: true }) }] : []),
        { label: 'Forage',       sub: 'Gain food',          variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Hunt, method: 'forage'   }) },
        { label: 'Rally',        sub: 'Boost morale',       variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Rally                                          }) },
        { label: 'Make Camp',    sub: '+10 HP · rest',      variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Camp }) },
      ]).map(btn => ({ ...btn, disabled: isTyping }));
  const npcActionButtons = currentNpcDialogueId && currentNpcName
    ? [{
        label: currentNpcName,
        sub: currentNpcCanSteal ? 'Talk · Steal' : 'Talk',
        variant: 'npc' as const,
        onPress: () => onOpenNpc?.(currentNpcDialogueId),
        disabled: isTyping,
      }]
    : [];

  function renderDelta(val: number, label: string, icon: string) {
    if (Math.abs(val) < 0.1) return null;
    const pos = val > 0;
    const color = pos ? '#2A5A3A' : '#8B1A1A';
    const sign = pos ? '+' : '';
    const bgColor = pos ? '#E6F4EA' : '#FCE8E6';
    const borderColor = pos ? '#A3D7B1' : '#F1B2AC';

    return (
      <View key={label} style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bgColor,
        borderWidth: 1,
        borderColor,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 8,
        marginBottom: 6,
      }}>
        <Text style={{ fontSize: 13, marginRight: 4 }}>{icon}</Text>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 10, color, letterSpacing: 0.5 }}>
          {sign}{Math.round(val)} {label.toUpperCase()}
        </Text>
      </View>
    );
  }


  function submit(params: ActionParams) {
    if (!engine) { onToast('Engine not ready'); return; }

    let moveFoodThreshold = 1.0;
    if (params.action === PlayerAction.Move) {
      if (params.shortcutTo) {
        moveFoodThreshold = 2.0;
      } else if (params.forcedMarch) {
        moveFoodThreshold = 1.5;
      }
    }

    if (params.action === PlayerAction.Move && gameState.resources.food < moveFoodThreshold) {
      onToast('Marching hungry — health and morale penalties will keep worsening until you find food.');
    }

    engine.submitAction(params).catch(console.error);
  }

  function submitWithConfirm(params: ActionParams, label: string, costDesc: string) {
    if (!confirmActions) {
      submit(params);
      return;
    }

    confirmAction(label, costDesc, () => submit(params));
  }

  const handleCompanionPress = (id: string) => {
    if (selectedCompanionId === id) {
      setSelectedCompanionId(null);
    } else {
      setSelectedCompanionId(id);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.parchment }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 480 }}>
          {/* Stat bars */}
          <View style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 7,
            gap: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#C8B89A',
          }}>
            <StatBar label="Health" value={gameState.player.health} max={gameState.player.stats.maxHealth} />
            <StatBar label="Morale" value={gameState.morale.value} />
          </View>

          <View style={{ padding: 16 }}>
            {/* Location header */}
            <View className="border-b border-parchment-deep pb-3 mb-4">
              <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 2 }}>
                {location.region.toUpperCase()} · LOCATION {location.id}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                <Text className="font-display-bold text-ink" style={{ fontSize: 22, flexShrink: 1 }}>
                  {location.name}
                </Text>
                {location.isTown && (
                  <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 11, lineHeight: 26, letterSpacing: 1, color: Colors.mist }}>
                    TOWN
                  </Text>
                )}
                {hasMerchant && (
                  <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 11, lineHeight: 26, letterSpacing: 1, color: Colors.gold }}>
                    SHOP
                  </Text>
                )}
              </View>
              {/* Weather · Forage row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                {(() => {
                  const style = WEATHER_TEXT_STYLE[gameState.weather];
                  return (
                    <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 10, letterSpacing: 1, color: style.color }}>
                      {style.label.toUpperCase()}
                    </Text>
                  );
                })()}
                {getForageLabel(location.actions.huntYield) && (
                  <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 10, letterSpacing: 1, color: getForageTextColor(location.actions.huntYield) }}>
                    {getForageLabel(location.actions.huntYield)}
                  </Text>
                )}
              </View>

              {/* Alert badges row — only when relevant */}
              {showAlertBadges && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {bossNearby && (
                    <FlashingBadge style={{ backgroundColor: Colors.blood, borderWidth: 1, borderColor: Colors.goldLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 }}>
                      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: Colors.parchment }}>
                        💀 BOSS FIGHT!
                      </Text>
                    </FlashingBadge>
                  )}

                  {dangerNearby && (
                    <ShakingBadge style={{ backgroundColor: '#F5C2C2', borderWidth: 1, borderColor: '#C94040', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 }}>
                      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#5A0C0C' }}>
                        ⚔ DANGER
                      </Text>
                    </ShakingBadge>
                  )}

                  {dialogueNearby && (
                    <ShakingBadge style={{ backgroundColor: '#F2E6C2', borderWidth: 1, borderColor: '#C8A020', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 }}>
                      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#403004' }}>
                        ◇ STRANGER NEARBY
                      </Text>
                    </ShakingBadge>
                  )}
                </View>
              )}
            </View>

            {/* Narrative / Combined Panel */}
            <TouchableOpacity
              activeOpacity={0.95}
              onPress={() => setForceComplete(true)}
              style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 3, padding: 12, marginBottom: 12, backgroundColor: '#EDE4CF' }}
            >
              {showingLastEntry && lastTurn ? (
                // Last Entry Content
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#C8A060', paddingBottom: 6 }}>
                    <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 11, color: Colors.blood, letterSpacing: 0.5 }}>
                      LAST ENTRY — DAY {lastTurn.dayNumber}
                    </Text>
                    <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 10, color: Colors.mist, letterSpacing: 0.5 }}>
                      {ACTION_LABELS[lastTurn.action].toUpperCase()}
                    </Text>
                  </View>
                  <TypewriterText
                    key={`journal-${lastTurn.dayNumber}-${lastTurn.action}`}
                    text={lastTurn.narrativeSummary || 'The day passed without incident.'}
                    interval={textInterval}
                    forceComplete={forceComplete}
                    onComplete={() => setLastEntryFinished(true)}
                    style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 15, lineHeight: 22, color: Colors.ink }}
                  />
                  {hasDelta && (
                    <>
                      <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 10 }} />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {renderDelta(netFood, 'food', '🍎')}
                        {renderDelta(netGold, 'gold', '🪙')}
                        {renderDelta(netHealth, 'health', '❤️')}
                        {renderDelta(netMorale, 'morale', '🎭')}
                      </View>
                    </>
                  )}
                </>
              ) : (
                // Location Content
                <>
                  <TypewriterText
                    key={`loc-${location.id}-${showingLastEntry}`}
                    text={displayLocationText}
                    interval={textInterval}
                    forceComplete={forceComplete}
                    onComplete={() => setLocDescFinished(true)}
                    style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 15, lineHeight: 22, color: Colors.inkLight }}
                  />
                  {randomText && locDescFinished && (
                    <>
                      <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 8 }} />
                      <TypewriterText
                        key={`loc-random-${location.id}-${showingLastEntry}`}
                        text={displayRandomText || ''}
                        interval={textInterval}
                        forceComplete={forceComplete}
                        onComplete={() => setRandomTextFinished(true)}
                        style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 15, lineHeight: 22, color: Colors.inkLight }}
                      />
                    </>
                  )}
                </>
              )}
            </TouchableOpacity>

            {/* Actions (only shown if not showing last journal entry) */}
            {!showingLastEntry && (
              <>
                <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                  <SectionHeader label="Actions" right="Choose wisely" centered />
                  <ActionGrid actions={actionButtons} />
                </View>
                {npcActionButtons.length > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                    <SectionHeader label="NPC" right="Talk or take your chances" centered />
                    <ActionGrid actions={npcActionButtons} />
                  </View>
                )}
              </>
            )}

            {/* Companions */}
            {gameState.companions.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader label="Companions" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 2 }}>
                  {gameState.companions.map(c => (
                    <CompanionIcon 
                      key={c.id} 
                      id={c.id}
                      name={c.name} 
                      archetype={c.archetype} 
                      loyalty={c.loyalty.value} 
                      isSelected={selectedCompanionId === c.id}
                      onPress={handleCompanionPress}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

          </View>
        </View>
      </ScrollView>
      {showingLastEntry ? (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setShowingLastEntry(false);
          }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : (
        isLocationTyping && !forceComplete && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setForceComplete(true)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        )
      )}
      <CompanionDetailModal
        visible={selectedCompanionId !== null}
        companionId={selectedCompanionId}
        onClose={() => setSelectedCompanionId(null)}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────

function statColor(value: number): string {
  if (value >= 75) return Colors.greenLight;
  if (value >= 50) return '#C8A020'; // yellow
  if (value >= 25) return '#C86A20'; // orange
  return '#B83030';                  // red
}

const ARCHETYPE_COLOR: Record<CompanionArchetype, string> = {
  [CompanionArchetype.Warrior]:   '#8B1A1A',
  [CompanionArchetype.Scout]:     '#3D6B4A',
  [CompanionArchetype.Healer]:    '#2E6B8B',
  [CompanionArchetype.Rogue]:     '#4A3D6B',
  [CompanionArchetype.Sage]:      '#7C6B2E',
  [CompanionArchetype.Bard]:      '#7C3D6B',
  [CompanionArchetype.Mercenary]: '#5C4A3D',
  [CompanionArchetype.Animal]:    '#4A6B3D',
};

function CompanionIcon({
  id,
  name,
  archetype,
  loyalty,
  isSelected,
  onPress,
}: {
  id: string;
  name: string;
  archetype: CompanionArchetype;
  loyalty: number;
  isSelected?: boolean;
  onPress?: (id: string) => void;
}) {
  const color    = ARCHETYPE_COLOR[archetype];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity 
      onPress={() => onPress?.(id)}
      activeOpacity={0.7}
      style={{ alignItems: 'center', width: 56 }}
    >
      <View style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: isSelected ? 3 : 2,
        borderColor: isSelected ? Colors.gold : '#C8B89A',
      }}>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 14, color: Colors.parchment }}>
          {initials}
        </Text>
      </View>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 9, color: Colors.ink, marginTop: 4, textAlign: 'center', letterSpacing: 0.5 }} numberOfLines={2}>
        {name}
      </Text>
      <View style={{ width: 36, height: 3, backgroundColor: '#C8B89A', borderRadius: 2, marginTop: 3 }}>
        <View style={{ width: `${loyalty}%`, height: '100%', backgroundColor: color, borderRadius: 2, opacity: 0.7 }} />
      </View>
    </TouchableOpacity>
  );
}

function StatBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct   = Math.min(Math.max((value / max) * 100, 0), 100);
  const color = statColor(pct);

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: Colors.mist, flexShrink: 0 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 4, backgroundColor: '#C8B89A', borderRadius: 2 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color, width: 26, textAlign: 'right' }}>
        {Math.round(value)}
      </Text>
    </View>
  );
}

function SectionHeader({ label, right, centered }: { label: string; right?: string; centered?: boolean }) {
  if (centered) {
    return (
      <View style={{ alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#C8B89A', paddingBottom: 8, marginBottom: 12 }}>
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, letterSpacing: 2, color: Colors.mist }}>
          {label.toUpperCase()}
        </Text>
        {right && (
          <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 12, color: Colors.ink, marginTop: 2 }}>{right}</Text>
        )}
      </View>
    );
  }
  return (
    <View className="flex-row justify-between items-center border-b border-parchment-deep pb-1 mb-3">
      <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Text>
      {right && (
        <Text className="font-body-italic text-ink" style={{ fontSize: 12 }}>{right}</Text>
      )}
    </View>
  );
}

type ActionDef = {
  label:   string;
  sub:     string;
  variant: 'primary' | 'secondary' | 'default' | 'npc' | 'move' | 'forceMarch';
  onPress: () => void;
  disabled?: boolean;
  isLucky?: boolean;
};

function ActionGrid({ actions }: { actions: ActionDef[] }) {
  const rows: ActionDef[][] = [];
  for (let i = 0; i < actions.length; i += 3) {
    rows.push(actions.slice(i, i + 3));
  }
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map(btn => <ActionButton key={btn.label} {...btn} />)}
          {row.length < 3 && <View style={{ flex: 3 - row.length }} />}
        </View>
      ))}
    </View>
  );
}

function ActionButton({ label, sub, variant, onPress, disabled, isLucky }: ActionDef) {
  const bg          = variant === 'primary'    ? Colors.blood
                    : variant === 'secondary'  ? Colors.gold
                    : variant === 'npc'        ? '#D8EEF9'
                    : variant === 'move'       ? '#3D6B4A'
                    : variant === 'forceMarch' ? '#1E4E2C'
                    : Colors.ink;
  let borderColor = variant === 'primary'    ? '#C94040'
                    : variant === 'secondary'  ? '#D4A017'
                    : variant === 'npc'        ? '#7BAFCC'
                    : variant === 'move'       ? '#5E8A69'
                    : variant === 'forceMarch' ? '#2F6A41'
                    : '#3A2E1C';
  const textColor   = variant === 'secondary' || variant === 'npc' ? Colors.ink : Colors.parchment;

  if (isLucky && variant === 'move') {
    borderColor = '#B8860B'; // Gold border highlight
  }

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      activeOpacity={disabled ? 1 : 0.75}
      style={{
        flex: 1,
        backgroundColor: bg,
        borderWidth: isLucky && variant === 'move' ? 2.2 : 1.5,
        borderColor,
        borderRadius: 3,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        shadowColor: isLucky && variant === 'move' ? '#B8860B' : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: disabled ? 0 : 0.35,
        shadowRadius: 3,
        elevation: disabled ? 0 : 4,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: textColor, fontSize: 12, letterSpacing: 1 }}>
        {isLucky && variant === 'move' ? '✨ ' : ''}{label}
      </Text>
      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: textColor, fontSize: 11, marginTop: 2, opacity: 0.75, textAlign: 'center' }}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}
