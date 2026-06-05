import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

import type { GameState } from '@engine/types';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';
import { DialogueScreen } from '@screens/DialogueScreen';
import { getDialogueDisplayName } from '@engine/DialogueEngine';

interface Props {
  gameState:      GameState;
  dialogueId:     string;
  onComplete:     (outcome: DialogueSessionOutcome) => void;
  onToast:        (msg: string) => void;
  onSteal:        () => void;
  onBackToRoad:   () => void;
}

export function NpcInteractionScreen({
  gameState,
  dialogueId,
  onComplete,
  onToast,
  onSteal,
  onBackToRoad,
}: Props) {
  const npcName = getDialogueDisplayName(dialogueId);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.kicker}>NPC ENCOUNTER</Text>
          <Text style={s.title}>{npcName}</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onBackToRoad}
          style={s.backButton}
        >
          <Text style={s.backButtonText}>ROAD</Text>
        </TouchableOpacity>
      </View>

      <View style={s.dialogueShell}>
        <DialogueScreen
          gameState={gameState}
          event={null}
          dialogueId={dialogueId}
          onComplete={onComplete}
          onToast={onToast}
          onBackToRoad={onBackToRoad}
          footerContent={(
            <View style={s.footer}>
              <Text style={s.footerLabel}>Other action</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onSteal}
                style={s.stealButton}
              >
                <Text style={s.stealButtonText}>STEAL</Text>
                <Text style={s.stealButtonSubtext}>Try your luck instead of talking</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
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
  dialogueShell: {
    flex: 1,
  },
  footer: {
    marginTop: 16,
  },
  footerLabel: {
    color: '#6B7C6E',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 8,
    textTransform: 'uppercase',
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
  stealButton: {
    alignItems: 'center',
    backgroundColor: '#8B1A1A',
    borderColor: '#C94040',
    borderRadius: 3,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stealButtonSubtext: {
    color: '#F5EAD6',
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 12,
    marginTop: 3,
    opacity: 0.82,
  },
  stealButtonText: {
    color: '#F5EAD6',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  title: {
    color: '#1A1208',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 18,
  },
});
