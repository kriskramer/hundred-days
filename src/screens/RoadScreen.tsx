import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, Animated } from 'react-native';
import { GameState, PlayerAction, ACTION_LABELS, WeatherType, CompanionArchetype, TurnRecord, Companion, CompanionPassiveBonus } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation, getLocationRandomText } from '@data/locations';
import { isBossLocation } from '@engine/bosses';
import { hasEligibleDialogue } from '@engine/EventSystem';
import { findDialogueForLocation } from '@engine/DialogueEngine';
import { Colors } from '@theme';
import { confirmAction } from '@utils/confirmAction';
import { TypewriterText } from '@components';
import * as Haptics from 'expo-haptics';

interface Props {
  gameState:   GameState;
  engine:      TurnEngine | null;
  onToast:     (msg: string) => void;
  onOpenShop?: () => void;
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

function getPassiveBonusDescription(bonus: CompanionPassiveBonus): string {
  const parts: string[] = [];
  if (bonus.luckModifier) {
    parts.push(`Luck Modifier: +${Math.round(bonus.luckModifier * 100)}%`);
  }
  if (bonus.foodCostModifier) {
    parts.push(`Food Cost Modifier: -${Math.round((1 - bonus.foodCostModifier) * 100)}%`);
  }
  if (bonus.foragingBonus) {
    parts.push(`Foraging: +${bonus.foragingBonus}`);
  }
  if (bonus.goldFindBonus) {
    parts.push(`Gold Find: +${Math.round(bonus.goldFindBonus * 100)}%`);
  }
  if (bonus.moralePerTurn) {
    parts.push(`Morale: +${bonus.moralePerTurn}/turn`);
  }
  if (bonus.healthRegenPerTurn) {
    parts.push(`Health Regen: +${bonus.healthRegenPerTurn} HP/turn`);
  }
  if (bonus.movementBonus) {
    parts.push(`Movement Speed: +${Math.round(bonus.movementBonus * 100)}%`);
  }
  if (bonus.eventMitigation && bonus.eventMitigation.length > 0) {
    parts.push(`Mitigates: ${bonus.eventMitigation.join(', ')}`);
  }
  if (bonus.revealHiddenLocations) {
    parts.push(`Reveals hidden locations`);
  }
  return parts.length > 0 ? parts.join(', ') : 'None';
}

function CompanionDetailCard({ companion, onClose }: { companion: Companion; onClose: () => void }) {
  const loyalty = companion.loyalty.value;
  const tier = loyalty >= 60 ? 'Loyal' : loyalty >= 30 ? 'Wavering' : 'Restless';
  const loyaltyColor = loyalty >= 60 ? Colors.green : loyalty >= 30 ? '#C8A020' : Colors.blood;
  const bonusDesc = getPassiveBonusDescription(companion.passiveBonus);

  return (
    <View style={{
      borderWidth: 1.5,
      borderColor: Colors.gold,
      borderRadius: 4,
      padding: 14,
      marginBottom: 16,
      backgroundColor: '#EDE4CF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
      position: 'relative',
      width: '100%',
    }}>
      {/* Close button */}
      <TouchableOpacity 
        onPress={onClose} 
        style={{ 
          position: 'absolute', 
          right: 12, 
          top: 10, 
          padding: 4 
        }}
      >
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 13, color: Colors.inkLight }}>✕</Text>
      </TouchableOpacity>

