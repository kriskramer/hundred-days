import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import {
  createNewGameState,
  applyMoraleDelta,
  applyReputationDelta,
  clamp,
} from '@engine/GameState';
import { generateRunLayout } from '@engine/RunLayout';
import { normalizeRngState } from '@engine/Random';
import {
  PlayerAction,
  TurnPhase,
  EventType,
  GameState,
  GameEvent,
  CombatResult,
  StatDelta,
  TurnRecord,
  DialogueSessionOutcome,
  ChoiceOutcome,
  LevelUpChoice,
} from '@engine/types';
import {
  CombatEngine,
  buildEnemiesForLocation,
  buildBossEnemy,
  EnemyCombatant,
} from '@engine/CombatEngine';
import { isBossLocation } from '@engine/bosses';
import { isCombatEvent } from '@utils/isCombatEvent';
import { getLocation } from '@data/locations';
import { getDialogue } from '@data/dialogues';
import { getCompanion } from '@data/companions';
import { evalConditions } from '@engine/ConditionEvaluator';

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

// ─────────────────────────────────────────
// Harness setup
// ─────────────────────────────────────────

function makeSeededState(seed: number): GameState {
  const base = createNewGameState('Test Hero');
  return {
    ...base,
    seed,
    rngState: normalizeRngState(seed),
    runLayout: generateRunLayout(seed),
  };
}

interface PlaythroughHarness {
  engine: TurnEngine;
  levelUpChoices: LevelUpChoice[] | null;
}

function createHarness(state: GameState): PlaythroughHarness {
  const harness: PlaythroughHarness = {
    engine: undefined as unknown as TurnEngine,
    levelUpChoices: null,
  };
  harness.engine = new TurnEngine(
    state,
    () => {},
    () => {},
    choices => { harness.levelUpChoices = choices; },
  );
  return harness;
}

// ─────────────────────────────────────────
// Combat replication (mirrors CombatScreen.buildEnemiesFromContext)
// ─────────────────────────────────────────

function buildEnemiesFromEvent(event: GameEvent | null, game: GameState, random: () => number): EnemyCombatant[] {
  const location = getLocation(game.currentLocationId);

  const isBossEvent = event?.tags?.includes('boss');
  const isLocationBossFight = !event && isBossLocation(game.currentLocationId) && !game.clearedCombatLocations.has(game.currentLocationId);
  if (isBossEvent || isLocationBossFight) return buildBossEnemy(game);

  const eliteSpawn = game.runLayout?.eliteSpawns.find(s => s.locationId === game.currentLocationId);
  if (eliteSpawn && event?.tags?.includes('location_ambush')) {
    return buildEnemiesForLocation([eliteSpawn.enemyType], game.currentLocationId);
  }

  if (event?.tags?.includes('bandit')) return buildEnemiesForLocation(['Bandits'], game.currentLocationId);
  if (event?.tags?.includes('wolves')) return buildEnemiesForLocation(['Wolves'], game.currentLocationId);

  const eligible = location.mobs.filter(m => random() * 100 < m.aggroPct && !m.isCompanion);
  const toSpawn = eligible.length > 0
    ? eligible.slice(0, 2)
    : location.mobs.filter(m => !m.isCompanion).sort((a, b) => b.aggroPct - a.aggroPct).slice(0, 1);

  return buildEnemiesForLocation(toSpawn.map(m => m.enemyId), game.currentLocationId);
}

function playCombatEncounter(engine: TurnEngine, event: GameEvent, state: GameState): CombatResult {
  const rng = () => engine.nextRandom();
  const enemies = buildEnemiesFromEvent(event, state, rng);
  const combat = new CombatEngine(enemies, state, () => {}, rng);

  let guard = 0;
  while (combat.getState().phase !== 'post_combat') {
    if (++guard > 100) throw new Error('Combat did not resolve within 100 rounds');

    const cs = combat.getState();
    if (cs.phase !== 'awaiting_input') break;

    const lowHp = cs.player.maxHP > 0 && cs.player.currentHP / cs.player.maxHP <= 0.25;
    const hasAliveEnemy = cs.enemies.some(e => e.currentHP > 0 && !e.isFleeing);

    if (lowHp && hasAliveEnemy) {
      combat.submitAction({ type: 'flee' });
    } else {
      combat.submitAction({ type: 'attack', targetEnemyIndex: 0 });
    }
  }

  const result = combat.getState().result;
  if (!result) throw new Error('Combat ended without a result');
  return result;
}

