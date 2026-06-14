/* eslint-disable react-native/sort-styles */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Animated,
} from 'react-native';

import type {
  Dialogue,
  DialogueChoice,
  DialogueNode,
  DialogueSessionOutcome,
  GameState,
} from '@engine/types';
import { DialogueEngine, ChoiceTone } from '@engine/DialogueEngine';
import { NATIVE_ANIMATED_DRIVER } from '@utils/platformStyles';

// ─────────────────────────────────────────
// Palette
// ─────────────────────────────────────────

const C = {
  ink:       '#1A1208',
  parchment: '#F5EAD6',
  parchDark: '#E8D5B0',
  parchDeep: '#D4B880',
  blood:     '#8B1A1A',
  gold:      '#B8860B',
  mist:      '#6B7C6E',
  greenLight:'#4A8A5A',
};

const TONE_META: Record<ChoiceTone, { color: string; label: string }> = {
  heroic:      { color: '#4A8A5A', label: 'Heroic'      },
  pragmatic:   { color: '#6B7C6E', label: 'Pragmatic'   },
  cunning:     { color: '#B8860B', label: 'Cunning'     },
  intimidating:{ color: '#B04A20', label: 'Intimidating'},
  villainous:  { color: '#8B1A1A', label: 'Villainous'  },
  curious:     { color: '#2A5A8A', label: 'Curious'     },
  humorous:    { color: '#8A5A2A', label: 'Humorous'    },
};

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  visible:    boolean;
  dialogue:   Dialogue | null;
  gameState:  GameState;
  onComplete: (outcome: DialogueSessionOutcome) => void;
  onClose:    () => void;
}

// ─────────────────────────────────────────
// CompanionDialogueModal
// ─────────────────────────────────────────

