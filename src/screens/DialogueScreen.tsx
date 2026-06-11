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
  Animated,
  ActivityIndicator,
} from 'react-native';

import {
  GameState,
  GameEvent,
} from '@engine/types';

import {
  DialogueEngine,
  DialogueNode,
  DialogueChoice,
  DialogueSessionOutcome,
  ChoiceTone,
  DIALOGUES,
  findDialogueForLocation,
  getDialogue,
} from '@engine/DialogueEngine';
import { TypewriterText } from '@components';
import { NATIVE_ANIMATED_DRIVER } from '@utils/platformStyles';

// ─────────────────────────────────────────
// Typewriter pacing
// ─────────────────────────────────────────

const DEFAULT_TYPE_INTERVAL = 18;
const MIN_TYPE_INTERVAL     = 4;
const AUTO_ADVANCE_BUFFER_MS = 300;

// Auto-advancing nodes fire on a fixed timer regardless of how long the text
// takes to type out. Speed up long auto-advance text so it finishes typing
// before the engine moves on, instead of getting cut off mid-sentence.
function typeIntervalFor(node: DialogueNode): number {
  if (!node.autoAdvance || !node.text.length) return DEFAULT_TYPE_INTERVAL;

  const budget = (node.autoAdvanceDelayMs ?? 1800) - AUTO_ADVANCE_BUFFER_MS;
  if (budget <= 0) return MIN_TYPE_INTERVAL;

  return Math.min(DEFAULT_TYPE_INTERVAL, Math.max(MIN_TYPE_INTERVAL, budget / node.text.length));
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState:  GameState;
  event:      GameEvent | null;
  onComplete: (outcome: DialogueSessionOutcome) => void;
  onToast:    (msg: string) => void;
  onBackToRoad?: () => void;
  dialogueId?: string;
  footerContent?: React.ReactNode;
}

// ─────────────────────────────────────────
// Colours
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
  green:     '#2A5A3A',
  greenLight:'#4A8A5A',
  red:       '#8B1A1A',
};

// Tone → accent colour and label
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
// DialogueScreen
// ─────────────────────────────────────────

