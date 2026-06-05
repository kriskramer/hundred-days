import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGameStore } from '@store/gameStore';
import { TurnEngine } from '@engine/TurnEngine';
import { saveEngine } from '@engine/SaveEngine';

// Screens
import { RoadScreen }      from '@screens/RoadScreen';
import { CombatScreen }    from '@screens/CombatScreen';
import { DialogueScreen }  from '@screens/DialogueScreen';
import { InventoryScreen } from '@screens/InventoryScreen';
import { MapScreen }       from '@screens/MapScreen';
import { ShopScreen }      from '@screens/ShopScreen';

// Components
import {
  StatusBar,
  JourneyBar,
  LevelUpModal,
  Toast,
  JournalModal,
  SettingsModal,
  CombatAlertModal,
} from '@components';

import type { GameEvent, LevelUpChoice, CombatResult, AppSettings, GameState } from '@engine/types';
import { findDialogueForLocation } from '@engine/DialogueEngine';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';
import { getCompanion } from '@data/companions';
import { getLocation }  from '@data/locations';
import { isCombatEvent } from '@utils/isCombatEvent';

type Tab = 'road' | 'combat' | 'dialogue' | 'inventory' | 'map';
type NavItemId = Tab | 'journal' | 'settings';

const TABS: { id: NavItemId; label: string; icon: string }[] = [
  { id: 'road',      label: 'Road',     icon: '◆' },
  { id: 'inventory', label: 'Gear',     icon: '▲' },
  { id: 'map',       label: 'Map',      icon: '◈' },
  { id: 'journal',   label: 'Journal',  icon: '◎' },
  { id: 'settings',  label: 'Settings', icon: '⚙' },
];

