import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { TurnEngine } from '@engine/TurnEngine';
import { saveEngine } from '@engine/SaveEngine';
import type { GameEvent, LevelUpChoice, CombatResult, GameState } from '@engine/types';
import { PlayerAction, TurnPhase } from '@engine/types';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';
import { getCompanion } from '@data/companions';
import { getLocation } from '@data/locations';
import {
  applyLevelUpChoice,
  LEVEL_UP_CHOICES,
  buildLevelUpChoicePreviews,
} from '@engine/GameState';
import { isCombatEvent, isOptionalDialogueEvent } from '@utils/isCombatEvent';
import { createTradeJournalRecord } from '@utils/tradeJournal';
import { dialogueOutcomeToCombatResult } from '@utils/dialogueOutcomeToCombatResult';
import { advanceCompanionQuest, findQuestForDialogue } from '@engine/CompanionQuestSystem';

export type HubTab = 'road' | 'inventory' | 'map';
export type NavItemId = HubTab | 'journal' | 'settings';

export type Interaction =
  | { kind: 'none' }
  | { kind: 'combat'; event: GameEvent | null; manual: boolean }
  | { kind: 'npc'; dialogueId: string; event: GameEvent | null }
  | { kind: 'merchant'; entryNarrative: string; merchantName: string }
  | { kind: 'inn' };

interface UseGameNavigationOptions {
  gameState: GameState | null;
  setGame: (state: GameState) => void;
}

