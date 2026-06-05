import {
  CombatEngine,
  ENEMY_DEFINITIONS,
  EnemyCombatant,
  buildEnemiesForLocation,
  buildBossEnemy,
} from '@engine/CombatEngine';
import { CompanionArchetype, EnemyBehavior, SpecialEffect } from '@engine/types';
import { makeGameState, makeCompanion } from '../__fixtures__/gameState';
import { mockRandomValue } from '../utils/mockRandom';
import { equipItem } from '@engine/ItemSystem';
import { makeInvWithItem } from '../__fixtures__/inventory';

function makeRatsEnemy(): EnemyCombatant {
  const def = ENEMY_DEFINITIONS.find(e => e.id === 'small_rats')!;
  return {
    enemyId: def.id, name: def.name,
    currentHP: def.baseHP, maxHP: def.baseHP,
    attack: def.baseAttack, defense: def.baseDefense, speed: def.baseSpeed,
    behavior: def.behavior, abilities: def.abilities,
    isFleeing: false, physicalResistance: def.physicalResistance,
    statusEffects: [],
  };
}

function makeEngine(enemyOverrides: Partial<EnemyCombatant> = {}, stateOverrides = {}) {
  const enemies = [{ ...makeRatsEnemy(), ...enemyOverrides }];
  const state = makeGameState(stateOverrides);
  const onStateChange = jest.fn();
  const engine = new CombatEngine(enemies, state, onStateChange);
  return { engine, onStateChange };
}

let randomSpy: jest.SpyInstance;

beforeEach(() => {
  // Default: no surprise, no crit, mid-variance
  randomSpy = mockRandomValue(0.5);
});

afterEach(() => {
  randomSpy.mockRestore();
});

// ─────────────────────────────────────────
// Construction
// ─────────────────────────────────────────

describe('CombatEngine construction', () => {
  it('starts in awaiting_input phase when no surprise', () => {
    randomSpy.mockRestore();
    // Player speed 5, rats speed 6. Surprise chance = (6-5)*0.04 = 0.04
    // Mock random to return > 0.04 so no surprise
    randomSpy = mockRandomValue(0.99);
    const { engine } = makeEngine();
    expect(engine.getState().phase).toBe('awaiting_input');
  });

  it('builds player combatant with correct stats', () => {
    const { engine } = makeEngine();
    const player = engine.getState().player;
    expect(player.currentHP).toBe(100);
    expect(player.attack).toBe(8);
    expect(player.defense).toBe(4);
  });

  it('applies item bonuses to player stats', () => {
    const inv = makeInvWithItem('travelers_blade', 1);
    const r = equipItem(inv, 'travelers_blade');
    if (!r.success) throw new Error();
    const state = makeGameState({
      resources: { food: 8, gold: 25, items: r.inventory.items, maxSlots: 8, equippedItems: r.inventory.equippedItems },
    });
    const enemies = [makeRatsEnemy()];
    const onStateChange = jest.fn();
    const engine = new CombatEngine(enemies, state, onStateChange);
    // travelers_blade gives +4 attack
    expect(engine.getState().player.attack).toBe(12);
  });
});

// ─────────────────────────────────────────
// Attack
// ─────────────────────────────────────────

