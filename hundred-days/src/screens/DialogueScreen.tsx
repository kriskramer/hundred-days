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
} from '@engine/DialogueEngine';

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState:  GameState;
  event:      GameEvent | null;
  onComplete: (outcome: DialogueSessionOutcome) => void;
  onToast:    (msg: string) => void;
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

export function DialogueScreen({ gameState, event, onComplete, onToast }: Props) {
  const [currentNode,    setCurrentNode]    = useState<DialogueNode | null>(null);
  const [visibleChoices, setVisibleChoices] = useState<DialogueChoice[]>([]);
  const [outcome,        setOutcome]        = useState<DialogueSessionOutcome | null>(null);
  const [noDialogue,     setNoDialogue]     = useState(false);
  const [outcomeText,    setOutcomeText]    = useState<string | null>(null);

  const engineRef    = useRef<DialogueEngine | null>(null);
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(24)).current;

  // ── Find and start the right dialogue ────────────────────

  useEffect(() => {
    // Determine which dialogue to run
    let dialogue = null;

    // From a triggered event
    if (event?.interactiveHandlerId === 'dialogue_handler' && event.id) {
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
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
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
            onPress={() => onToast('Switch to Road tab to keep moving.')}
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
  // Render: outcome screen
  // ─────────────────────────────────────────

  if (outcome) {
    return (
      <View style={s.root}>
        <OutcomeScreen outcome={outcome} onDismiss={handleOutcomeDismiss} />
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

  return (
    <ScrollView
      style={s.root}
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
          <Text style={[s.bubbleText, isNarrator && s.bubbleTextNarrator]}>
            {currentNode.text}
          </Text>
        </View>
      </Animated.View>

      {/* Outcome text flash */}
      {outcomeText && (
        <View style={s.outcomeTextBox}>
          <Text style={s.outcomeTextContent}>{outcomeText}</Text>
        </View>
      )}

      {/* Auto-advance indicator */}
      {isAutoAdvance && (
        <View style={s.autoAdvancePill}>
          <ActivityIndicator size="small" color={C.gold} style={{ marginRight: 6 }} />
          <Text style={s.autoAdvanceText}>Continuing...</Text>
        </View>
      )}

      {/* Choices */}
      {visibleChoices.length > 0 && (
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
      {visibleChoices.length > 0 && (
        <View style={s.toneKey}>
          {(['heroic', 'cunning', 'villainous'] as ChoiceTone[]).map(tone => (
            <View key={tone} style={s.toneKeyItem}>
              <View style={[s.toneDot, { backgroundColor: TONE_META[tone].color }]} />
              <Text style={s.toneKeyLabel}>{TONE_META[tone].label}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
    Animated.timing(pressScale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start();
  }
  function onPressOut() {
    Animated.timing(pressScale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
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
// Outcome screen
// ─────────────────────────────────────────

function OutcomeScreen({
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

  const recruited = outcome.companionEffects.filter(e => e.type === 'recruit');

  return (
    <View style={s.outcomeRoot}>
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
    flex:            1,
    backgroundColor: C.parchment,
  },
  scroll: {
    padding:      16,
    paddingBottom:40,
  },

  // Crumb
  crumb: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    color:       C.mist,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  // Speaker block
  speakerBlock: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
    marginBottom:  18,
  },
  avatar: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: C.inkLight,
    borderWidth:     2,
    borderColor:     C.parchDeep,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarNarrator: {
    backgroundColor: C.gold + '22',
    borderColor:     C.gold,
  },
  avatarText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:   14,
    color:      C.parchment,
  },

  // Bubble
  bubble: {
    flex:            1,
    backgroundColor: C.parchDark,
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius:  8,
    padding:         12,
  },
  bubbleNarrator: {
    backgroundColor: C.parchment,
    borderColor:     C.gold + '66',
    borderLeftWidth: 2,
    borderLeftColor: C.gold,
  },
  speakerName: {
    fontFamily:   'Cinzel_400Regular',
    fontSize:     10,
    color:        C.mist,
    letterSpacing: 1.2,
    marginBottom:  6,
  },
  bubbleText: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   16,
    color:      C.ink,
    lineHeight: 26,
  },
  bubbleTextNarrator: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    color:      C.inkLight,
  },

  // Outcome text
  outcomeTextBox: {
    backgroundColor: C.parchDark,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    paddingHorizontal: 10,
    paddingVertical:   8,
    marginBottom:      14,
    borderRadius:      2,
  },
  outcomeTextContent: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   14,
    color:      C.inkLight,
    lineHeight: 21,
  },

  // Auto-advance
  autoAdvancePill: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom:   16,
  },
  autoAdvanceText: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    13,
    color:       C.mist,
    letterSpacing: 0.5,
  },

  // Choices
  choicesSection: {
    marginTop: 4,
  },
  choicesHeader: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    color:       C.mist,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  choiceBtn: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             10,
    backgroundColor: C.parchDark,
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderLeftWidth: 3,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom:    8,
    borderRadius:    2,
  },
  toneDotLarge: {
    width:        9,
    height:       9,
    borderRadius: 5,
    marginTop:    5,
    flexShrink:   0,
  },
  choiceTextBlock: {
    flex: 1,
  },
  choiceText: {
    fontFamily: 'CrimsonText_400Regular',
    fontSize:   15,
    color:      C.ink,
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
    marginTop:      14,
    justifyContent: 'center',
  },
  toneKeyItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  toneDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  toneKeyLabel: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    11,
    color:       C.mist,
  },

  // No-dialogue state
  noDialogueBox: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        32,
  },
  noDialogueTitle: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    18,
    color:       C.ink,
    marginBottom: 10,
    letterSpacing: 1,
  },
  noDialogueBody: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    15,
    color:       C.mist,
    textAlign:   'center',
    lineHeight:  22,
    marginBottom: 24,
  },
  noDialogueBtn: {
    backgroundColor: C.inkLight,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius:    2,
    borderWidth:     1,
    borderColor:     C.parchDeep,
  },
  noDialogueBtnText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    12,
    color:       C.parchment,
    letterSpacing: 1.2,
  },

  // Outcome screen
  outcomeRoot: {
    flex:    1,
    padding: 20,
  },
  recruitedBanner: {
    backgroundColor: C.gold + '22',
    borderWidth:     2,
    borderColor:     C.gold,
    borderRadius:    2,
    padding:         16,
    alignItems:      'center',
    marginBottom:    16,
  },
  recruitedTitle: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    14,
    color:       C.goldLight,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  recruitedName: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    18,
    color:       C.ink,
  },
  outcomeStatsBox: {
    backgroundColor: C.parchDark,
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    padding:         14,
    marginBottom:    16,
  },
  outcomeStatsTitle: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    color:       C.mist,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  outcomeStatsDivider: {
    height:      1,
    backgroundColor: C.parchDeep,
    marginBottom: 10,
  },
  statLine: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 4,
  },
  statLabel: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    13,
    color:       C.ink,
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    13,
    letterSpacing: 0.3,
  },
  outcomeBtn: {
    backgroundColor: C.ink,
    paddingVertical:   12,
    paddingHorizontal: 24,
    borderRadius:      2,
    alignItems:        'center',
    borderWidth:       1,
    borderColor:       C.gold,
  },
  outcomeBtnText: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    12,
    color:       C.parchment,
    letterSpacing: 1.5,
  },
});
