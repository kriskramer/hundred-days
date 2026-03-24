import { View, Text, Animated, useEffect, useRef } from 'react-native';
import { GameState } from '@engine/types';

// ─────────────────────────────────────────
// StatusBar — persistent top chrome
// ─────────────────────────────────────────

export function StatusBar({ gameState }: { gameState: GameState }) {
  const foodLow  = gameState.resources.food < 3;
  const foodWarn = gameState.resources.food < 5;

  return (
    <View className="bg-ink flex-row items-center justify-between px-4 py-2">
      <Text className="font-display text-parchment" style={{ fontSize: 13, letterSpacing: 1 }}>
        Day{' '}
        <Text style={{ color: '#D4A017', fontSize: 18 }}>
          {gameState.dayNumber}
        </Text>
        <Text style={{ opacity: 0.5, fontSize: 11 }}> / 100</Text>
      </Text>

      <View className="flex-row gap-3 items-center">
        {/* Location */}
        <Pill label="▲" value={`Loc ${gameState.currentLocationId}`} />
        {/* Food */}
        <Pill
          label="◇"
          value={gameState.resources.food.toFixed(1)}
          valueColor={foodLow ? '#ff8080' : foodWarn ? '#ffcc44' : undefined}
        />
        {/* Gold */}
        <Pill label="★" value={String(gameState.resources.gold)} />
        {/* Level */}
        <Pill label="Lv" value={String(gameState.player.level)} />
      </View>
    </View>
  );
}

