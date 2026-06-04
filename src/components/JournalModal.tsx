import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { TurnRecord, ACTION_LABELS } from '@engine/types';

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
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {reversed.map((record, i) => (
              <JournalEntry key={`${record.dayNumber}_${i}`} record={record} />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function formatEventName(eventId: string) {
  return eventId
    .replace(/_/g, ' ')
    .replace(/\bloc\d+\b/gi, '')
    .replace(/\bday\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatEventLabel(record: TurnRecord, eventId: string) {
  const eventName = formatEventName(eventId);
  if (record.eventOutcome?.eventId !== eventId) return eventName;

  const actionLabel: Record<NonNullable<TurnRecord['eventOutcome']>['result'], string> = {
    victory:          'Defeated',
    defeat:           'Fell To',
    fled:             'Fled From',
    negotiated:       'Negotiated With',
    dialogue_complete:'Spoke With',
  };

  return `${actionLabel[record.eventOutcome.result]} ${eventName}`;
}

function JournalEntry({ record }: { record: TurnRecord }) {
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
  const eventIds = record.eventOutcome?.eventId && !record.eventsTriggered.includes(record.eventOutcome.eventId)
    ? [...record.eventsTriggered, record.eventOutcome.eventId]
    : record.eventsTriggered;

  return (
    <View style={{
      borderBottomWidth: 1,
      borderBottomColor: '#E8D5B0',
      paddingVertical:   12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 11, color: '#B8860B', marginRight: 8, letterSpacing: 0.5 }}>
          DAY {record.dayNumber}
        </Text>
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#6B7C6E', letterSpacing: 0.8 }}>
          {ACTION_LABELS[record.action] ?? record.action.toUpperCase()}
          {record.levelUpOccurred ? '  · LEVELLED UP' : ''}
        </Text>
      </View>

      {record.narrativeSummary ? (
        <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 14, color: '#2D1F0A', lineHeight: 21, marginBottom: 6 }}>
          {record.narrativeSummary}
        </Text>
      ) : null}

      {eventIds.length > 0 && (
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#6B7C6E', letterSpacing: 0.5, marginBottom: 4 }}>
          {eventIds.map(id => formatEventLabel(record, id)).join('  ·  ')}
        </Text>
      )}

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
