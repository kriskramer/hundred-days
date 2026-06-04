import React from 'react';
import { View, Text } from 'react-native';

export function DreadBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <View style={{ backgroundColor: '#8B1A1A', paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{
        fontFamily:    'Cinzel_400Regular',
        fontSize:      11,
        color:         '#F5EAD6',
        letterSpacing: 1,
        textAlign:     'center',
      }}>
        ⚠ The days are running short. Dread settles in.
      </Text>
    </View>
  );
}
