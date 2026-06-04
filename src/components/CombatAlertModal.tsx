import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { GameEvent } from '@engine/types';

interface CombatAlertModalProps {
  visible: boolean;
  event: GameEvent | null;
  locationName: string;
  isManualCombat: boolean;
  onConfirm: () => void;
}

export function CombatAlertModal({
  visible,
  event,
  locationName,
  isManualCombat,
  onConfirm,
}: CombatAlertModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible) return null;

  // Determine headers and descriptions based on the event tags
  let title = 'TO ARMS!';
  let subtitle = 'PREPARE FOR BATTLE';
  let description = 'Something blocks your path. Steel yourself.';
  let isAmbush = false;
  let isBoss = false;

  if (event) {
    const tags = event.tags ?? [];
    isAmbush = tags.includes('location_ambush') || tags.includes('hazard_ambush') || event.id.includes('ambush');
    isBoss = tags.includes('boss');

    if (isBoss) {
      title = '💀 BOSS FIGHT!';
      subtitle = event.name.toUpperCase();
      description = event.description;
    } else if (isAmbush) {
      title = '⚔️ AMBUSHED!';
      subtitle = event.name.toUpperCase();
      description = event.description;
    } else {
      title = '⚔️ ATTACK!';
      subtitle = event.name.toUpperCase();
      description = event.description;
    }
  } else if (isManualCombat) {
    title = '⚔️ ENGAGE ENEMY';
    subtitle = `SKIRMISH AT ${locationName.toUpperCase()}`;
    description = 'You choose to confront the dangers lurking in this place. Prepare your companions and your weapons.';
  }

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Decorative Border */}
          <View style={styles.innerBorder}>
            {/* Header Icon/Decorative Swords */}
            <Text style={styles.iconDecoration}>{isBoss ? '☠' : '⚔'}</Text>

            <Text style={[styles.title, isBoss ? styles.titleBoss : styles.titleNormal]}>
              {title}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.subtitle}>{subtitle}</Text>

            <Text style={styles.description}>{description}</Text>

            <TouchableOpacity style={styles.button} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={styles.buttonText}>
                {isAmbush ? 'DEFEND YOURSELF' : isBoss ? 'CHALLENGE FOE' : 'ENTER COMBAT'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 3, 3, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1E0A0A',
    borderWidth: 2,
    borderColor: '#B8860B',
    borderRadius: 4,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  innerBorder: {
    borderWidth: 1,
    borderColor: 'rgba(184, 134, 11, 0.3)',
    margin: 4,
    padding: 20,
    alignItems: 'center',
  },
  iconDecoration: {
    fontSize: 32,
    color: '#D4A017',
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 2,
  },
  titleNormal: {
    color: '#C94040',
  },
  titleBoss: {
    color: '#D4A017',
  },
  divider: {
    height: 1,
    backgroundColor: '#8B1A1A',
    width: '60%',
    marginVertical: 12,
    opacity: 0.8,
  },
  subtitle: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    color: '#D4A017',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 12,
  },
  description: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 16,
    color: '#F5EAD6',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#8B1A1A',
    borderWidth: 1,
    borderColor: '#D4A017',
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    color: '#F5EAD6',
    letterSpacing: 1.5,
  },
});
