import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  DreadBanner,
  LevelUpModal,
  Toast,
  JournalModal,
  SettingsModal,
} from '@components';

import type { GameEvent, LevelUpChoice, CombatResult } from '@engine/types';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';
import { getCompanion } from '@data/companions';
import { getLocation }  from '@data/locations';

type Tab = 'road' | 'combat' | 'dialogue' | 'inventory' | 'map';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'road',      label: 'Road',      icon: '◆' },
  { id: 'combat',    label: 'Combat',    icon: '⚔' },
  { id: 'dialogue',  label: 'Talk',      icon: '◇' },
  { id: 'inventory', label: 'Pack',      icon: '▲' },
  { id: 'map',       label: 'Map',       icon: '◈' },
];

export default function GameScreen() {
  const [activeTab, setActiveTab]             = useState<Tab>('road');
  const [activeEvent, setActiveEvent]         = useState<GameEvent | null>(null);
  const [levelUpChoices, setLevelUpChoices]   = useState<LevelUpChoice[] | null>(null);
  const [toastMsg, setToastMsg]               = useState('');
  const [shopOpen, setShopOpen]               = useState(false);
  const [journalOpen, setJournalOpen]         = useState(false);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const engineRef                             = useRef<TurnEngine | null>(null);

  const gameState  = useGameStore(s => s.gameState);
  const setGame    = useGameStore(s => s.setGameState);

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
        setGame(newState);
        // Auto-save handled inside TurnEngine.cleanup()
      },
      // onAwaitInput (interactive event — combat or dialogue)
      (event: GameEvent) => {
        setActiveEvent(event);
        if (event.type === 'combat')   setActiveTab('combat');
        if (event.type === 'dialogue') setActiveTab('dialogue');
      },
      // onLevelUp
      (choices: LevelUpChoice[]) => {
        setLevelUpChoices(choices);
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once — engine holds its own state reference

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  }

  function handleInteractiveEventComplete(result: CombatResult) {
    if (activeEvent) {
      // Event-driven combat: feed result back into the turn engine
      engineRef.current?.resolveInteractiveEvent(result);
    } else {
      // Location-initiated combat: apply result and mark location cleared
      const locationId = gameState?.currentLocationId;
      if (locationId !== undefined) {
        engineRef.current?.resolveLocationCombat(locationId, result).catch(console.error);
      }
    }
    setActiveEvent(null);
    setActiveTab('road');
  }

  function handleDialogueComplete(outcome: DialogueSessionOutcome) {
    // Mark the dialogue as seen at this location so it won't re-trigger here
    if (outcome.dialogueId && gameState) {
      engineRef.current?.markDialogueSeen(outcome.dialogueId, gameState.currentLocationId);
    }

    // Recruit any companions before the turn engine continues
    for (const effect of outcome.companionEffects) {
      if (effect.type === 'recruit') {
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
      moraleDelta:       outcome.moraleDelta,
      reputationDelta:   outcome.reputationDelta,
      injuriesGained:    [],
      companionInjuries: {},
    };
    handleInteractiveEventComplete(result);
  }

  function handleLevelUpChoice(choiceId: string) {
    engineRef.current?.submitLevelUpChoice(choiceId);
    setLevelUpChoices(null);
    showToast('Level up applied!');
  }

  async function handleRestart() {
    setSettingsOpen(false);
    await saveEngine.clearActiveRun();
    setGame(null);
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
    activeEvent?.type === 'combat' ||
    (locationHasMobs && !gameState.clearedCombatLocations.has(gameState.currentLocationId));

  return (
    <SafeAreaView className="flex-1 bg-parchment" edges={['top']}>

      {/* Persistent top chrome */}
      <StatusBar gameState={gameState} />
      <JourneyBar locationId={gameState.currentLocationId} />
      <DreadBanner active={gameState.morale.dreadActive} />

      {/* Utility bar — journal + settings */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: '#1A1208', paddingHorizontal: 14, paddingBottom: 6, gap: 16 }}>
        <TouchableOpacity onPress={() => setJournalOpen(true)} activeOpacity={0.7}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#A0B8AA', letterSpacing: 1 }}>◎ JOURNAL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsOpen(true)} activeOpacity={0.7}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#A0B8AA', letterSpacing: 1 }}>⚙ SETTINGS</Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      <Toast message={toastMsg} />

      {/* Screen area */}
      <View className="flex-1">
        {activeTab === 'road'      && (
          <RoadScreen
            gameState={gameState}
            engine={engine}
            onToast={showToast}
            onOpenShop={() => setShopOpen(true)}
          />
        )}
        {activeTab === 'combat'    && (
          <CombatScreen
            gameState={gameState}
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
      <View style={{ backgroundColor: '#1A1208', borderTopWidth: 2, borderTopColor: '#B8860B', flexDirection: 'row' }}>
        {TABS.map(tab => {
          const active    = activeTab === tab.id;
          const disabled  = tab.id === 'combat' && !combatAvailable;
          const textColor = active ? '#D4A017' : disabled ? '#3A3A3A' : '#A0B8AA';
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => { if (!disabled) setActiveTab(tab.id); }}
              activeOpacity={disabled ? 1 : 0.7}
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
      />

    </SafeAreaView>
  );
}
