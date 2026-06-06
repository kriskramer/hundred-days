import {
  CombatEngine,
  ENEMY_DEFINITIONS,
  buildBossEnemy,
} from '@engine/CombatEngine';
import { TurnEngine } from '@engine/TurnEngine';
import { BOSS_EVENT_MAP } from '@engine/bosses';
import { EVENT_DEFINITIONS } from '@engine/EventSystem';
import { makeGameState } from '../__fixtures__/gameState';
import { saveEngine } from '@engine/SaveEngine';
import {
  CombatResult,
  ResolutionType,
  EventType,
  GameState,
  GameEvent,
} from '@engine/types';
import { inventoryFromResources } from '@engine/ItemSystem';

// ─────────────────────────────────────────
// Module-level mocks
// ─────────────────────────────────────────

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

const mockSampleEvents = jest.fn<GameEvent[], [GameState]>(() => []);
const mockHasEligibleDialogue = jest.fn<boolean, [GameState]>(() => false);

jest.mock('@engine/EventSystem', () => ({
  sampleEventsForTurn: (state: GameState) => mockSampleEvents(state),
  hasEligibleDialogue: (state: GameState) => mockHasEligibleDialogue(state),
  passiveOutcomeToDelta: jest.requireActual('@engine/EventSystem').passiveOutcomeToDelta,
  EVENT_DEFINITIONS: jest.requireActual('@engine/EventSystem').EVENT_DEFINITIONS,
}));

const mockBossLocation = (locationId: number) => ({
  id: locationId,
  name: `Boss Location ${locationId}`,
  type: 'wilderness',
  region: 'The Midlands',
  isTown: false,
  hasShop: false,
  mobs: [],
  actions: { canSteal: false, huntYield: null, restQuality: null, travelDifficulty: 1, hasBossFight: true },
  bossLevel: 1,
  locationText: 'A dark presence looms.',
  randomTexts: [],
  eventPool: [],
});