describe('CombatEngine — attack', () => {
  it('reduces enemy HP on attack', () => {
    randomSpy = mockRandomValue(0.5);
    const { engine } = makeEngine();
    const hpBefore = engine.getState().enemies[0].currentHP;

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    const hpAfter = engine.getState().enemies[0].currentHP;
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  it('deals critical damage when crit roll < 0.10', () => {
    // mockReturnValue(0.05): surprise = 0.05 < 0.04? No (rat surprise threshold = 0.04, 0.05 > 0.04)
    // Player variance = 0.8 + 0.05*0.4 = 0.82. Crit: 0.05 < 0.10 → YES CRIT.
    // Rat HP 8, player attack 8, defense 1:
    // damage = max(1, floor((8-0.5)*0.82*1.75)) = floor(10.76) = 10 → rat dies (8 HP)
    // Enemy dies before attacking → no more random calls needed.
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.05);
    const { engine } = makeEngine();

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    const log = engine.getState().log;
    const critLog = log.find(l => l.isCritical);
    expect(critLog).toBeDefined();
    expect(engine.getState().result?.outcome).toBe('victory'); // rat dies in one crit
  });

  it('normal hit does floor((attack - def*0.5) * variance) damage', () => {
    // With mockReturnValue(0.5): variance = 0.8 + 0.5*0.4 = 1.0, no crit
    // damage = max(1, floor((8 - 1*0.5) * 1.0)) = floor(7.5) = 7
    // Rat has 8 HP → survives with 1 HP
    const { engine } = makeEngine(); // uses default mockReturnValue(0.5)
    const hpBefore = engine.getState().enemies[0].currentHP;
    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });
    const damage = hpBefore - engine.getState().enemies[0].currentHP;
    expect(damage).toBe(7);
  });

  it('victory when last enemy dies', () => {
    // Rat has 8 HP. Kill it in one shot by giving huge attack
    randomSpy = mockRandomValue(0.5);
    const { engine } = makeEngine({}, {
      player: { name: 'Test', level: 1, xp: 0, health: 100, stats: { maxHealth: 100, attack: 50, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    const state = engine.getState();
    expect(state.phase).toBe('post_combat');
    expect(state.result?.outcome).toBe('victory');
    expect(state.result?.moraleDelta).toBe(8);
  });

  it('defeat when player HP reaches 0', () => {
    // Player HP 1, enemy attack very high
    randomSpy = mockRandomValue(0.5);
    const { engine } = makeEngine(
      { attack: 200, defense: 200 }, // enemy almost impossible to kill, hits hard
      { player: { name: 'Test', level: 1, xp: 0, health: 1, stats: { maxHealth: 100, attack: 8, defense: 0, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] } }
    );

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    const state = engine.getState();
    expect(state.phase).toBe('post_combat');
    expect(state.result?.outcome).toBe('defeat');
    expect(state.result?.moraleDelta).toBe(-12);
  });

  it('physical resistance reduces damage', () => {
    randomSpy = mockRandomValue(0.5);
    const withResistance = { ...makeRatsEnemy(), physicalResistance: 0.5, defense: 0 };
    const withoutResistance = { ...makeRatsEnemy(), physicalResistance: 0, defense: 0 };

    const state = makeGameState();
    const onStateChange1 = jest.fn();
    const onStateChange2 = jest.fn();
    const eng1 = new CombatEngine([withResistance], state, onStateChange1);
    const eng2 = new CombatEngine([withoutResistance], state, onStateChange2);

    eng1.submitAction({ type: 'attack', targetEnemyIndex: 0 });
    eng2.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    const dmg1 = withResistance.maxHP - eng1.getState().enemies[0].currentHP;
    const dmg2 = withoutResistance.maxHP - eng2.getState().enemies[0].currentHP;
    expect(dmg1).toBeLessThan(dmg2);
  });
});

// ─────────────────────────────────────────
// Defend
// ─────────────────────────────────────────

describe('CombatEngine — defend', () => {
  it('logs defensive stance and resets isDefending after enemy turn', () => {
    const { engine } = makeEngine(); // uses default mockReturnValue(0.5)
    engine.submitAction({ type: 'defend' });
    // "playerDefend" logs "takes a defensive stance."
    const log = engine.getState().log;
    const defendLog = log.find(l => l.action.includes('defensive stance'));
    expect(defendLog).toBeDefined();
    // isDefending resets to false after tickStatusEffects()
    expect(engine.getState().player.isDefending).toBe(false);
  });
});

// ─────────────────────────────────────────
// Flee
// ─────────────────────────────────────────

describe('CombatEngine — flee', () => {
  it('successful flee ends combat with fled outcome', () => {
    // Player speed 5, rat speed 6. fleeChance = 0.4 + (5-6)*0.05 = 0.35
    // mockReturnValue(0.1): surprise 0.1 < 0.04? No → no surprise.
    // Flee roll: 0.1 < 0.35 → SUCCESS
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.1);
    const { engine } = makeEngine();
    engine.submitAction({ type: 'flee' });

    expect(engine.getState().result?.outcome).toBe('fled');
    expect(engine.getState().result?.moraleDelta).toBe(-3);
  });

  it('failed flee returns to awaiting_input and enemy attacks', () => {
    // fleeChance = 0.35, mock 0.8 > 0.35 → flee fails
    // 0.8 >= 0.04 so no surprise; enemy ability check 0.8 >= 0.3 no ability; enemy attacks
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.8);
    const { engine } = makeEngine();
    const hpBefore = engine.getState().player.currentHP;
    engine.submitAction({ type: 'flee' });

    const afterState = engine.getState();
    expect(afterState.phase).toBe('awaiting_input');
    expect(afterState.player.currentHP).toBeLessThanOrEqual(hpBefore);
  });

  it('smoke_bomb usage consumes the item and guarantees flee success immediately', () => {
    const { engine } = makeEngine();
    // Smoke Bomb should succeed even with high random roll
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.99);

    engine.submitAction({ type: 'skill', itemId: 'smoke_bomb' });

    const state = engine.getState();
    expect(state.result?.outcome).toBe('fled');
    expect(state.itemsConsumed).toContain('smoke_bomb');
  });

  it('Mira special ability guarantees flee success (100% chance)', () => {
    // With Mira level 5 and specialAbilityReady, flee should succeed even if roll is 0.99
    // Player speed 5, rat speed 6. Flee chance normally 0.35, but Mira sets to 1.0.
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.99);

    const companion = makeCompanion({ id: 'mira_thorn', level: { current: 5, xp: 0, xpToNext: 20 } });
    const { engine } = makeEngine({}, { companions: [companion] });

    // Enable Mira specialAbilityReady
    engine.getState().companions[0].specialAbilityReady = true;

    engine.submitAction({ type: 'flee' });

    expect(engine.getState().result?.outcome).toBe('fled');
    expect(engine.getState().companions[0].specialAbilityReady).toBe(false);
  });

  it('flee chance filters out dead or fleeing enemies from speed calculation', () => {
    // If we have one fast rat (speed 10) who is already fleeing, and one slow rat (speed 2) who is alive,
    // the flee chance should be based on speed 2, not 10.
    // fleeChance = 0.4 + (5 - 2) * 0.05 = 0.55
    // If fast rat speed 10 was counted, fleeChance would be 0.4 + (5 - 10) * 0.05 = 0.15.
    // If mock roll is 0.50, it should succeed (0.50 < 0.55) if fast rat is ignored, and fail if fast rat is counted.
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.50);

    const rat1 = { ...makeRatsEnemy(), speed: 10, isFleeing: true };
    const rat2 = { ...makeRatsEnemy(), speed: 2, currentHP: 10 };
    const state = makeGameState();
    const engine = new CombatEngine([rat1, rat2], state, jest.fn());

    engine.submitAction({ type: 'flee' });

    expect(engine.getState().result?.outcome).toBe('fled');
  });

  it('failed flee ticks status effects (durations decrement)', () => {
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.8);

    const { engine } = makeEngine();
    // Add a status effect to player with 3 rounds remaining
    engine.getState().player.statusEffects.push({
      id: 'attack_buffed',
      remainingRounds: 3,
      magnitude: 5
    });

    engine.submitAction({ type: 'flee' });

    const state = engine.getState();
    expect(state.phase).toBe('awaiting_input');
    expect(state.player.statusEffects[0].remainingRounds).toBe(2);
  });
});

