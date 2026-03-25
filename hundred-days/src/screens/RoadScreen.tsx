import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { GameState, PlayerAction, WeatherType } from '@engine/types';
import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import { getLocation, getLocationRandomText } from '@data/locations';
import { hasEligibleDialogue } from '@engine/EventSystem';

interface Props {
  gameState:   GameState;
  engine:      TurnEngine | null;
  onToast:     (msg: string) => void;
  onOpenShop?: () => void;
}

function getForageLabel(huntYield: number | null): string | null {
  if (huntYield === null)       return null;
  if (huntYield === 0)          return '❧ BARREN';
  if (huntYield < 0.5)          return '❧ SCARCE';
  if (huntYield < 1.0)          return '❧ MEAGRE';
  if (huntYield < 1.5)          return '❧ ADEQUATE';
  if (huntYield < 2.0)          return '❧ PLENTIFUL';
  return '❧ BOUNTIFUL';
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
  const randomText     = getLocationRandomText(location);
  const dialogueNearby = hasEligibleDialogue(gameState);
  const dangerNearby   = location.mobs.some(m => m.aggroPct > 0 && !m.isCompanion)
                      && !gameState.clearedCombatLocations.has(gameState.currentLocationId);

  function submit(params: ActionParams) {
    if (!engine) { onToast('Engine not ready'); return; }
    engine.submitAction(params).catch(console.error);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5EAD6' }}>
      {/* Stat bars — pinned below top chrome */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 7,
        gap: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#C8B89A',
      }}>
        <StatBar label="Morale" value={gameState.morale.value} />
        <StatBar label="Health" value={gameState.player.health} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ width: '100%', maxWidth: 480 }}>
      {/* Location header */}
      <View className="border-b border-parchment-deep pb-3 mb-4">
        <Text className="font-display text-mist" style={{ fontSize: 11, letterSpacing: 2 }}>
          {location.region.toUpperCase()} · LOCATION {location.id}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
          <Text className="font-display-bold text-ink" style={{ fontSize: 22, flexShrink: 1 }}>
            {location.name}
          </Text>
          {location.isTown  && <Text style={{ fontSize: 17, lineHeight: 26 }}>🏰</Text>}
          {location.hasShop && <Text style={{ fontSize: 17, lineHeight: 26 }}>⚖</Text>}
        </View>
        {/* Weather · Forage row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#6B7C6E' }}>
            {WEATHER_LABEL[gameState.weather]}
          </Text>
          {getForageLabel(location.actions.huntYield) && (
            <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#6B7C6E' }}>
              {getForageLabel(location.actions.huntYield)}
            </Text>
          )}
        </View>
        {/* Alert badges row — only when relevant */}
        {(dangerNearby || dialogueNearby) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
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
        )}
      </View>

      {/* Narrative */}
      <View style={{ borderWidth: 1, borderColor: '#B8860B', borderRadius: 3, padding: 12, marginBottom: 12, backgroundColor: '#EDE4CF' }}>
        <Text className="font-body-italic text-ink-light" style={{ fontSize: 15, lineHeight: 22 }}>
          {location.locationText}
        </Text>
        {randomText && (
          <>
            <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 8 }} />
            <Text className="font-body-italic text-ink-light" style={{ fontSize: 15, lineHeight: 22 }}>
              {randomText}
            </Text>
          </>
        )}
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
      <ActionGrid actions={[
        { label: 'Move',         sub: '1 loc · 1 food',    variant: 'primary',   onPress: () => submit({ action: PlayerAction.Move, forcedMarch: false }) },
        { label: 'Force March',  sub: '2 locs · 1.5 food', variant: 'primary',   onPress: () => submit({ action: PlayerAction.Move, forcedMarch: true  }) },
        ...(location.hasShop ? [{ label: 'Trade',      sub: 'Buy · Sell',     variant: 'secondary' as const, onPress: () => onOpenShop?.()                                    }] : []),
        ...(location.isTown  ? [{ label: 'Rest at Inn', sub: '+25 HP · 10g', variant: 'default'   as const, onPress: () => submit({ action: PlayerAction.Rest, atInn: true }) }] : []),
        { label: 'Forage',       sub: 'Gain food',          variant: 'default',   onPress: () => submit({ action: PlayerAction.Hunt, method: 'forage'   }) },
        { label: 'Rally',        sub: 'Boost morale',       variant: 'default',   onPress: () => submit({ action: PlayerAction.Rally                                          }) },
        { label: 'Make Camp',    sub: '+10 HP · rest',      variant: 'default',   onPress: () => submit({ action: PlayerAction.Camp                                           }) },
      ]} />
      </View>
      </ScrollView>
    </View>
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
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1, color: '#6B7C6E', flexShrink: 0 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 4, backgroundColor: '#C8B89A', borderRadius: 2 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 12, color, width: 26, textAlign: 'right' }}>
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

type ActionDef = {
  label:   string;
  sub:     string;
  variant: 'primary' | 'secondary' | 'default';
  onPress: () => void;
};

function ActionGrid({ actions }: { actions: ActionDef[] }) {
  const rows: ActionDef[][] = [];
  for (let i = 0; i < actions.length; i += 3) {
    rows.push(actions.slice(i, i + 3));
  }
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map(btn => <ActionButton key={btn.label} {...btn} />)}
          {row.length < 3 && <View style={{ flex: 3 - row.length }} />}
        </View>
      ))}
    </View>
  );
}

function ActionButton({ label, sub, variant, onPress }: ActionDef) {
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
        flex: 1,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor,
        borderRadius: 3,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: 'Cinzel_600SemiBold', color: textColor, fontSize: 12, letterSpacing: 1 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'CrimsonText_400Regular_Italic', color: textColor, fontSize: 11, marginTop: 2, opacity: 0.75, textAlign: 'center' }}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}