      <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: Colors.ink, marginBottom: 2 }}>
        {companion.name}
      </Text>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: Colors.mist, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
        Level {companion.level.current} • {companion.archetype}
      </Text>

      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 14, color: Colors.inkLight, marginBottom: 12, lineHeight: 18 }}>
        {companion.description}
      </Text>

      {/* Stats and details */}
      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 10 }}>
        {/* Loyalty */}
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: Colors.inkLight, letterSpacing: 0.5 }}>
          Loyalty: {loyalty}/100 ({tier})
        </Text>
        <View style={{ height: 6, backgroundColor: '#C8B89A', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
          <View style={{ width: `${loyalty}%`, height: '100%', backgroundColor: loyaltyColor, borderRadius: 3 }} />
        </View>

        {/* Combat Power & Food Cost */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: Colors.inkLight }}>
            ⚔ Combat Power: <Text style={{ fontFamily: 'Cinzel_600SemiBold' }}>+{companion.combatPower}</Text>
          </Text>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: Colors.inkLight }}>
            🍎 Food Cost: <Text style={{ fontFamily: 'Cinzel_600SemiBold' }}>{companion.foodCostPerTurn}/turn</Text>
          </Text>
        </View>

        {/* Passive Bonus */}
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: Colors.mist, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
            Passive Bonus
          </Text>
          <Text style={{ fontFamily: 'CrimsonText_400Regular', fontSize: 13, color: Colors.ink }}>
            {bonusDesc}
          </Text>
        </View>

        {/* Muted warning line when loyalty < 30 */}
        {loyalty < 30 && (
          <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 12, color: Colors.blood, marginTop: 6, alignSelf: 'center' }}>
            ⚠ Growing restless... Keep morale high or perform rallies.
          </Text>
        )}
      </View>
    </View>
  );
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
  const [randomText, setRandomText]                   = useState<string | null>(() => getLocationRandomText(location));
  const [forceComplete, setForceComplete]             = useState(false);
  const [locDescFinished, setLocDescFinished]         = useState(false);

  const activeDialogue = findDialogueForLocation(gameState.currentLocationId, gameState);
  const dialogueCue    = activeDialogue ? (DIALOGUE_CUES[activeDialogue.id] || 'Someone is nearby, looking to speak with you.') : null;
  const baseLocationText = location.locationText || '';
  const currentRandomText = (location.randomTexts && randomText && location.randomTexts.includes(randomText))
    ? randomText
    : null;
  const displayLocationText = (dialogueCue && !currentRandomText)
    ? `${baseLocationText}\n\n${dialogueCue}`
    : baseLocationText;
  const displayRandomText = (dialogueCue && currentRandomText)
    ? `${currentRandomText}\n\n${dialogueCue}`
    : currentRandomText;

  const lastTurn = gameState.turnHistory[gameState.turnHistory.length - 1];
  const lastTurnKey = lastTurn ? `${lastTurn.dayNumber}_${lastTurn.action}` : null;
  const prevTurnKeyRef = useRef<string | null>(lastTurnKey);

  useEffect(() => {
    setRandomText(getLocationRandomText(location));
  }, [gameState.currentLocationId]);

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
    setLocDescFinished(false);
  }, [gameState.currentLocationId, showingLastEntry]);

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

  const actionButtons = bossNearby
    ? [
        {
          label: 'Fight Boss',
          sub: 'Begin combat',
          variant: 'primary' as const,
          onPress: () => submit({ action: PlayerAction.Move, forcedMarch: false }),
        },
      ]
    : [
        { label: 'Move',         sub: '1 loc · 1 food',    variant: 'primary' as const,   onPress: () => submit({ action: PlayerAction.Move, forcedMarch: false }) },
        { label: 'Force March',  sub: '2 locs · 1.5 food', variant: 'primary' as const,   onPress: () => submit({ action: PlayerAction.Move, forcedMarch: true  }) },
        ...(location.hasShop ? [{ label: 'Trade',      sub: 'Buy · Sell',     variant: 'secondary' as const, onPress: () => onOpenShop?.()                                    }] : []),
        ...(location.isTown  ? [{ label: 'Rest at Inn', sub: '+25 HP · 10g', variant: 'default'   as const, onPress: () => submit({ action: PlayerAction.Rest, atInn: true }) }] : []),
        { label: 'Forage',       sub: 'Gain food',          variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Hunt, method: 'forage'   }) },
        { label: 'Rally',        sub: 'Boost morale',       variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Rally                                          }) },
        { label: 'Make Camp',    sub: '+10 HP · rest',      variant: 'default' as const,   onPress: () => submit({ action: PlayerAction.Camp }) },
      ];

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

    const moveFoodThreshold = params.action === PlayerAction.Move && params.forcedMarch ? 1.5 : 1;

    if (params.action === PlayerAction.Move && gameState.resources.food < moveFoodThreshold) {
      Alert.alert(
        'March Hungry?',
        'You can still move without enough food, but each hungry march costs health and morale, and the penalty grows if you keep pushing.',
        [
          { text: 'Stay',  style: 'cancel' },
          { text: 'March', onPress: () => engine.submitAction(params).catch(console.error) },
        ]
      );
      return;
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
                {location.isTown  && <Text style={{ fontSize: 17, lineHeight: 26 }}>🏰</Text>}
                {location.hasShop && <Text style={{ fontSize: 17, lineHeight: 26 }}>⚖</Text>}
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
              {(dangerNearby || dialogueNearby || bossNearby) && (
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
                  {currentRandomText && locDescFinished && (
                    <>
                      <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 8 }} />
                      <TypewriterText
                        key={`loc-random-${location.id}-${showingLastEntry}`}
                        text={displayRandomText || ''}
                        interval={textInterval}
                        forceComplete={forceComplete}
                        style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 15, lineHeight: 22, color: Colors.inkLight }}
                      />
                    </>
                  )}
                </>
              )}
            </TouchableOpacity>

            {/* Actions / Next button */}
            {showingLastEntry ? (
              <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setShowingLastEntry(false);
                  }}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: Colors.blood,
                    borderWidth: 1.5,
                    borderColor: '#C94040',
                    borderRadius: 3,
                    alignItems: 'center',
                    paddingVertical: 14,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 3,
                    elevation: 4,
                  }}
                >
                  <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: Colors.parchment, fontSize: 13, letterSpacing: 2 }}>
                    NEXT
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                <SectionHeader label="Actions" right="Choose wisely" centered />
                <ActionGrid actions={actionButtons} />
              </View>
            )}

            {/* Companions */}
            {gameState.companions.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader label="Companions" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 2, marginBottom: selectedCompanionId ? 12 : 0 }}>
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
                {selectedCompanionId && (() => {
                  const c = gameState.companions.find(comp => comp.id === selectedCompanionId);
                  if (!c) return null;
                  return <CompanionDetailCard companion={c} onClose={() => setSelectedCompanionId(null)} />;
                })()}
              </View>
            )}

          </View>
        </View>
      </ScrollView>
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
  variant: 'primary' | 'secondary' | 'default';
  onPress: () => void;
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

function ActionButton({ label, sub, variant, onPress }: ActionDef) {
  const bg          = variant === 'primary'   ? Colors.blood
                    : variant === 'secondary' ? Colors.gold
                    : Colors.ink;
  const borderColor = variant === 'primary'   ? '#C94040'
                    : variant === 'secondary' ? '#D4A017'
                    : '#3A2E1C';
  const textColor   = variant === 'secondary' ? Colors.ink : Colors.parchment;

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      activeOpacity={0.75}
      style={{
        flex: 1,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor,
        borderRadius: 3,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: textColor, fontSize: 12, letterSpacing: 1 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: textColor, fontSize: 11, marginTop: 2, opacity: 0.75, textAlign: 'center' }}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}

