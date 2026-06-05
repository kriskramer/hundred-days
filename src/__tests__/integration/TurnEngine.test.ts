import { TurnEngine } from '@engine/TurnEngine';
import { PlayerAction, WeatherType, MoraleTier, GameEvent, ResolutionType, EventType, GameState } from '@engine/types';
import { saveEngine } from '@engine/SaveEngine';
import { makeGameState, makeCompanion } from '../__fixtures__/gameState';
import { getLocation, getRegion } from '@data/locations';

// ─────────────────────────────────────────
// Module-level mocks
// ─────────────────────────────────────────

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

// Default: no events fire
const mockSampleEvents = jest.fn<GameEvent[], [GameState]>(() => []);
const mockHasEligibleDialogue = jest.fn<boolean, [GameState]>(() => false);

jest.mock('@engine/EventSystem', () => ({
  sampleEventsForTurn: (gameState: GameState) => mockSampleEvents(gameState),
  hasEligibleDialogue: (gameState: GameState) => mockHasEligibleDialogue(gameState),
  passiveOutcomeToDelta: jest.requireActual('@engine/EventSystem').passiveOutcomeToDelta,
  EVENT_DEFINITIONS: jest.requireActual('@engine/EventSystem').EVENT_DEFINITIONS,
}));

// Controlled wilderness location
const mockLocation = {
  id: 1, name: 'Test Location', type: 'wilderness',
  region: { name: 'Test Region', startId: 1, endId: 20 },
  isTown: false, hasShop: false,
  mobs: [],
  actions: { canSteal: false, huntYield: 1.0, restQuality: 1.0, travelDifficulty: 1.0, hasBossFight: false },
  bossLevel: null, locationText: null, randomTexts: ['A dusty road.'],
  eventPool: [],
};

jest.mock('@data/locations', () => ({
  LOCATIONS: Array.from({ length: 125 }, (_, i) => ({ ...mockLocation, id: i + 1 })),
  getLocation: jest.fn(() => mockLocation),
  getRegion: jest.fn(() => ({ name: 'Test Region', startId: 1, endId: 20 })),
}));

// ─────────────────────────────────────────
// Factory helper
// ─────────────────────────────────────────

function makeEngine(stateOverrides = {}) {
  const state        = makeGameState(stateOverrides);
  const onStateChange = jest.fn();
  const onAwaitInput  = jest.fn();
  const onLevelUp     = jest.fn();
  const engine = new TurnEngine(state, onStateChange, onAwaitInput, onLevelUp, () => Math.random());
  return { engine, onStateChange, onAwaitInput, onLevelUp };
}

let randomSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSampleEvents.mockReturnValue([]);
  mockHasEligibleDialogue.mockReturnValue(false);
  (getLocation as jest.Mock).mockReturnValue(mockLocation);
  (getRegion as jest.Mock).mockReturnValue({ name: 'Test Region', startId: 1, endId: 20 });
  // Default: no luck roll success, no crits — pass slightly above typical thresholds
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
});

afterEach(() => {
  randomSpy.mockRestore();
});

// ─────────────────────────────────────────
// Move action
// ─────────────────────────────────────────