// ─────────────────────────────────────────
// Dialogue replication (mirrors DialogueEngine.choose/accumulateOutcome)
// ─────────────────────────────────────────

function accumulateDialogueOutcome(sessionOutcome: DialogueSessionOutcome, outcome: ChoiceOutcome): void {
  if (outcome.reputationDelta) sessionOutcome.reputationDelta += outcome.reputationDelta;
  if (outcome.moraleDelta) sessionOutcome.moraleDelta += outcome.moraleDelta;
  if (outcome.xpGained) sessionOutcome.xpGained += outcome.xpGained;
  if (outcome.resourceDelta?.food) sessionOutcome.resourceDeltas.food += outcome.resourceDelta.food;
  if (outcome.resourceDelta?.gold) sessionOutcome.resourceDeltas.gold += outcome.resourceDelta.gold;
  if (outcome.resourceDelta?.health) sessionOutcome.resourceDeltas.health += outcome.resourceDelta.health;
  if (outcome.resourceDelta?.daysSpent) {
    sessionOutcome.resourceDeltas.daysSpent = (sessionOutcome.resourceDeltas.daysSpent ?? 0) + outcome.resourceDelta.daysSpent;
  }
  if (outcome.companionEffect) sessionOutcome.companionEffects.push(outcome.companionEffect);
  if (outcome.eventTrigger) sessionOutcome.eventTriggers.push(outcome.eventTrigger);
  if (outcome.flagsSet) sessionOutcome.flagsSet.push(...outcome.flagsSet);
}

function playDialogueEncounter(state: GameState, dialogueId: string): DialogueSessionOutcome {
  const dialogue = getDialogue(dialogueId);
  if (!dialogue) throw new Error(`No dialogue found for id "${dialogueId}"`);

  const outcome: DialogueSessionOutcome = {
    dialogueId,
    reputationDelta: 0,
    moraleDelta: 0,
    xpGained: 0,
    resourceDeltas: { food: 0, gold: 0, health: 0, daysSpent: 0 },
    companionEffects: [],
    eventTriggers: [],
    flagsSet: [],
  };

  let currentNodeId: string | null = dialogue.rootNodeId;
  let guard = 0;

  while (currentNodeId) {
    if (++guard > 50) throw new Error(`Dialogue "${dialogueId}" did not terminate within 50 nodes`);

    const node = dialogue.nodes[currentNodeId];
    if (!node) break;

    if (node.autoAdvance) {
      currentNodeId = node.autoAdvanceToId ?? null;
      continue;
    }

    const visibleChoices = node.choices.filter(choice =>
      !choice.conditions || evalConditions(choice.conditions, state, { dialogueId }),
    );
    const choice = visibleChoices[0] ?? node.choices[0];
    if (!choice) break;

    accumulateDialogueOutcome(outcome, choice.outcome);
    if (choice.outcome.flagsSet) {
      choice.outcome.flagsSet.forEach(flag => state.storyFlags.add(flag));
    }
    currentNodeId = choice.outcome.nextNodeId;
  }

  return outcome;
}

// Mirrors app/game.tsx handleDialogueComplete's outcome -> CombatResult mapping
function dialogueOutcomeToCombatResult(outcome: DialogueSessionOutcome): CombatResult {
  return {
    outcome: 'negotiated',
    roundsFought: 0,
    xpGained: outcome.xpGained,
    goldGained: outcome.resourceDeltas.gold,
    foodGained: outcome.resourceDeltas.food,
    healthLost: -(outcome.resourceDeltas.health ?? 0),
    healthDelta: outcome.resourceDeltas.health ?? 0,
    moraleDelta: outcome.moraleDelta,
    reputationDelta: outcome.reputationDelta,
    injuriesGained: [],
    companionInjuries: {},
    daysSpent: outcome.resourceDeltas.daysSpent ?? 0,
  };
}

