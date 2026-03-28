import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
} from 'react-native';

import {
  GameState,
  GameEvent,
  CombatResult,
  EnemyBehavior,
} from '@engine/types';

import {
  CombatEngine,
  CombatState,
  CombatAction,
  CombatLogEntry,
  EnemyCombatant,
  CompanionCombatant,
  ENEMY_DEFINITIONS,
  buildEnemiesForLocation,
  buildBossEnemy,
} from '@engine/CombatEngine';

import { getLocation } from '@data/locations';
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState:  GameState;
  event:      GameEvent | null;
  onComplete: (result: CombatResult) => void;
  onToast:    (msg: string) => void;
}

// ─────────────────────────────────────────
// Colours
// ─────────────────────────────────────────

const C = {
  ink:        '#1A1208',
  inkLight:   '#2D1F0A',
  parchment:  '#F5EAD6',
  parchDark:  '#E8D5B0',
  parchDeep:  '#D4B880',
  blood:      '#8B1A1A',
  gold:       '#B8860B',
  goldLight:  '#D4A017',
  mist:       '#6B7C6E',
  green:      '#4A8A5A',
};

// ─────────────────────────────────────────
// CombatScreen
// ─────────────────────────────────────────

export function CombatScreen({ gameState, event, onComplete, onToast }: Props) {
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [showResult,  setShowResult]  = useState(false);

  const engineRef    = useRef<CombatEngine | null>(null);
  const logScrollRef = useRef<ScrollView>(null);
  const enemyFlash   = useRef(new Animated.Value(1)).current;
  const playerFlash  = useRef(new Animated.Value(1)).current;
  const prevPlayerHP = useRef<number>(0);

  // ── Build enemies ────────────────────────────────────────

  const enemies = buildEnemiesFromContext(event, gameState);

  // ── Init engine once ─────────────────────────────────────

  useEffect(() => {
    if (engineRef.current) return;

    const engine = new CombatEngine(
      enemies,
      gameState,
      (newState) => {
        // Flash + haptic when player takes damage
        if (newState.player.currentHP < prevPlayerHP.current) {
          flashAnim(playerFlash);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
        prevPlayerHP.current = newState.player.currentHP;

        setCombatState({ ...newState });

        if (newState.phase === 'post_combat' && newState.result) {
          if (newState.result.outcome === 'victory') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          setTimeout(() => setShowResult(true), 700);
        }
      },
    );

    engineRef.current = engine;
    const initial     = engine.getState();
    prevPlayerHP.current = initial.player.currentHP;
    setCombatState(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll log ──────────────────────────────────────

  useEffect(() => {
    logScrollRef.current?.scrollToEnd({ animated: true });
  }, [combatState?.log.length]);

  // ── Actions ──────────────────────────────────────────────

  const handleAction = useCallback((type: CombatAction['type'], targetIdx = 0) => {
    if (!engineRef.current) return;
    if (combatState?.phase !== 'awaiting_input') return;
    if (type === 'attack') {
      flashAnim(enemyFlash);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    engineRef.current.submitAction({ type, targetEnemyIndex: targetIdx });
  }, [combatState?.phase, enemyFlash]);

  const handleContinue = useCallback(() => {
    if (!combatState?.result) return;
    setShowResult(false);
    onComplete(combatState.result);
  }, [combatState?.result, onComplete]);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  if (!combatState) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.emptyText}>Preparing for battle...</Text>
      </View>
    );
  }

  const aliveEnemies  = combatState.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
  const awaitingInput = combatState.phase === 'awaiting_input';
  const showNegotiate = canNegotiate(combatState.enemies);

  return (
    <View style={s.root}>

      {/* Encounter text — shown on round 1 */}
      {combatState.round === 1 && (
        <View style={s.encounterBanner}>
          <Text style={s.encounterText}>
            {getEncounterText(combatState.enemies)}
          </Text>
        </View>
      )}

      {/* ── ENEMY BLOCKS ── */}
      <View style={s.enemiesSection}>
        {combatState.enemies.map((enemy, i) => (
          <Animated.View
            key={`${enemy.enemyId}_${i}`}
            style={{ opacity: i === 0 ? enemyFlash : 1 }}
          >
            <EnemyBlock
              enemy={enemy}
              isTarget={i === 0 && aliveEnemies.length > 0}
              onPress={() => awaitingInput && handleAction('attack', i)}
            />
          </Animated.View>
        ))}
      </View>

      {/* ── ROUND DIVIDER ── */}
      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>Round {combatState.round}</Text>
        {combatState.isPlayerStunned && (
          <View style={s.stunnedPill}>
            <Text style={s.stunnedText}>STUNNED</Text>
          </View>
        )}
        <View style={s.dividerLine} />
      </View>

      {/* ── PARTY ── */}
      <View style={s.partyRow}>
        <Animated.View style={[s.partyBlock, s.playerBlock, { opacity: playerFlash }]}>
          <View style={s.partyHeader}>
            <Text style={s.playerName}>You</Text>
            {combatState.player.statusEffects.length > 0 && (
              <StatusBadges effects={combatState.player.statusEffects} />
            )}
          </View>
          <HPBar current={combatState.player.currentHP} max={combatState.player.maxHP} color={C.green} />
          <Text style={s.hpText}>
            {combatState.player.currentHP} / {combatState.player.maxHP}
          </Text>
        </Animated.View>

        {combatState.companions.map(c => (
          <CompanionBlock key={c.companionId} companion={c} />
        ))}
      </View>

      {/* ── LOG ── */}
      <ScrollView
        ref={logScrollRef}
        style={s.log}
        showsVerticalScrollIndicator={false}
      >
        {combatState.log.map((entry, i) => (
          <LogLine key={i} entry={entry} />
        ))}
        {combatState.log.length === 0 && (
          <Text style={[s.logLine, { color: C.mist }]}>
            The air grows heavy. Choose your action.
          </Text>
        )}
      </ScrollView>

      {/* ── ACTIONS ── */}
      <View style={s.actionsGrid}>
        <ActionBtn
          label="Attack"
          sub={aliveEnemies[0]?.name ?? '—'}
          icon="⚔"
          bgColor={C.blood}
          borderColor={C.blood}
          disabled={!awaitingInput}
          onPress={() => handleAction('attack', 0)}
        />
        <ActionBtn
          label="Defend"
          sub="−40% damage taken"
          icon="◈"
          bgColor={C.inkLight}
          borderColor={C.green}
          disabled={!awaitingInput}
          onPress={() => handleAction('defend')}
        />
        <ActionBtn
          label="Skill"
          sub="Use consumable"
          icon="★"
          bgColor={C.inkLight}
          borderColor={C.goldLight}
          disabled={!awaitingInput}
          onPress={() => handleAction('skill')}
        />
        <ActionBtn
          label="Flee"
          sub={`~${calcFleeChance(combatState)}% chance`}
          icon="▶"
          bgColor={C.inkLight}
          borderColor={C.mist}
          disabled={!awaitingInput}
          onPress={() => handleAction('flee')}
        />
        {showNegotiate && (
          <ActionBtn
            label="Negotiate"
            sub="Talk your way out"
            icon="◇"
            bgColor={C.inkLight}
            borderColor={C.gold}
            disabled={!awaitingInput}
            onPress={() => handleAction('negotiate')}
            wide
          />
        )}
      </View>

      {/* ── RESULT OVERLAY ── */}
      {showResult && combatState.result && (
        <ResultOverlay result={combatState.result} onContinue={handleContinue} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────

function EnemyBlock({
  enemy, isTarget, onPress,
}: {
  enemy:    EnemyCombatant;
  isTarget: boolean;
  onPress:  () => void;
}) {
  const dead = enemy.currentHP <= 0 || enemy.isFleeing;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.enemyBlock, isTarget && s.enemyTarget, dead && s.enemyDead]}
      disabled={dead}
    >
      <View style={s.enemyHeaderRow}>
        <Text style={[s.enemyName, dead && { color: C.mist }]}>
          {enemy.name}{enemy.isFleeing ? '  (fleeing)' : ''}{enemy.currentHP <= 0 ? '  ✕' : ''}
        </Text>
        <BehaviorTag behavior={enemy.behavior} />
      </View>
      <HPBar
        current={Math.max(0, enemy.currentHP)}
        max={enemy.maxHP}
        color={dead ? C.mist : C.blood}
      />
      <View style={s.enemyFooterRow}>
        <Text style={s.hpText}>{Math.max(0, enemy.currentHP)} / {enemy.maxHP}</Text>
        {enemy.physicalResistance > 0 && (
          <Text style={s.resistText}>{Math.round(enemy.physicalResistance * 100)}% resist</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function CompanionBlock({ companion }: { companion: CompanionCombatant }) {
  const dead = companion.currentHP <= 0;
  return (
    <View style={[s.partyBlock, s.companionBlock, dead && { opacity: 0.4 }]}>
      <View style={s.partyHeader}>
        <Text style={s.companionName}>{companion.name}</Text>
        <Text style={s.companionRole}>{companion.archetype}</Text>
      </View>
      <HPBar current={companion.currentHP} max={companion.maxHP} color={C.gold} />
      <Text style={s.hpText}>{companion.currentHP} / {companion.maxHP}</Text>
    </View>
  );
}

function HPBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
  return (
    <View style={s.hpTrack}>
      <View style={[s.hpFill, { width: pct as any, backgroundColor: color }]} />
    </View>
  );
}

function StatusBadges({ effects }: { effects: { id: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {effects.slice(0, 3).map(e => (
        <View key={e.id} style={s.statusPill}>
          <Text style={s.statusPillText}>{e.id.replace(/_/g, ' ')}</Text>
        </View>
      ))}
    </View>
  );
}

function BehaviorTag({ behavior }: { behavior: EnemyBehavior }) {
  const map: Record<EnemyBehavior, [string, string]> = {
    [EnemyBehavior.Aggressive]:  ['Aggro',    '#8B1A1A'],
    [EnemyBehavior.Opportunist]: ['Opp.',     '#6B5000'],
    [EnemyBehavior.Defensive]:   ['Def.',     '#1A4A1A'],
    [EnemyBehavior.Pack]:        ['Pack',     '#1A3A5A'],
    [EnemyBehavior.Undead]:      ['Undead',   '#3A1A5A'],
    [EnemyBehavior.Spectral]:    ['Spectral', '#2A1A6A'],
  };
  const [label, color] = map[behavior] ?? ['?', C.mist];
  return (
    <View style={[s.behaviorPill, { borderColor: color }]}>
      <Text style={[s.behaviorText, { color }]}>{label}</Text>
    </View>
  );
}

function LogLine({ entry }: { entry: CombatLogEntry }) {
  const color = entry.type === 'damage' ? '#FF9999'
              : entry.type === 'heal'   ? '#99FF99'
              : entry.type === 'system' ? C.goldLight
              : entry.type === 'effect' ? '#FFCC88'
              : C.parchDark;
  return (
    <Text style={[s.logLine, { color }]}>
      {entry.actor ? `${entry.actor}: ` : ''}{entry.action}
    </Text>
  );
}

function ActionBtn({
  label, sub, icon, bgColor, borderColor, disabled, onPress, wide,
}: {
  label:       string;
  sub:         string;
  icon:        string;
  bgColor:     string;
  borderColor: string;
  disabled:    boolean;
  onPress:     () => void;
  wide?:       boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        s.actionBtn,
        { backgroundColor: bgColor, borderColor },
        wide    && s.actionBtnWide,
        disabled && s.actionBtnDimmed,
      ]}
    >
      <Text style={s.actionIcon}>{icon}</Text>
      <Text style={s.actionLabel}>{label}</Text>
      <Text style={s.actionSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function ResultOverlay({
  result, onContinue,
}: { result: CombatResult; onContinue: () => void }) {
  const isGood   = result.outcome === 'victory' || result.outcome === 'negotiated';
  const isFled   = result.outcome === 'fled';
  const titles   = {
    victory: 'Victory', negotiated: 'Negotiated', fled: 'Escaped', defeat: 'Defeated',
  } as const;

  const gains  = [
    result.xpGained   > 0 ? `+${result.xpGained} XP`      : null,
    result.goldGained > 0 ? `+${result.goldGained} gold`   : null,
    result.foodGained > 0 ? `+${result.foodGained} food`   : null,
    result.moraleDelta> 0 ? `+${result.moraleDelta} morale`: null,
  ].filter(Boolean) as string[];

  const losses = [
    result.healthLost  > 0 ? `−${result.healthLost} HP`       : null,
    result.moraleDelta < 0 ? `${result.moraleDelta} morale`    : null,
    result.injuriesGained.length ? `Injured: ${result.injuriesGained.join(', ')}` : null,
  ].filter(Boolean) as string[];

  return (
    <View style={s.overlay}>
      <View style={s.resultCard}>
        <View style={[s.resultAccent, { backgroundColor: isGood ? C.gold : C.blood }]} />

        <Text style={[s.resultTitle, { color: isGood ? C.goldLight : '#FF8080' }]}>
          {titles[result.outcome].toUpperCase()}
        </Text>

        <View style={s.resultDivider} />

        {(isGood || isFled ? gains : losses).map((line, i) => (
          <Text key={i} style={s.resultStat}>{line}</Text>
        ))}

        {!isGood && !isFled && gains.length > 0 && (
          <>
            <View style={[s.resultDivider, { marginTop: 8 }]} />
            {gains.map((line, i) => (
              <Text key={i} style={[s.resultStat, { color: C.mist }]}>{line}</Text>
            ))}
          </>
        )}

        <TouchableOpacity
          onPress={onContinue}
          activeOpacity={0.8}
          style={[s.resultBtn, { backgroundColor: isGood ? C.gold : C.blood }]}
        >
          <Text style={[s.resultBtnText, { color: isGood ? C.ink : C.parchment }]}>
            {result.outcome === 'victory'    ? 'BACK TO THE ROAD'
           : result.outcome === 'negotiated' ? 'MOVE ON'
           : result.outcome === 'fled'       ? 'REGROUP'
           :                                  'PRESS ON'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function buildEnemiesFromContext(event: GameEvent | null, game: GameState) {
  const location = getLocation(game.currentLocationId);

  if (event?.tags?.includes('boss'))   return buildBossEnemy(game);
  if (event?.tags?.includes('bandit')) return buildEnemiesForLocation(['Bandits'], game.currentLocationId);
  if (event?.tags?.includes('wolves')) return buildEnemiesForLocation(['Wolves'],  game.currentLocationId);

  const eligible = location.mobs.filter(m => Math.random() * 100 < m.aggroPct);
  const picked   = eligible.slice(0, 2).map(m => m.name);
  return buildEnemiesForLocation(
    picked.length ? picked : [location.mobs[0]?.name ?? 'Bandits'],
    game.currentLocationId,
  );
}

function getEncounterText(enemies: EnemyCombatant[]): string {
  const def = ENEMY_DEFINITIONS.find(d => d.id === enemies[0]?.enemyId);
  if (!def) return 'Something threatens you on the road.';
  const texts = def.encounterText;
  return texts[Math.floor(Math.random() * texts.length)];
}

function canNegotiate(enemies: EnemyCombatant[]): boolean {
  return enemies.some(e => {
    const def = ENEMY_DEFINITIONS.find(d => d.id === e.enemyId);
    return def && !def.immuneToNegotiate && e.currentHP > 0;
  });
}

function calcFleeChance(state: CombatState): number {
  const fastest = Math.max(...state.enemies.map(e => e.speed));
  const chance  = 0.4 + (state.player.speed - fastest) * 0.05;
  return Math.round(Math.max(10, Math.min(95, chance * 100)));
}

function flashAnim(anim: Animated.Value) {
  Animated.sequence([
    Animated.timing(anim, { toValue: 0.35, duration: 80,  useNativeDriver: true }),
    Animated.timing(anim, { toValue: 1,    duration: 220, useNativeDriver: true }),
  ]).start();
}

// ─────────────────────────────────────────
// StyleSheet
// ─────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.ink,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },

  emptyText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
    color: C.parchment,
    textAlign: 'center',
  },

  // Encounter banner
  encounterBanner: {
    backgroundColor: '#3A0A0A',
    borderLeftWidth: 3,
    borderLeftColor: C.blood,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
    borderRadius: 2,
  },
  encounterText: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 14,
    color: C.parchDark,
    lineHeight: 20,
  },

  // Enemies
  enemiesSection: { gap: 5, marginBottom: 6 },
  enemyBlock: {
    backgroundColor: '#220D05',
    borderWidth: 1,
    borderColor: '#5A1A1A',
    borderRadius: 2,
    padding: 9,
  },
  enemyTarget: { borderColor: C.blood },
  enemyDead: { opacity: 0.4 },
  enemyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  enemyName: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    color: '#FF9999',
    letterSpacing: 0.5,
  },
  enemyFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 6,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.inkLight },
  dividerText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 11,
    color: C.gold,
    letterSpacing: 1.5,
  },
  stunnedPill: {
    backgroundColor: '#3A0A0A',
    borderWidth: 1,
    borderColor: '#FF4444',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  stunnedText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
    color: '#FF8080',
    letterSpacing: 1,
  },

  // Party
  partyRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  partyBlock: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 2,
    padding: 8,
  },
  playerBlock: {
    backgroundColor: '#0A180A',
    borderColor: C.green,
  },
  companionBlock: {
    backgroundColor: '#180D00',
    borderColor: C.gold,
  },
  partyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  playerName: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    color: '#AAFFAA',
    letterSpacing: 0.5,
  },
  companionName: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    color: C.goldLight,
    letterSpacing: 0.5,
  },
  companionRole: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 10,
    color: C.mist,
  },

  // HP bar
  hpTrack: {
    height: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 3,
  },
  hpFill: { height: '100%', borderRadius: 3 },
  hpText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 10,
    color: C.parchDeep,
    letterSpacing: 0.2,
  },
  resistText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
    color: '#AAAAFF',
  },

  // Status badges
  statusPill: {
    backgroundColor: '#3A2A0A',
    borderWidth: 1,
    borderColor: '#B8860B55',
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  statusPillText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 8,
    color: C.goldLight,
    letterSpacing: 0.3,
  },

  // Behavior badge
  behaviorPill: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  behaviorText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
    letterSpacing: 0.3,
  },

  // Log
  log: {
    flex: 1,
    backgroundColor: '#0D0805',
    borderWidth: 1,
    borderColor: '#2A1A0A',
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
    maxHeight: 90,
  },
  logLine: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 1,
  },

  // Action buttons
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  actionBtn: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 1,
  },
  actionBtnWide: { width: '100%' },
  actionBtnDimmed: { opacity: 0.35 },
  actionIcon: { fontSize: 15, color: C.parchment, marginBottom: 1 },
  actionLabel: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    color: C.parchment,
    letterSpacing: 0.8,
  },
  actionSub: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 10,
    color: C.parchDark,
    opacity: 0.75,
  },

  // Result overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,18,8,0.93)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  resultCard: {
    backgroundColor: '#2A1A0A',
    borderWidth: 2,
    borderColor: C.gold,
    borderRadius: 2,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  resultAccent: { height: 3, marginBottom: 14 },
  resultTitle: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 4,
  },
  resultDivider: {
    height: 1,
    backgroundColor: '#3A2A0A',
    marginVertical: 10,
  },
  resultStat: {
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
    color: C.parchment,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  resultBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 2,
    alignItems: 'center',
  },
  resultBtnText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
