import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Animated } from 'react-native';
import { GameState, PlayerAction, WeatherType, CompanionArchetype, GameEvent } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation } from '@data/locations';
import { pickLocationText, pickLocationRandomText } from '@engine/GameState';
import { isBossLocation } from '@engine/bosses';
import { canStealFromDialogue, findCompanionDialogue, findDialogueForLocation, getDialogue, getDialogueDisplayName } from '@engine/DialogueEngine';
import {
  canShowNpcSlot,
  getNpcSlotDialogueId,
  getRunPremise,
} from '@engine/NarrativeSystem';
import {
  getQuestAtLocation,
  getQuestActionLabel,
  getQuestDialogueId,
  getQuestStep,
} from '@engine/CompanionQuestSystem';
import { findDetourAtLocation } from '@engine/RunLayout';
import { Colors } from '@theme';
import { confirmAction } from '@utils/confirmAction';
import { TypewriterText, CompanionDetailModal } from '@components';
import { CompanionDialogueModal } from '@components/CompanionDialogueModal';
import { getLuckThreshold, computeEquippedBonuses, inventoryFromResources } from '@engine';
import { getMerchantAtLocation, hasMerchantAtLocation } from '@engine/ItemSystem';
import { getMerchantEntryNarrative } from '@utils/tradeJournal';
import { getEnemyDefinition } from '@engine';
import { saveEngine } from '@engine/SaveEngine';
import { useGameStore } from '@store/gameStore';
import * as Haptics from 'expo-haptics';
import { createShadowStyle, NATIVE_ANIMATED_DRIVER } from '@utils/platformStyles';

interface JournalSegment {
  key:          string;
  type:         'prev_entry' | 'prev_delta' | 'loc_desc' | 'random_text' | 'npc_cue'
                | 'travel_dialogue' | 'action_result' | 'combat_intro' | 'trade_intro';
  text?:        string;
  deltaFood?:   number;
  deltaGold?:   number;
  deltaHealth?: number;
  deltaMorale?: number;
  instant:      boolean;
}