// ─────────────────────────────────────────
// Negotiate
// ─────────────────────────────────────────

describe('CombatEngine — negotiate', () => {
  it('successful negotiate ends combat', () => {
    // Use bandits (not immune to negotiate). Need random < 0.30 for success.
    // mockReturnValue(0.1): surprise 0.1 < max(0,(5-5)*0.04)=0 → no surprise.
    // Negotiate roll: 0.1 < 0.30 → SUCCESS
    randomSpy.mockRestore();
    randomSpy = mockRandomValue(0.1);
    const banditDef = ENEMY_DEFINITIONS.find(e => e.id === 'bandits')!;
    const bandit: EnemyCombatant = {
      enemyId: banditDef.id, name: banditDef.name,
      currentHP: banditDef.baseHP, maxHP: banditDef.baseHP,
      attack: banditDef.baseAttack, defense: banditDef.baseDefense, speed: banditDef.baseSpeed,
      behavior: banditDef.behavior, abilities: banditDef.abilities,
      isFleeing: false, physicalResistance: 0, statusEffects: [],
    };
    const state = makeGameState();
    const eng = new CombatEngine([bandit], state, jest.fn());
    eng.submitAction({ type: 'negotiate' });

    expect(eng.getState().result?.outcome).toBe('negotiated');
    expect(eng.getState().result?.moraleDelta).toBe(3);
    // reputationDelta is only +5 on victory-with-fleeing-enemies, not negotiate
    expect(eng.getState().result?.reputationDelta).toBe(0);
  });

  it('negotiate fails against immune enemies and logs appropriate message', () => {
    // rats are immune to negotiate; combat continues
    const { engine } = makeEngine(); // uses default mockReturnValue(0.5)
    engine.submitAction({ type: 'negotiate' });

    const log = engine.getState().log;
    const notListeningLog = log.find(l => l.action.includes("aren't listening"));
    expect(notListeningLog).toBeDefined();
  });
});

