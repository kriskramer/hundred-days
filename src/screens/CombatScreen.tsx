/* eslint-disable react-native/sort-styles */
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
  ItemCategory,
  ItemDefinition,
  CompanionArchetype,
} from '@engine/types';

import {
  inventoryFromResources,
  getItemDef,
} from '@engine/ItemSystem';

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
import type { TurnEngine } from '@engine/TurnEngine';

import { getLocation } from '@data/locations';
import { isBossLocation } from '@engine/bosses';
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState:  GameState;
  engine:     TurnEngine | null;
  event:      GameEvent | null;
  onComplete: (result: CombatResult) => void;
  onToast:    (msg: string) => void;
}

// ─────────────────────────────────────────
// Colours
// ─────────────────────────────────────────

import { Colors as C } from '@theme';
import { TypewriterText } from '@components';

const BEHAVIOR_DESC: Record<EnemyBehavior, string> = {
  [EnemyBehavior.Aggressive]:  'Attacks every round without hesitation.',
  [EnemyBehavior.Opportunist]: 'Targets the weakest party member preferentially.',
  [EnemyBehavior.Defensive]:   'Takes reduced damage until provoked.',
  [EnemyBehavior.Pack]:        'May call additional enemies when bloodied.',
  [EnemyBehavior.Undead]:      'Cannot flee or be negotiated with.',
  [EnemyBehavior.Spectral]:    'Resists 40% of physical damage.',
};


// ─────────────────────────────────────────
// CombatScreen
// ─────────────────────────────────────────