export function DialogueScreen({
  gameState,
  event,
  onComplete,
  onToast,
  onBackToRoad,
  dialogueId,
  footerContent,
}: Props) {
  const [currentNode,    setCurrentNode]    = useState<DialogueNode | null>(null);
  const [visibleChoices, setVisibleChoices] = useState<DialogueChoice[]>([]);
  const [outcome,        setOutcome]        = useState<DialogueSessionOutcome | null>(null);
  const [noDialogue,     setNoDialogue]     = useState(false);
  const [outcomeText,    setOutcomeText]    = useState<string | null>(null);
  const [isTyping,       setIsTyping]       = useState(true);
  const [forceComplete,  setForceComplete]  = useState(false);

  const engineRef    = useRef<DialogueEngine | null>(null);
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(24)).current;

  // ── Find and start the right dialogue ────────────────────

  useEffect(() => {
    // Determine which dialogue to run
    let dialogue = null;

    if (dialogueId) {
      dialogue = getDialogue(dialogueId) ?? null;
    }

    // From a triggered event
    if (!dialogue && event?.interactiveHandlerId === 'dialogue_handler' && event.id) {
      dialogue = DIALOGUES.find(d => d.id === event.id) ?? null;
    }

    // From location entry
    if (!dialogue) {
      dialogue = findDialogueForLocation(gameState.currentLocationId, gameState);
    }

    if (!dialogue) {
      setNoDialogue(true);
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
        setIsTyping(true);
        setForceComplete(false);
      },
      (sessionOutcome) => {
        setOutcome(sessionOutcome);
      },
    );

    engineRef.current = engine;
    engine.start(gameState, gameState.companions);

    return () => { engine.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animate node changes ──────────────────────────────────

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ── Choose ────────────────────────────────────────────────

  const handleChoice = useCallback((choice: DialogueChoice) => {
    if (!engineRef.current) return;

    // Show brief outcome text if present
    if (choice.outcome.outcomeText) {
      setOutcomeText(choice.outcome.outcomeText);
    }

    engineRef.current.choose(choice.id, gameState, gameState.companions);
  }, [gameState]);

  // ── Dismiss outcome ───────────────────────────────────────

  const handleOutcomeDismiss = useCallback(() => {
    if (!outcome) return;
    onComplete(outcome);
  }, [outcome, onComplete]);

  // ─────────────────────────────────────────
  // Render: no dialogue found
  // ─────────────────────────────────────────

  if (noDialogue) {
    return (
      <View style={s.root}>
        <View style={s.noDialogueBox}>
          <Text style={s.noDialogueTitle}>No one to talk to</Text>
          <Text style={s.noDialogueBody}>
            There is nobody here who wants a conversation. The road awaits.
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (onBackToRoad) {
                onBackToRoad();
              } else {
                onToast('Switch to Road tab to keep moving.');
              }
            }}
            style={s.noDialogueBtn}
            activeOpacity={0.8}
          >
            <Text style={s.noDialogueBtnText}>BACK TO ROAD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────
  // Render: loading
  // ─────────────────────────────────────────

  if (!currentNode) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.gold} />
      </View>
    );
  }

  // ─────────────────────────────────────────
  // Render: active dialogue
  // ─────────────────────────────────────────

  const isAutoAdvance = currentNode.autoAdvance && visibleChoices.length === 0;
  const isNarrator    = currentNode.speakerName === 'Narrator';
  const showResponse  = visibleChoices.length > 0 && !isTyping && !outcome;

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scrollRoot}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Location crumb */}
        <Text style={s.crumb}>
          Location {gameState.currentLocationId}  ·  Day {gameState.dayNumber}
        </Text>

        {/* Speaker block */}
        <Animated.View style={[
          s.speakerBlock,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
          {/* Avatar */}
          <View style={[s.avatar, isNarrator && s.avatarNarrator]}>
            <Text style={s.avatarText}>
              {isNarrator
                ? '✦'
                : currentNode.speakerName.slice(0, 2).toUpperCase()}
            </Text>
          </View>

          {/* Bubble */}
          <View style={[s.bubble, isNarrator && s.bubbleNarrator]}>
            <Text style={s.speakerName}>
              {currentNode.speakerName.toUpperCase()}
            </Text>
            <TypewriterText
              key={currentNode.id}
              text={currentNode.text}
              style={[s.bubbleText, isNarrator && s.bubbleTextNarrator]}
              interval={typeIntervalFor(currentNode)}
              forceComplete={forceComplete}
              onComplete={() => setIsTyping(false)}
            />
          </View>
        </Animated.View>

        {/* Outcome text flash */}
        {outcomeText && (
          <View style={s.outcomeTextBox}>
            <Text style={s.outcomeTextContent}>{outcomeText}</Text>
          </View>
        )}

        {/* Auto-advance indicator */}
        {isAutoAdvance && !isTyping && !outcome && (
          <View style={s.autoAdvancePill}>
            <ActivityIndicator size="small" color={C.gold} style={{ marginRight: 6 }} />
            <Text style={s.autoAdvanceText}>Continuing...</Text>
          </View>
        )}

        {/* Choices */}
        {showResponse && (
          <Animated.View style={[
            s.choicesSection,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}>
            <Text style={s.choicesHeader}>Your response</Text>
            {visibleChoices.map((choice) => (
              <ChoiceButton
                key={choice.id}
                choice={choice}
                onPress={() => handleChoice(choice)}
              />
            ))}
          </Animated.View>
        )}

        {/* Reputation / morale hint */}
        {showResponse && (
          <View style={s.toneKey}>
            {(['heroic', 'cunning', 'villainous'] as ChoiceTone[]).map(tone => (
              <View key={tone} style={s.toneKeyItem}>
                <View style={[s.toneDot, { backgroundColor: TONE_META[tone].color }]} />
                <Text style={s.toneKeyLabel}>{TONE_META[tone].label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Conversation results — shown alongside the final dialogue line */}
        {outcome && !isTyping && (
          <OutcomeSummary outcome={outcome} onDismiss={handleOutcomeDismiss} />
        )}

        {!outcome && footerContent}
      </ScrollView>

      {isTyping && !forceComplete && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setForceComplete(true)}
          style={StyleSheet.absoluteFillObject}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Choice button
// ─────────────────────────────────────────

function ChoiceButton({
  choice,
  onPress,
}: {
  choice:  DialogueChoice;
  onPress: () => void;
}) {
  const { color } = TONE_META[choice.tone];
  const pressScale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.timing(pressScale, { toValue: 0.97, duration: 80, useNativeDriver: NATIVE_ANIMATED_DRIVER }).start();
  }
  function onPressOut() {
    Animated.timing(pressScale, { toValue: 1, duration: 120, useNativeDriver: NATIVE_ANIMATED_DRIVER }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[s.choiceBtn, { borderLeftColor: color }]}
      >
        <View style={[s.toneDotLarge, { backgroundColor: color }]} />
        <View style={s.choiceTextBlock}>
          <Text style={s.choiceText}>{choice.text}</Text>
          <Text style={[s.choiceToneLabel, { color }]}>
            {TONE_META[choice.tone].label}
            {hasReputationEffect(choice) ? reputationHint(choice) : ''}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────
// Outcome summary (shown inline once the conversation ends)
// ─────────────────────────────────────────

function OutcomeSummary({
  outcome,
  onDismiss,
}: {
  outcome:   DialogueSessionOutcome;
  onDismiss: () => void;
}) {
  const hasGains  = outcome.reputationDelta > 0 || outcome.moraleDelta > 0
                 || outcome.xpGained > 0        || outcome.resourceDeltas.gold > 0
                 || outcome.resourceDeltas.food  > 0;
  const hasLosses = outcome.reputationDelta < 0 || outcome.moraleDelta < 0
                 || outcome.resourceDeltas.gold  < 0 || outcome.resourceDeltas.food < 0;

  const recruited = outcome.companionEffects.filter(
    (e): e is NonNullable<typeof e> => e !== undefined && e.type === 'recruit'
  );

  return (
    <View style={s.outcomeSection}>
      {/* Recruited companion celebration */}
      {recruited.length > 0 && (
        <View style={s.recruitedBanner}>
          <Text style={s.recruitedTitle}>Companion Joined!</Text>
          {recruited.map(e => (
            <Text key={e.companionId} style={s.recruitedName}>
              {formatCompanionId(e.companionId)}
            </Text>
          ))}
        </View>
      )}

      {/* Stats */}
      {(hasGains || hasLosses) && (
        <View style={s.outcomeStatsBox}>
          <Text style={s.outcomeStatsTitle}>Conversation results</Text>
          <View style={s.outcomeStatsDivider} />
          {renderStatLine('Reputation', outcome.reputationDelta)}
          {renderStatLine('Morale',     outcome.moraleDelta)}
          {renderStatLine('XP',         outcome.xpGained)}
          {renderStatLine('Gold',        outcome.resourceDeltas.gold)}
          {renderStatLine('Food',        outcome.resourceDeltas.food)}
        </View>
      )}

      <TouchableOpacity onPress={onDismiss} activeOpacity={0.8} style={s.outcomeBtn}>
        <Text style={s.outcomeBtnText}>RETURN TO ROAD</Text>
      </TouchableOpacity>
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
// Helpers
// ─────────────────────────────────────────

function hasReputationEffect(choice: DialogueChoice): boolean {
  return !!(choice.outcome.reputationDelta);
}

function reputationHint(choice: DialogueChoice): string {
  const delta = choice.outcome.reputationDelta ?? 0;
  if (delta > 0) return '  ↑ Rep';
  if (delta < 0) return '  ↓ Rep';
  return '';
}

function formatCompanionId(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    backgroundColor: C.parchment,
    flex:            1,
  },
  scrollRoot: {
    flex: 1,
  },
  scroll: {
    padding:      16,
    paddingBottom:40,
  },

  // Crumb
  crumb: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  // Speaker block
  speakerBlock: {
    alignItems:    'flex-start',
    flexDirection: 'row',
    gap:           12,
    marginBottom:  18,
  },
  avatar: {
    alignItems:      'center',
    backgroundColor: C.inkLight,
    borderColor:     C.parchDeep,
    borderRadius:    24,
    borderWidth:     2,
    flexShrink:      0,
    height:          48,
    justifyContent:  'center',
    width:           48,
  },
  avatarNarrator: {
    backgroundColor: C.gold + '22',
    borderColor:     C.gold,
  },
  avatarText: {
    color:      C.parchment,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   14,
  },

  // Bubble
  bubble: {
    backgroundColor: C.parchDark,
    borderBottomLeftRadius:  8,
    borderBottomRightRadius: 8,
    borderColor:     C.parchDeep,
    borderRadius:    0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderWidth:     1,
    flex:            1,
    padding:         12,
  },
  bubbleNarrator: {
    backgroundColor: C.parchment,
    borderColor:     C.gold + '66',
    borderLeftColor: C.gold,
    borderLeftWidth: 2,
  },
  speakerName: {
    color:        C.mist,
    fontFamily:   'Cinzel_400Regular',
    fontSize:     10,
    letterSpacing: 1.2,
    marginBottom:  6,
  },
  bubbleText: {
    color:      C.ink,
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   16,
    lineHeight: 26,
  },
  bubbleTextNarrator: {
    color:      C.inkLight,
    fontFamily: 'CrimsonText_400Regular_Italic',
  },

  // Outcome text
  outcomeTextBox: {
    backgroundColor: C.parchDark,
    borderLeftColor: C.gold,
    borderLeftWidth: 3,
    borderRadius:      2,
    marginBottom:      14,
    paddingHorizontal: 10,
    paddingVertical:   8,
  },
  outcomeTextContent: {
    color:      C.inkLight,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   14,
    lineHeight: 21,
  },

  // Auto-advance
  autoAdvancePill: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'center',
    marginBottom:   16,
    paddingVertical: 8,
  },
  autoAdvanceText: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    13,
    letterSpacing: 0.5,
  },

  // Choices
  choicesSection: {
    marginTop: 4,
  },
  choicesHeader: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  choiceBtn: {
    alignItems:      'flex-start',
    backgroundColor: C.parchDark,
    borderColor:     C.parchDeep,
    borderLeftWidth: 3,
    borderRadius:    2,
    borderWidth:     1,
    flexDirection:   'row',
    gap:             10,
    marginBottom:    8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  toneDotLarge: {
    borderRadius: 5,
    flexShrink:   0,
    height:       9,
    marginTop:    5,
    width:        9,
  },
  choiceTextBlock: {
    flex: 1,
  },
  choiceText: {
    color:      C.ink,
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   15,
    lineHeight: 22,
    marginBottom: 3,
  },
  choiceToneLabel: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    letterSpacing: 0.8,
  },

  // Tone key
  toneKey: {
    flexDirection:  'row',
    gap:            14,
    justifyContent: 'center',
    marginTop:      14,
  },
  toneKeyItem: {
    alignItems:    'center',
    flexDirection: 'row',
    gap:           4,
  },
  toneDot: {
    borderRadius: 4,
    height:       7,
    width:        7,
  },
  toneKeyLabel: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    11,
  },

  // No-dialogue state
  noDialogueBox: {
    alignItems:     'center',
    flex:           1,
    justifyContent: 'center',
    padding:        32,
  },
  noDialogueTitle: {
    color:       C.ink,
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    18,
    letterSpacing: 1,
    marginBottom: 10,
  },
  noDialogueBody: {
    color:       C.mist,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    15,
    lineHeight:  22,
    marginBottom: 24,
    textAlign:   'center',
  },
  noDialogueBtn: {
    backgroundColor: C.inkLight,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  noDialogueBtnText: {
    color:       C.parchment,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    12,
    letterSpacing: 1.2,
  },

  // Outcome summary
  outcomeSection: {
    marginTop: 16,
  },
  recruitedBanner: {
    alignItems:      'center',
    backgroundColor: C.gold + '22',
    borderColor:     C.gold,
    borderRadius:    2,
    borderWidth:     2,
    marginBottom:    16,
    padding:         16,
  },
  recruitedTitle: {
    color:       C.goldLight,
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    14,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  recruitedName: {
    color:       C.ink,
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    18,
  },
  outcomeStatsBox: {
    backgroundColor: C.parchDark,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    borderWidth:     1,
    marginBottom:    16,
    padding:         14,
  },
  outcomeStatsTitle: {
    color:       C.mist,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  outcomeStatsDivider: {
    backgroundColor: C.parchDeep,
    height:      1,
    marginBottom: 10,
  },
  statLine: {
    alignItems:     'center',
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statLabel: {
    color:       C.ink,
    fontFamily:  'Cinzel_400Regular',
    fontSize:    13,
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    13,
    letterSpacing: 0.3,
  },
  outcomeBtn: {
    alignItems:        'center',
    backgroundColor: C.ink,
    borderColor:       C.gold,
    borderRadius:      2,
    borderWidth:       1,
    paddingHorizontal: 24,
    paddingVertical:   12,
  },
  outcomeBtnText: {
    color:       C.parchment,
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    12,
    letterSpacing: 1.5,
  },
});