jest.mock('@data/locations', () => ({
  LOCATIONS: Array.from({ length: 125 }, (_, i) => {
    const id = i + 1;
    const bossIds = [32, 65, 93, 125];
    return bossIds.includes(id)
      ? { id, name: `Boss Location ${id}`, type: 'wilderness', region: 'The Midlands', isTown: false, hasShop: false, mobs: [], actions: { canSteal: false, huntYield: null, restQuality: null, travelDifficulty: 1, hasBossFight: true }, bossLevel: 1, locationText: null, randomTexts: [], eventPool: [] }
      : { id, name: `Location ${id}`, type: 'wilderness', region: 'The Midlands', isTown: false, hasShop: false, mobs: [], actions: { canSteal: false, huntYield: null, restQuality: null, travelDifficulty: 1, hasBossFight: false }, bossLevel: null, locationText: null, randomTexts: [], eventPool: [] };
  }),
  getLocation: jest.fn((id: number) => mockBossLocation(id)),
  getRegion: jest.fn(() => ({ name: 'The Midlands', locationRange: [1, 125], description: '', dangerLevel: 3 })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSampleEvents.mockReturnValue([]);
  mockHasEligibleDialogue.mockReturnValue(false);
});

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function makeCombatVictory(overrides: Partial<CombatResult> = {}): CombatResult {
  return {
    outcome:           'victory',
    roundsFought:      3,
    xpGained:          50,
    goldGained:        0,
    foodGained:        0,
    healthLost:        10,
    healthDelta:       -10,
    moraleDelta:       8,
    reputationDelta:   0,
    injuriesGained:    [],
    companionInjuries: {},
    itemsConsumed:     [],
    lootedItems:       [],
    ...overrides,
  };
}

// ─────────────────────────────────────────
// Boss event definitions
// ─────────────────────────────────────────

describe('boss event definitions', () => {
  const bossEventIds = Object.values(BOSS_EVENT_MAP);

  it.each(bossEventIds)('event %s exists with Interactive resolution and combat tag', (eventId) => {
    const event = EVENT_DEFINITIONS.find(e => e.id === eventId);
    expect(event).toBeDefined();
    expect(event!.resolutionType).toBe(ResolutionType.Interactive);
    expect(event!.tags).toContain('boss');
    expect(event!.tags).toContain('combat');
    expect(event!.interactiveHandlerId).toBe('combat_handler');
    expect(event!.repeatable).toBe(false);
  });

  it.each([
    [32, 'boss_orc_warchief'],
    [65, 'boss_lich_of_vorishy'],
    [93, 'boss_white_horseman'],
    [125, 'boss_dread_sovereign'],
  ] as [number, string][])('location %i fires event %s', (locationId, eventId) => {
    const event = EVENT_DEFINITIONS.find(e => e.id === eventId)!;
    expect(event.conditions.minLocationId).toBe(locationId);
    expect(event.conditions.probability).toBe(1.0);
  });
});

// ─────────────────────────────────────────
// buildBossEnemy
// ─────────────────────────────────────────

describe('buildBossEnemy', () => {
  const bossLocations = [32, 65, 93, 125] as const;

  it.each(bossLocations)('builds a valid combatant at location %i', (locationId) => {
    const state = makeGameState({ currentLocationId: locationId });
    const enemies = buildBossEnemy(state);

    expect(enemies).toHaveLength(1);
    const boss = enemies[0];
    expect(boss.currentHP).toBeGreaterThan(0);
    expect(boss.maxHP).toBe(boss.currentHP);
    expect(boss.attack).toBeGreaterThan(0);
    expect(boss.defense).toBeGreaterThanOrEqual(0);
  });

  it('scales boss HP with player level', () => {
    const level1 = makeGameState({ currentLocationId: 32, player: { ...makeGameState().player, level: 1 } });
    const level5 = makeGameState({ currentLocationId: 32, player: { ...makeGameState().player, level: 5 } });

    const [boss1] = buildBossEnemy(level1);
    const [boss5] = buildBossEnemy(level5);

    expect(boss5.maxHP).toBeGreaterThan(boss1.maxHP);
    expect(boss5.attack).toBeGreaterThan(boss1.attack);
  });

  it('each boss is a different enemy', () => {
    const ids = ([32, 65, 93, 125] as const).map(loc =>
      buildBossEnemy(makeGameState({ currentLocationId: loc }))[0].enemyId,
    );
    expect(new Set(ids).size).toBe(4);
  });
});

// ─────────────────────────────────────────
// CombatEngine — boss loot
// ─────────────────────────────────────────

describe('CombatEngine boss loot', () => {
  function runBossFightToVictory(locationId: number): CombatResult {
    const state = makeGameState({ currentLocationId: locationId });
    const enemies = buildBossEnemy(state);

    // Give player overwhelming attack to guarantee one-hit kill
    const strongState: GameState = {
      ...state,
      player: {
        ...state.player,
        health: 200,
        stats: { ...state.player.stats, maxHealth: 200, attack: 9999, defense: 50, speed: 50 },
      },
    };
    const strongEnemies = enemies.map(e => ({ ...e, currentHP: 1, maxHP: 1 }));

    const onStateChange = jest.fn();
    const engine = new CombatEngine(strongEnemies, strongState, onStateChange, () => 0.5);

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });
    const finalState = engine.getState();
    return finalState.result!;
  }

  it.each([32, 65, 93, 125])('boss at location %i drops loot on victory', (locationId) => {
    const result = runBossFightToVictory(locationId);
    expect(result.outcome).toBe('victory');
    expect(result.lootedItems).toBeDefined();
    expect(result.lootedItems!.length).toBeGreaterThan(0);
  });

  it('boss loot items all reference valid item definitions', () => {
    const { getItemDef } = require('@engine/ItemSystem');
    ([32, 65, 93, 125] as const).forEach(locationId => {
      const result = runBossFightToVictory(locationId);
      for (const itemId of result.lootedItems ?? []) {
        const def = getItemDef(itemId);
        expect(def).toBeDefined();
      }
    });
  });
});

// ─────────────────────────────────────────
// TurnEngine — boss resolution
// ─────────────────────────────────────────

