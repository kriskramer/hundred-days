import { TurnEngine, ActionParams } from '@engine/TurnEngine';
import {
  createNewGameState,
  applyMoraleDelta,
  applyReputationDelta,
  applyXP,
  clamp,
} from '@engine/GameState';
import { generateRunLayout } from '@engine/RunLayout';
import { normalizeRngState, nextMulberry32 } from '@engine/Random';
import {
  advanceCompanionQuest,
  findQuestForDialogue,
} from '@engine/CompanionQuestSystem';
import {
  PlayerAction,
  TurnPhase,
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
import { dialogueOutcomeToCombatResult } from '@utils/dialogueOutcomeToCombatResult';
import { getLocation } from '@data/locations';
import { getDialogue } from '@data/dialogues';
import { getCompanion } from '@data/companions';
import { evalConditions } from '@engine/ConditionEvaluator';

export interface PlaythroughHarness {
  engine: TurnEngine;
  levelUpChoices: LevelUpChoice[] | null;
  pendingOptionalEvents: GameEvent[];
  forceCombatVictory?: boolean;
}

export interface ResolvedInteraction {
  event: GameEvent;
  result: CombatResult;
  dialogueOutcome?: DialogueSessionOutcome;
}

export interface HarnessOptions {
  randomOverride?: () => number;
  forceCombatVictory?: boolean;
}

export function makeSeededState(seed: number): GameState {
  const base = createNewGameState('Test Hero');
  return {
    ...base,
    seed,
    rngState: normalizeRngState(seed),
    runLayout: generateRunLayout(seed),
  };
}

export function createHarness(state: GameState, options: HarnessOptions = {}): PlaythroughHarness {
  const harness: PlaythroughHarness = {
    engine: undefined as unknown as TurnEngine,
    levelUpChoices: null,
    pendingOptionalEvents: [],
    forceCombatVictory: options.forceCombatVictory,
  };
  harness.engine = new TurnEngine(
    state,
    () => {},
    event => {
      if (event && !isCombatEvent(event)) {
        harness.pendingOptionalEvents.push(event);
      }
    },
    choices => { harness.levelUpChoices = choices; },
    options.randomOverride,
  );
  return harness;
}

function buildEnemiesFromEvent(
  event: GameEvent | null,
  game: GameState,
  random: () => number,
): EnemyCombatant[] {
  const location = getLocation(game.currentLocationId);

  const isBossEvent = event?.tags?.includes('boss');
  const isLocationBossFight = !event
    && isBossLocation(game.currentLocationId)
    && !game.clearedCombatLocations.has(game.currentLocationId);
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

export function playCombatEncounter(
  engine: TurnEngine,
  event: GameEvent,
  state: GameState,
  forceVictory = false,
): CombatResult {
  if (forceVictory) {
    return {
      outcome: 'victory',
      roundsFought: 1,
      xpGained: 80,
      goldGained: 30,
      foodGained: 0,
      healthLost: 5,
      healthDelta: -5,
      moraleDelta: 5,
      reputationDelta: 2,
      injuriesGained: [],
      companionInjuries: {},
      daysSpent: 0,
    };
  }

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

export function playDialogueEncounter(state: GameState, dialogueId: string): DialogueSessionOutcome {
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

function applyCompanionRecruits(engine: TurnEngine, outcome: DialogueSessionOutcome): void {
  for (const effect of outcome.companionEffects) {
    if (effect?.type === 'recruit') {
      const companion = getCompanion(effect.companionId);
      if (companion) engine.addCompanion(companion);
    }
  }
}

/** Mirrors useGameNavigation quest advance after turn-bound dialogue. */
export function advanceQuestAfterDialogue(engine: TurnEngine, dialogueId: string): void {
  const afterEvent = engine.getState();
  const questMatch = findQuestForDialogue(afterEvent, dialogueId);
  if (questMatch) {
    engine.syncExternalState(advanceCompanionQuest(afterEvent, questMatch.companionId));
  }
}

/** Location NPC quest step (not turn-bound). */
export function resolveLocationQuestDialogue(
  harness: PlaythroughHarness,
  dialogueId: string,
): LevelUpChoice[] | null {
  const state = harness.engine.getState();
  const outcome = playDialogueEncounter(state, dialogueId);
  applyCompanionRecruits(harness.engine, outcome);
  harness.engine.markDialogueSeen(outcome.dialogueId, state.currentLocationId);
  return harness.engine.applyLocationDialogueOutcome(outcome, dialogueId);
}

async function resolvePendingOptionalEvents(
  harness: PlaythroughHarness,
  engine: TurnEngine,
  resolved: ResolvedInteraction[],
): Promise<void> {
  while (harness.pendingOptionalEvents.length > 0) {
    const event = harness.pendingOptionalEvents.shift()!;
    const state = engine.getState();
    const outcome = playDialogueEncounter(state, event.id);

    applyCompanionRecruits(engine, outcome);
    engine.markDialogueSeen(outcome.dialogueId, state.currentLocationId);

    const result = dialogueOutcomeToCombatResult(outcome);
    resolved.push({ event, result, dialogueOutcome: outcome });
    await engine.applyStandaloneDialogueResult(result);
  }
}

export async function submitAndResolve(
  harness: PlaythroughHarness,
  params: ActionParams,
): Promise<ResolvedInteraction[]> {
  const { engine } = harness;
  const resolved: ResolvedInteraction[] = [];
  harness.pendingOptionalEvents = [];

  await engine.submitAction(params);

  while (true) {
    const state = engine.getState();
    if (state.isComplete) {
      await resolvePendingOptionalEvents(harness, engine, resolved);
      return resolved;
    }

    const turn = state.currentTurn;
    if (turn === null) {
      await resolvePendingOptionalEvents(harness, engine, resolved);
      return resolved;
    }

    if (turn.activeInteractiveEvent) {
      const event = turn.activeInteractiveEvent;

      if (isCombatEvent(event)) {
        const result = playCombatEncounter(engine, event, state, harness.forceCombatVictory);
        resolved.push({ event, result });
        await engine.resolveInteractiveEvent(result);
      } else {
        const outcome = playDialogueEncounter(state, event.id);

        applyCompanionRecruits(engine, outcome);
        engine.markDialogueSeen(outcome.dialogueId, state.currentLocationId);

        const result = dialogueOutcomeToCombatResult(outcome);
        const override: TurnRecord['eventOutcome'] = {
          eventId: event.id,
          result: 'dialogue_complete',
          summary: 'Dialogue completed.',
        };
        resolved.push({ event, result, dialogueOutcome: outcome });
        await engine.resolveInteractiveEvent(result, override);
        advanceQuestAfterDialogue(engine, outcome.dialogueId);
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

export interface ReconciledResources {
  food: number;
  gold: number;
  health: number;
  moraleValue: number;
  reputationValue: number;
  xp: number;
  companionLoyalty: Record<string, number>;
}

export function applyDeltasSequentially(
  pre: GameState,
  deltas: StatDelta[],
  maxHealth: number,
): ReconciledResources {
  let food = pre.resources.food;
  let gold = pre.resources.gold;
  let health = pre.player.health;
  let morale = pre.morale;
  let reputation = pre.reputation;
  let xp = pre.player.xp;
  const companionLoyalty: Record<string, number> = Object.fromEntries(
    pre.companions.map(c => [c.id, c.loyalty.value]),
  );

  for (const d of deltas) {
    if (d.food !== undefined) food = Math.max(0, food + d.food);
    if (d.gold !== undefined) gold = Math.max(0, gold + d.gold);
    if (d.health !== undefined) health = clamp(health + d.health, 0, maxHealth);
    if (d.morale !== undefined) morale = applyMoraleDelta(morale, d.morale);
    if (d.reputation !== undefined) reputation = applyReputationDelta(reputation, d.reputation);
    if (d.xp !== undefined) xp = applyXP({ ...pre.player, xp }, d.xp).xp;
    if (d.companionLoyalty) {
      for (const [companionId, delta] of Object.entries(d.companionLoyalty)) {
        if (companionLoyalty[companionId] !== undefined) {
          companionLoyalty[companionId] = clamp(companionLoyalty[companionId] + delta, 0, 100);
        }
      }
    }
  }

  return {
    food,
    gold,
    health,
    moraleValue: morale.value,
    reputationValue: reputation.value,
    xp,
    companionLoyalty,
  };
}

export function applyStandaloneDialogueExpected(
  base: ReconciledResources,
  outcome: DialogueSessionOutcome,
  maxHealth: number,
): ReconciledResources {
  return {
    ...base,
    food: Math.max(0, base.food + outcome.resourceDeltas.food),
    gold: Math.max(0, base.gold + outcome.resourceDeltas.gold),
    health: clamp(base.health + (outcome.resourceDeltas.health ?? 0), 0, maxHealth),
    moraleValue: applyMoraleDelta(
      { value: base.moraleValue, tier: 'neutral' as const },
      outcome.moraleDelta,
    ).value,
    reputationValue: applyReputationDelta(
      { value: base.reputationValue, tier: 'neutral' as const },
      outcome.reputationDelta,
    ).value,
    xp: applyXP({ ...({} as GameState['player']), xp: base.xp, level: 1, stats: { maxHealth } }, outcome.xpGained).xp,
  };
}

export const SMOKE_POOL: ActionParams[] = [
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Move, forcedMarch: false },
  { action: PlayerAction.Hunt, method: 'forage' },
  { action: PlayerAction.Rest, atInn: false },
  { action: PlayerAction.Camp },
  { action: PlayerAction.Rally },
];

export function makeActionPicker(seed: number, pool: ActionParams[] = SMOKE_POOL): () => ActionParams {
  let rngState = normalizeRngState(seed);
  return () => {
    const next = nextMulberry32(rngState);
    rngState = next.state;
    return pool[Math.floor(next.value * pool.length)];
  };
}

export function makeSpeedrunPicker(): (state: GameState) => ActionParams {
  return (state: GameState) => {
    const location = getLocation(state.currentLocationId);
    const hpRatio = state.player.health / state.player.stats.maxHealth;

    if (state.resources.food < 5) {
      return { action: PlayerAction.Hunt, method: 'forage' };
    }

    if (hpRatio < 0.45 && location.isTown && state.resources.gold >= 10) {
      return { action: PlayerAction.Rest, atInn: true };
    }

    if (state.resources.food >= 4) {
      return { action: PlayerAction.Move, forcedMarch: true };
    }

    return { action: PlayerAction.Move, forcedMarch: false };
  };
}

export function makeExtendedRunState(seed: number): GameState {
  const state = makeSeededState(seed);
  return {
    ...state,
    resources: {
      ...state.resources,
      food: 100,
      gold: 120,
    },
    player: {
      ...state.player,
      level: 4,
      health: 120,
      stats: {
        ...state.player.stats,
        maxHealth: 120,
        attack: 16,
        defense: 12,
        speed: 8,
      },
    },
  };
}

export function makeVictoryRunState(seed: number): GameState {
  const state = makeExtendedRunState(seed);
  return {
    ...state,
    resources: {
      ...state.resources,
      food: 150,
      gold: 200,
    },
    player: {
      ...state.player,
      level: 8,
      stats: {
        ...state.player.stats,
        maxHealth: 200,
        attack: 28,
        defense: 20,
        speed: 12,
      },
      health: 200,
    },
  };
}

export function makeSurvivalPicker(): (state: GameState) => ActionParams {
  return (state: GameState) => {
    const location = getLocation(state.currentLocationId);

    if (state.resources.food <= 1) {
      return { action: PlayerAction.Hunt, method: 'forage' };
    }

    if (state.morale.value < 40) {
      return { action: PlayerAction.Rally };
    }

    if (state.player.health < state.player.stats.maxHealth * 0.6) {
      if (location.isTown && state.resources.gold >= 10) {
        return { action: PlayerAction.Rest, atInn: true };
      }
      return { action: PlayerAction.Rest, atInn: false };
    }

    if (state.resources.food < 5) {
      return { action: PlayerAction.Hunt, method: 'forage' };
    }

    return { action: PlayerAction.Move, forcedMarch: false };
  };
}

export async function runPlaythrough(
  harness: PlaythroughHarness,
  pickAction: () => ActionParams,
  maxTurns: number,
): Promise<{ turnsRun: number; resolved: ResolvedInteraction[][] }> {
  const allResolved: ResolvedInteraction[][] = [];
  let turnsRun = 0;

  for (let i = 0; i < maxTurns; i++) {
    const pre = harness.engine.getState();
    if (pre.isComplete) break;

    const resolved = await submitAndResolve(harness, pickAction());
    allResolved.push(resolved);
    turnsRun += 1;

    if (harness.engine.getState().isComplete) break;
  }

  return { turnsRun, resolved: allResolved };
}