export default function GameScreen() {
  const insets                                = useSafeAreaInsets();
  const [activeTab, setActiveTab]             = useState<Tab>('road');
  const [activeEvent, setActiveEvent]         = useState<GameEvent | null>(null);
  const [levelUpChoices, setLevelUpChoices]   = useState<LevelUpChoice[] | null>(null);
  const [toastMsg, setToastMsg]               = useState('');
  const [shopOpen, setShopOpen]               = useState(false);
  const [journalOpen, setJournalOpen]         = useState(false);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [settings, setSettings]               = useState<AppSettings | null>(null);
  const [combatAlertVisible, setCombatAlertVisible] = useState(false);
  const [pendingCombatEvent, setPendingCombatEvent] = useState<GameEvent | null>(null);
  const [isManualCombat, setIsManualCombat]         = useState(false);
  const engineRef                             = useRef<TurnEngine | null>(null);
  const lastEngineSnapshotRef                 = useRef<GameState | null>(null);

  const gameState  = useGameStore(s => s.gameState);
  const setGame    = useGameStore(s => s.setGameState);
  const clearGame  = useGameStore(s => s.clearGame);

  // Guard: redirect to title if no state
  useEffect(() => {
    if (!gameState) { router.replace('/'); }
  }, [gameState]);

  // Initialise engine once on mount
  useEffect(() => {
    if (!gameState) return;

    engineRef.current = new TurnEngine(
      gameState,
      // onStateChange
      (newState) => {
        lastEngineSnapshotRef.current = newState;
        setGame(newState);
        // Auto-save handled inside TurnEngine.cleanup()
      },
      // onAwaitInput (interactive event — combat or dialogue)
      (event: GameEvent) => {
        setActiveEvent(event);
        if (isCombatEvent(event)) {
          setPendingCombatEvent(event);
          setIsManualCombat(false);
          setCombatAlertVisible(true);
        }
        if (event.type === 'dialogue') setActiveTab('dialogue');
      },
      // onLevelUp
      (choices: LevelUpChoice[]) => {
        setLevelUpChoices(choices);
      },
    );
    lastEngineSnapshotRef.current = gameState;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once — engine holds its own state reference

  useEffect(() => {
    if (!gameState || !engineRef.current) return;
    if (gameState === lastEngineSnapshotRef.current) return;
    engineRef.current.syncExternalState(gameState);
  }, [gameState]);

  useEffect(() => {
    saveEngine.loadSettings().then(setSettings).catch(console.error);
  }, []);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  }

  async function handleInteractiveEventComplete(result: CombatResult) {
    if (activeEvent) {
      // Event-driven combat: feed result back into the turn engine
      await engineRef.current?.resolveInteractiveEvent(result);
    } else {
      // Location-initiated combat: apply result and mark location cleared
      const locationId = gameState?.currentLocationId;
      if (locationId !== undefined) {
        await engineRef.current?.resolveLocationCombat(locationId, result).catch(console.error);
      }
    }
    const nextInteractiveEvent = engineRef.current?.getState().currentTurn?.activeInteractiveEvent;
    if (!nextInteractiveEvent) {
      setActiveEvent(null);
      setActiveTab('road');
    }
  }

  function handleConfirmCombat() {
    setCombatAlertVisible(false);
    setPendingCombatEvent(null);
    setActiveTab('combat');
  }

  function handleOpenCombat() {
    if (!combatAvailable) return;

    if (!activeEvent) {
      setPendingCombatEvent(null);
      setIsManualCombat(true);
      setCombatAlertVisible(true);
      return;
    }

    handleConfirmCombat();
  }

  function handleOpenDialogue() {
    if (!dialogueAvailable) return;
    setActiveTab('dialogue');
  }

  async function handleDialogueComplete(outcome: DialogueSessionOutcome) {
    const completedEventId = activeEvent?.id ?? outcome.dialogueId;

    // Mark the dialogue as seen at this location so it won't re-trigger here
    if (outcome.dialogueId && gameState) {
      engineRef.current?.markDialogueSeen(outcome.dialogueId, gameState.currentLocationId);
    }

    // Recruit any companions before the turn engine continues
    for (const effect of outcome.companionEffects) {
      if (effect && effect.type === 'recruit') {
        const companion = getCompanion(effect.companionId);
        if (companion) engineRef.current?.addCompanion(companion);
      }
    }

    // Convert to CombatResult and resume the turn
    const result: CombatResult = {
      outcome:           'negotiated',
      roundsFought:      0,
      xpGained:          outcome.xpGained,
      goldGained:        outcome.resourceDeltas.gold,
      foodGained:        outcome.resourceDeltas.food,
      healthLost:        -(outcome.resourceDeltas.health ?? 0),
      healthDelta:       outcome.resourceDeltas.health ?? 0,
      moraleDelta:       outcome.moraleDelta,
      reputationDelta:   outcome.reputationDelta,
      injuriesGained:    [],
      companionInjuries: {},
    };
    if (activeEvent) {
      await engineRef.current?.resolveInteractiveEvent(result, {
        eventId: completedEventId,
        result: 'dialogue_complete',
        summary: 'Dialogue completed.',
      }).catch(console.error);
      const nextInteractiveEvent = engineRef.current?.getState().currentTurn?.activeInteractiveEvent;
      if (!nextInteractiveEvent) {
        setActiveEvent(null);
        setActiveTab('road');
      }
      return;
    }

    await handleInteractiveEventComplete(result);
  }

  function handleLevelUpChoice(choiceId: string) {
    engineRef.current?.submitLevelUpChoice(choiceId);
    setLevelUpChoices(null);
    showToast('Level up applied!');
  }

  async function handleRestart() {
    setSettingsOpen(false);
    await saveEngine.clearActiveRun();
    clearGame();
    router.replace('/');
  }

  async function handleRunComplete() {
    Alert.alert(
      gameState?.outcome === 'victory' ? 'Victory!' : 'The Journey Ends',
      gameState?.outcome === 'victory'
        ? 'You have defeated the Dread Sovereign. The world is saved.'
        : 'Your journey ends here. The darkness claims what it will.',
      [{ text: 'Return to Title', onPress: () => router.replace('/') }]
    );
  }

  // Check for run completion
  useEffect(() => {
    if (gameState?.isComplete) { handleRunComplete(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.isComplete]);

  if (!gameState) return null;

  const engine = engineRef.current;

  // Combat tab is accessible only when an event demands it, or the location has
  // uncleared dangerous mobs.
  const currentLocation  = getLocation(gameState.currentLocationId);
  const locationHasMobs  = currentLocation.mobs.some(m => m.aggroPct > 0 && !m.isCompanion);
  const combatAvailable  =
    isCombatEvent(activeEvent) ||
    (locationHasMobs && !gameState.clearedCombatLocations.has(gameState.currentLocationId));
  const dialogueAvailable =
    (activeEvent?.interactiveHandlerId === 'dialogue_handler' && !!activeEvent.id) ||
    findDialogueForLocation(gameState.currentLocationId, gameState) !== null;
  const bottomNavInset = 66 + insets.bottom;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5EAD6' }} edges={['top']}>

      {/* Fixed top chrome */}
      <View>
        <StatusBar gameState={gameState} />
        <JourneyBar locationId={gameState.currentLocationId} dreadActive={gameState.morale.dreadActive} />
      </View>

      {/* Toast */}
      <Toast message={toastMsg} />

      {/* Screen area */}
      <View style={{ flex: 1, paddingBottom: bottomNavInset }}>
        <View style={{ flex: 1, display: activeTab === 'road' ? 'flex' : 'none' }}>
          <RoadScreen
            gameState={gameState}
            engine={engine}
            onToast={showToast}
            onOpenShop={() => setShopOpen(true)}
            onOpenCombat={handleOpenCombat}
            onOpenDialogue={handleOpenDialogue}
            textInterval={settings?.textSpeed === 'slow'
              ? 45
              : settings?.textSpeed === 'fast'
                ? 8
                : settings?.textSpeed === 'instant'
                  ? 0
                  : 22}
            confirmActions={settings?.confirmActions ?? true}
          />
        </View>
        {activeTab === 'combat'    && (
          <CombatScreen
            gameState={gameState}
            engine={engine}
            event={activeEvent}
            onComplete={handleInteractiveEventComplete}
            onToast={showToast}
          />
        )}
        {activeTab === 'dialogue'  && (
          <DialogueScreen
            gameState={gameState}
            event={activeEvent}
            onComplete={handleDialogueComplete}
            onToast={showToast}
            onBackToRoad={() => setActiveTab('road')}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryScreen
            gameState={gameState}
            onToast={showToast}
          />
        )}
        {activeTab === 'map'       && (
          <MapScreen
            gameState={gameState}
            onToast={showToast}
          />
        )}
      </View>

      {/* Bottom navigation */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1A1208', borderTopWidth: 2, borderTopColor: '#B8860B', flexDirection: 'row', paddingBottom: insets.bottom }}>
        {TABS.map(tab => {
          const active    = tab.id === 'road' || tab.id === 'inventory' || tab.id === 'map'
            ? activeTab === tab.id
            : false;
          const textColor = active ? '#D4A017' : '#A0B8AA';
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => {
                if (tab.id === 'journal') {
                  setJournalOpen(true);
                  return;
                }

                if (tab.id === 'settings') {
                  setSettingsOpen(true);
                  return;
                }

                setActiveTab(tab.id);
              }}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 18, color: textColor }}>
                {tab.icon}
              </Text>
              <Text style={{
                fontFamily:    'Cinzel_400Regular',
                fontSize:      10,
                letterSpacing: 1,
                color:         textColor,
                marginTop:     3,
              }}>
                {tab.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Shop modal */}
      <ShopScreen
        gameState={gameState}
        locationId={gameState.currentLocationId}
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        onToast={showToast}
      />

      {/* Level-up modal */}
      <LevelUpModal
        visible={!!levelUpChoices}
        choices={levelUpChoices ?? []}
        playerLevel={gameState.player.level ?? 0}
        onChoose={handleLevelUpChoice}
      />

      {/* Journal modal */}
      <JournalModal
        visible={journalOpen}
        history={gameState.turnHistory}
        onClose={() => setJournalOpen(false)}
      />

      {/* Settings modal */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRestart={handleRestart}
        onSettingsChanged={setSettings}
      />

      {/* Combat Alert popup */}
      <CombatAlertModal
        visible={combatAlertVisible}
        event={pendingCombatEvent}
        locationName={currentLocation.name}
        isManualCombat={isManualCombat}
        onConfirm={handleConfirmCombat}
      />

    </SafeAreaView>
  );
}