describe('TurnEngine.resolveLocationCombat', () => {
  function makeTurnEngine(locationId: number) {
    const state = makeGameState({ currentLocationId: locationId });
    const onStateChange = jest.fn();
    const onAwaitInput  = jest.fn();
    const onLevelUp     = jest.fn();
    const engine = new TurnEngine(state, onStateChange, onAwaitInput, onLevelUp, Math.random);
    return engine;
  }

  it('marks boss location cleared after victory', async () => {
    const engine = makeTurnEngine(32);
    await engine.resolveLocationCombat(32, makeCombatVictory());
    expect(engine.getState().clearedCombatLocations.has(32)).toBe(true);
  });

  it('records boss event as fired to prevent re-trigger', async () => {
    const engine = makeTurnEngine(32);
    await engine.resolveLocationCombat(32, makeCombatVictory());
    expect(engine.getState().firedEventIds.has('boss_orc_warchief')).toBe(true);
  });

  it('adds boss loot items to inventory', async () => {
    const lootedItems = ['healing_potion', 'travelers_blade'];
    const engine = makeTurnEngine(32);
    await engine.resolveLocationCombat(32, makeCombatVictory({ lootedItems }));

    const inv = inventoryFromResources(engine.getState().resources);
    const itemIds = inv.items.map(i => i.definitionId);
    expect(itemIds).toContain('healing_potion');
    expect(itemIds).toContain('travelers_blade');
  });

  it('does not mark location cleared on defeat', async () => {
    const engine = makeTurnEngine(32);
    await engine.resolveLocationCombat(32, makeCombatVictory({ outcome: 'defeat', lootedItems: [] }));
    expect(engine.getState().clearedCombatLocations.has(32)).toBe(true);
  });

  it('marks all four boss locations cleared and their events fired after victories', async () => {
    const bossLocations = [32, 65, 93, 125] as const;
    for (const locationId of bossLocations) {
      const engine = makeTurnEngine(locationId);
      const eventId = BOSS_EVENT_MAP[locationId];
      await engine.resolveLocationCombat(locationId, makeCombatVictory());
      expect(engine.getState().clearedCombatLocations.has(locationId)).toBe(true);
      expect(engine.getState().firedEventIds.has(eventId)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────
// In-combat item limits
// ─────────────────────────────────────────

describe('CombatEngine in-combat item limits', () => {
  function makeEngineWithPotion() {
    const { addItem, inventoryFromResources, resourcesToInventory } = require('@engine/ItemSystem');
    const state = makeGameState();
    const inv = inventoryFromResources(state.resources);
    const added = addItem(inv, 'healing_potion');
    const resources = resourcesToInventory(state.resources, added.inventory!);
    const stateWithPotion: GameState = { ...state, resources };
    const enemy = ENEMY_DEFINITIONS.find(e => e.id === 'small_rats')!;
    const enemies = [{
      enemyId: enemy.id, name: enemy.name,
      currentHP: 100, maxHP: 100,
      attack: 1, defense: 0, speed: 1,
      behavior: enemy.behavior, abilities: enemy.abilities,
      isFleeing: false, physicalResistance: 0, statusEffects: [],
    }];
    const engine = new CombatEngine(enemies, stateWithPotion, jest.fn(), () => 0.5);
    return engine;
  }

  it('allows item use when within combatUsesPerBattle limit', () => {
    const engine = makeEngineWithPotion();
    engine.submitAction({ type: 'skill', itemId: 'healing_potion' });
    const used = engine.getState().itemsConsumed.filter(id => id === 'healing_potion').length;
    expect(used).toBe(1);
  });

  it('blocks item use after combatUsesPerBattle is reached', () => {
    const engine = makeEngineWithPotion();
    // healing_potion has combatUsesPerBattle: 2 — use it twice
    engine.submitAction({ type: 'skill', itemId: 'healing_potion' });
    engine.submitAction({ type: 'skill', itemId: 'healing_potion' });
    // Third use should be blocked by engine
    engine.submitAction({ type: 'skill', itemId: 'healing_potion' });
    const used = engine.getState().itemsConsumed.filter(id => id === 'healing_potion').length;
    expect(used).toBe(2);
  });
});
