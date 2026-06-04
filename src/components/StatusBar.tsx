import React from 'react';
import { View, Text } from 'react-native';
import { GameState } from '@engine/types';
import { Colors } from '@theme';

export function StatusBar({ gameState }: { gameState: GameState }) {
  const foodLow  = gameState.resources.food < 3;
  const foodWarn = gameState.resources.food < 5;

  return (
    <View style={{ backgroundColor: Colors.ink, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.inkLight }}>
      <StatusPill
        label="DAY"
        value={`${gameState.dayNumber}`}
        sub="/ 100"
      />
      <StatusPill
        label="LOC"
        value={String(gameState.currentLocationId)}
        sub="/125"
      />
      <StatusPill
        label="FOOD"
        value={gameState.resources.food.toFixed(1)}
        valueColor={foodLow ? '#ff8080' : foodWarn ? '#ffcc44' : undefined}
      />
      <StatusPill label="GOLD" value={String(gameState.resources.gold)} />
      <StatusPill label="LV" value={String(gameState.player.level)} />
    </View>
  );
}

function StatusPill({ label, value, sub, valueColor, flex = 1 }: { label: string; value: string; sub?: string; valueColor?: string; flex?: number }) {
  return (
    <View style={{ flex, alignItems: 'center', paddingVertical: 10 }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 9, color: '#A0B8AA', letterSpacing: 1, marginBottom: 2 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 16, color: valueColor ?? Colors.parchment, letterSpacing: 0.5 }}>
          {value}
        </Text>
        {sub && (
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, color: '#A0B8AA' }}>{sub}</Text>
        )}
      </View>
    </View>
  );
}
