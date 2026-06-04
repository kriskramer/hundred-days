import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { AppSettings } from '@engine/types';
import { saveEngine } from '@engine/SaveEngine';

interface SettingsModalProps {
  visible:             boolean;
  onClose:             () => void;
  onRestart?:          () => void;
  onSettingsChanged?:  (settings: AppSettings) => void;
}

export function SettingsModal({ visible, onClose, onRestart, onSettingsChanged }: SettingsModalProps) {
  const [settings,          setSettings]          = useState<AppSettings | null>(null);
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  useEffect(() => {
    if (visible) {
      saveEngine.loadSettings().then(setSettings);
    } else {
      setConfirmingRestart(false);
    }
  }, [visible]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    if (!settings) return;

    const next = { ...settings, ...patch };
    setSettings(next);
    onSettingsChanged?.(next);
    void saveEngine.saveSettings(next);
  }, [onSettingsChanged, settings]);

  if (!settings) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F5EAD6' }}>

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

        <ScrollView
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

          <SettingsSection label="Game">
            {!confirmingRestart ? (
              <TouchableOpacity
                onPress={() => setConfirmingRestart(true)}
                activeOpacity={0.8}
                style={{ paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 13, color: '#8B1A1A', letterSpacing: 0.3 }}>
                  Restart Game
                </Text>
                <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: '#8B1A1A', opacity: 0.7 }}>
                  ⚠ loses progress
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 14, color: '#8B1A1A', lineHeight: 20 }}>
                  All current progress will be lost. Are you sure?
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setConfirmingRestart(false)}
                    activeOpacity={0.8}
                    style={{ flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#C8B89A', borderRadius: 2, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 12, color: '#1A1208', letterSpacing: 0.5 }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRestart?.()}
                    activeOpacity={0.8}
                    style={{ flex: 1, paddingVertical: 10, backgroundColor: '#8B1A1A', borderRadius: 2, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color: '#F5EAD6', letterSpacing: 0.5 }}>
                      Restart
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </SettingsSection>

        </ScrollView>
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
    fontFamily: 'Cinzel_600SemiBold',
    fontSize:    16,
    color:       '#F5EAD6',
  },
  valueText: {
    fontFamily: 'Cinzel_400Regular',
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
    fontFamily:    'Cinzel_400Regular',
    fontSize:      11,
    color:         '#6B7C6E',
    letterSpacing: 0.8,
  },
  speedPillTextActive: {
    color: '#F5EAD6',
  },
};