export function CompanionDialogueModal({ visible, dialogue, gameState, onComplete, onClose }: Props) {
  const [currentNode,    setCurrentNode]    = useState<DialogueNode | null>(null);
  const [visibleChoices, setVisibleChoices] = useState<DialogueChoice[]>([]);
  const [isDone,         setIsDone]         = useState(false);
  const [outcome,        setOutcome]        = useState<DialogueSessionOutcome | null>(null);
  const [outcomeText,    setOutcomeText]    = useState<string | null>(null);

  const engineRef = useRef<DialogueEngine | null>(null);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (!visible || !dialogue) {
      setCurrentNode(null);
      setVisibleChoices([]);
      setIsDone(false);
      setOutcome(null);
      setOutcomeText(null);
      engineRef.current?.destroy();
      engineRef.current = null;
      return;
    }

    const engine = new DialogueEngine(
      dialogue,
      gameState,
      (node, choices) => {
        animateIn();
        setCurrentNode(node);
        setVisibleChoices(choices);
        setOutcomeText(null);
      },
      (sessionOutcome) => {
        setIsDone(true);
        setOutcome(sessionOutcome);
        setVisibleChoices([]);
      },
      { manualDismiss: true },
    );

    engineRef.current = engine;
    engine.start(gameState, gameState.companions);

    return () => { engine.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dialogue?.id]);

  const handleChoice = useCallback((choice: DialogueChoice) => {
    if (choice.outcome.outcomeText) {
      setOutcomeText(choice.outcome.outcomeText);
    }
    engineRef.current?.choose(choice.id, gameState, gameState.companions);
  }, [gameState]);

  const handleDismiss = useCallback(() => {
    if (isDone && outcome) {
      onComplete(outcome);
      onClose();
      return;
    }

    if (currentNode?.autoAdvance && visibleChoices.length === 0 && engineRef.current) {
      engineRef.current.advance(gameState, gameState.companions);
      const sessionOutcome = engineRef.current.getSession().outcome;
      const hasStats = sessionOutcome.reputationDelta !== 0 || sessionOutcome.moraleDelta !== 0
        || sessionOutcome.xpGained !== 0 || sessionOutcome.resourceDeltas.gold !== 0
        || sessionOutcome.resourceDeltas.food !== 0;
      if (!hasStats) {
        onComplete(sessionOutcome);
        onClose();
      }
    }
  }, [currentNode, gameState, isDone, onClose, onComplete, outcome, visibleChoices.length]);

  if (!visible) return null;

  const awaitingDismiss = !!currentNode?.autoAdvance && visibleChoices.length === 0 && !isDone;
  const showDismissBtn  = awaitingDismiss || isDone;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Close button */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {currentNode && (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                {/* Speaker name */}
                <Text style={s.speakerName}>{currentNode.speakerName.toUpperCase()}</Text>

                {/* Speech bubble */}
                <View style={[s.bubble, currentNode.speakerName === 'Narrator' && s.bubbleNarrator]}>
                  <Text style={[s.bubbleText, currentNode.speakerName === 'Narrator' && s.bubbleTextNarrator]}>
                    {currentNode.text}
                  </Text>
                </View>
              </Animated.View>
            )}

            {outcomeText && (
              <View style={s.outcomeTextBox}>
                <Text style={s.outcomeTextContent}>{outcomeText}</Text>
              </View>
            )}

            {/* Choices */}
            {visibleChoices.length > 0 && !isDone && (
              <Animated.View style={{ opacity: fadeAnim, marginTop: 12 }}>
                <Text style={s.responseLabel}>Your response</Text>
                {visibleChoices.map(choice => (
                  <TouchableOpacity
                    key={choice.id}
                    style={[s.choiceBtn, { borderLeftColor: TONE_META[choice.tone].color }]}
                    onPress={() => handleChoice(choice)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.tonePip, { backgroundColor: TONE_META[choice.tone].color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.choiceToneLabel}>{TONE_META[choice.tone].label}</Text>
                      <Text style={s.choiceText}>{choice.text}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            {isDone && outcome && <OutcomeSummary outcome={outcome} />}

            {showDismissBtn && (
              <TouchableOpacity style={s.doneBtn} onPress={handleDismiss} activeOpacity={0.8}>
                <Text style={s.doneBtnText}>CLOSE</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────
// Outcome summary
// ─────────────────────────────────────────

function OutcomeSummary({ outcome }: { outcome: DialogueSessionOutcome }) {
  const hasGains  = outcome.reputationDelta > 0 || outcome.moraleDelta > 0
                 || outcome.xpGained > 0        || outcome.resourceDeltas.gold > 0
                 || outcome.resourceDeltas.food  > 0;
  const hasLosses = outcome.reputationDelta < 0 || outcome.moraleDelta < 0
                 || outcome.resourceDeltas.gold  < 0 || outcome.resourceDeltas.food < 0;

  if (!hasGains && !hasLosses) return null;

  return (
    <View style={s.outcomeStatsBox}>
      <Text style={s.outcomeStatsTitle}>Conversation results</Text>
      <View style={s.outcomeStatsDivider} />
      {renderStatLine('Reputation', outcome.reputationDelta)}
      {renderStatLine('Morale',     outcome.moraleDelta)}
      {renderStatLine('XP',         outcome.xpGained)}
      {renderStatLine('Gold',       outcome.resourceDeltas.gold)}
      {renderStatLine('Food',       outcome.resourceDeltas.food)}
    </View>
  );
}

function renderStatLine(label: string, value: number) {
  if (!value) return null;
  const positive = value > 0;
  return (
    <View key={label} style={s.statLine}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: positive ? C.greenLight : '#FF9999' }]}>
        {positive ? '+' : ''}{value}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.parchment,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: C.parchDeep,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 4,
  },
  closeBtnText: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 16,
    color: C.mist,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 8,
  },
  speakerName: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    color: C.gold,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  bubble: {
    backgroundColor: C.parchDark,
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.parchDeep,
  },
  bubbleNarrator: {
    backgroundColor: 'transparent',
    borderLeftColor: C.mist,
  },
  bubbleText: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 16,
    color: C.ink,
    lineHeight: 22,
  },
  bubbleTextNarrator: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    color: '#3A3020',
  },
  outcomeTextBox: {
    backgroundColor: C.parchDark,
    borderLeftColor: C.gold,
    borderLeftWidth: 3,
    borderRadius: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  outcomeTextContent: {
    color: '#3A3020',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 14,
    lineHeight: 20,
  },
  responseLabel: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 10,
    color: C.mist,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.parchDark,
    borderRadius: 6,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  tonePip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  choiceToneLabel: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
    letterSpacing: 1,
    color: C.mist,
    marginBottom: 2,
  },
  choiceText: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 15,
    color: C.ink,
    lineHeight: 20,
  },
  outcomeStatsBox: {
    backgroundColor: C.parchDark,
    borderRadius: 6,
    marginTop: 12,
    padding: 14,
  },
  outcomeStatsTitle: {
    color: C.ink,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  outcomeStatsDivider: {
    backgroundColor: C.parchDeep,
    height: 1,
    marginBottom: 8,
  },
  statLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statLabel: {
    color: C.mist,
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 14,
  },
  statValue: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
  },
  doneBtn: {
    backgroundColor: C.ink,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    color: C.parchment,
    letterSpacing: 2,
  },
});
