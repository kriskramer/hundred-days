import React from 'react';
import { View, Text } from 'react-native';
import { GameState } from '@engine/types';
import { getLocation } from '@data/locations';
import { Colors } from '@theme';

export function StatusBar({ gameState }: { gameState: GameState }) {
  const foodLow  = gameState.resources.food < 3;
  const foodWarn = gameState.resources.food < 5;

  const loc      = getLocation(gameState.currentLocationId);
  const locShort = loc.name.length > 10 ? loc.name.slice(0, 9) + '…' : loc.name;

  return (
    <View style={{ backgroundColor: Colors.ink, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.inkLight }}>
      <StatusPill
        label="DAY"
        value={`${gameState.dayNumber}`}
        sub="/ 100"
      />
      <StatusPill
        label="LOC"
        value={locShort}
        sub={`${gameState.currentLocationId}/125`}
        flex={1.5}
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