// ─────────────────────────────────────────
// Turn driver — submits an action and resolves any interactive
// events / level-ups synchronously, mirroring the UI's role.
// ─────────────────────────────────────────

interface ResolvedInteraction {
  event: GameEvent;
  result: CombatResult;
  dialogueOutcome?: DialogueSessionOutcome;
}

async function submitAndResolve(harness: PlaythroughHarness, params: ActionParams): Promise<ResolvedInteraction[]> {
  const { engine } = harness;
  const resolved: ResolvedInteraction[] = [];

  await engine.submitAction(params);

  while (true) {
    const state = engine.getState();
    if (state.isComplete) return resolved;

    const turn = state.currentTurn;
    if (turn === null) return resolved;

    if (turn.activeInteractiveEvent) {
      const event = turn.activeInteractiveEvent;

      if (isCombatEvent(event)) {
        const result = playCombatEncounter(engine, event, state);
        resolved.push({ event, result });
        await engine.resolveInteractiveEvent(result);
      } else {
        const outcome = playDialogueEncounter(state, event.id);

        for (const effect of outcome.companionEffects) {
          if (effect?.type === 'recruit') {
            const companion = getCompanion(effect.companionId);
            if (companion) engine.addCompanion(companion);
          }
        }
        engine.markDialogueSeen(outcome.dialogueId, state.currentLocationId);

        const result = dialogueOutcomeToCombatResult(outcome);
        const override: TurnRecord['eventOutcome'] = {
          eventId: event.id,
          result: 'dialogue_complete',
          summary: 'Dialogue completed.',
        };
        resolved.push({ event, result, dialogueOutcome: outcome });
        await engine.resolveInteractiveEvent(result, override);
      }
      continue;
    }

    if (turn.phase === TurnPhase.AwaitingLevelUp) {
      const choices = harness.levelUpChoices;
      if (!choices || choices.length === 0) {
        throw new Error('Engine entered AwaitingLevelUp but no choices were captured');
      }
      harness.levelUpChoices = null;
      await engine.submitLevelUpChoice(choices[0].id);
      continue;
    }

    throw new Error(`submitAndResolve: unexpected turn phase "${turn.phase}"`);
  }
}

// Replicates TurnEngine.applyAllDeltas() for the resources we assert on,
// so we can reconcile a turn's recorded StatDelta[] against the resulting state.
function applyDeltasSequentially(
  pre: GameState,
  deltas: StatDelta[],
  maxHealth: number,
): { food: number; gold: number; health: number; moraleValue: number; reputationValue: number } {
  let food = pre.resources.food;
  let gold = pre.resources.gold;
  let health = pre.player.health;
  let morale = pre.morale;
  let reputation = pre.reputation;

  for (const d of deltas) {
    if (d.food !== undefined) food = Math.max(0, food + d.food);
    if (d.gold !== undefined) gold = Math.max(0, gold + d.gold);
    if (d.health !== undefined) health = clamp(health + d.health, 0, maxHealth);
    if (d.morale !== undefined) morale = applyMoraleDelta(morale, d.morale);
    if (d.reputation !== undefined) reputation = applyReputationDelta(reputation, d.reputation);
  }

  return { food, gold, health, moraleValue: morale.value, reputationValue: reputation.value };
}

const MIXED_ACTION_CYCLE: ActionParams[] = [
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Hunt, method: 'forage' },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Rest, atInn: false },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Camp },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Rally },
];

// ─────────────────────────────────────────
// Tests
// ─────────────────────────────────────────

