import { GameState, TurnRecord } from '@engine/types';
import {
  applyDeltasSequentially,
  applyStandaloneDialogueExpected,
  ResolvedInteraction,
  ReconciledResources,
} from './playthroughHarness';

export function assertResourceBounds(post: GameState): void {
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
}

export function assertXpAndLevel(post: GameState, pre: GameState): void {
  expect(post.player.xp).toBeGreaterThanOrEqual(pre.player.xp);
  expect(post.player.level).toBeGreaterThanOrEqual(pre.player.level);
  if (post.player.level === pre.player.level) {
    expect(post.player.stats.maxHealth).toBe(pre.player.stats.maxHealth);
    expect(post.player.stats.attack).toBe(pre.player.stats.attack);
  } else {
    expect(post.player.level).toBe(pre.player.level + 1);
    expect(post.player.stats.maxHealth).toBeGreaterThanOrEqual(pre.player.stats.maxHealth);
  }
}

export function assertTurnRecordShape(record: TurnRecord): void {
  expect(record.action).toBeDefined();
  expect(record.locationBefore).toBeGreaterThan(0);
  expect(record.locationAfter).toBeGreaterThan(0);
  expect(Array.isArray(record.deltas)).toBe(true);
  for (const delta of record.deltas) {
    expect(delta.source).toBeDefined();
  }
}

export function assertCompanionLoyaltyDeltas(
  pre: GameState,
  post: GameState,
  expected: ReconciledResources,
): void {
  for (const companion of post.companions) {
    const preCompanion = pre.companions.find(c => c.id === companion.id);
    if (!preCompanion) continue;

    if (expected.companionLoyalty[companion.id] !== undefined) {
      expect(companion.loyalty.value).toBeCloseTo(expected.companionLoyalty[companion.id], 6);
    }
  }
}

export function assertDeltaReconciliation(
  pre: GameState,
  post: GameState,
  record: TurnRecord,
  resolved: ResolvedInteraction[],
): void {
  let expected = applyDeltasSequentially(pre, record.deltas, post.player.stats.maxHealth);

  for (const interaction of resolved) {
    if (interaction.dialogueOutcome) {
      expected = applyStandaloneDialogueExpected(
        expected,
        interaction.dialogueOutcome,
        post.player.stats.maxHealth,
      );
    }
  }

  expect(post.resources.food).toBeCloseTo(expected.food, 6);
  expect(post.resources.gold).toBeCloseTo(expected.gold, 6);
  expect(post.player.health).toBeCloseTo(expected.health, 6);
  expect(post.morale.value).toBeCloseTo(expected.moraleValue, 6);
  expect(post.reputation.value).toBeCloseTo(expected.reputationValue, 6);

  if (post.player.level === pre.player.level) {
    expect(post.player.xp).toBeCloseTo(expected.xp, 6);
  }

  assertCompanionLoyaltyDeltas(pre, post, expected);
}

export function assertTurnInvariants(
  pre: GameState,
  post: GameState,
  resolved: ResolvedInteraction[],
): void {
  assertResourceBounds(post);
  assertXpAndLevel(post, pre);

  if (post.turnHistory.length === pre.turnHistory.length + 1) {
    const record = post.turnHistory[post.turnHistory.length - 1];
    assertTurnRecordShape(record);
    assertDeltaReconciliation(pre, post, record, resolved);
  }
}
