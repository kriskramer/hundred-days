import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { LevelUpChoice } from '@engine/types';

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
            fontFamily:    'Cinzel_600SemiBold',
            fontSize:      22,
            color:         '#B8860B',
            textAlign:     'center',
            letterSpacing: 2,
            marginBottom:  4,
          }}>
            Level {playerLevel}
          </Text>
          <Text style={{
            fontFamily:   'CrimsonText_400Regular_Italic',
            fontSize:      15,
            color:         '#3D2E18',
            textAlign:     'center',
            marginBottom:  16,
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
                fontFamily:   'Cinzel_600SemiBold',
                fontSize:      14,
                color:         '#1A1208',
                marginBottom:  4,
              }}>
                {choice.label}
              </Text>
              <Text style={{
                fontFamily: 'CrimsonText_400Regular_Italic',
                fontSize:    13,
                color:       '#3D2E18',
              }}>
                {choice.description}
              </Text>
              {choice.statPreview && (
                <Text style={{
                  fontFamily: 'Cinzel_400Regular',
                  fontSize:    11,
                  color:       '#B8860B',
                  marginTop:   4,
                }}>
                  {choice.statPreview}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}
