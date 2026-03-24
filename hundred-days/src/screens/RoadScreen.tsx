import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { GameState, PlayerAction, WeatherType } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation, getLocationFlavor } from '@data/locations';

interface Props {
  gameState:   GameState;
  engine:      TurnEngine | null;
  onToast:     (msg: string) => void;
  onOpenShop?: () => void;
}

const WEATHER_LABEL: Record<WeatherType, string> = {
  [WeatherType.Severe]:  'Severe Storm',
  [WeatherType.Poor]:    'Poor Weather',
  [WeatherType.Neutral]: 'Overcast',
  [WeatherType.Good]:    'Good Weather',
  [WeatherType.Ideal]:   'Ideal Conditions',
};

export function RoadScreen({ gameState, engine, onToast, onOpenShop }: Props) {
  const location = getLocation(gameState.currentLocationId);
  const flavor   = getLocationFlavor(location);

  function submit(params: ActionParams) {
    if (!engine) { onToast('Engine not ready'); return; }
    engine.submitAction(params).catch(console.error);
  }

  return (
    <ScrollView
      className="flex-1 bg-parchment"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Location header */}
      <View className="border-b border-parchment-deep pb-3 mb-4">
        <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 2 }}>
          {location.region.toUpperCase()} · LOCATION {location.id}
        </Text>
        <Text className="font-display-bold text-ink" style={{ fontSize: 22, marginTop: 4 }}>
          {location.name}
        </Text>
        <View className="flex-row mt-2 gap-2">
          {location.isTown && (
            <View className="bg-parchment-dark border border-green-700 px-2 py-0.5 rounded-sm">
              <Text className="font-display text-green-800" style={{ fontSize: 10, letterSpacing: 1 }}>TOWN</Text>
            </View>
          )}
          {location.hasShop && (
            <View className="bg-parchment-dark border border-gold px-2 py-0.5 rounded-sm">
              <Text className="font-display text-ink-light" style={{ fontSize: 10, letterSpacing: 1 }}>SHOP</Text>
            </View>
          )}
          <View className="bg-parchment-dark border border-parchment-deep px-2 py-0.5 rounded-sm">
            <Text className="font-display text-mist" style={{ fontSize: 10, letterSpacing: 1 }}>
              {WEATHER_LABEL[gameState.weather]}
            </Text>
          </View>
        </View>
      </View>

      {/* Narrative */}
      <View className="bg-parchment-dark border-l-4 border-gold border border-parchment-deep p-3 mb-4 rounded-sm">
        <Text className="font-body-italic text-ink-light" style={{ fontSize: 15, lineHeight: 24 }}>
          "{flavor}"
        </Text>
      </View>

      {/* Stat bars */}
      <View className="flex-row gap-2 mb-4">
        <StatBar label="Morale" value={gameState.morale.value} color="#5A8A6A" />
        <StatBar label="Health" value={gameState.player.health} color="#8B1A1A" />
      </View>

      {/* Companions */}
      {gameState.companions.length > 0 && (
        <View className="mb-4">
          <SectionHeader label="Companions" right={`${gameState.companions.length} travelling`} />
          <View className="flex-row flex-wrap gap-2">
            {gameState.companions.map(c => (
              <View key={c.id} className="flex-row items-center gap-2 bg-parchment-dark border border-parchment-deep px-2 py-1 rounded-sm">
                <View className="w-6 h-6 rounded-full bg-ink items-center justify-center">
                  <Text className="font-display text-parchment" style={{ fontSize: 9 }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text className="font-display text-ink" style={{ fontSize: 12 }}>{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <SectionHeader label="Actions" right="Choose wisely" />
      <View className="flex-row flex-wrap gap-2">
        <ActionButton
          label="Move"
          sub="1 location · 1.0 food"
          variant="primary"
          onPress={() => submit({ action: PlayerAction.Move, forcedMarch: false })}
        />
        <ActionButton
          label="Force March"
          sub="2 locations · 1.5 food"
          variant="primary"
          onPress={() => submit({ action: PlayerAction.Move, forcedMarch: true })}
        />
        {location.hasShop && (
          <ActionButton
            label="Trade"
            sub="Buy · Sell"
            variant="secondary"
            onPress={() => onOpenShop?.()}
          />
        )}
        {location.isTown && (
          <ActionButton
            label="Rest at Inn"
            sub="+25 HP · 10 gold"
            variant="default"
            onPress={() => submit({ action: PlayerAction.Rest, atInn: true })}
          />
        )}
        {location.actions.huntYield !== null && (
          <ActionButton
            label="Forage"
            sub="Gain food · 1 turn"
            variant="default"
            onPress={() => submit({ action: PlayerAction.Hunt, method: 'forage' })}
          />
        )}
        <ActionButton
          label="Rally"
          sub="Boost morale · 1 turn"
          variant="default"
          onPress={() => submit({ action: PlayerAction.Rally })}
        />
        <ActionButton
          label="Make Camp"
          sub="+5 HP · rest"
          variant="default"
          onPress={() => submit({ action: PlayerAction.Camp })}
        />
      </View>
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 bg-parchment-dark border border-parchment-deep p-2 rounded-sm">
      <Text className="font-display text-mist" style={{ fontSize: 10, letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <View className="h-1.5 bg-parchment-deep rounded-full mt-1 mb-1">
        <View style={{ width: `${Math.min(value, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
      </View>
      <Text className="font-display text-ink" style={{ fontSize: 12 }}>{Math.round(value)}</Text>
    </View>
  );
}

function SectionHeader({ label, right }: { label: string; right?: string }) {
  return (
    <View className="flex-row justify-between items-center border-b border-parchment-deep pb-1 mb-3">
      <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Text>
      {right && (
        <Text className="font-body-italic text-ink" style={{ fontSize: 12 }}>{right}</Text>
      )}
    </View>
  );
}

function ActionButton({
  label, sub, variant, onPress,
}: {
  label:   string;
  sub:     string;
  variant: 'primary' | 'secondary' | 'default';
  onPress: () => void;
}) {
  const bg = variant === 'primary'   ? 'bg-blood'
           : variant === 'secondary' ? 'bg-gold'
           : 'bg-ink';
  const textColor = variant === 'secondary' ? 'text-ink' : 'text-parchment';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`${bg} rounded-sm items-center py-3 px-3`}
      style={{ width: '48%' }}
    >
      <Text className={`font-display ${textColor}`} style={{ fontSize: 13, letterSpacing: 1 }}>
        {label}
      </Text>
      <Text className={`font-body-italic ${textColor} opacity-70`} style={{ fontSize: 11, marginTop: 2 }}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}
