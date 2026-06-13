import { EventType, GameState, GameEvent, CombatResult, DialogueSessionOutcome } from '@engine/types';
import { isCombatEvent } from '@utils/isCombatEvent';
import {
  makeSeededState,
  createHarness,
  submitAndResolve,
  makeActionPicker,
  applyDeltasSequentially,
  applyStandaloneDialogueExpected,
  SMOKE_POOL,
} from '../helpers/playthroughHarness';
import { assertTurnInvariants } from '../helpers/statInvariants';

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

describe('Playthrough — smoke invariants', () => {
  it('keeps resources within bounds and reconciles every recorded delta over 20 turns', async () => {
    const seed = 20260610;
    const harness = createHarness(makeSeededState(seed));
    const pickAction = makeActionPicker(seed);

    const MAX_TURNS = 20;
    let turnsRun = 0;

    for (let i = 0; i < MAX_TURNS; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, pickAction());
      turnsRun += 1;
      assertTurnInvariants(pre, harness.engine.getState(), resolved);
    }

    expect(turnsRun).toBeGreaterThan(5);
    expect(harness.engine.getState().turnHistory.length).toBeGreaterThan(0);
  });
});

describe('Playthrough — encounter rates', () => {
  it('combat and NPC encounters fire at plausible rates over many turns', async () => {
    const SEEDS = [101, 202, 303, 404, 505, 606];
    const TURNS_PER_SEED = 20;

    let totalTurns = 0;
    let combatTurns = 0;
    let npcTurns = 0;

    for (const seed of SEEDS) {
      const harness = createHarness(makeSeededState(seed));
      const pickAction = makeActionPicker(seed, SMOKE_POOL);

      for (let i = 0; i < TURNS_PER_SEED; i++) {
        const pre = harness.engine.getState();
        if (pre.isComplete) break;

        const resolved = await submitAndResolve(harness, pickAction());
        totalTurns += 1;

        if (resolved.some(({ event }) => isCombatEvent(event))) combatTurns += 1;
        if (resolved.some(({ event }) => event.type === EventType.NpcEncounter)) npcTurns += 1;

        if (harness.engine.getState().isComplete) break;
      }
    }

    expect(totalTurns).toBeGreaterThan(50);

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
    const seed = 8675309;
    const harness = createHarness(makeSeededState(seed));
    const pickAction = makeActionPicker(seed);

    let found: {
      pre: GameState;
      post: GameState;
      event: GameEvent;
      result: CombatResult;
    } | null = null;

    for (let i = 0; i < 60 && !found; i++) {
      const pre = harness.engine.getState();
      if (pre.isComplete) break;

      const resolved = await submitAndResolve(harness, pickAction());
      const post = harness.engine.getState();

      if (resolved.length >= 1 && post.turnHistory.length === pre.turnHistory.length + 1) {
        const combatResolved = resolved.find(r => isCombatEvent(r.event));
        if (combatResolved) {
          found = { pre, post, event: combatResolved.event, result: combatResolved.result };
        }
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
    const seed = 13013;
    const harness = createHarness(makeSeededState(seed));
    const pickAction = makeActionPicker(seed);

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

      const resolved = await submitAndResolve(harness, pickAction());
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
    let expected = applyDeltasSequentially(pre, record.deltas, post.player.stats.maxHealth);
    expected = applyStandaloneDialogueExpected(expected, outcome, post.player.stats.maxHealth);

    expect(post.resources.food).toBeCloseTo(expected.food, 6);
    expect(post.resources.gold).toBeCloseTo(expected.gold, 6);
    expect(post.player.health).toBeCloseTo(expected.health, 6);
    expect(post.morale.value).toBeCloseTo(expected.moraleValue, 6);
    expect(post.reputation.value).toBeCloseTo(expected.reputationValue, 6);
    expect(post.player.xp).toBeGreaterThanOrEqual(pre.player.xp + outcome.xpGained);

    expect(post.firedEventIds.has(`${outcome.dialogueId}_loc${post.currentLocationId}`)).toBe(true);

    for (const effect of outcome.companionEffects) {
      if (effect?.type === 'recruit') {
        expect(post.companions.some(c => c.id === effect.companionId)).toBe(true);
      }
    }
  });
});