function Pill({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Text style={{ color: '#6B7C6E', fontSize: 11 }}>{label}</Text>
      <Text style={{
        fontFamily:  'Cinzel_600SemiBold',
        fontSize:    12,
        color:       valueColor ?? '#F5EAD6',
        letterSpacing: 0,
      }}>
        {value}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────
// JourneyBar — progress indicator
// ─────────────────────────────────────────

export function JourneyBar({ locationId }: { locationId: number }) {
  const pct = Math.min((locationId / 125) * 100, 100);
  return (
    <View style={{ height: 4, backgroundColor: '#2D1F0A' }}>
      <View style={{
        height:          '100%',
        width:           `${pct}%`,
        backgroundColor: '#B8860B',
        position:        'relative',
      }}>
        {/* Dot at the tip */}
        <View style={{
          position:        'absolute',
          right:           -4,
          top:             -3,
          width:           10,
          height:          10,
          borderRadius:    5,
          backgroundColor: '#D4A017',
          borderWidth:     2,
          borderColor:     '#F5EAD6',
        }} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// DreadBanner — pulses when dread is active
// ─────────────────────────────────────────

export function DreadBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <View style={{ backgroundColor: '#8B1A1A', paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{
        fontFamily:  'Cinzel_400Regular',
        fontSize:    11,
        color:       '#F5EAD6',
        letterSpacing: 1,
        textAlign:   'center',
      }}>
        ⚠ The days are running short. Dread settles in.
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────
// Toast — brief notification
// ─────────────────────────────────────────

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={{
      position:        'absolute',
      top:             60,
      left:            '10%',
      right:           '10%',
      backgroundColor: '#1A1208',
      borderRadius:    2,
      borderWidth:     1,
      borderColor:     '#B8860B',
      paddingVertical: 8,
      paddingHorizontal:16,
      zIndex:          50,
      alignItems:      'center',
    }}>
      <Text style={{
        fontFamily:  'Cinzel_400Regular',
        fontSize:    12,
        color:       '#F5EAD6',
        letterSpacing: 0.5,
      }}>
        {message}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────
// LevelUpModal
// ─────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { Modal, TouchableOpacity, ScrollView as RNScrollView, Switch } from 'react-native';
import { LevelUpChoice, TurnRecord, PlayerAction, AppSettings } from '@engine/types';
import { saveEngine } from '@engine/SaveEngine';

interface LevelUpModalProps {
  visible:     boolean;
  choices:     LevelUpChoice[];
  playerLevel: number;
  onChoose:    (choiceId: string) => void;
}

export function LevelUpModal({ visible, choices, playerLevel, onChoose }: LevelUpModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{
        flex:            1,
        backgroundColor: 'rgba(26,18,8,0.88)',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         24,
      }}>
        <View style={{
          backgroundColor: '#F5EAD6',
          borderWidth:     2,
          borderColor:     '#B8860B',
          borderRadius:    2,
          padding:         20,
          width:           '100%',
          maxWidth:        380,
        }}>
          <Text style={{
            fontFamily:  'Cinzel_600SemiBold',
            fontSize:    22,
            color:       '#B8860B',
            textAlign:   'center',
            letterSpacing: 2,
            marginBottom: 4,
          }}>
            Level {playerLevel}
          </Text>
          <Text style={{
            fontFamily:  'CrimsonText_400Regular_Italic',
            fontSize:    15,
            color:       '#3D2E18',
            textAlign:   'center',
            marginBottom: 16,
          }}>
            The road has made you stronger. Choose a path.
          </Text>

          {choices.map(choice => (
            <TouchableOpacity
              key={choice.id}
              onPress={() => onChoose(choice.id)}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#E8D5B0',
                borderWidth:     1,
                borderColor:     '#D4B880',
                borderRadius:    2,
                padding:         12,
                marginBottom:    8,
              }}
            >
              <Text style={{
                fontFamily:  'Cinzel_600SemiBold',
                fontSize:    14,
                color:       '#1A1208',
                marginBottom: 4,
              }}>
                {choice.label}
              </Text>
              <Text style={{
                fontFamily:  'CrimsonText_400Regular_Italic',
                fontSize:    13,
                color:       '#3D2E18',
              }}>
                {choice.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────
// JournalModal — turn history log viewer
// ─────────────────────────────────────────

const ACTION_LABELS: Record<PlayerAction, string> = {
  [PlayerAction.Move]:  'Travelled',
  [PlayerAction.Hunt]:  'Foraged',
  [PlayerAction.Rest]:  'Rested',
  [PlayerAction.Trade]: 'Traded',
  [PlayerAction.Rally]: 'Rallied',
  [PlayerAction.Camp]:  'Made Camp',
};

interface JournalModalProps {
  visible:  boolean;
  history:  TurnRecord[];
  onClose:  () => void;
}

export function JournalModal({ visible, history, onClose }: JournalModalProps) {
  const reversed = [...history].reverse();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F5EAD6' }}>

        {/* Header */}
        <View style={{
          backgroundColor: '#1A1208',
          paddingTop:      48,
          paddingBottom:   14,
          paddingHorizontal: 20,
          flexDirection:   'row',
          alignItems:      'center',
          justifyContent:  'space-between',
          borderBottomWidth: 2,
          borderBottomColor: '#B8860B',
        }}>
          <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: '#F5EAD6', letterSpacing: 1.5 }}>
            CHRONICLES
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#6B7C6E', letterSpacing: 1 }}>
              CLOSE ✕
            </Text>
          </TouchableOpacity>
        </View>

        {history.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 16, color: '#6B7C6E', textAlign: 'center' }}>
              The road stretches ahead, unwritten.{'\n'}Your story has yet to begin.
            </Text>
          </View>
        ) : (
          <RNScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {reversed.map((record, i) => (
              <JournalEntry key={`${record.dayNumber}_${i}`} record={record} />
            ))}
          </RNScrollView>
        )}
      </View>
    </Modal>
  );
}

function JournalEntry({ record }: { record: TurnRecord }) {
  // Summarise net deltas across the turn
  let netFood = 0, netGold = 0, netHealth = 0, netMorale = 0;
  for (const d of record.deltas) {
    netFood   += d.food   ?? 0;
    netGold   += d.gold   ?? 0;
    netHealth += d.health ?? 0;
    netMorale += d.morale ?? 0;
  }

  function delta(val: number, label: string) {
    if (Math.abs(val) < 0.1) return null;
    const pos   = val > 0;
    const color = pos ? '#4A8A5A' : '#8B1A1A';
    return (
      <Text key={label} style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color, marginRight: 6 }}>
        {pos ? '+' : ''}{Math.round(val)} {label}
      </Text>
    );
  }

  const hasDelta = [netFood, netGold, netHealth, netMorale].some(v => Math.abs(v) >= 0.1);

  return (
    <View style={{
      borderBottomWidth: 1,
      borderBottomColor: '#E8D5B0',
      paddingVertical:   12,
    }}>
      {/* Day + action */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 11, color: '#B8860B', marginRight: 8, letterSpacing: 0.5 }}>
          DAY {record.dayNumber}
        </Text>
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#6B7C6E', letterSpacing: 0.8 }}>
          {ACTION_LABELS[record.action] ?? record.action.toUpperCase()}
          {record.levelUpOccurred ? '  · LEVELLED UP' : ''}
        </Text>
      </View>

      {/* Narrative */}
      {record.narrativeSummary ? (
        <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 14, color: '#2D1F0A', lineHeight: 21, marginBottom: 6 }}>
          {record.narrativeSummary}
        </Text>
      ) : null}

      {/* Events */}
      {record.eventsTriggered.length > 0 && (
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#6B7C6E', letterSpacing: 0.5, marginBottom: 4 }}>
          {record.eventsTriggered.map(id => id.replace(/_/g, ' ')).join('  ·  ')}
        </Text>
      )}

      {/* Net deltas */}
      {hasDelta && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
          {delta(netFood,   'food')}
          {delta(netGold,   'gold')}
          {delta(netHealth, 'hp')}
          {delta(netMorale, 'morale')}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// SettingsModal
// ─────────────────────────────────────────

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (visible) {
      saveEngine.loadSettings().then(setSettings);
    }
  }, [visible]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveEngine.saveSettings(next);
      return next;
    });
  }, []);

  if (!settings) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F5EAD6' }}>

        {/* Header */}
        <View style={{
          backgroundColor:   '#1A1208',
          paddingTop:        48,
          paddingBottom:     14,
          paddingHorizontal: 20,
          flexDirection:     'row',
          alignItems:        'center',
          justifyContent:    'space-between',
          borderBottomWidth: 2,
          borderBottomColor: '#B8860B',
        }}>
          <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: '#F5EAD6', letterSpacing: 1.5 }}>
            SETTINGS
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#6B7C6E', letterSpacing: 1 }}>
              CLOSE ✕
            </Text>
          </TouchableOpacity>
        </View>

        <RNScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <SettingsSection label="Audio">
            <ToggleRow
              label="Sound effects"
              value={settings.soundEnabled}
              onToggle={v => update({ soundEnabled: v })}
            />
            <SettingsRow label="Music volume">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => update({ musicVolume: Math.max(0, +(settings.musicVolume - 0.1).toFixed(1)) })}
                  style={settingsStyles.stepBtn}
                  activeOpacity={0.7}
                >
                  <Text style={settingsStyles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={settingsStyles.valueText}>{Math.round(settings.musicVolume * 100)}%</Text>
                <TouchableOpacity
                  onPress={() => update({ musicVolume: Math.min(1, +(settings.musicVolume + 0.1).toFixed(1)) })}
                  style={settingsStyles.stepBtn}
                  activeOpacity={0.7}
                >
                  <Text style={settingsStyles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection label="Gameplay">
            <ToggleRow
              label="Confirm actions"
              value={settings.confirmActions}
              onToggle={v => update({ confirmActions: v })}
            />
            <ToggleRow
              label="Show damage numbers"
              value={settings.showDamageNumbers}
              onToggle={v => update({ showDamageNumbers: v })}
            />
          </SettingsSection>

          <SettingsSection label="Text Speed">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['slow', 'normal', 'fast', 'instant'] as AppSettings['textSpeed'][]).map(speed => (
                <TouchableOpacity
                  key={speed}
                  onPress={() => update({ textSpeed: speed })}
                  activeOpacity={0.8}
                  style={[
                    settingsStyles.speedPill,
                    settings.textSpeed === speed && settingsStyles.speedPillActive,
                  ]}
                >
                  <Text style={[
                    settingsStyles.speedPillText,
                    settings.textSpeed === speed && settingsStyles.speedPillTextActive,
                  ]}>
                    {speed.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsSection>
        </RNScrollView>
      </View>
    </Modal>
  );
}

function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: '#6B7C6E', letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ backgroundColor: '#E8D5B0', borderWidth: 1, borderColor: '#D4B880', borderRadius: 2 }}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#D4B880' }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 13, color: '#1A1208', letterSpacing: 0.3 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#D4B880' }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 13, color: '#1A1208', letterSpacing: 0.3 }}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#6B7C6E', true: '#B8860B' }}
        thumbColor={value ? '#D4A017' : '#D4B880'}
      />
    </View>
  );
}

const settingsStyles = {
  stepBtn: {
    width:           32,
    height:          32,
    backgroundColor: '#1A1208',
    borderRadius:    2,
    alignItems:      'center' as const,
    justifyContent:  'center' as const,
    borderWidth:     1,
    borderColor:     '#B8860B',
  },
  stepBtnText: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    16,
    color:       '#F5EAD6',
  },
  valueText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    13,
    color:       '#1A1208',
    minWidth:    40,
    textAlign:   'center' as const,
  },
  speedPill: {
    paddingVertical:   7,
    paddingHorizontal: 14,
    borderRadius:      2,
    borderWidth:       1,
    borderColor:       '#D4B880',
    backgroundColor:   '#F5EAD6',
  },
  speedPillActive: {
    backgroundColor: '#1A1208',
    borderColor:     '#B8860B',
  },
  speedPillText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    color:       '#6B7C6E',
    letterSpacing: 0.8,
  },
  speedPillTextActive: {
    color: '#F5EAD6',
  },
};