describe('Playthrough — resource integrity', () => {
  it('keeps health/morale/reputation/food/gold/loyalty within bounds and reconciles every recorded delta', async () => {
    const state = makeSeededState(20260610);
    const harness = createHarness(state);

    const MAX_TURNS = 80;
    let turnsRun = 0;

    for (let i = 0; i < MAX_TURNS; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      await submitAndResolve(harness, MIXED_ACTION_CYCLE[i % MIXED_ACTION_CYCLE.length]);
      turnsRun += 1;

      const post = harness.engine.getState();

      expect(post.player.health).toBeGreaterThanOrEqual(0);
      expect(post.player.health).toBeLessThanOrEqual(post.player.stats.maxHealth);
      expect(post.morale.value).toBeGreaterThanOrEqual(0);
      expect(post.morale.value).toBeLessThanOrEqual(100);
      expect(post.reputation.value).toBeGreaterThanOrEqual(0);
      expect(post.reputation.value).toBeLessThanOrEqual(100);
      expect(post.resources.food).toBeGreaterThanOrEqual(0);
      expect(post.resources.gold).toBeGreaterThanOrEqual(0);
      for (const companion of post.companions) {
        expect(companion.loyalty.value).toBeGreaterThanOrEqual(0);
        expect(companion.loyalty.value).toBeLessThanOrEqual(100);
      }

      if (post.turnHistory.length === pre.turnHistory.length + 1) {
        const record = post.turnHistory[post.turnHistory.length - 1];
        const expected = applyDeltasSequentially(pre, record.deltas, post.player.stats.maxHealth);

        expect(post.resources.food).toBeCloseTo(expected.food, 6);
        expect(post.resources.gold).toBeCloseTo(expected.gold, 6);
        expect(post.player.health).toBeCloseTo(expected.health, 6);
        expect(post.morale.value).toBeCloseTo(expected.moraleValue, 6);
        expect(post.reputation.value).toBeCloseTo(expected.reputationValue, 6);
      }
    }

    expect(turnsRun).toBeGreaterThan(10);
    expect(harness.engine.getState().turnHistory.length).toBeGreaterThan(0);
  });
});

describe('Playthrough — encounter rates', () => {
  it('combat and NPC encounters fire at plausible rates over many turns', async () => {
    const SEEDS = [101, 202, 303, 404, 505, 606];
    const TURNS_PER_SEED = 50;

    let totalTurns = 0;
    let combatTurns = 0;
    let npcTurns = 0;

    for (const seed of SEEDS) {
      const state = makeSeededState(seed);
      const harness = createHarness(state);

      for (let i = 0; i < TURNS_PER_SEED; i++) {
        const pre = harness.engine.getState();
        if (pre.isComplete) break;

        const resolved = await submitAndResolve(harness, MIXED_ACTION_CYCLE[i % MIXED_ACTION_CYCLE.length]);
        totalTurns += 1;

        if (resolved.some(({ event }) => isCombatEvent(event))) combatTurns += 1;
        if (resolved.some(({ event }) => event.type === EventType.NpcEncounter)) npcTurns += 1;

        if (harness.engine.getState().isComplete) break;
      }
    }

    expect(totalTurns).toBeGreaterThan(50);

    // Combat (bandit/wolf ambushes, danger-zone mobs, elites) and NPC road
    // encounters should both occur, but not on every single turn.
    const combatRate = combatTurns / totalTurns;
    const npcRate = npcTurns / totalTurns;

    expect(combatTurns).toBeGreaterThan(0);
    expect(npcTurns).toBeGreaterThan(0);
    expect(combatRate).toBeGreaterThan(0);
    expect(combatRate).toBeLessThan(0.6);
    expect(npcRate).toBeGreaterThan(0);
    expect(npcRate).toBeLessThan(0.6);
  });
});

