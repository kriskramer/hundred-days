import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { GameState, PlayerAction, WeatherType } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation, getLocationFlavor } from '@data/locations';
import { hasEligibleDialogue } from '@engine/EventSystem';

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
  const location       = getLocation(gameState.currentLocationId);
  const flavor         = getLocationFlavor(location);
  const dialogueNearby = hasEligibleDialogue(gameState);
  const dangerNearby   = location.mobs.some(m => m.aggroPct > 0 && !m.isCompanion);

  function submit(params: ActionParams) {
    if (!engine) { onToast('Engine not ready'); return; }
    engine.submitAction(params).catch(console.error);
  }

  return (
    <ScrollView
      className="flex-1 bg-parchment"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, alignItems: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%', maxWidth: 480 }}>
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
          {dangerNearby && (
            <View style={{ backgroundColor: '#2A0808', borderWidth: 1, borderColor: '#C94040', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 }}>
              <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#C94040' }}>
                ⚔ DANGER
              </Text>
            </View>
          )}
          {dialogueNearby && (
            <View style={{ backgroundColor: '#2A1A08', borderWidth: 1, borderColor: '#C8A020', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 }}>
              <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#C8A020' }}>
                ◇ STRANGER NEARBY
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Narrative */}
      <View className="bg-parchment-dark border-l-4 border-gold border border-parchment-deep rounded-sm" style={{ padding: 14, marginBottom: 16 }}>
        <Text className="font-body-italic text-ink-light" style={{ fontSize: 15, lineHeight: 26 }}>
          "{flavor}"
        </Text>
      </View>

      {/* Stat bars */}
      <View className="flex-row gap-2" style={{ marginBottom: 24 }}>
        <StatBar label="Morale" value={gameState.morale.value} />
        <StatBar label="Health" value={gameState.player.health} />
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
      <SectionHeader label="Actions" right="Choose wisely" centered />
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
        <ActionButton
          label="Forage"
          sub="Gain food · 1 turn"
          variant="default"
          onPress={() => submit({ action: PlayerAction.Hunt, method: 'forage' })}
        />
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
      </View>
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────

function statColor(value: number): string {
  if (value >= 75) return '#4A9E6B'; // green
  if (value >= 50) return '#C8A020'; // yellow
  if (value >= 25) return '#C86A20'; // orange
  return '#B83030';                  // red
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct   = Math.min(Math.max(value, 0), 100);
  const color = statColor(pct);

  return (
    <View style={{
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EDE0C4',
      borderWidth: 1,
      borderColor: '#C8B89A',
      borderRadius: 3,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#6B7C6E', width: 58 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 5, backgroundColor: '#C8B89A', borderRadius: 3 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 13, color, width: 28, textAlign: 'right' }}>
        {Math.round(value)}
      </Text>
    </View>
  );
}

function SectionHeader({ label, right, centered }: { label: string; right?: string; centered?: boolean }) {
  if (centered) {
    return (
      <View style={{ alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#C8B89A', paddingBottom: 8, marginBottom: 12 }}>
        <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, letterSpacing: 2, color: '#6B7C6E' }}>
          {label.toUpperCase()}
        </Text>
        {right && (
          <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 12, color: '#1A1208', marginTop: 2 }}>{right}</Text>
        )}
      </View>
    );
  }
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
  const bg          = variant === 'primary'   ? '#8B1A1A'
                    : variant === 'secondary' ? '#B8860B'
                    : '#1A1208';
  const borderColor = variant === 'primary'   ? '#C94040'
                    : variant === 'secondary' ? '#D4A017'
                    : '#3A2E1C';
  const textColor   = variant === 'secondary' ? '#1A1208' : '#F5EAD6';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: '48%',
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor,
        borderRadius: 3,
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: textColor, fontSize: 13, letterSpacing: 1.5 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: textColor, fontSize: 12, marginTop: 3, opacity: 0.75 }}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}
