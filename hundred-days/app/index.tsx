import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveEngine } from '@engine/SaveEngine';
import { useGameStore } from '@store/gameStore';
import { createNewGameState } from '@engine/GameState';
import type { SaveFile, RunHistoryEntry } from '@engine/types';
import { SettingsModal } from '@components';

export default function TitleScreen() {
  const [loading, setLoading]           = useState(true);
  const [activeSave, setActiveSave]     = useState<SaveFile | null>(null);
  const [history, setHistory]           = useState<RunHistoryEntry[]>([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initGame                        = useGameStore(s => s.initGame);

  useEffect(() => {
    async function load() {
      const [save, runs] = await Promise.all([
        saveEngine.getActiveSaveInfo(),
        saveEngine.getRunHistory(),
      ]);
      setActiveSave(save);
      setHistory(runs);
      setLoading(false);
    }
    load();
  }, []);

  async function handleNewGame() {
    await saveEngine.clearActiveRun();
    const state = createNewGameState();
    initGame(state);
    router.replace('/game');
  }

  async function handleContinue() {
    const result = await saveEngine.loadActiveRun();
    if (result.found && result.state) {
      initGame(result.state);
      router.replace('/game');
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-ink items-center justify-center">
        <ActivityIndicator color="#B8860B" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View className="items-center mt-8 mb-6">
          <Text className="font-display-bold text-blood text-center"
            style={{ fontSize: 32, letterSpacing: 2, lineHeight: 40 }}>
            100 DAYS{'\n'}TO SAVE{'\n'}THE WORLD
          </Text>
          <Text className="font-body-italic text-parchment-deep text-center mt-3"
            style={{ fontSize: 16 }}>
            A Fantasy Journey
          </Text>

          {/* Decorative rule */}
          <View className="w-24 h-px bg-gold mt-4" />
        </View>

        {/* Buttons */}
        <View className="gap-3 mb-8">
          {activeSave && (
            <TouchableOpacity
              onPress={handleContinue}
              className="bg-blood border border-gold rounded-sm py-4 px-6 items-center"
              activeOpacity={0.8}
            >
              <Text className="font-display text-parchment" style={{ fontSize: 14, letterSpacing: 1 }}>
                CONTINUE
              </Text>
              <Text className="font-body-italic text-parchment-deep mt-1" style={{ fontSize: 13 }}>
                Day {activeSave.dayNumber} · Location {activeSave.locationId} · Level {activeSave.playerLevel}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleNewGame}
            className="bg-ink-light border border-parchment-deep rounded-sm py-4 px-6 items-center"
            activeOpacity={0.8}
          >
            <Text className="font-display text-parchment" style={{ fontSize: 14, letterSpacing: 1 }}>
              {activeSave ? 'NEW GAME' : 'BEGIN THE JOURNEY'}
            </Text>
            {activeSave && (
              <Text className="font-body-italic text-mist mt-1" style={{ fontSize: 12 }}>
                Current run will be abandoned
              </Text>
            )}
          </TouchableOpacity>

          {history.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowHistory(h => !h)}
              className="border border-parchment-deep rounded-sm py-3 px-6 items-center"
              activeOpacity={0.8}
            >
              <Text className="font-display text-parchment-deep" style={{ fontSize: 12, letterSpacing: 1 }}>
                {showHistory ? 'HIDE' : 'PAST JOURNEYS'} ({history.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Run history */}
        {showHistory && (
          <View className="border border-parchment-deep rounded-sm p-4 mb-6">
            <Text className="font-display text-gold mb-3" style={{ fontSize: 12, letterSpacing: 1 }}>
              CHRONICLES
            </Text>
            {history.map((run, i) => (
              <View key={run.runId}
                className={`pb-3 mb-3 ${i < history.length - 1 ? 'border-b border-parchment-deep' : ''}`}
              >
                <Text className="font-display text-parchment" style={{ fontSize: 11 }}>
                  {run.outcome.toUpperCase()} · Level {run.finalLevel}
                </Text>
                <Text className="font-body-italic text-mist mt-1" style={{ fontSize: 13 }}>
                  {run.summary}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Flavour text */}
        <Text className="font-body-italic text-mist text-center" style={{ fontSize: 13, lineHeight: 20 }}>
          "The road to the Blasted Lands is long.{'\n'}
          No one who has walked it has found it short."
        </Text>

        {/* Settings link */}
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={{ alignSelf: 'center', marginTop: 24 }}
          activeOpacity={0.7}
        >
          <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 1 }}>
            ⚙ SETTINGS
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}