export function CombatScreen({ gameState, engine, event, onComplete, onToast }: Props) {
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [showResult,  setShowResult]  = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [encounterText, setEncounterText] = useState('');

  const [animateFromIdx, setAnimateFromIdx] = useState(0);

  const engineRef    = useRef<CombatEngine | null>(null);
  const logScrollRef = useRef<ScrollView>(null);
  const enemyFlash   = useRef(new Animated.Value(1)).current;
  const playerFlash  = useRef(new Animated.Value(1)).current;
  const prevPlayerHP = useRef<number>(0);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
    };
  }, []);

  // ── Init engine once ─────────────────────────────────────

  useEffect(() => {
    if (engineRef.current) return;

    const combatRng = engine ? () => engine.nextRandom() : Math.random;
    const enemies = buildEnemiesFromContext(event, gameState, combatRng);
    setEncounterText(getEncounterText(enemies, combatRng));

    const combatEngine = new CombatEngine(
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
        }
      },
      combatRng,
    );

    engineRef.current = combatEngine;
    const initial     = combatEngine.getState();
    prevPlayerHP.current = initial.player.currentHP;
    setCombatState(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll log ──────────────────────────────────────

  useEffect(() => {
    logScrollRef.current?.scrollToEnd({ animated: true });
  }, [combatState?.log.length]);

  // ── Actions ──────────────────────────────────────────────

  const handleAction = useCallback((type: CombatAction['type'], targetIdx = 0, itemId?: string) => {
    if (!engineRef.current) return;
    if (combatState?.phase !== 'awaiting_input') return;
    if (type === 'attack') {
      flashAnim(enemyFlash);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setAnimateFromIdx(combatState?.log.length ?? 0);
    engineRef.current.submitAction({ type, targetEnemyIndex: targetIdx, itemId });
  }, [combatState?.log.length, combatState?.phase, enemyFlash]);

  const handleContinue = useCallback(() => {
    if (!combatState?.result) return;
    setShowResult(false);
    onComplete(combatState.result);
  }, [combatState?.result, onComplete]);

  const handleLogFinished = useCallback(() => {
    if (combatState?.phase === 'post_combat' && combatState.result && !showResult) {
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => {
        setShowResult(true);
      }, 500);
    }
  }, [combatState?.phase, combatState?.result, showResult]);

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

  const inv = inventoryFromResources(gameState.resources);
  const usableItems = inv.items
    .map(i => getItemDef(i.definitionId))
    .filter((def): def is ItemDefinition => !!def?.activeEffect && def.category === ItemCategory.Consumable);

  return (
    <View style={s.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {/* Encounter text — shown on round 1 */}
        {combatState.round === 1 && (
          <View style={s.encounterBanner}>
            <Text style={s.encounterText}>
              {encounterText}
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
                onBehaviorLongPress={() => onToast(BEHAVIOR_DESC[enemy.behavior])}
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
            <LogLine
              key={i}
              entry={entry}
              companions={combatState.companions}
              enemies={combatState.enemies}
              animDelay={i >= animateFromIdx ? (i - animateFromIdx) * 120 : -1}
              onComplete={i === combatState.log.length - 1 ? handleLogFinished : undefined}
            />
          ))}
          {combatState.log.length === 0 && (
            <Text style={[s.logLine, { color: C.mist }]}>
              The air grows heavy. Choose your action.
            </Text>
          )}
        </ScrollView>
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
          sub={usableItems.length > 0 ? "Use consumable" : "No items"}
          icon="★"
          bgColor={C.inkLight}
          borderColor={C.goldLight}
          disabled={!awaitingInput || usableItems.length === 0}
          onPress={() => setShowItemPicker(true)}
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

      {/* ── ITEM PICKER OVERLAY ── */}
      {showItemPicker && (
        <View style={s.itemPickerOverlay}>
          <Text style={s.itemPickerTitle}>USE ITEM</Text>
          <ScrollView style={s.itemPickerScroll}>
            {usableItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={s.itemPickerRow}
                onPress={() => {
                  setShowItemPicker(false);
                  handleAction('skill', 0, item.id);
                }}
              >
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.itemDesc}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.itemPickerCancelBtn} onPress={() => setShowItemPicker(false)}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

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
  enemy, isTarget, onPress, onBehaviorLongPress,
}: {
  enemy:                EnemyCombatant;
  isTarget:             boolean;
  onPress:              () => void;
  onBehaviorLongPress:  () => void;
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
        <TouchableOpacity
          onLongPress={onBehaviorLongPress}
          onPress={() => {}}
          activeOpacity={0.9}
        >
          <BehaviorTag behavior={enemy.behavior} />
        </TouchableOpacity>
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

function LogLine({
  entry,
  companions,
  enemies,
  animDelay,
  onComplete,
}: {
  entry:       CombatLogEntry;
  companions:  CompanionCombatant[];
  enemies:     EnemyCombatant[];
  animDelay:   number;
  onComplete?: () => void;
}) {
  // Determine actor type: player, companion, enemy, or system
  const actor = entry.actor;
  let actorType: 'player' | 'companion' | 'enemy' | 'system' = 'system';

  if (actor && actor.trim() !== '') {
    const lowerActor = actor.toLowerCase().trim();
    if (lowerActor === 'player') {
      actorType = 'player';
    } else {
      // Check if actor is an enemy
      const isEnemy = enemies.some(e => {
        const lowerName = e.name.toLowerCase();
        return lowerName === lowerActor || lowerName.includes(lowerActor) || lowerActor.includes(lowerName);
      });

      if (isEnemy) {
        actorType = 'enemy';
      } else {
        // Check if actor is a companion
        const isCompanion = companions.some(c => {
          const lowerName = c.name.toLowerCase();
          return lowerName === lowerActor || lowerName.includes(lowerActor) || lowerActor.includes(lowerName);
        });

        if (isCompanion) {
          actorType = 'companion';
        } else {
          // If it has an actor but it's not a companion or enemy, it belongs to the player (e.g. consumable items like "Holy Water")
          actorType = 'player';
        }
      }
    }
  }

  // Determine the color based on the actor type
  let color = C.parchDark;
  if (actorType === 'player') {
    color = '#64B5F6'; // Blue
  } else if (actorType === 'companion') {
    color = '#8CE995'; // Green
  } else if (actorType === 'enemy') {
    color = '#FF8080'; // Red
  } else {
    color = entry.type === 'damage' ? '#FF9999'
          : entry.type === 'heal'   ? '#99FF99'
          : entry.type === 'system' ? C.goldLight
          : entry.type === 'effect' ? '#FFCC88'
          : C.parchDark;
  }

  // Determine if this is a critical or special hit/attack to bold it
  const isCriticalOrSpecial =
    entry.isCritical ||
    entry.type === 'effect' ||
    entry.action.toLowerCase().includes('critical') ||
    entry.action.toLowerCase().includes('special') ||
    entry.action.includes('!') ||
    entry.action.toLowerCase().startsWith('uses ') ||
    entry.action.toLowerCase().startsWith('activates ') ||
    entry.action.toLowerCase().startsWith('rallies ') ||
    entry.action.toLowerCase().includes('heal') ||
    entry.action.toLowerCase().includes('drain');

  const text = `${entry.actor ? `${entry.actor}: ` : ''}${entry.action}`;

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (animDelay < 0) {
      onCompleteRef.current?.();
    }
  }, [animDelay]);

  const textStyle = [
    s.logLine,
    { color },
    isCriticalOrSpecial && {
      fontFamily: 'CrimsonText_600SemiBold',
      fontWeight: 'bold' as const,
    },
  ];

  if (animDelay >= 0) {
    return (
      <TypewriterText
        text={text}
        style={textStyle}
        interval={18}
        delay={animDelay}
        onComplete={onComplete}
      />
    );
  }
  return <Text style={textStyle}>{text}</Text>;
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

        <TypewriterText
          text={(isGood || isFled ? gains : losses).join('\n')}
          interval={14}
          style={s.resultStat}
        />

        {!isGood && !isFled && gains.length > 0 && (
          <>
            <View style={[s.resultDivider, { marginTop: 8 }]} />
            <TypewriterText
              text={gains.join('\n')}
              interval={14}
              style={[s.resultStat, { color: C.mist }]}
            />
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

function buildEnemiesFromContext(
  event: GameEvent | null,
  game: GameState,
  random: () => number,
) {
  const location = getLocation(game.currentLocationId);

  const isBossEvent = event?.tags?.includes('boss');
  const isLocationBossFight = !event && isBossLocation(game.currentLocationId) && !game.clearedCombatLocations.has(game.currentLocationId);

  if (isBossEvent || isLocationBossFight) return buildBossEnemy(game);
  if (event?.tags?.includes('bandit')) return buildEnemiesForLocation(['Bandits'], game.currentLocationId);
  if (event?.tags?.includes('wolves')) return buildEnemiesForLocation(['Wolves'],  game.currentLocationId);

  const eligible = location.mobs.filter(m => random() * 100 < m.aggroPct && !m.isCompanion);
  // Guarantee at least one enemy — TurnEngine already confirmed mobs would spawn
  const toSpawn = eligible.length > 0
    ? eligible.slice(0, 2)
    : location.mobs
        .filter(m => !m.isCompanion)
        .sort((a, b) => b.aggroPct - a.aggroPct)
        .slice(0, 1);
  return buildEnemiesForLocation(
    toSpawn.map(m => m.name),
    game.currentLocationId,
  );
}

function getEncounterText(enemies: EnemyCombatant[], random: () => number): string {
  const def = ENEMY_DEFINITIONS.find(d => d.id === enemies[0]?.enemyId);
  if (!def) return 'Something threatens you on the road.';
  const texts = def.encounterText;
  return texts[Math.floor(random() * texts.length)];
}

function canNegotiate(enemies: EnemyCombatant[]): boolean {
  return enemies.some(e => {
    const def = ENEMY_DEFINITIONS.find(d => d.id === e.enemyId);
    return def && !def.immuneToNegotiate && e.currentHP > 0;
  });
}

function calcFleeChance(state: CombatState): number {
  const activeEnemies = state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
  const fastest = activeEnemies.length > 0 ? Math.max(...activeEnemies.map(e => e.speed)) : 0;
  let chance = 0.4 + (state.player.speed - fastest) * 0.05;

  const hasScout = state.companions.some(
    c => c.archetype === CompanionArchetype.Scout && c.currentHP > 0,
  );
  if (hasScout) chance += 0.15;

  chance = Math.max(0.1, Math.min(0.95, chance));

  const mira = state.companions.find(c => c.companionId === 'mira_thorn' && c.currentHP > 0);
  if (mira?.specialAbilityReady && mira.level >= 5) {
    chance = 1.0;
  }

  return Math.round(chance * 100);
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
    backgroundColor: C.ink,
    flex: 1,
    paddingBottom: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },

  emptyText: {
    color: C.parchment,
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },

  // Encounter banner
  encounterBanner: {
    backgroundColor: '#3A0A0A',
    borderLeftColor: C.blood,
    borderLeftWidth: 3,
    borderRadius: 2,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  encounterText: {
    color: C.parchDark,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 14,
    lineHeight: 20,
  },

  // Enemies
  enemiesSection: { gap: 5, marginBottom: 6 },
  enemyBlock: {
    backgroundColor: '#220D05',
    borderColor: '#5A1A1A',
    borderRadius: 2,
    borderWidth: 1,
    padding: 9,
  },
  enemyTarget: { borderColor: C.blood },
  enemyDead: { opacity: 0.4 },
  enemyHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  enemyName: {
    color: '#FF9999',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  enemyFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },

  // Divider
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 6,
  },
  dividerLine: { backgroundColor: C.inkLight, flex: 1, height: 1 },
  dividerText: {
    color: C.gold,
    fontFamily: 'Cinzel_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  stunnedPill: {
    backgroundColor: '#3A0A0A',
    borderColor: '#FF4444',
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  stunnedText: {
    color: '#FF8080',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
    letterSpacing: 1,
  },

  // Party
  partyRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  partyBlock: {
    borderRadius: 2,
    borderWidth: 1,
    flex: 1,
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  playerName: {
    color: '#AAFFAA',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  companionName: {
    color: C.goldLight,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  companionRole: {
    color: C.mist,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 10,
  },

  // HP bar
  hpTrack: {
    backgroundColor: '#1A1A1A',
    borderRadius: 3,
    height: 6,
    marginBottom: 3,
    overflow: 'hidden',
  },
  hpFill: { borderRadius: 3, height: '100%' },
  hpText: {
    color: C.parchDeep,
    fontFamily: 'Cinzel_400Regular',
    fontSize: 10,
    letterSpacing: 0.2,
  },
  resistText: {
    color: '#AAAAFF',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 9,
  },

  // Status badges
  statusPill: {
    backgroundColor: '#3A2A0A',
    borderColor: '#B8860B55',
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  statusPillText: {
    color: C.goldLight,
    fontFamily: 'Cinzel_400Regular',
    fontSize: 8,
    letterSpacing: 0.3,
  },

  // Behavior badge
  behaviorPill: {
    borderRadius: 2,
    borderWidth: 1,
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
    backgroundColor: '#0D0805',
    borderColor: '#2A1A0A',
    borderRadius: 2,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 80,
    maxHeight: 220,
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    alignItems: 'center',
    borderRadius: 2,
    borderWidth: 1,
    gap: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
    width: '47%',
  },
  actionBtnWide: { width: '100%' },
  actionBtnDimmed: { opacity: 0.35 },
  actionIcon: { color: C.parchment, fontSize: 15, marginBottom: 1 },
  actionLabel: {
    color: C.parchment,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  actionSub: {
    color: C.parchDark,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 10,
    opacity: 0.75,
  },

  // Result overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(26,18,8,0.93)',
    justifyContent: 'center',
    padding: 24,
  },
  resultCard: {
    backgroundColor: '#2A1A0A',
    borderColor: C.gold,
    borderRadius: 2,
    borderWidth: 2,
    maxWidth: 360,
    overflow: 'hidden',
    padding: 20,
    width: '100%',
  },
  resultAccent: { height: 3, marginBottom: 14 },
  resultTitle: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 26,
    letterSpacing: 3,
    marginBottom: 4,
    textAlign: 'center',
  },
  resultDivider: {
    backgroundColor: '#3A2A0A',
    height: 1,
    marginVertical: 10,
  },
  resultStat: {
    color: C.parchment,
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
    letterSpacing: 0.5,
    lineHeight: 22,
    textAlign: 'center',
  },
  resultBtn: {
    alignItems: 'center',
    borderRadius: 2,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  resultBtnText: {
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },

  // Item Picker Overlay
  itemPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(26,18,8,0.95)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  itemPickerTitle: {
    color: C.gold,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 20,
    letterSpacing: 2,
    marginBottom: 16,
  },
  itemPickerScroll: {
    width: '100%',
    maxHeight: 280,
    marginBottom: 16,
  },
  itemPickerRow: {
    backgroundColor: '#22140A',
    borderColor: '#4E3629',
    borderRadius: 2,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  itemName: {
    color: C.parchment,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  itemDesc: {
    color: C.parchDark,
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize: 12,
    lineHeight: 16,
  },
  itemPickerCancelBtn: {
    backgroundColor: '#3A2015',
    borderColor: '#5C3826',
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  cancelText: {
    color: C.mist,
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
