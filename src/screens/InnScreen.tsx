import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

import type { GameEvent, GameState } from '@engine/types';
import { PlayerAction } from '@engine/types';
import type { TurnEngine } from '@engine/TurnEngine';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';
import { findInnDialogue, getDialogueDisplayName } from '@engine/DialogueEngine';
import { getLocation } from '@data/locations';
import { isOptionalDialogueEvent } from '@utils/isCombatEvent';
import { DialogueScreen } from '@screens/DialogueScreen';

interface Props {
  gameState:      GameState;
  engine:         TurnEngine | null;
  activeEvent:    GameEvent | null;
  onBackToRoad:   () => void;
  onRestComplete: () => void;
  onTavernComplete: (outcome: DialogueSessionOutcome) => void;
  onToast:        (msg: string) => void;
}

export function InnScreen({
  gameState,
  engine,
  activeEvent,
  onBackToRoad,
  onRestComplete,
  onTavernComplete,
  onToast,
}: Props) {
  const location = getLocation(gameState.currentLocationId);
  const [tavernDialogueId, setTavernDialogueId] = useState<string | null>(null);

  const innDialogue = findInnDialogue(gameState.currentLocationId, gameState);
  const eventTavernId =
    activeEvent
    && isOptionalDialogueEvent(activeEvent)
    && activeEvent.tags?.includes('town')
      ? activeEvent.id
      : null;
  const tavernTalkId = eventTavernId ?? innDialogue?.id ?? null;
  const canRest = gameState.resources.gold >= 10;

  function handleRest() {
    if (!engine) {
      onToast('Engine not ready');
      return;
    }
    if (!canRest) {
      onToast('Not enough gold for the inn.');
      return;
    }
    engine.submitAction({ action: PlayerAction.Rest, atInn: true })
      .then(onRestComplete)
      .catch(console.error);
  }

  if (tavernDialogueId) {
    return (
      <View style={s.root}>
        <View style={s.header}>
          <View>
            <Text style={s.kicker}>THE INN</Text>
            <Text style={s.title}>{getDialogueDisplayName(tavernDialogueId)}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setTavernDialogueId(null)} style={s.backButton}>
            <Text style={s.backButtonText}>INN</Text>
          </TouchableOpacity>
        </View>
        <View style={s.dialogueShell}>
          <DialogueScreen
            gameState={gameState}
            event={eventTavernId === tavernDialogueId ? activeEvent : null}
            dialogueId={tavernDialogueId}
            onComplete={(outcome) => {
              setTavernDialogueId(null);
              onTavernComplete(outcome);
            }}
            onToast={onToast}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.kicker}>THE INN</Text>
          <Text style={s.title}>{location.name}</Text>
          <Text style={s.subtitle}>Warm beds and cold ale await weary travelers.</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={onBackToRoad} style={s.backButton}>
          <Text style={s.backButtonText}>ROAD</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleRest}
          style={[s.actionCard, !canRest && s.actionCardDisabled]}
        >
          <Text style={s.actionLabel}>REST</Text>
          <Text style={s.actionSub}>+25 HP · +15 morale · 10 gold · ½ food</Text>
          {!canRest && (
            <Text style={s.actionHint}>You need at least 10 gold.</Text>
          )}
        </TouchableOpacity>

        {tavernTalkId && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setTavernDialogueId(tavernTalkId)}
            style={s.actionCard}
          >
            <Text style={s.actionLabel}>TAVERN TALK</Text>
            <Text style={s.actionSub}>Listen to rumors from the common room</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  actionCard: {
    backgroundColor: '#EDE4CF',
    borderColor: '#C8B89A',
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  actionCardDisabled: {
    opacity: 0.55,
  },
  actionHint: {
    color: '#8B1A1A',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 13,
    marginTop: 8,
  },
  actionLabel: {
    color: '#1A1208',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    letterSpacing: 1.2,
  },
  actionSub: {
    color: '#6B7C6E',
    fontFamily: 'CrimsonText_400Regular',
    fontSize: 14,
    marginTop: 6,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#EDE4CF',
    borderColor: '#C8B89A',
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#1A1208',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  content: {
    padding: 16,
  },
  dialogueShell: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#F5EAD6',
    borderBottomColor: '#C8B89A',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  kicker: {
    color: '#6B7C6E',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  root: {
    backgroundColor: '#F5EAD6',
    flex: 1,
  },
  subtitle: {
    color: '#6B7C6E',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 14,
    marginTop: 4,
  },
  title: {
    color: '#1A1208',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 20,
  },
});