describe('Playthrough — combat encounter resolution', () => {
  it('resolves a full combat encounter and applies its CombatResult to game state', async () => {
    const state = makeSeededState(8675309);
    const harness = createHarness(state);

    let found: { pre: GameState; post: GameState; event: GameEvent; result: CombatResult } | null = null;

    for (let i = 0; i < 60 && !found; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, MIXED_ACTION_CYCLE[i % MIXED_ACTION_CYCLE.length]);
      const post = harness.engine.getState();

      if (
        resolved.length === 1
        && isCombatEvent(resolved[0].event)
        && post.turnHistory.length === pre.turnHistory.length + 1
      ) {
        found = { pre, post, event: resolved[0].event, result: resolved[0].result };
      }
    }

    expect(found).not.toBeNull();
    const { pre, post, event, result } = found!;

    expect(['victory', 'defeat', 'fled', 'negotiated']).toContain(result.outcome);

    const record = post.turnHistory[post.turnHistory.length - 1];
    expect(record.eventOutcome?.eventId).toBe(event.id);
    expect(record.eventOutcome?.result).toBe(result.outcome);

    const eventDelta = record.deltas.find(d => d.source === 'event_result');
    expect(eventDelta).toBeDefined();
    expect(eventDelta!.xp).toBe(result.xpGained);
    expect(eventDelta!.gold).toBe(result.goldGained);
    expect(eventDelta!.food).toBe(result.foodGained);
    expect(eventDelta!.health).toBe(result.healthDelta ?? -result.healthLost);

    const expected = applyDeltasSequentially(pre, record.deltas, post.player.stats.maxHealth);
    expect(post.resources.food).toBeCloseTo(expected.food, 6);
    expect(post.resources.gold).toBeCloseTo(expected.gold, 6);
    expect(post.player.health).toBeCloseTo(expected.health, 6);
    expect(post.morale.value).toBeCloseTo(expected.moraleValue, 6);
    expect(post.reputation.value).toBeCloseTo(expected.reputationValue, 6);

    if (result.outcome === 'victory' && event.tags.includes('location_ambush')) {
      expect(post.clearedCombatLocations.has(post.currentLocationId)).toBe(true);
    }
  });
});

describe('Playthrough — NPC dialogue encounter resolution', () => {
  it('resolves a full NPC dialogue encounter and applies its outcome to game state', async () => {
    const state = makeSeededState(13013);
    const harness = createHarness(state);

    let found: {
      pre: GameState;
      post: GameState;
      event: GameEvent;
      result: CombatResult;
      outcome: DialogueSessionOutcome;
    } | null = null;

    for (let i = 0; i < 60 && !found; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, MIXED_ACTION_CYCLE[i % MIXED_ACTION_CYCLE.length]);
      const post = harness.engine.getState();

      if (
        resolved.length === 1
        && resolved[0].event.type === EventType.NpcEncounter
        && resolved[0].dialogueOutcome
        && post.turnHistory.length === pre.turnHistory.length + 1
      ) {
        found = {
          pre,
          post,
          event: resolved[0].event,
          result: resolved[0].result,
          outcome: resolved[0].dialogueOutcome,
        };
      }
    }

    expect(found).not.toBeNull();
    const { pre, post, event, result, outcome } = found!;

    expect(result.outcome).toBe('negotiated');
    expect(outcome.dialogueId).toBe(event.id);

    const record = post.turnHistory[post.turnHistory.length - 1];
    expect(record.eventOutcome?.eventId).toBe(event.id);
    expect(record.eventOutcome?.result).toBe('dialogue_complete');

    const eventDelta = record.deltas.find(d => d.source === 'event_result');
    expect(eventDelta).toBeDefined();
    expect(eventDelta!.xp).toBe(outcome.xpGained);
    expect(eventDelta!.gold).toBe(outcome.resourceDeltas.gold);
    expect(eventDelta!.food).toBe(outcome.resourceDeltas.food);
    expect(eventDelta!.health).toBe(outcome.resourceDeltas.health ?? 0);
    expect(eventDelta!.morale).toBe(outcome.moraleDelta);
    expect(eventDelta!.reputation).toBe(outcome.reputationDelta);

    const expected = applyDeltasSequentially(pre, record.deltas, post.player.stats.maxHealth);
    expect(post.resources.food).toBeCloseTo(expected.food, 6);
    expect(post.resources.gold).toBeCloseTo(expected.gold, 6);
    expect(post.player.health).toBeCloseTo(expected.health, 6);
    expect(post.morale.value).toBeCloseTo(expected.moraleValue, 6);
    expect(post.reputation.value).toBeCloseTo(expected.reputationValue, 6);

    expect(post.firedEventIds.has(`${outcome.dialogueId}_loc${post.currentLocationId}`)).toBe(true);

    for (const effect of outcome.companionEffects) {
      if (effect?.type === 'recruit') {
        expect(post.companions.some(c => c.id === effect.companionId)).toBe(true);
      }
    }
  });
});