interface Props {
  gameState:       GameState;
  engine:          TurnEngine | null;
  onToast:         (msg: string) => void;
  onOpenShop?:     (shopName: string, entryNarrative: string) => void;
  onOpenCombat?:   () => void;
  onOpenNpc?:      (dialogueId: string, event?: GameEvent | null) => void;
  onOpenInn?:      () => void;
  textInterval?:   number;
  confirmActions?: boolean;
  merchantCloseKey?: number;
  activeEvent?:    GameEvent | null;
  actionsLocked?:  boolean;
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
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: -3, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: 3, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
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
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(opacityAnim, { toValue: 0.1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: NATIVE_ANIMATED_DRIVER }),
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
  onOpenNpc,
  onOpenInn,
  textInterval = 22,
  confirmActions = true,
  merchantCloseKey,
  activeEvent,
  actionsLocked = false,
}: Props) {
  const location       = getLocation(gameState.currentLocationId);
  const dangerNearby   = location.mobs.some(m => m.aggroPct > 0 && !m.isCompanion)
                      && !gameState.clearedCombatLocations.has(gameState.currentLocationId);
  const bossNearby     = isBossLocation(gameState.currentLocationId)
                      && !gameState.clearedCombatLocations.has(gameState.currentLocationId);

  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
  const [companionDialogueId, setCompanionDialogueId] = useState<string | null>(null);
  const setGameState = useGameStore(s => s.setGameState);
  const [segments, setSegments]           = useState<JournalSegment[]>([]);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [forceComplete, setForceComplete] = useState(false);
  const [pendingShopNarrative, setPendingShopNarrative] = useState('');
  const journalScrollRef = useRef<ScrollView>(null);
  const prevMerchantCloseKeyRef = useRef(merchantCloseKey ?? 0);
  const queuedActionRef = useRef<(() => void) | null>(null);

  const activeDialogue = findDialogueForLocation(gameState.currentLocationId, gameState);
  const dialogueCue    = activeDialogue ? (DIALOGUE_CUES[activeDialogue.id] || 'Someone is nearby, looking to speak with you.') : null;
  const currentNpcSlot = gameState.runLayout?.npcSlots.find(
    slot => slot.locationId === gameState.currentLocationId
      && canShowNpcSlot(slot, gameState.storyFlags, gameState.firedEventIds),
  ) ?? null;

  interface NpcItem {
    dialogueId: string;
    name: string;
    canSteal: boolean;
    isEvent: boolean;
  }

  const npcItems: NpcItem[] = [];
  const seenDialogueIds = new Set<string>();

  if (activeEvent?.interactiveHandlerId === 'dialogue_handler' && activeEvent.id) {
    const id = activeEvent.id;
    seenDialogueIds.add(id);
    npcItems.push({
      dialogueId: id,
      name: getDialogueDisplayName(id),
      canSteal: canStealFromDialogue(id),
      isEvent: true,
    });
  }

  if (activeDialogue) {
    const id = activeDialogue.id;
    if (!seenDialogueIds.has(id)) {
      seenDialogueIds.add(id);
      npcItems.push({
        dialogueId: id,
        name: getDialogueDisplayName(id),
        canSteal: canStealFromDialogue(id),
        isEvent: false,
      });
    }
  }

  if (currentNpcSlot) {
    const id = getNpcSlotDialogueId(currentNpcSlot.npcEventId, currentNpcSlot.arcStage);
    if (!seenDialogueIds.has(id)) {
      seenDialogueIds.add(id);
      npcItems.push({
        dialogueId: id,
        name: getDialogueDisplayName(id),
        canSteal: canStealFromDialogue(id),
        isEvent: false,
      });
    }
  }

  const activeQuest = getQuestAtLocation(gameState, gameState.currentLocationId);
  const questDialogueId = activeQuest ? getQuestDialogueId(gameState, activeQuest) : null;
  if (questDialogueId && !seenDialogueIds.has(questDialogueId)) {
    seenDialogueIds.add(questDialogueId);
    npcItems.push({
      dialogueId: questDialogueId,
      name: getDialogueDisplayName(questDialogueId),
      canSteal: false,
      isEvent: false,
    });
  }

  const dialogueNearby = npcItems.length > 0;

  const lastTurn = gameState.turnHistory[gameState.turnHistory.length - 1];
  const baseLocationText = location.locationText || '';
  const randomText = pickLocationRandomText(location, gameState.dayNumber, gameState.seed);
  const travelDialogueText = lastTurn?.travelDialogue
    && lastTurn.locationAfter === gameState.currentLocationId
    && lastTurn.locationAfter !== lastTurn.locationBefore
    ? `${lastTurn.travelDialogue.speakerName}: "${lastTurn.travelDialogue.text}"`
    : null;
  const lastTurnKey = lastTurn ? `${lastTurn.dayNumber}_${lastTurn.action}` : null;
  const prevTurnKeyRef = useRef<string | null>(lastTurnKey);

  // Effect A — reset journal panel on location arrival
  useEffect(() => {
    const segs: JournalSegment[] = [];

    if (lastTurn) {
      segs.push({
        key:     `prev-entry-${lastTurn.dayNumber}-${lastTurn.action}`,
        type:    'prev_entry',
        text:    lastTurn.narrativeSummary || 'The day passed without incident.',
        instant: true,
      });
      if (hasDelta) {
        segs.push({
          key:         `prev-delta-${lastTurn.dayNumber}`,
          type:        'prev_delta',
          deltaFood:   netFood,
          deltaGold:   netGold,
          deltaHealth: netHealth,
          deltaMorale: netMorale,
          instant:     true,
        });
      }
    }

    if (baseLocationText)
      segs.push({ key: `loc-${gameState.currentLocationId}`, type: 'loc_desc',    text: baseLocationText, instant: false });
    if (gameState.dayNumber === 1 && runPremise)
      segs.push({ key: 'run-premise', type: 'random_text', text: runPremise.journalIntro, instant: false });
    if (randomText)
      segs.push({ key: `rnd-${gameState.currentLocationId}`, type: 'random_text', text: randomText,        instant: false });
    if (travelDialogueText)
      segs.push({ key: `travel-${lastTurn?.dayNumber}-${lastTurn?.travelDialogue?.id}`, type: 'travel_dialogue', text: travelDialogueText, instant: false });
    if (dialogueCue)
      segs.push({ key: `npc-${gameState.currentLocationId}`, type: 'npc_cue',     text: dialogueCue,       instant: false });

    setSegments(segs);
    setCompletedKeys(new Set());
    setForceComplete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.currentLocationId]); // snapshot lastTurn/deltas at arrival only; same-location actions handled by Effect B

  // Effect B — append result for same-location actions
  useEffect(() => {
    if (!lastTurnKey || !lastTurn) return;
    if (lastTurn.locationAfter !== lastTurn.locationBefore) return; // movement handled by Effect A

    const narrativeText = lastTurn.narrativeSummary || 'The day continued.';
    const text = lastTurn.action === PlayerAction.Trade
      ? narrativeText.split('\n').slice(1).join('\n').trim()
      : narrativeText;
    if (!text) return;

    const segmentKey = `action-${lastTurnKey}`;
    const isNewTurn = lastTurnKey !== prevTurnKeyRef.current;
    prevTurnKeyRef.current = lastTurnKey;

    setSegments(prev => {
      const existingIndex = prev.findIndex(seg => seg.key === segmentKey);
      if (existingIndex !== -1) {
        if (prev[existingIndex].text === text) return prev;
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], text };
        return next;
      }

      if (!isNewTurn) return prev;

      return [...prev, {
        key:     segmentKey,
        type:    'action_result',
        text,
        instant: false,
      }];
    });
  }, [lastTurn, lastTurnKey]);

  // Effect C — auto-scroll when new segments are added
  useEffect(() => {
    if (segments.length > 0) {
      const t = setTimeout(() => journalScrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(t);
    }
  }, [segments]);

  // Effect D — append exit text when merchant closes
  useEffect(() => {
    if (merchantCloseKey === undefined) return;
    if (merchantCloseKey === prevMerchantCloseKeyRef.current) return;
    prevMerchantCloseKeyRef.current = merchantCloseKey;
    setSegments(prev => [...prev, {
      key:     `merchant-exit-${merchantCloseKey}`,
      type:    'action_result',
      text:    'You step back out onto the road.',
      instant: false,
    }]);
  }, [merchantCloseKey]);

  const firstTypingIdx = segments.findIndex(
    (s, i) =>
      !s.instant &&
      !completedKeys.has(s.key) &&
      segments.slice(0, i).filter(p => !p.instant).every(p => completedKeys.has(p.key))
  );
  const isTyping  = firstTypingIdx !== -1;
  const typingKey = isTyping ? segments[firstTypingIdx].key : null;
  const showAlertBadges = dangerNearby || dialogueNearby || bossNearby;

  function finishJournalTyping() {
    setCompletedKeys(prev => {
      const next = new Set(prev);
      for (const segment of segments) {
        if (!segment.instant) next.add(segment.key);
      }
      return next;
    });
    setForceComplete(true);
  }

  function runWhenJournalReady(action: () => void) {
    if (!isTyping) {
      action();
      return;
    }

    queuedActionRef.current = action;
    finishJournalTyping();
  }

  useEffect(() => {
    if (dangerNearby || bossNearby) return;

    setSegments(prev => {
      const next = prev.filter(seg => seg.type !== 'combat_intro');
      return next.length === prev.length ? prev : next;
    });
  }, [bossNearby, dangerNearby]);

  useEffect(() => {
    if (isTyping || !queuedActionRef.current) return;

    const queuedAction = queuedActionRef.current;
    queuedActionRef.current = null;
    queuedAction();
  }, [isTyping, completedKeys]);

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

  const activeDetour = findDetourAtLocation(gameState.runLayout, gameState.currentLocationId);
  const runPremise = getRunPremise(gameState.runPremiseId);

  const itemBonuses = computeEquippedBonuses(inventoryFromResources(gameState.resources));
  const luckThreshold = getLuckThreshold(gameState.morale)
    + ((gameState.player.stats.luck ?? 0) / 100)
    + (itemBonuses.luckModifier ?? 0);
  const isLucky = luckThreshold > 0.25;
  const hasMerchant = hasMerchantAtLocation(gameState.currentLocationId, gameState.runLayout);
  const merchantName = getMerchantAtLocation(gameState.currentLocationId, gameState.runLayout)?.merchantName ?? location.name;

  function appendCombatIntro(onOpen: () => void) {
    const hostileMob = location.mobs.find(m => m.aggroPct > 0 && !m.isCompanion);
    let encounterText = 'Danger looms ahead.';
    if (hostileMob) {
      try {
        const def = getEnemyDefinition(hostileMob.enemyId);
        if (def.encounterTexts?.length) {
          encounterText = def.encounterTexts[Math.floor(Math.random() * def.encounterTexts.length)];
        }
      } catch { /* fallback */ }
    }
    setSegments(prev => [...prev, {
      key:     `combat-${Date.now()}`,
      type:    'combat_intro',
      text:    encounterText,
      instant: false,
    }]);
    // onOpen fires from the segment's onComplete callback
  }

  const actionButtons = (bossNearby
    ? [
        {
          label: 'Fight Boss',
          sub: 'Begin combat',
          variant: 'primary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => appendCombatIntro(() => onOpenCombat?.())),
        },
      ]
    : [
        ...(dangerNearby ? [{ label: 'Combat', sub: 'Face nearby danger', variant: 'primary' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => appendCombatIntro(() => onOpenCombat?.())) }] : []),
        { label: 'Move',         sub: '1 loc · 1 food',    variant: 'move' as const,       disabled: actionsLocked, onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Move, forcedMarch: false }, 'Move', '1 location · 1 food')), isLucky },
        { label: 'Force March',  sub: '2 locs · 1.5 food', variant: 'forceMarch' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Move, forcedMarch: true  }, 'Force March', '2 locations · 1.5 food')) },
        ...activeShortcuts.map(s => ({
          label: s.label,
          sub: `To loc ${s.to} · 2 food`,
          variant: 'primary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Move, forcedMarch: false, shortcutTo: s.to }, s.label, `Shortcut to location ${s.to} · 2 food`))
        })),
        ...(activeDetour ? [{
          label: activeDetour.label,
          sub: `Detour to loc ${activeDetour.rejoinAt}`,
          variant: 'primary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => submitWithConfirm(
            { action: PlayerAction.Move, forcedMarch: false, detourThreadId: activeDetour.threadId },
            activeDetour.label,
            `Side path rejoining at location ${activeDetour.rejoinAt}`,
          )),
        }] : []),
        ...(activeQuest && getQuestStep(activeQuest)?.type === 'search' ? [{
          label: getQuestActionLabel(activeQuest) ?? 'Search',
          sub: activeQuest.stepDeadlineLocationId
            ? `Before loc ${activeQuest.stepDeadlineLocationId}`
            : activeQuest.title,
          variant: 'primary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => submit({ action: PlayerAction.Hunt, method: 'forage', questCompanionId: activeQuest.companionId })),
        }] : []),
        ...(activeQuest && getQuestStep(activeQuest)?.type === 'miniboss' ? [{
          label: getQuestActionLabel(activeQuest) ?? 'Fight',
          sub: activeQuest.stepDeadlineLocationId
            ? `Before loc ${activeQuest.stepDeadlineLocationId}`
            : activeQuest.title,
          variant: 'primary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => submit({ action: PlayerAction.Hunt, method: 'hunt', questCompanionId: activeQuest.companionId, questFight: true })),
        }] : []),
        ...(hasMerchant ? [{
          label: 'Trade',
          sub: 'Buy · Sell',
          variant: 'secondary' as const,
          disabled: actionsLocked,
          onPress: () => runWhenJournalReady(() => {
            const flavorText = getMerchantEntryNarrative(merchantName);
            setPendingShopNarrative(flavorText);
            setSegments(prev => [...prev, {
              key:     `trade-${Date.now()}`,
              type:    'trade_intro',
              text:    flavorText,
              instant: false,
            }]);
          })
        }] : []),
        ...(location.isTown  ? [{ label: 'Visit Inn', sub: 'Rest · rumors', variant: 'default' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => onOpenInn?.()) }] : []),
        ...(!location.isTown ? [{ label: 'Forage',       sub: 'Gain food',          variant: 'default' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Hunt, method: 'forage' }, 'Forage', 'Search for food')) }] : []),
        { label: 'Rally',        sub: 'Boost morale',       variant: 'default' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Rally }, 'Rally', 'Boost party morale')) },
        ...(!location.isTown ? [{ label: 'Make Camp',    sub: '+10 HP · rest',      variant: 'default' as const, disabled: actionsLocked, onPress: () => runWhenJournalReady(() => submitWithConfirm({ action: PlayerAction.Camp }, 'Make Camp', 'Rest and recover')) }] : []),
      ]);
  const npcActionButtons = npcItems.map(item => ({
    label: item.name,
    sub: item.canSteal ? 'Talk · Steal' : 'Talk',
    variant: 'npc' as const,
    disabled: actionsLocked,
    onPress: () => runWhenJournalReady(() => {
      onOpenNpc?.(item.dialogueId, item.isEvent ? activeEvent ?? null : null);
    }),
  }));

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
    if (actionsLocked) return;
    if (!confirmActions) {
      submit(params);
      return;
    }

    confirmAction(label, costDesc, () => submit(params));
  }

  const handleCompanionPress = (id: string) => {
    const dialogue = findCompanionDialogue(id, gameState);
    if (dialogue) {
      setCompanionDialogueId(dialogue.id);
      return;
    }
    if (selectedCompanionId === id) {
      setSelectedCompanionId(null);
    } else {
      setSelectedCompanionId(id);
    }
  };

  const handleCompanionDialogueComplete = (_outcome: import('@engine/types').DialogueSessionOutcome) => {
    const dialogueId = companionDialogueId;
    setCompanionDialogueId(null);
    if (!dialogueId) return;
    // Record in each companion whose tag matches (finds the right one by tag)
    const updated = {
      ...gameState,
      companions: gameState.companions.map(c => {
        const had = c.conversationsHad ?? [];
        if (had.includes(dialogueId)) return c;
        return { ...c, conversationsHad: [...had, dialogueId] };
      }),
    };
    setGameState(updated);
    saveEngine.saveRun(updated).catch(console.error);
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

            {/* Narrative / Journal Panel — accumulates the day's events */}
            <ScrollView
              ref={journalScrollRef}
              style={{ maxHeight: 340 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => setForceComplete(true)}
                style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 3, padding: 12, marginBottom: 12, backgroundColor: '#EDE4CF' }}
              >
                {segments.map((seg, i) => (
                  <JournalSegmentView
                    key={seg.key}
                    seg={seg}
                    isTyping={seg.key === typingKey}
                    isCompleted={completedKeys.has(seg.key)}
                    forceComplete={forceComplete && seg.key === typingKey}
                    textInterval={textInterval}
                    showDivider={i > 0}
                    renderDelta={renderDelta}
                    onComplete={() => {
                      setCompletedKeys(prev => new Set([...prev, seg.key]));
                      setForceComplete(false);
                      if (seg.type === 'trade_intro')  setTimeout(() => onOpenShop?.(merchantName, pendingShopNarrative), 0);
                      if (seg.type === 'combat_intro') setTimeout(() => onOpenCombat?.(), 0);
                    }}
                  />
                ))}
              </TouchableOpacity>
            </ScrollView>

            {/* Actions */}
            <>
              {npcActionButtons.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                  <SectionHeader label="NPC" right="Talk or take your chances" centered />
                  <ActionGrid actions={npcActionButtons} />
                </View>
              )}
              <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', paddingTop: 12, marginTop: 12, marginBottom: 16 }}>
                <SectionHeader label="Actions" right="Choose wisely" centered />
                <ActionGrid actions={actionButtons} />
              </View>
            </>

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
      <CompanionDetailModal
        visible={selectedCompanionId !== null}
        companionId={selectedCompanionId}
        onClose={() => setSelectedCompanionId(null)}
      />
      <CompanionDialogueModal
        visible={companionDialogueId !== null}
        dialogue={companionDialogueId ? (getDialogue(companionDialogueId) ?? null) : null}
        gameState={gameState}
        onComplete={handleCompanionDialogueComplete}
        onClose={() => setCompanionDialogueId(null)}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 8 }} />;
}

