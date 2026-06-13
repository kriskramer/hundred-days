import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGameStore } from '@store/gameStore';
import { saveEngine } from '@engine/SaveEngine';

import { RoadScreen }      from '@screens/RoadScreen';
import { CombatScreen }    from '@screens/CombatScreen';
import { InventoryScreen } from '@screens/InventoryScreen';
import { MapScreen }       from '@screens/MapScreen';
import { NpcInteractionScreen } from '@screens/NpcInteractionScreen';
import { MerchantScreen }  from '@screens/MerchantScreen';
import { InnScreen }       from '@screens/InnScreen';

import {
  StatusBar,
  JourneyBar,
  LevelUpModal,
  Toast,
  JournalModal,
  SettingsModal,
  CombatAlertModal,
} from '@components';

import type { AppSettings } from '@engine/types';
import { getLocation } from '@data/locations';
import {
  useGameNavigation,
  type HubTab,
  type NavItemId,
} from '@hooks/useGameNavigation';

const TABS: { id: NavItemId; label: string; icon: string }[] = [
  { id: 'road',      label: 'Road',     icon: '◆' },
  { id: 'inventory', label: 'Gear',     icon: '▲' },
  { id: 'map',       label: 'Map',      icon: '◈' },
  { id: 'journal',   label: 'Journal',  icon: '◎' },
  { id: 'settings',  label: 'Settings', icon: '⚙' },
];

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const [toastMsg, setToastMsg] = useState('');
  const [journalOpen, setJournalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const gameState = useGameStore(s => s.gameState);
  const setGame = useGameStore(s => s.setGameState);
  const clearGame = useGameStore(s => s.clearGame);

  const nav = useGameNavigation({ gameState, setGame });

  useEffect(() => {
    if (!gameState) { router.replace('/'); }
  }, [gameState]);

  useEffect(() => {
    saveEngine.loadSettings().then(setSettings).catch(console.error);
  }, []);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
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

  useEffect(() => {
    if (gameState?.isComplete) { handleRunComplete(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.isComplete]);

  if (!gameState) return null;

  const engine = nav.engineRef.current;
  const currentLocation = getLocation(gameState.currentLocationId);
  const bottomNavInset = 66 + insets.bottom;
  const blocking = nav.isBlockingInteraction();

  function handleNavPress(tab: NavItemId) {
    if (tab === 'journal') {
      setJournalOpen(true);
      return;
    }
    if (tab === 'settings') {
      setSettingsOpen(true);
      return;
    }
    nav.handleHubTabPress(tab as HubTab);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5EAD6' }} edges={['top']}>
      <View>
        <StatusBar />
        <JourneyBar />
      </View>

      <Toast message={toastMsg} />

      <View style={{ flex: 1, paddingBottom: bottomNavInset }}>
        <View style={{ flex: 1, display: nav.roadVisible ? 'flex' : 'none' }}>
          <RoadScreen
            gameState={gameState}
            engine={engine}
            onToast={showToast}
            onOpenShop={nav.handleOpenShop}
            onOpenCombat={nav.handleOpenCombat}
            onOpenNpc={nav.handleOpenNpc}
            onOpenInn={nav.handleOpenInn}
            activeEvent={nav.activeEvent}
            actionsLocked={nav.actionsLocked}
            textInterval={settings?.textSpeed === 'slow'
              ? 45
              : settings?.textSpeed === 'fast'
                ? 8
                : settings?.textSpeed === 'instant'
                  ? 0
                  : 22}
            confirmActions={settings?.confirmActions ?? true}
            merchantCloseKey={nav.merchantCloseKey}
          />
        </View>

        {nav.interaction.kind === 'combat' && (
          <CombatScreen
            gameState={gameState}
            engine={engine}
            event={nav.interaction.event}
            onComplete={nav.handleInteractiveEventComplete}
            onToast={showToast}
          />
        )}

        {nav.interaction.kind === 'npc' && (
          <NpcInteractionScreen
            gameState={gameState}
            dialogueId={nav.interaction.dialogueId}
            event={nav.interaction.event}
            onComplete={nav.handleNpcInteractionComplete}
            onToast={showToast}
            onSteal={nav.handleNpcSteal}
            onBackToRoad={nav.handleNpcBackToRoad}
          />
        )}

        {nav.interaction.kind === 'merchant' && (
          <MerchantScreen
            onBackToRoad={nav.handleMerchantClose}
            onToast={showToast}
            merchantEntryNarrative={nav.interaction.entryNarrative}
          />
        )}

        {nav.interaction.kind === 'inn' && (
          <InnScreen
            gameState={gameState}
            engine={engine}
            activeEvent={nav.activeEvent}
            onBackToRoad={nav.returnToRoad}
            onRestComplete={nav.returnToRoad}
            onTavernComplete={nav.handleNpcInteractionComplete}
            onToast={showToast}
          />
        )}

        {nav.hubTab === 'inventory' && nav.interaction.kind === 'none' && (
          <InventoryScreen
            gameState={gameState}
            onToast={showToast}
          />
        )}

        {nav.hubTab === 'map' && nav.interaction.kind === 'none' && (
          <MapScreen
            gameState={gameState}
            onToast={showToast}
          />
        )}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1A1208', borderTopWidth: 2, borderTopColor: '#B8860B', flexDirection: 'row', paddingBottom: insets.bottom }}>
        {TABS.map(tab => {
          const isHubTab = tab.id === 'road' || tab.id === 'inventory' || tab.id === 'map';
          const active = isHubTab
            ? (tab.id === 'road' ? nav.roadVisible : nav.hubTab === tab.id && nav.interaction.kind === 'none')
            : false;
          const disabled = blocking && isHubTab && tab.id !== 'road';
          const textColor = active ? '#D4A017' : disabled ? '#5A6A62' : '#A0B8AA';

          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => handleNavPress(tab.id)}
              disabled={disabled}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}
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

      <LevelUpModal
        visible={!!nav.levelUpChoices}
        choices={nav.levelUpChoices ?? []}
        onChoose={(choiceId) => {
          nav.handleLevelUpChoice(choiceId);
          showToast('Level up applied!');
        }}
      />

      <JournalModal
        visible={journalOpen}
        onClose={() => setJournalOpen(false)}
      />

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRestart={handleRestart}
        onSettingsChanged={setSettings}
      />

      <CombatAlertModal
        visible={nav.combatAlertVisible}
        event={nav.pendingCombatEvent}
        locationName={currentLocation.name}
        isManualCombat={nav.isManualCombat}
        onConfirm={nav.handleConfirmCombat}
      />
    </SafeAreaView>
  );
}
