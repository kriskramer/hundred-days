import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '@theme';
import { useCompanions, useReputation } from '@store/gameStore';

interface CompanionDetailModalProps {
  visible: boolean;
  companionId: string | null;
  onClose: () => void;
}

export function CompanionDetailModal({ visible, companionId, onClose }: CompanionDetailModalProps) {
  const companions = useCompanions();
  const playerRep = useReputation();

  const companion = companions.find(c => c.id === companionId);
  if (!companion) return null;

  const loyalty = companion.loyalty.value;
  const desertsBelow = companion.loyalty.desertsBelow;
  const complainsBelow = companion.loyalty.complainsBelow;

  // Determine Loyalty Tier
  let loyaltyTier = 'Disloyal';
  let loyaltyColor = Colors.blood;
  if (loyalty >= 75) {
    loyaltyTier = 'Devoted';
    loyaltyColor = '#4A8A5A'; // Emerald Green
  } else if (loyalty >= 50) {
    loyaltyTier = 'Steady';
    loyaltyColor = Colors.gold;
  } else if (loyalty >= 30) {
    loyaltyTier = 'Wavering';
    loyaltyColor = '#C8A020'; // Dark Gold/Orange
  }

  // Determine Reputation Alignment
  const prefRep = companion.preferredReputation;
  const currentRepVal = playerRep?.value ?? 50;
  let repAligned = true;
  let repText = 'No Preference';

  if (prefRep) {
    const min = prefRep.min;
    const max = prefRep.max;
    if (min !== undefined && max !== undefined) {
      repText = `Preferred: ${min} - ${max}`;
      repAligned = currentRepVal >= min && currentRepVal <= max;
    } else if (min !== undefined) {
      repText = `Preferred: ${min}+`;
      repAligned = currentRepVal >= min;
    } else if (max !== undefined) {
      repText = `Preferred: under ${max}`;
      repAligned = currentRepVal <= max;
    }
  }

  // Format passive support benefits
  const passive = companion.passiveBonus;
  const passiveLines: string[] = [];
  if (passive.moralePerTurn) {
    passiveLines.push(`+${passive.moralePerTurn} Morale per turn`);
  }
  if (passive.foragingBonus) {
    passiveLines.push(`+${passive.foragingBonus} Foraging Food per turn`);
  }
  if (passive.luckModifier) {
    passiveLines.push(`+${Math.round(passive.luckModifier * 100)}% Luck`);
  }
  if (passive.foodCostModifier) {
    passiveLines.push(`-${Math.round((1 - passive.foodCostModifier) * 100)}% Food cost`);
  }
  if (passive.healthRegenPerTurn) {
    passiveLines.push(`+${passive.healthRegenPerTurn} Health regen/turn`);
  }
  if (passive.movementBonus) {
    passiveLines.push(`+${Math.round(passive.movementBonus * 100)}% Movement speed`);
  }
  if (passive.eventMitigation && passive.eventMitigation.length > 0) {
    const formattedMitigation = passive.eventMitigation
      .map(e => e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(', ');
    passiveLines.push(`Mitigates: ${formattedMitigation}`);
  }
  if (passive.revealHiddenLocations) {
    passiveLines.push('Reveals hidden location caches');
  }

  const isLowLoyalty = loyalty < complainsBelow;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerTitle}>
            <Text style={s.subLabel}>PARTY COMPANION</Text>
            <Text style={s.companionName}>{companion.name}</Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.closeBtn}>
            <Text style={s.closeBtnText}>CLOSE ✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Archetype & Bio */}
          <View style={s.section}>
            <Text style={s.archetypeTitle}>
              LEVEL {companion.level.current} • {companion.archetype.toUpperCase()}
            </Text>
            <View style={s.card}>
              <Text style={s.bioText}>{companion.description}</Text>
            </View>
          </View>

          {/* Loyalty Section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>LOYALTY & TIES</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Loyalty Tier</Text>
                <Text style={[s.fieldValueVal, { color: loyaltyColor }]}>
                  {loyaltyTier.toUpperCase()} ({loyalty}/100)
                </Text>
              </View>

              {/* Progress bar */}
              <View style={s.barContainer}>
                <View style={[s.barFill, { width: `${loyalty}%`, backgroundColor: loyaltyColor }]} />
              </View>

              <View style={s.rowBetween}>
                <Text style={s.subFieldText}>Desertion Threshold: below {desertsBelow}</Text>
                <Text style={s.subFieldText}>Grievance Threshold: below {complainsBelow}</Text>
              </View>

              {isLowLoyalty && (
                <View style={s.warningBanner}>
                  <Text style={s.warningText}>
                    ⚠ Wavering devotion! Resolve their grievances through rallies or high morale before they desert the company.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Reputation Alignment */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>REPUTATION ALIGNMENT</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Reputation Preference</Text>
                <Text style={s.fieldValueVal}>{repText}</Text>
              </View>
              <View style={s.rowBetween}>
                <Text style={s.subFieldText}>Your Reputation: {currentRepVal}</Text>
                {prefRep ? (
                  <View style={[s.badge, { backgroundColor: repAligned ? '#4A8A5A' : Colors.blood }]}>
                    <Text style={s.badgeText}>
                      {repAligned ? 'ALIGNED' : 'MISALIGNED'}
                    </Text>
                  </View>
                ) : (
                  <View style={[s.badge, { backgroundColor: '#6B7C6E' }]}>
                    <Text style={s.badgeText}>NEUTRAL</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Combat & Upkeep */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>COMBAT & UPKEEP</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Combat Power</Text>
                <Text style={s.fieldValueVal}>⚔ {companion.combatPower}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.rowBetween}>
                <Text style={s.fieldLabel}>Food Consumption</Text>
                <Text style={s.fieldValueVal}>🍎 {companion.foodCostPerTurn.toFixed(1)} / turn</Text>
              </View>
            </View>
          </View>

          {/* Passive Bonuses */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>PASSIVE SUPPORT EFFECTS</Text>
            <View style={s.card}>
              {passiveLines.length === 0 ? (
                <Text style={s.noPassivesText}>No active passive support benefits.</Text>
              ) : (
                passiveLines.map((line, idx) => (
                  <View key={idx} style={s.supportRow}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.supportText}>{line}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  archetypeTitle: {
    color: '#B8860B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  badge: {
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#F5EAD6',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  barContainer: {
    backgroundColor: '#D4C5A0',
    borderRadius: 4,
    height: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 4,
    height: '100%',
  },
  bioText: {
    color: '#2D1F0A',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 14,
    lineHeight: 20,
  },
  bullet: {
    color: '#B8860B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    marginRight: 8,
  },
  card: {
    backgroundColor: '#E8D5B0',
    borderColor: '#D4B880',
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeBtnText: {
    color: '#6B7C6E',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 12,
    letterSpacing: 1,
  },
  companionName: {
    color: '#F5EAD6',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 20,
    marginTop: 2,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  divider: {
    backgroundColor: '#D4B880',
    height: 1,
    marginVertical: 8,
  },
  fieldLabel: {
    color: '#2D1F0A',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 12,
  },
  fieldValueVal: {
    color: '#2D1F0A',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 13,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#1A1208',
    borderBottomColor: '#B8860B',
    borderBottomWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  headerTitle: {
    flex: 1,
  },
  noPassivesText: {
    color: '#6B7C6E',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 13,
    textAlign: 'center',
  },
  root: {
    backgroundColor: '#F5EAD6',
    flex: 1,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#1A1208',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  subFieldText: {
    color: '#6B7C6E',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 11,
  },
  subLabel: {
    color: '#B8860B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 9,
    letterSpacing: 2,
  },
  supportRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginVertical: 4,
  },
  supportText: {
    color: '#2D1F0A',
    flex: 1,
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 13,
  },
  warningBanner: {
    backgroundColor: '#EACAB2',
    borderColor: Colors.blood,
    borderRadius: 2,
    borderWidth: 1,
    marginTop: 12,
    padding: 8,
  },
  warningText: {
    color: Colors.blood,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 12,
    lineHeight: 16,
  },
});