const SEGMENT_HEADERS: Partial<Record<JournalSegment['type'], string>> = {
  prev_entry:    'PREVIOUS DAY',
  travel_dialogue:'ON THE ROAD',
  action_result: 'YOU ACTED',
  combat_intro:  'DANGER APPROACHES',
  trade_intro:   'AT THE MARKET',
};

function JournalSegmentView({
  seg,
  isTyping,
  isCompleted,
  forceComplete,
  textInterval,
  showDivider,
  renderDelta,
  onComplete,
}: {
  seg:           JournalSegment;
  isTyping:      boolean;
  isCompleted:   boolean;
  forceComplete: boolean;
  textInterval:  number;
  showDivider:   boolean;
  renderDelta:   (val: number, label: string, icon: string) => React.ReactNode;
  onComplete:    () => void;
}) {
  const isPrevEntry = seg.type === 'prev_entry';
  const isTravelDialogue = seg.type === 'travel_dialogue';
  const textStyle = isPrevEntry
    ? { fontFamily: 'CrimsonText_400Regular_Italic' as const, fontSize: 14, lineHeight: 21, color: Colors.mist, opacity: 0.8 }
    : isTravelDialogue
      ? { fontFamily: 'CrimsonText_400Regular' as const, fontSize: 15, lineHeight: 23, color: Colors.ink }
    : { fontFamily: 'CrimsonText_400Regular_Italic' as const, fontSize: 15, lineHeight: 22, color: Colors.inkLight };

  const header = SEGMENT_HEADERS[seg.type] ?? null;

  if (seg.type === 'prev_delta') {
    return (
      <>
        {showDivider && <Divider />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {renderDelta(seg.deltaFood   ?? 0, 'food',   '🍎')}
          {renderDelta(seg.deltaGold   ?? 0, 'gold',   '🪙')}
          {renderDelta(seg.deltaHealth ?? 0, 'health', '❤️')}
          {renderDelta(seg.deltaMorale ?? 0, 'morale', '🎭')}
        </View>
      </>
    );
  }

  // Segments not yet reached in the chain are hidden
  if (!seg.instant && !isCompleted && !isTyping) return null;

  return (
    <>
      {showDivider && <Divider />}
      {header && (
        <Text style={{
          fontFamily: 'Cinzel_600SemiBold',
          fontSize: 10,
          letterSpacing: 0.5,
          color: isPrevEntry ? Colors.mist : Colors.blood,
          opacity: isPrevEntry ? 0.7 : 1,
          marginBottom: 4,
        }}>
          {header}
        </Text>
      )}
      {seg.instant || isCompleted ? (
        <Text style={textStyle}>{seg.text}</Text>
      ) : (
        <TypewriterText
          key={seg.key}
          text={seg.text ?? ''}
          interval={textInterval}
          forceComplete={forceComplete}
          onComplete={onComplete}
          style={textStyle}
        />
      )}
    </>
  );
}

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
        ...(disabled
          ? { elevation: 0 }
          : createShadowStyle({
              color: isLucky && variant === 'move' ? '#B8860B' : '#000',
              offsetX: 0,
              offsetY: 2,
              opacity: 0.35,
              radius: 3,
              elevation: 4,
            })),
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