// ─────────────────────────────────────────
// Stun status effect
// ─────────────────────────────────────────

describe('CombatEngine — stun', () => {
  it('player skips attack when stunned', () => {
    randomSpy = mockRandomValue(0.5);
    const { engine } = makeEngine();
    // Manually inject stun status on player
    engine['state'].isPlayerStunned = true;
    const hpBefore = engine.getState().enemies[0].currentHP;

    engine.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    // Player was stunned, so no player damage to enemy this round
    // (but enemy still acts — HP may be different due to no player attack)
    const log = engine.getState().log;
    const stunnedLog = log.find(l => l.action.includes('stunned'));
    expect(stunnedLog).toBeDefined();
    expect(engine.getState().enemies[0].currentHP).toBe(hpBefore);
    // isPlayerStunned should have reset to false
    expect(engine.getState().isPlayerStunned).toBe(false);
  });
});

// ─────────────────────────────────────────
// buildEnemiesForLocation
// ─────────────────────────────────────────

describe('buildEnemiesForLocation', () => {
  it('returns a combatant for a known mob name', () => {
    const result = buildEnemiesForLocation(['Small Rats'], 1);
    expect(result).toHaveLength(1);
    expect(result[0].enemyId).toBe('small_rats');
  });

  it('limits to 3 enemies max', () => {
    const result = buildEnemiesForLocation(
      ['Small Rats', 'Small Rats', 'Small Rats', 'Small Rats'],
      1,
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('scales enemy HP with location ID', () => {
    const at1 = buildEnemiesForLocation(['Bandits'], 6);
    const at50 = buildEnemiesForLocation(['Bandits'], 50);
    // HP scales with location
    expect(at50[0].maxHP).toBeGreaterThanOrEqual(at1[0].maxHP);
  });
});

// ─────────────────────────────────────────
// buildBossEnemy
// ─────────────────────────────────────────

describe('buildBossEnemy', () => {
  it('builds Orc Warchief boss at location 32', () => {
    const state = makeGameState({ currentLocationId: 32 });
    const boss = buildBossEnemy(state);
    expect(boss).toHaveLength(1);
    expect(boss[0].enemyId).toBe('orc_warchief');
  });

  it('keeps Orc Warchief HP at exactly 100 regardless of player level', () => {
    const level1 = makeGameState({
      currentLocationId: 32,
      player: { name: 'T', level: 1, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const level5 = makeGameState({
      currentLocationId: 32,
      player: { name: 'T', level: 5, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const boss1 = buildBossEnemy(level1);
    const boss5 = buildBossEnemy(level5);
    expect(boss1[0].maxHP).toBe(100);
    expect(boss5[0].maxHP).toBe(100);
  });

  it('scales boss HP with player level', () => {
    const level1 = makeGameState({
      currentLocationId: 65,
      player: { name: 'T', level: 1, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const level5 = makeGameState({
      currentLocationId: 65,
      player: { name: 'T', level: 5, xp: 0, health: 100, stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 }, statusEffects: [] },
    });
    const boss1 = buildBossEnemy(level1);
    const boss5 = buildBossEnemy(level5);
    expect(boss5[0].maxHP).toBeGreaterThan(boss1[0].maxHP);
  });
});

// ─────────────────────────────────────────
// Companion AI
// ─────────────────────────────────────────

describe('CombatEngine — companion AI', () => {
  it('warrior companion attacks when player attacks', () => {
    randomSpy = mockRandomValue(0.5);
    const warrior = makeCompanion({ archetype: CompanionArchetype.Warrior });
    const state = makeGameState({ companions: [warrior] });
    const enemies = [makeRatsEnemy()];
    const eng = new CombatEngine(enemies, state, jest.fn());

    const hpBefore = eng.getState().enemies[0].currentHP;
    eng.submitAction({ type: 'attack', targetEnemyIndex: 0 });

    // With both player and warrior attacking, enemy takes more damage
    const hpAfter = eng.getState().enemies[0].currentHP;
    expect(hpAfter).toBeLessThan(hpBefore);
    // Check companion attack in log
    const log = eng.getState().log;
    const compLog = log.find(l => l.actor === warrior.name);
    expect(compLog).toBeDefined();
  });
});

// ─────────────────────────────────────────
// Combat Item Usage
// ─────────────────────────────────────────

describe('CombatEngine — Item Usage', () => {
  it('recovers player health when using a healing potion', () => {
    const { engine } = makeEngine({}, {
      player: {
        name: 'Test', level: 1, xp: 0, health: 40,
        stats: { maxHealth: 100, attack: 8, defense: 4, speed: 5, endurance: 3, perception: 3, leadership: 2 },
        statusEffects: [],
      },
    });

    engine.submitAction({ type: 'skill', itemId: 'healing_potion' });

    const state = engine.getState();
    // 40 HP + 25 heal = 65 HP. Then rat attacks for 1 damage = 64 HP.
    expect(state.player.currentHP).toBe(64);
    expect(state.itemsConsumed).toContain('healing_potion');
  });

  it('recovers player morale when using a spirit tonic', () => {
    const { engine } = makeEngine();

    engine.submitAction({ type: 'skill', itemId: 'spirit_tonic' });

    const state = engine.getState();
    expect(state.itemsConsumed).toContain('spirit_tonic');
    expect(state.resourceSideEffects.moraleLost).toBe(-20);
  });

  it('stuns enemies when using flash powder', () => {
    const { engine } = makeEngine();

    engine.submitAction({ type: 'skill', itemId: 'flash_powder' });

    const state = engine.getState();
    expect(state.itemsConsumed).toContain('flash_powder');
    // Stunned remainingRounds was 1, but ticked down to 0 at end of round and got removed.
    expect(state.enemies[0].statusEffects).toEqual([]);
  });

  it('stuns enemies prevent them from acting on their turn', () => {
    const { engine } = makeEngine();
    engine.submitAction({ type: 'skill', itemId: 'flash_powder' });

    const log = engine.getState().log;
    const stunLog = log.find(l => l.actor === 'Small Rats' && l.action.includes('stunned'));
    expect(stunLog).toBeDefined();
  });

  it('grants attack buff when using a battle draught', () => {
    const { engine } = makeEngine();

    engine.submitAction({ type: 'skill', itemId: 'battle_draught' });

    const state = engine.getState();
    expect(state.itemsConsumed).toContain('battle_draught');
    // Buff started at 3 rounds, but ticked down to 2 at end of round.
    expect(state.player.statusEffects).toContainEqual({
      id: 'attack_buffed',
      remainingRounds: 2,
      magnitude: 6,
    });
  });
});
