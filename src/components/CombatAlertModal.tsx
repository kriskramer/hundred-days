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
  button: {
    alignItems: 'center',
    backgroundColor: '#8B1A1A',
    borderColor: '#D4A017',
    borderRadius: 2,
    borderWidth: 1,
    elevation: 3,
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    width: '100%',
  },
  buttonText: {
    color: '#F5EAD6',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: '#1E0A0A',
    borderColor: '#B8860B',
    borderRadius: 4,
    borderWidth: 2,
    elevation: 10,
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    width: '100%',
  },
  description: {
    color: '#F5EAD6',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  divider: {
    backgroundColor: '#8B1A1A',
    height: 1,
    marginVertical: 12,
    opacity: 0.8,
    width: '60%',
  },
  iconDecoration: {
    color: '#D4A017',
    fontSize: 32,
    marginBottom: 8,
    textAlign: 'center',
  },
  innerBorder: {
    alignItems: 'center',
    borderColor: 'rgba(184, 134, 11, 0.3)',
    borderWidth: 1,
    margin: 4,
    padding: 20,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 3, 3, 0.94)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  subtitle: {
    color: '#D4A017',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  title: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 24,
    letterSpacing: 2,
    textAlign: 'center',
  },
  titleBoss: {
    color: '#D4A017',
  },
  titleNormal: {
    color: '#C94040',
  },
});
