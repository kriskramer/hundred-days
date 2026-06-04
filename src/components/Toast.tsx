import React from 'react';
import { View, Text } from 'react-native';

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={{
      position:          'absolute',
      top:               60,
      left:              '10%',
      right:             '10%',
      backgroundColor:   '#1A1208',
      borderRadius:      2,
      borderWidth:       1,
      borderColor:       '#B8860B',
      paddingVertical:   8,
      paddingHorizontal: 16,
      zIndex:            50,
      alignItems:        'center',
    }}>
      <Text style={{
        fontFamily:    'Cinzel_400Regular',
        fontSize:      12,
        color:         '#F5EAD6',
        letterSpacing: 0.5,
      }}>
        {message}
      </Text>
    </View>
  );
}
