import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { GameState } from '@engine/types';
import { Colors } from '@theme';
import { computeEquippedBonuses, inventoryFromResources, XP_THRESHOLDS } from '@engine';

export function StatusBar({ gameState }: { gameState: GameState }) {
  const [showStats, setShowStats] = useState(false);
  const foodLow  = gameState.resources.food < 3;
  const foodWarn = gameState.resources.food < 5;

  return (
    <View style={{ backgroundColor: Colors.ink, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.inkLight }}>
      <StatusPill
        label="DAY"
        value={`${gameState.dayNumber}`}
        sub="/ 100"
      />
      <StatusPill
        label="LOC"
        value={String(gameState.currentLocationId)}
        sub="/125"
      />
      <StatusPill
        label="FOOD"
        value={gameState.resources.food.toFixed(1)}
        valueColor={foodLow ? '#ff8080' : foodWarn ? '#ffcc44' : undefined}
      />
      <StatusPill label="GOLD" value={String(gameState.resources.gold)} />
      <StatusPill
        label="LV"
        value={String(gameState.player.level)}
        onPress={() => setShowStats(true)}
      />

      <CharacterSheetModal
        visible={showStats}
        gameState={gameState}
        onClose={() => setShowStats(false)}
      />
    </View>
  );
}

function StatusPill({
  label,
  value,
  sub,
  valueColor,
  flex = 1,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  flex?: number;
  onPress?: () => void;
}) {
  const content = (
    <View style={{ flex, alignItems: 'center', paddingVertical: 10 }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 9, color: '#A0B8AA', letterSpacing: 1, marginBottom: 2 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: valueColor ?? Colors.parchment, letterSpacing: 0.5 }}>
          {value}
        </Text>
        {sub && (
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#A0B8AA' }}>{sub}</Text>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flex }}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

interface CharacterSheetModalProps {
  visible: boolean;
  gameState: GameState;
  onClose: () => void;
}

function CharacterSheetModal({ visible, gameState, onClose }: CharacterSheetModalProps) {
  const player = gameState.player;
  const base = player.stats;

  // Compute equipment bonuses
  const inventory = inventoryFromResources(gameState.resources);
  const equippedBonuses = computeEquippedBonuses(inventory);

  // Compute XP needed for next level
  const currentXP = player.xp;
  const isMaxLevel = player.level >= 10;
  const nextLevelXP = isMaxLevel ? 1200 : XP_THRESHOLDS[player.level];
  const prevLevelXP = player.level === 1 ? 0 : XP_THRESHOLDS[player.level - 1];
  const xpNeeded = isMaxLevel ? 0 : Math.max(0, nextLevelXP - currentXP);

  // Calculate percentage within the current level's XP range
  const xpRange = nextLevelXP - prevLevelXP;
  const xpCurrentInRange = Math.max(0, currentXP - prevLevelXP);
  const xpProgressPercent = isMaxLevel ? 1 : xpRange > 0 ? Math.min(1, xpCurrentInRange / xpRange) : 0;

  // Format Status Effect ID
  const formatStatusEffectId = (id: string) => {
    return id
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  // Render a stat row showing Base + Bonus
  const renderStatRow = (label: string, baseVal: number, bonusVal?: number) => {
    const finalVal = baseVal + (bonusVal ?? 0);
    return (
      <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E8D5B0' }}>
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 13, color: '#2D1F0A' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 13, color: '#2D1F0A', fontWeight: 'bold' }}>
            {finalVal}
          </Text>
          {bonusVal && bonusVal !== 0 ? (
            <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: bonusVal > 0 ? '#4A8A5A' : '#8B1A1A', marginLeft: 4 }}>
              ({bonusVal > 0 ? '+' : ''}{bonusVal} from gear)
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  // Build active equipment passive lines
  const eqLines: string[] = [];
  const pushEq = (label: string, val: number | undefined, suffix = '') => {
    if (val) eqLines.push(`${label}: ${val > 0 ? '+' : ''}${val}${suffix}`);
  };
  pushEq('Attack',              equippedBonuses.attackBonus);
  pushEq('Defense',             equippedBonuses.defenseBonus);
  pushEq('Speed',               equippedBonuses.speedBonus);
  pushEq('Luck',                equippedBonuses.luckModifier ? Math.round(equippedBonuses.luckModifier * 100) : undefined, '%');
  pushEq('Food cost reduction', equippedBonuses.foodCostReduction ? Math.round(equippedBonuses.foodCostReduction * 100) : undefined, '%');
  pushEq('Foraging bonus',      equippedBonuses.foragingBonus, ' food');
  pushEq('Morale per turn',     equippedBonuses.moralePerTurn);
  pushEq('Gold find bonus',     equippedBonuses.goldFindBonus);
  pushEq('Phys. resist bypass', equippedBonuses.physicalResistanceBonus ? Math.round(equippedBonuses.physicalResistanceBonus * 100) : undefined, '%');
  pushEq('March food cost reduction', equippedBonuses.forcedMarchCostReduction ? Math.round(equippedBonuses.forcedMarchCostReduction * 100) : undefined, '%');
  pushEq('Loyalty bonus',       equippedBonuses.companionLoyaltyBonus ? Math.round(equippedBonuses.companionLoyaltyBonus * 100) : undefined, '%');
  if (equippedBonuses.weatherProtection)    eqLines.push('Weather protection');
  if (equippedBonuses.immuneToTerrify)      eqLines.push('Immune to terrify');
  if (equippedBonuses.revealHiddenLocations) eqLines.push('Reveals hidden caches');

  // Build companion passive lines
  const compLines: { companionName: string; text: string }[] = [];
  for (const comp of gameState.companions) {
    const lines: string[] = [];
    const b = comp.passiveBonus;
    if (b.moralePerTurn) lines.push(`+${b.moralePerTurn} Morale/turn`);
    if (b.foragingBonus) lines.push(`+${b.foragingBonus} foraging food`);
    if (b.luckModifier)  lines.push(`+${Math.round(b.luckModifier * 100)}% Luck`);
    if (b.foodCostModifier) lines.push(`-${Math.round((1 - b.foodCostModifier) * 100)}% Food cost`);
    if (b.healthRegenPerTurn) lines.push(`+${b.healthRegenPerTurn} Health regen/turn`);
    if (b.movementBonus) lines.push(`+${Math.round(b.movementBonus * 100)}% movement speed`);
    if (b.eventMitigation && b.eventMitigation.length > 0) {
      lines.push(`prevents ${b.eventMitigation.join(', ')}`);
    }
    if (b.revealHiddenLocations) lines.push('reveals hidden caches');
    compLines.push({
      companionName: comp.name,
      text: lines.join(', ') || 'No passive effects',
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F5EAD6' }}>

        {/* Header */}
        <View style={{
          backgroundColor:   '#1A1208',
          paddingTop:        48,
          paddingBottom:     14,
          paddingHorizontal: 20,
          flexDirection:     'row',
          alignItems:        'center',
          justifyContent:    'space-between',
          borderBottomWidth: 2,
          borderBottomColor: '#B8860B',
        }}>
          <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: '#F5EAD6', letterSpacing: 1.5 }}>
            {player.name.toUpperCase()}
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#6B7C6E', letterSpacing: 1 }}>
              CLOSE ✕
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* LEVEL & XP SECTION */}
          <View style={{ marginBottom: 24, backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 18, color: '#1A1208' }}>
                LEVEL {player.level}
              </Text>
              <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#6B7C6E' }}>
                {isMaxLevel ? 'MAX LEVEL' : `XP: ${currentXP} / ${nextLevelXP}`}
              </Text>
            </View>

            {/* XP Progress Bar */}
            <View style={{ height: 10, backgroundColor: '#D4C5A0', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
              <View style={{ height: '100%', width: `${Math.round(xpProgressPercent * 100)}%`, backgroundColor: '#B8860B', borderRadius: 5 }} />
            </View>

            {!isMaxLevel && (
              <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 13, color: '#2D1F0A' }}>
                {xpNeeded} XP needed for next level.
              </Text>
            )}
          </View>

          {/* HEALTH SECTION */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 14, color: '#B8860B', marginBottom: 8, letterSpacing: 1 }}>
              VITALITY
            </Text>
            <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 13, color: '#2D1F0A' }}>
                  HEALTH POINTS
                </Text>
                <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 14, color: '#8B1A1A' }}>
                  {player.health} / {base.maxHealth}
                </Text>
              </View>

              {/* Health Progress Bar */}
              <View style={{ height: 10, backgroundColor: '#D4C5A0', borderRadius: 5, overflow: 'hidden' }}>
                <View style={{
                  height: '100%',
                  width: `${Math.round(Math.max(0, Math.min(1, player.health / base.maxHealth)) * 100)}%`,
                  backgroundColor: '#8B1A1A',
                  borderRadius: 5
                }} />
              </View>
            </View>
          </View>

          {/* STATS SECTION */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 14, color: '#B8860B', marginBottom: 8, letterSpacing: 1 }}>
              CORE ATTRIBUTES
            </Text>
            <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, paddingHorizontal: 16, paddingVertical: 8 }}>
              {renderStatRow('Attack', base.attack, equippedBonuses.attackBonus)}
              {renderStatRow('Defense', base.defense, equippedBonuses.defenseBonus)}
              {renderStatRow('Speed', base.speed, equippedBonuses.speedBonus)}
              {renderStatRow('Endurance', base.endurance)}
              {renderStatRow('Perception', base.perception)}
              {renderStatRow('Leadership', base.leadership)}
            </View>
          </View>

          {/* ABILITIES & PASSIVES SECTION */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 14, color: '#B8860B', marginBottom: 8, letterSpacing: 1 }}>
              ABILITIES & CONDITIONS
            </Text>

            {/* Status Effects */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color: '#2D1F0A', marginBottom: 4 }}>
                Active Conditions
              </Text>
              <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, padding: 12 }}>
                {player.statusEffects.length === 0 ? (
                  <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 13, color: '#6B7C6E' }}>
                    No active conditions (Healthy).
                  </Text>
                ) : (
                  player.statusEffects.map((eff, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#8B1A1A' }}>
                        {formatStatusEffectId(eff.id)}
                      </Text>
                      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 12, color: '#6B7C6E' }}>
                        {eff.durationTurns} {eff.durationTurns === 1 ? 'turn' : 'turns'} remaining
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* Equipment Passives */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color: '#2D1F0A', marginBottom: 4 }}>
                Equipment Perks
              </Text>
              <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, padding: 12 }}>
                {eqLines.length === 0 ? (
                  <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 13, color: '#6B7C6E' }}>
                    No passive perks active from equipment.
                  </Text>
                ) : (
                  eqLines.map((line, idx) => (
                    <Text key={idx} style={{ fontFamily: 'CrimsonText_400Regular', fontSize: 13, color: '#2D1F0A', paddingVertical: 2 }}>
                      • {line}
                    </Text>
                  ))
                )}
              </View>
            </View>

            {/* Companion Passives */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color: '#2D1F0A', marginBottom: 4 }}>
                Companion Support
              </Text>
              <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 4, padding: 12 }}>
                {compLines.length === 0 ? (
                  <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 13, color: '#6B7C6E' }}>
                    No companions in the party.
                  </Text>
                ) : (
                  compLines.map((cLine, idx) => (
                    <View key={idx} style={{ paddingVertical: 4 }}>
                      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#B8860B' }}>
                        {cLine.companionName}
                      </Text>
                      <Text style={{ fontFamily: 'CrimsonText_400Regular', fontSize: 12, color: '#2D1F0A', marginLeft: 8 }}>
                        {cLine.text}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>

          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
