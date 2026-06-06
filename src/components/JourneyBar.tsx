import React from 'react';
import { View } from 'react-native';
import { Colors } from '@theme';
import { useLocation, useMorale } from '@store/gameStore';

export function JourneyBar() {
  const locationId = useLocation();
  const morale = useMorale();
  const dreadActive = morale?.dreadActive ?? false;

  const pct      = Math.min((locationId / 125) * 100, 100);
  const barColor = dreadActive ? Colors.blood : Colors.gold;
  const dotColor = dreadActive ? '#C94040' : Colors.goldLight;

  return (
    <View style={{ height: 4, backgroundColor: Colors.inkLight }}>
      <View style={{
        height:          '100%',
        width:           `${pct}%`,
        backgroundColor: barColor,
        position:        'relative',
      }}>
        <View style={{
          position:        'absolute',
          right:           -4,
          top:             -3,
          width:           10,
          height:          10,
          borderRadius:    5,
          backgroundColor: dotColor,
          borderWidth:     2,
          borderColor:     Colors.parchment,
        }} />
      </View>
    </View>
  );
}

