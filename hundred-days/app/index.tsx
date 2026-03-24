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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1A1208' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: '#8B1A1A', textAlign: 'center', fontSize: 34, letterSpacing: 3, lineHeight: 44 }}>
            100 DAYS{'\n'}TO SAVE{'\n'}THE WORLD
          </Text>
          <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: '#C8B89A', textAlign: 'center', fontSize: 16, marginTop: 12 }}>
            A Fantasy Journey
          </Text>
          <View style={{ width: 80, height: 1, backgroundColor: '#B8860B', marginTop: 20 }} />
        </View>

        {/* Buttons */}
        <View style={{ width: '100%', maxWidth: 340, alignItems: 'center', gap: 12, marginBottom: 48 }}>
          {activeSave && (
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.75}
              style={{
                width: '100%',
                backgroundColor: '#8B1A1A',
                borderWidth: 1.5,
                borderColor: '#C94040',
                borderRadius: 3,
                alignItems: 'center',
                paddingVertical: 16,
                paddingHorizontal: 24,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: '#F5EAD6', fontSize: 14, letterSpacing: 1.5 }}>
                CONTINUE
              </Text>
              <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: '#F5EAD6', fontSize: 13, marginTop: 4, opacity: 0.75 }}>
                Day {activeSave.dayNumber} · Loc {activeSave.locationId} · Lv {activeSave.playerLevel}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleNewGame}
            activeOpacity={0.75}
            style={{
              width: '100%',
              backgroundColor: '#1A1208',
              borderWidth: 1.5,
              borderColor: activeSave ? '#3A2E1C' : '#C94040',
              borderRadius: 3,
              alignItems: 'center',
              paddingVertical: 16,
              paddingHorizontal: 24,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.4,
              shadowRadius: 4,
              elevation: 5,
            }}
          >
            <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: '#F5EAD6', fontSize: 14, letterSpacing: 1.5 }}>
              {activeSave ? 'NEW GAME' : 'BEGIN THE JOURNEY'}
            </Text>
            {activeSave && (
              <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: '#6B7C6E', fontSize: 12, marginTop: 4 }}>
                Current run will be abandoned
              </Text>
            )}
          </TouchableOpacity>

          {history.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowHistory(h => !h)}
              activeOpacity={0.8}
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ fontFamily: 'Cinzel_400Regular', color: '#6B7C6E', fontSize: 11, letterSpacing: 1 }}>
                {showHistory ? 'HIDE CHRONICLES' : `PAST JOURNEYS (${history.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Run history */}
        {showHistory && (
          <View style={{ width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#3A2E1C', borderRadius: 2, padding: 16, marginBottom: 48 }}>
            <Text style={{ fontFamily: 'Cinzel_400Regular', color: '#B8860B', fontSize: 11, letterSpacing: 1, marginBottom: 12 }}>
              CHRONICLES
            </Text>
            {history.map((run, i) => (
              <View key={run.runId} style={{ paddingBottom: 12, marginBottom: i < history.length - 1 ? 12 : 0, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: '#3A2E1C' }}>
                <Text style={{ fontFamily: 'Cinzel_400Regular', color: '#F5EAD6', fontSize: 11, letterSpacing: 0.5 }}>
                  {run.outcome.toUpperCase()} · Level {run.finalLevel}
                </Text>
                <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: '#6B7C6E', fontSize: 13, marginTop: 4 }}>
                  {run.summary}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Flavour quote */}
        <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: '#6B7C6E', textAlign: 'center', fontSize: 14, lineHeight: 22, marginBottom: 32 }}>
          "The road to the Blasted Lands is long.{'\n'}No one who has walked it has found it short."
        </Text>

        {/* Settings */}
        <TouchableOpacity onPress={() => setSettingsOpen(true)} activeOpacity={0.7}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', color: '#3A2E1C', fontSize: 11, letterSpacing: 1 }}>
            ⚙ SETTINGS
          </Text>
        </TouchableOpacity>

      </ScrollView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}