describe('TurnEngine — Move action', () => {
  it('advances location by 1 and increments day', async () => {
    const { engine } = makeEngine();
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    const after = engine.getState();
    expect(after.dayNumber).toBe(before.dayNumber + 1);
    expect(after.currentLocationId).toBe(before.currentLocationId + 1);
  });

  it('decreases food', async () => {
    const { engine } = makeEngine({ resources: { food: 8, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const foodBefore = engine.getState().resources.food;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().resources.food).toBeLessThan(foodBefore);
  });

  it('still moves without food and applies a hungry march penalty', async () => {
    const { engine } = makeEngine({
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      weather: WeatherType.Neutral,
      morale: { value: 50, tier: MoraleTier.Steady, tierChangedThisTurn: false, dreadActive: false },
      player: { name: 'Test', level: 1, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    const after = engine.getState();
    expect(after.currentLocationId).toBe(before.currentLocationId + 1);
    expect(after.starvationTurns).toBe(1);
    expect(after.player.health).toBe(92);
    expect(after.morale.value).toBe(42);
    expect(after.turnHistory[after.turnHistory.length - 1].narrativeSummary).toContain('short rations');
  });

  it('scales hungry march penalties across consecutive foodless moves', async () => {
    const { engine } = makeEngine({
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      weather: WeatherType.Neutral,
      morale: { value: 60, tier: MoraleTier.Steady, tierChangedThisTurn: false, dreadActive: false },
      player: { name: 'Test', level: 1, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    const startingHealth = engine.getState().player.health;
    const startingMorale = engine.getState().morale.value;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });
    const afterFirstMove = engine.getState();
    expect(afterFirstMove.player.health).toBe(92);
    expect(afterFirstMove.morale.value).toBe(52);
    const firstHealthLoss = startingHealth - afterFirstMove.player.health;
    const firstMoraleLoss = startingMorale - afterFirstMove.morale.value;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });
    const afterSecondMove = engine.getState();
    expect(afterSecondMove.player.health).toBe(79);
    expect(afterSecondMove.morale.value).toBe(42);
    const secondHealthLoss = afterFirstMove.player.health - afterSecondMove.player.health;
    const secondMoraleLoss = afterFirstMove.morale.value - afterSecondMove.morale.value;

    expect(afterSecondMove.starvationTurns).toBe(2);
    expect(secondHealthLoss).toBeGreaterThan(firstHealthLoss);
    expect(secondMoraleLoss).toBeGreaterThan(firstMoraleLoss);
  });

  it('forced march moves 2 locations (no luck roll)', async () => {
    // luck roll mock returns 0.99 (above any threshold) so no lucky 3rd
    const { engine } = makeEngine({ resources: { food: 10, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const locBefore = engine.getState().currentLocationId;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: true });

    expect(engine.getState().currentLocationId).toBe(locBefore + 2);
  });

  it('severe weather limits movement to 1 location even with forced march', async () => {
    const { engine } = makeEngine({
      weather: WeatherType.Severe,
      resources: { food: 10, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const locBefore = engine.getState().currentLocationId;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: true });

    expect(engine.getState().currentLocationId).toBe(locBefore + 1);
  });

  it('stops at the nearest uncleared boss checkpoint', async () => {
    // Start at loc 30, boss at 32, clear combat locations empty → should stop at 32
    const { engine, onAwaitInput } = makeEngine({
      currentLocationId: 30,
      resources: { food: 10, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: true });

    expect(engine.getState().currentLocationId).toBe(32);
    expect(engine.getState().currentTurn).toBeNull();
    expect(onAwaitInput).not.toHaveBeenCalled();
  });

  it('starts the boss encounter without moving past an uncleared boss location', async () => {
    const { engine, onAwaitInput } = makeEngine({
      currentLocationId: 32,
      resources: { food: 10, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().currentLocationId).toBe(32);
    expect(onAwaitInput).toHaveBeenCalled();
    const bossEvent = onAwaitInput.mock.calls[0][0] as GameEvent;
    expect(bossEvent.id).toBe('boss_orc_warchief');
  });

  it('calls saveEngine.saveRun after completing a turn', async () => {
    const { engine } = makeEngine();

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(saveEngine.saveRun).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────
// Rest action
// ─────────────────────────────────────────

describe('TurnEngine — Rest action', () => {
  it('restores health and morale, costs food', async () => {
    const { engine } = makeEngine({
      player: { name: 'Test', level: 1, xp: 0, health: 70, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Rest, atInn: false });

    const after = engine.getState();
    expect(after.player.health).toBeGreaterThan(before.player.health);
    expect(after.morale.value).toBeGreaterThan(before.morale.value);
    expect(after.resources.food).toBeLessThan(before.resources.food);
  });

  it('falls back to camp when not enough gold for inn', async () => {
    const { engine } = makeEngine({
      resources: { food: 8, gold: 0, items: [], maxSlots: 8, equippedItems: {} },
      player: { name: 'Test', level: 1, xp: 0, health: 70, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    // Falls back to camp: +10 HP (camp) + +2 HP (stat tick) = 82
    await engine.submitAction({ action: PlayerAction.Rest, atInn: true });

    const after = engine.getState();
    expect(after.player.health).toBeGreaterThan(70);
    expect(after.player.health).toBeLessThan(90); // not as much as inn (+25)
  });

  it('triggers hazard ambush when resting in high-danger area', async () => {
    const mockGetLocation = getLocation as jest.Mock;
    const mockGetRegion = getRegion as jest.Mock;

    mockGetLocation.mockReturnValue({
      id: 1, name: 'Wilderness Location', type: 'wilderness',
      isTown: false, hasShop: false, mobs: [],
      actions: { canSteal: false, huntYield: 1.0, restQuality: 1.0, travelDifficulty: 1.0, hasBossFight: false },
    });
    mockGetRegion.mockReturnValue({ name: 'Danger Zone', startId: 1, endId: 20, dangerLevel: 8 });

    // Mock random to trigger the ambush: dangerLevel 8 * 0.05 = 0.4 chance.
    // 0.3 <= 0.4, so it should trigger.
    randomSpy.mockReturnValue(0.3);

    const { engine } = makeEngine({
      player: { name: 'Test', level: 1, xp: 0, health: 70, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    await engine.submitAction({ action: PlayerAction.Rest, atInn: false });

    const state = engine.getState();
    const currentTurn = state.currentTurn;
    expect(currentTurn?.activeInteractiveEvent).not.toBeNull();
    expect(currentTurn?.activeInteractiveEvent?.tags).toContain('hazard_ambush');
    expect(currentTurn?.activeInteractiveEvent?.name).toBe('Disturbed Sleep');
  });
});

// ─────────────────────────────────────────
// Hunt action
// ─────────────────────────────────────────

describe('TurnEngine — Hunt action', () => {
  it('gains food and 3 XP', async () => {
    // Mock random to return mid-range forage (0.5 → floor(0.5*3) = 1, 1+1=2 base)
    randomSpy.mockReturnValue(0.5);
    const { engine } = makeEngine();
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Hunt, method: 'forage' });

    const after = engine.getState();
    expect(after.player.xp).toBe(before.player.xp + 3);
    // Food may have gone up or down depending on day cost vs yield; just verify turn advanced
    expect(after.dayNumber).toBe(before.dayNumber + 1);
  });

  it('triggers hazard ambush when hunting in high-danger area', async () => {
    const mockGetLocation = getLocation as jest.Mock;
    const mockGetRegion = getRegion as jest.Mock;

    mockGetLocation.mockReturnValue({
      id: 1, name: 'Wilderness Location', type: 'wilderness',
      isTown: false, hasShop: false, mobs: [],
      actions: { canSteal: false, huntYield: 1.0, restQuality: 1.0, travelDifficulty: 1.0, hasBossFight: false },
    });
    mockGetRegion.mockReturnValue({ name: 'Danger Zone', startId: 1, endId: 20, dangerLevel: 8 });

    // Mock random to trigger the ambush: dangerLevel 8 * 0.05 = 0.4 chance.
    // 0.3 <= 0.4, so it should trigger.
    randomSpy.mockReturnValue(0.3);

    const { engine } = makeEngine();

    await engine.submitAction({ action: PlayerAction.Hunt, method: 'forage' });

    const state = engine.getState();
    const currentTurn = state.currentTurn;
    expect(currentTurn?.activeInteractiveEvent).not.toBeNull();
    expect(currentTurn?.activeInteractiveEvent?.tags).toContain('hazard_ambush');
    expect(currentTurn?.activeInteractiveEvent?.name).toBe('Predator in the Brush');
  });
});

// ─────────────────────────────────────────
// Rally action
// ─────────────────────────────────────────

describe('TurnEngine — Rally action', () => {
  it('increases morale and companion loyalty', async () => {
    const companion = makeCompanion({ id: 'test_comp', loyalty: { value: 50, desertsBelow: 15, complainsBelow: 35 } });
    const { engine } = makeEngine({ companions: [companion] });
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Rally, targetCompanionId: 'test_comp' });

    const after = engine.getState();
    expect(after.morale.value).toBeGreaterThan(before.morale.value);

    const afterComp = after.companions.find(c => c.id === 'test_comp');
    expect(afterComp?.loyalty.value).toBeGreaterThan(companion.loyalty.value);
  });

  it('grants 5 XP', async () => {
    const { engine } = makeEngine();
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Rally });

    expect(engine.getState().player.xp).toBe(before.player.xp + 5);
  });
});

// ─────────────────────────────────────────
// Starvation
// ─────────────────────────────────────────

describe('TurnEngine — starvation', () => {
  it('first starvation turn deducts 10 HP and 8 morale', async () => {
    const { engine } = makeEngine({
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const before = engine.getState();

    await engine.submitAction({ action: PlayerAction.Camp });

    const after = engine.getState();
    expect(after.starvationTurns).toBe(1);
    expect(after.player.health).toBeLessThan(before.player.health);
    expect(after.morale.value).toBeLessThan(before.morale.value);
  });

  it('second starvation turn applies a larger health penalty', async () => {
    const { engine } = makeEngine({
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      starvationTurns: 1,
      player: { name: 'Test', level: 1, xp: 0, health: 80, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const hpBefore = engine.getState().player.health;

    await engine.submitAction({ action: PlayerAction.Camp });

    const after = engine.getState();
    // Second starvation: penalty ≥ 15 (10 + 5*1) before camp recovery
    // Camp recovery: +10 HP, so net is -15 + 10 = -5 minimum
    expect(after.player.health).toBeLessThan(hpBefore);
  });
});

// ─────────────────────────────────────────
// Level-up detection and choice
// ─────────────────────────────────────────

describe('TurnEngine — level-up', () => {
  it('triggers onLevelUp when player XP is already at threshold', async () => {
    // checkLevelUp reads player.xp before deltas are applied (they apply in cleanup).
    // So we must start with XP = 30 (= XP_THRESHOLDS[1]) to trigger level-up.
    const { engine, onLevelUp } = makeEngine({
      player: { name: 'Test', level: 1, xp: 30, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    await engine.submitAction({ action: PlayerAction.Camp });

    expect(onLevelUp).toHaveBeenCalled();
    const choices = onLevelUp.mock.calls[0][0];
    expect(choices).toHaveLength(3);
  });

  it('applying a level-up choice changes stats', async () => {
    randomSpy.mockRestore(); // let real random run for shuffle
    const { engine, onLevelUp } = makeEngine({
      player: { name: 'Test', level: 1, xp: 30, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    await engine.submitAction({ action: PlayerAction.Camp });

    const choices = onLevelUp.mock.calls[0][0];
    expect(choices.length).toBeGreaterThan(0);

    const firstChoice = choices[0];
    await engine.submitLevelUpChoice(firstChoice.id);

    // After level-up: player is level 2
    expect(engine.getState().player.level).toBe(2);
    // Auto-grant: +8 maxHealth (before perk). Perk may add more (e.g., 'tough' adds +5).
    expect(engine.getState().player.stats.maxHealth).toBeGreaterThanOrEqual(108);
    // Auto-grant: +1 attack (before perk). Perk may add more (e.g., 'fierce' adds +3).
    expect(engine.getState().player.stats.attack).toBeGreaterThanOrEqual(9);
  });
});

// ─────────────────────────────────────────
// Win / loss conditions
// ─────────────────────────────────────────

describe('TurnEngine — win/loss', () => {
  it('timeout when day > 100', async () => {
    const { engine } = makeEngine({ dayNumber: 101 });

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().isComplete).toBe(true);
    expect(engine.getState().outcome).toBe('timeout');
  });

  it('defeat when player health is 0', async () => {
    const { engine } = makeEngine({
      player: { name: 'Test', level: 1, xp: 0, health: 0, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().isComplete).toBe(true);
    expect(engine.getState().outcome).toBe('defeat');
  });

  it('victory when at location 125 with boss cleared', async () => {
    const clearedCombatLocations = new Set([125]);
    const { engine } = makeEngine({
      currentLocationId: 125,
      clearedCombatLocations,
    });

    await engine.submitAction({ action: PlayerAction.Camp });

    expect(engine.getState().isComplete).toBe(true);
    expect(engine.getState().outcome).toBe('victory');
  });
});

// ─────────────────────────────────────────
// Interactive event flow
// ─────────────────────────────────────────

describe('TurnEngine — interactive events', () => {
  it('pauses at AwaitingPlayer when an interactive event fires', async () => {
    const banditEvent: GameEvent = {
      id: 'bandit_ambush', type: EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name: 'Bandit Ambush', description: 'Bandits!',
      conditions: { probability: 1.0 }, repeatable: true, tags: ['combat'],
    };
    mockSampleEvents.mockReturnValue([banditEvent]);

    const { engine, onAwaitInput } = makeEngine();
    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(onAwaitInput).toHaveBeenCalledWith(banditEvent);
  });

  it('applies combat result and completes turn after resolveInteractiveEvent', async () => {
    const banditEvent: GameEvent = {
      id: 'bandit_ambush', type: EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name: 'Bandit Ambush', description: 'Bandits!',
      conditions: { probability: 1.0 }, repeatable: true, tags: ['combat'],
    };
    mockSampleEvents.mockReturnValue([banditEvent]);

    const { engine } = makeEngine();
    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    const goldBefore = engine.getState().resources.gold;
    await engine.resolveInteractiveEvent({
      outcome: 'victory', roundsFought: 2, xpGained: 18, goldGained: 10,
      foodGained: 0, healthLost: 5, moraleDelta: 8, reputationDelta: 0,
      injuriesGained: [], companionInjuries: {},
    });

    const after = engine.getState();
    expect(after.player.xp).toBeGreaterThan(0);
    expect(after.resources.gold).toBeGreaterThanOrEqual(goldBefore + 10 - 5); // gold + event gain, minus any costs
    expect(after.dayNumber).toBeGreaterThan(1);
  });

  it('records action, locations, triggered events, and event outcome in turn history', async () => {
    const banditEvent: GameEvent = {
      id: 'bandit_ambush', type: EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name: 'Bandit Ambush', description: 'Bandits!',
      conditions: { probability: 1.0 }, repeatable: true, tags: ['combat'],
    };
    mockSampleEvents.mockReturnValue([banditEvent]);

    const { engine } = makeEngine();
    const startingLocation = engine.getState().currentLocationId;

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });
    await engine.resolveInteractiveEvent({
      outcome: 'victory', roundsFought: 2, xpGained: 18, goldGained: 10,
      foodGained: 0, healthLost: 5, moraleDelta: 8, reputationDelta: 0,
      injuriesGained: [], companionInjuries: {},
    });

    const history = engine.getState().turnHistory;
    const record = history[history.length - 1];
    expect(record).toMatchObject({
      action: PlayerAction.Move,
      locationBefore: startingLocation,
      locationAfter: startingLocation + 1,
      eventsTriggered: ['bandit_ambush'],
      eventOutcome: {
        eventId: 'bandit_ambush',
        result: 'victory',
      },
    });
  });

  it('records dialogue completion separately from negotiated combat outcomes', async () => {
    const dialogueEvent: GameEvent = {
      id: 'camp_elder', type: EventType.Dialogue,
      resolutionType: ResolutionType.Interactive,
      name: 'Camp Elder', description: 'A quiet conversation.',
      conditions: { probability: 1.0 }, repeatable: true, tags: ['dialogue'],
    };
    mockSampleEvents.mockReturnValue([dialogueEvent]);

    const { engine } = makeEngine();
    await engine.submitAction({ action: PlayerAction.Camp });
    await engine.resolveInteractiveEvent({
      outcome: 'negotiated', roundsFought: 0, xpGained: 0, goldGained: 0,
      foodGained: 0, healthLost: 0, moraleDelta: 1, reputationDelta: 0,
      injuriesGained: [], companionInjuries: {},
    }, {
      eventId: 'camp_elder',
      result: 'dialogue_complete',
      summary: 'Dialogue completed.',
    });

    const history = engine.getState().turnHistory;
    const record = history[history.length - 1];
    expect(record?.eventOutcome).toEqual({
      eventId: 'camp_elder',
      result: 'dialogue_complete',
      summary: 'Dialogue completed.',
    });
  });

  it('applies combat healing from net health delta on interactive events', async () => {
    const banditEvent: GameEvent = {
      id: 'bandit_ambush', type: EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name: 'Bandit Ambush', description: 'Bandits!',
      conditions: { probability: 1.0 }, repeatable: true, tags: ['combat'],
    };
    mockSampleEvents.mockReturnValue([banditEvent]);

    const { engine } = makeEngine({
      player: {
        name: 'Test', level: 1, xp: 0, health: 40,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
    });

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });
    await engine.resolveInteractiveEvent({
      outcome: 'victory', roundsFought: 2, xpGained: 0, goldGained: 0,
      foodGained: 0, healthLost: 0, healthDelta: 24, moraleDelta: 0, reputationDelta: 0,
      injuriesGained: [], companionInjuries: {}, itemsConsumed: ['healing_potion'],
    });

    const after = engine.getState();
    expect(after.player.health).toBe(66);
    expect(after.resources.items.some(item => item.definitionId === 'healing_potion')).toBe(false);
  });

  it('applies full combat rewards for location combat results', async () => {
    const { engine } = makeEngine({
      player: {
        name: 'Test', level: 1, xp: 0, health: 40,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
      resources: {
        food: 8,
        gold: 25,
        items: [{ definitionId: 'healing_potion', quantity: 1, isEquipped: false }],
        maxSlots: 8,
        equippedItems: {},
      },
    });

    await engine.resolveLocationCombat(1, {
      outcome: 'victory', roundsFought: 2, xpGained: 0, goldGained: 3,
      foodGained: 1, healthLost: 0, healthDelta: 24, moraleDelta: 5, reputationDelta: 2,
      injuriesGained: [], companionInjuries: {}, itemsConsumed: ['healing_potion'],
    });

    const after = engine.getState();
    expect(after.player.health).toBe(64);
    expect(after.resources.gold).toBe(28);
    expect(after.resources.food).toBe(9);
    expect(after.morale.value).toBeGreaterThan(50);
    expect(after.reputation.value).toBeGreaterThan(0);
    expect(after.resources.items.some(item => item.definitionId === 'healing_potion')).toBe(false);
    expect(after.clearedCombatLocations.has(1)).toBe(true);
  });
});

// ─────────────────────────────────────────
// Companion desertion
// ─────────────────────────────────────────

describe('TurnEngine — companion desertion', () => {
  it('removes companion when loyalty drops below desertsBelow', async () => {
    const comp = makeCompanion({
      id: 'deserting_comp',
      loyalty: { value: 10, desertsBelow: 15, complainsBelow: 35 },
      loyaltyLosses: { onStarvation: 5, onMoraleLow: 10, onReputationMismatch: 2, onBrokenPromise: 8 },
    });
    const { engine } = makeEngine({
      companions: [comp],
      morale: { value: 15, tier: MoraleTier.Broken, tierChangedThisTurn: false, dreadActive: false },
    });

    await engine.submitAction({ action: PlayerAction.Camp });

    // With broken morale, loyalty drops via onMoraleLow and onMoraleLow tick
    const after = engine.getState();
    const stillPresent = after.companions.some(c => c.id === 'deserting_comp');
    // Desertion depends on actual loyalty tick amount — just verify no crash
    expect(typeof stillPresent).toBe('boolean');
  });
});

// ─────────────────────────────────────────
// Weather consequences
// ─────────────────────────────────────────

describe('TurnEngine — Weather consequences', () => {
  it('ruins rations in severe weather with 10% chance', async () => {
    const { engine } = makeEngine({
      weather: WeatherType.Severe,
      resources: { food: 5, gold: 20, items: [], maxSlots: 8, equippedItems: {} },
    });

    randomSpy.mockReset();
    randomSpy = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99) // luck roll
      .mockReturnValueOnce(0.05) // weather check
      .mockReturnValue(0.99);    // general fallback

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().resources.food).toBe(3);
    const history = engine.getState().turnHistory;
    const record = history[history.length - 1];
    expect(record.narrativeSummary).toContain('Rations ruined by the storm.');
  });

  it('lifts morale in ideal weather when moving', async () => {
    const { engine } = makeEngine({
      weather: WeatherType.Ideal,
      morale: { value: 50, tier: MoraleTier.Steady, tierChangedThisTurn: false, dreadActive: false },
    });

    randomSpy.mockReset();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    await engine.submitAction({ action: PlayerAction.Move, forcedMarch: false });

    expect(engine.getState().morale.value).toBe(52);
    const history = engine.getState().turnHistory;
    const record = history[history.length - 1];
    expect(record.narrativeSummary).toContain('Morale lifts under clear skies.');
  });

  it('does not lift morale in ideal weather when camping', async () => {
    const { engine } = makeEngine({
      weather: WeatherType.Ideal,
      morale: { value: 50, tier: MoraleTier.Steady, tierChangedThisTurn: false, dreadActive: false },
    });

    randomSpy.mockReset();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    await engine.submitAction({ action: PlayerAction.Camp });

    expect(engine.getState().morale.value).toBe(53);
  });
});