export function useGameNavigation({ gameState, setGame }: UseGameNavigationOptions) {
  const [hubTab, setHubTab] = useState<HubTab>('road');
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'none' });
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);
  const [levelUpChoices, setLevelUpChoices] = useState<LevelUpChoice[] | null>(null);
  const [combatAlertVisible, setCombatAlertVisible] = useState(false);
  const [pendingCombatEvent, setPendingCombatEvent] = useState<GameEvent | null>(null);
  const [isManualCombat, setIsManualCombat] = useState(false);
  const [merchantCloseKey, setMerchantCloseKey] = useState(0);

  const engineRef = useRef<TurnEngine | null>(null);
  const lastEngineSnapshotRef = useRef<GameState | null>(null);
  const activeEventRef = useRef<GameEvent | null>(null);
  activeEventRef.current = activeEvent;

  const syncExternalGameState = useCallback((nextState: GameState) => {
    lastEngineSnapshotRef.current = nextState;
    setGame(nextState);
    engineRef.current?.syncExternalState(nextState);
    saveEngine.saveRun(nextState).catch(console.error);
  }, [setGame]);

  const returnToRoad = useCallback(() => {
    setInteraction({ kind: 'none' });
    setHubTab('road');
  }, []);

  const closeNonBlockingInteraction = useCallback(() => {
    if (interaction.kind === 'merchant') {
      setMerchantCloseKey(k => k + 1);
    }
    setInteraction({ kind: 'none' });
    setHubTab('road');
  }, [interaction.kind]);

  const isBlockingInteraction = useCallback((): boolean => {
    if (combatAlertVisible) return true;
    if (interaction.kind === 'combat') return true;
    if (!gameState?.currentTurn) return false;
    const { phase, activeInteractiveEvent } = gameState.currentTurn;
    if (phase === TurnPhase.AwaitingPlayer && activeInteractiveEvent) {
      return true;
    }
    if (
      interaction.kind === 'npc'
      && interaction.event
      && !isOptionalDialogueEvent(interaction.event)
      && phase === TurnPhase.AwaitingPlayer
    ) {
      return true;
    }
    return false;
  }, [combatAlertVisible, gameState, interaction]);

  useEffect(() => {
    if (!gameState) return;

    engineRef.current = new TurnEngine(
      gameState,
      (newState) => {
        lastEngineSnapshotRef.current = newState;
        setGame(newState);
        if (
          !newState.currentTurn
          && activeEventRef.current
          && isOptionalDialogueEvent(activeEventRef.current)
        ) {
          setActiveEvent(null);
        }
      },
      (event: GameEvent | null) => {
        if (!event) {
          setActiveEvent(null);
          return;
        }
        setActiveEvent(event);
        if (isCombatEvent(event)) {
          setPendingCombatEvent(event);
          setIsManualCombat(false);
          setCombatAlertVisible(true);
        }
      },
      (choices: LevelUpChoice[]) => {
        setLevelUpChoices(choices);
      },
    );
    lastEngineSnapshotRef.current = gameState;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!gameState || !engineRef.current) return;
    if (gameState === lastEngineSnapshotRef.current) return;
    engineRef.current.syncExternalState(gameState);
  }, [gameState]);

  const openInteraction = useCallback((next: Interaction) => {
    setHubTab('road');
    setInteraction(next);
  }, []);

  const handleHubTabPress = useCallback((tab: HubTab) => {
    if (isBlockingInteraction()) {
      Alert.alert('Cannot leave', 'Finish the current encounter first.');
      return;
    }
    if (interaction.kind === 'merchant' || interaction.kind === 'inn') {
      closeNonBlockingInteraction();
    }
    setHubTab(tab);
  }, [closeNonBlockingInteraction, interaction.kind, isBlockingInteraction]);

  const handleConfirmCombat = useCallback(() => {
    setCombatAlertVisible(false);
    setPendingCombatEvent(null);
    openInteraction({
      kind:   'combat',
      event:  activeEvent,
      manual: isManualCombat,
    });
  }, [activeEvent, isManualCombat, openInteraction]);

  const handleOpenCombat = useCallback(() => {
    if (!gameState) return;
    const currentLocation = getLocation(gameState.currentLocationId);
    const locationHasMobs = currentLocation.mobs.some(m => m.aggroPct > 0 && !m.isCompanion);
    const combatAvailable =
      isCombatEvent(activeEvent)
      || (locationHasMobs && !gameState.clearedCombatLocations.has(gameState.currentLocationId));
    if (!combatAvailable) return;

    if (!activeEvent) {
      setPendingCombatEvent(null);
      setIsManualCombat(true);
      setCombatAlertVisible(true);
      return;
    }

    handleConfirmCombat();
  }, [activeEvent, gameState, handleConfirmCombat]);

  const handleOpenShop = useCallback((shopName: string, entryNarrative: string) => {
    if (!gameState) return;

    const nextState: GameState = {
      ...gameState,
      turnHistory: [...gameState.turnHistory, createTradeJournalRecord(gameState, shopName)],
    };

    syncExternalGameState(nextState);
    openInteraction({ kind: 'merchant', entryNarrative, merchantName: shopName });
  }, [gameState, openInteraction, syncExternalGameState]);

  const handleOpenInn = useCallback(() => {
    openInteraction({ kind: 'inn' });
  }, [openInteraction]);

  const handleOpenNpc = useCallback((dialogueId: string, event: GameEvent | null = null) => {
    openInteraction({ kind: 'npc', dialogueId, event });
  }, [openInteraction]);

  const handleInteractiveEventComplete = useCallback(async (result: CombatResult) => {
    const engine = engineRef.current;
    if (!engine) return;

    const engineState = engine.getState();
    const awaitingInteractive =
      engineState.currentTurn?.phase === TurnPhase.AwaitingPlayer
      && !!engineState.currentTurn?.activeInteractiveEvent;

    if (awaitingInteractive) {
      await engine.resolveInteractiveEvent(result).catch(console.error);
    } else {
      await engine.resolveLocationCombat(engineState.currentLocationId, result).catch(console.error);
    }

    const after = engine.getState();
    if (!after.currentTurn?.activeInteractiveEvent) {
      setActiveEvent(null);
      if (!after.isComplete) {
        returnToRoad();
      }
    }
  }, [returnToRoad]);

  const handleNpcInteractionComplete = useCallback(async (outcome: DialogueSessionOutcome) => {
    const engine = engineRef.current;
    if (!engine || !gameState) return;

    const ctx = interaction.kind === 'npc' ? interaction : null;
    const event = ctx?.event ?? activeEvent;
    const dialogueId = ctx?.dialogueId ?? outcome.dialogueId;
    const completedEventId = event?.id ?? dialogueId;

    if (outcome.dialogueId) {
      engine.markDialogueSeen(outcome.dialogueId, gameState.currentLocationId);
    }

    for (const effect of outcome.companionEffects) {
      if (effect?.type === 'recruit') {
        const companion = getCompanion(effect.companionId);
        if (companion) engine.addCompanion(companion);
      }
    }

    const result = dialogueOutcomeToCombatResult(outcome);

    if (event) {
      const awaitingPlayer = engine.getState().currentTurn?.phase === TurnPhase.AwaitingPlayer;
      if (awaitingPlayer) {
        await engine.resolveInteractiveEvent(result, {
          eventId: completedEventId,
          result:  'dialogue_complete',
          summary: 'Dialogue completed.',
        }).catch(console.error);
        const afterEvent = engine.getState();
        const questMatch = findQuestForDialogue(afterEvent, dialogueId);
        if (questMatch) {
          syncExternalGameState(advanceCompanionQuest(afterEvent, questMatch.companionId));
        }
        const nextInteractiveEvent = engine.getState().currentTurn?.activeInteractiveEvent;
        if (!nextInteractiveEvent) {
          setActiveEvent(null);
          returnToRoad();
        }
      } else {
        await engine.applyStandaloneDialogueResult(result).catch(console.error);
        setActiveEvent(null);
        returnToRoad();
      }
      return;
    }

    const rawChoices = engine.applyLocationDialogueOutcome(outcome, dialogueId);
    syncExternalGameState(engine.getState());
    if (rawChoices) {
      setLevelUpChoices(buildLevelUpChoicePreviews(rawChoices, engine.getState().player.stats));
    }
    returnToRoad();
  }, [activeEvent, gameState, interaction, returnToRoad, syncExternalGameState]);

  const handleNpcBackToRoad = useCallback(async () => {
    const engine = engineRef.current;
    const event = interaction.kind === 'npc' ? interaction.event : activeEvent;
    if (event && isOptionalDialogueEvent(event)) {
      await engine?.dismissOptionalDialogue().catch(console.error);
      setActiveEvent(null);
    }
    returnToRoad();
  }, [activeEvent, interaction, returnToRoad]);

  const handleNpcSteal = useCallback(() => {
    if (!engineRef.current) return;
    returnToRoad();
    engineRef.current.submitAction({ action: PlayerAction.Steal }).catch(console.error);
  }, [returnToRoad]);

  const handleMerchantClose = useCallback(() => {
    setMerchantCloseKey(k => k + 1);
    returnToRoad();
  }, [returnToRoad]);

  const handleLevelUpChoice = useCallback((choiceId: string) => {
    if (engineRef.current?.getState().currentTurn?.phase === TurnPhase.AwaitingLevelUp) {
      engineRef.current.submitLevelUpChoice(choiceId);
      setLevelUpChoices(null);
      return;
    }

    if (!gameState) return;

    const choice = LEVEL_UP_CHOICES.find(levelUpChoice => levelUpChoice.id === choiceId);
    if (!choice) return;

    const nextState: GameState = {
      ...gameState,
      player: {
        ...gameState.player,
        stats: applyLevelUpChoice(gameState.player.stats, choice),
      },
    };

    syncExternalGameState(nextState);
    setLevelUpChoices(null);
  }, [gameState, syncExternalGameState]);

  const actionsLocked = !!gameState?.currentTurn
    && gameState.currentTurn.phase !== TurnPhase.AwaitingAction;

  const roadVisible = hubTab === 'road' && interaction.kind === 'none';

  return {
    engineRef,
    hubTab,
    interaction,
    activeEvent,
    levelUpChoices,
    combatAlertVisible,
    pendingCombatEvent,
    isManualCombat,
    merchantCloseKey,
    actionsLocked,
    roadVisible,
    isBlockingInteraction,
    handleHubTabPress,
    handleConfirmCombat,
    handleOpenCombat,
    handleOpenShop,
    handleOpenInn,
    handleOpenNpc,
    handleInteractiveEventComplete,
    handleNpcInteractionComplete,
    handleNpcBackToRoad,
    handleNpcSteal,
    handleMerchantClose,
    handleLevelUpChoice,
    returnToRoad,
  };
}
