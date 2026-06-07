import {
  GameState,
  Companion,
  CompanionArchetype,
  CombatResult,
  EnemyBehavior,
  SpecialEffect,
  EnemyDefinition,
  EnemyAbility,
  MoraleState,
  MoraleTier,
} from './types';
import {
  computeEquippedBonuses,
  inventoryFromResources,
  getItemDef,
} from './ItemSystem';
import { GameBalance } from './GameBalance';
import { ENEMIES as ENEMY_DEFINITIONS, getEnemyDefinition } from '../data/enemies';

export { ENEMY_DEFINITIONS };

// Live combatant state
export interface PlayerCombatant {
  currentHP:       number;
  maxHP:           number;
  attack:          number;
  defense:         number;
  speed:           number;
  isDefending:     boolean;
  statusEffects:   CombatStatusEffect[];
  immuneToTerrify: boolean;
}

export interface CompanionCombatant {
  companionId:          string;
  name:                 string;
  archetype:            CompanionArchetype;
  currentHP:            number;
  maxHP:                number;
  attack:               number;
  defense:              number;
  speed:                number;
  level:                number;
  specialAbilityReady:  boolean;
  statusEffects:        CombatStatusEffect[];
  guaranteedFleeAtLevel?: number;
}

export interface EnemyCombatant {
  enemyId:        string;
  name:           string;
  currentHP:      number;
  maxHP:          number;
  attack:         number;
  defense:        number;
  speed:          number;
  behavior:       EnemyBehavior;
  abilities:      EnemyAbility[];
  isFleeing:      boolean;
  physicalResistance: number;
  statusEffects:  CombatStatusEffect[];
}

export interface CombatStatusEffect {
  id:               string;
  remainingRounds:  number;
  magnitude?:       number;
}

// Combat state
export type CombatPhase =
  | 'pre_combat'
  | 'awaiting_input'
  | 'resolving'
  | 'post_combat'
  | 'complete';

export interface CombatLogEntry {
  round:       number;
  actor:       string;
  action:      string;
  damage?:     number;
  effect?:     string;
  isCritical?: boolean;
  type:        'damage' | 'heal' | 'system' | 'effect' | 'normal';
}

export interface ResourceSideEffect {
  goldStolen?: number;
  foodStolen?: number;
  moraleLost?: number;
}

export interface CombatState {
  id:                   string;
  locationId:           number;
  round:                number;
  phase:                CombatPhase;
  player:               PlayerCombatant;
  companions:           CompanionCombatant[];
  enemies:              EnemyCombatant[];
  isPlayerStunned:      boolean;
  surpriseRound:        boolean;
  log:                  CombatLogEntry[];
  result:               CombatResult | null;
  resourceSideEffects:  ResourceSideEffect;
  itemsConsumed:        string[];
  playerMorale:         MoraleState;
}

export type CombatActionType = 'attack' | 'defend' | 'skill' | 'flee' | 'negotiate';

export interface CombatAction {
  type:             CombatActionType;
  targetEnemyIndex?: number;
  skillId?:         string;
  itemId?:          string;
}

export function buildEnemyCombatant(def: EnemyDefinition, locationId: number): EnemyCombatant {
  const locationScale = 1 + Math.max(0, (locationId - def.minLocationId) / 10) * (def.scaleFactor - 1);
  return {
    enemyId:           def.id,
    name:              def.name,
    currentHP:         Math.floor(def.baseHP     * locationScale),
    maxHP:             Math.floor(def.baseHP     * locationScale),
    attack:            Math.floor(def.baseAttack  * locationScale),
    defense:           Math.floor(def.baseDefense * locationScale),
    speed:             def.baseSpeed,
    behavior:          def.behavior,
    abilities:         def.abilities,
    isFleeing:         false,
    physicalResistance:def.physicalResistance,
    statusEffects:     [],
  } satisfies EnemyCombatant;
}

export function buildEnemiesForLocation(
  mobIdsOrNames:  string[],
  locationId: number,
): EnemyCombatant[] {
  return mobIdsOrNames
    .slice(0, 3)
    .map((name): EnemyCombatant | null => {
      const def = ENEMY_DEFINITIONS.find(
        e => e.name.toLowerCase() === name.toLowerCase()
          || e.id === name.toLowerCase()
          || e.id === name.toLowerCase().replace(/\s+/g, '_'),
      );
      if (!def) return null;
      return buildEnemyCombatant(def, locationId);
    })
    .filter((e): e is EnemyCombatant => e !== null);
}

const BOSS_ENEMY_BY_LOC: Record<number, string> = {
  32:  'orc_warchief',
  65:  'lich_of_vorishy',
  93:  'white_horseman',
  125: 'dread_sovereign',
};

export function buildBossEnemy(game: GameState): EnemyCombatant[] {
  const enemyId = BOSS_ENEMY_BY_LOC[game.currentLocationId] ?? 'dread_sovereign';
  const def   = getEnemyDefinition(enemyId);
  const level = game.player.level;

  const scale   = def.fixedStats ? 0 : level;
  const hp      = def.baseHP     + scale * 15;
  const attack  = def.baseAttack + scale * 2;
  const defense = def.baseDefense + scale;

  return [{
    enemyId:            def.id,
    name:               def.name,
    currentHP:          hp,
    maxHP:              hp,
    attack,
    defense,
    speed:              def.baseSpeed,
    behavior:           def.behavior,
    abilities:          def.abilities,
    isFleeing:          false,
    physicalResistance: def.physicalResistance,
    statusEffects:      [],
  }];
}

// ─────────────────────────────────────────
// CombatEngine
// ─────────────────────────────────────────

export class CombatEngine {
  private state:           CombatState;
  private onStateChange:   (state: CombatState) => void;
  private initialPlayerHP: number;
  private readonly random: () => number;
  private spawnedCount:    Record<string, number> = {};

  constructor(
    enemies:       EnemyCombatant[],
    gameState:     GameState,
    onStateChange: (state: CombatState) => void,
    random:        () => number,
  ) {
    this.onStateChange   = onStateChange;
    this.random          = random;
    this.state           = this.init(enemies, gameState);
    this.initialPlayerHP = this.state.player.currentHP;
    // Start in awaiting_input (or after surprise round)
    if (this.state.surpriseRound) {
      this.runEnemyTurn();
      this.checkEnd();
      if (this.state.phase !== 'post_combat') {
        this.setState({ phase: 'awaiting_input' });
      }
    } else {
      this.setState({ phase: 'awaiting_input' });
    }
  }

  // ── Public API ────────────────────────────────────────────

  submitAction(action: CombatAction): void {
    if (this.state.phase !== 'awaiting_input') return;
    this.setState({ phase: 'resolving' });
    this.resolveRound(action);
  }

  getState(): CombatState { return this.state; }

  // ── Initialisation ────────────────────────────────────────

  private init(enemies: EnemyCombatant[], game: GameState): CombatState {
    const fastestEnemy = Math.max(...enemies.map(e => e.speed));
    const surprised = this.random() < Math.max(
      0,
      (fastestEnemy - game.player.stats.speed) * GameBalance.SURPRISE_ROUND_THRESHOLD,
    );

    return {
      id:          `combat_${Date.now()}`,
      locationId:  game.currentLocationId,
      round:       1,
      phase:       'pre_combat',
      player:      this.buildPlayer(game),
      companions:  game.companions.map(c => this.buildCompanion(c)),
      enemies,
      isPlayerStunned:     false,
      surpriseRound:       surprised,
      log:                 [],
      result:              null,
      resourceSideEffects: {},
      itemsConsumed:       [],
      playerMorale:        game.morale,
    };
  }

  private buildPlayer(game: GameState): PlayerCombatant {
    const bonuses = computeEquippedBonuses(inventoryFromResources(game.resources));
    return {
      currentHP:       game.player.health,
      maxHP:           game.player.stats.maxHealth,
      attack:          game.player.stats.attack  + (bonuses.attackBonus  ?? 0),
      defense:         game.player.stats.defense + (bonuses.defenseBonus ?? 0),
      speed:           game.player.stats.speed   + (bonuses.speedBonus   ?? 0),
      isDefending:     false,
      statusEffects:   [],
      immuneToTerrify: bonuses.immuneToTerrify ?? false,
    };
  }

  private buildCompanion(c: Companion): CompanionCombatant {
    const lvl = c.level.current;
    return {
      companionId:         c.id,
      name:                c.name,
      archetype:           c.archetype,
      currentHP:           40 + lvl * 8,
      maxHP:               40 + lvl * 8,
      attack:              6 + (lvl - 1) * 2 + (c.loyalty.value > 80 ? 3 : 0),
      defense:             4 + (lvl - 1) * 2,
      speed:               5,
      level:               lvl,
      specialAbilityReady: lvl >= 5,
      statusEffects:       [],
      guaranteedFleeAtLevel: c.guaranteedFleeAtLevel,
    };
  }

  // ── Round resolution ──────────────────────────────────────

  private resolveRound(action: CombatAction): void {
    // Handle flee / negotiate before damage exchange
    if (action.type === 'flee')      { this.resolveFlee();      return; }
    if (action.type === 'negotiate') { this.resolveNegotiate(); return; }

    // Player acts
    if (this.state.isPlayerStunned) {
      this.log('Player', 'is stunned and cannot act.', this.state.round, undefined, undefined, undefined, 'effect');
      this.setState({ isPlayerStunned: false });
    } else {
      if (action.type === 'attack') this.playerAttack(action.targetEnemyIndex ?? 0);
      if (action.type === 'defend') this.playerDefend();
      if (action.type === 'skill')  this.playerSkill(action.itemId || action.skillId);
    }

    if (!this.isOver()) this.companionsAct();
    if (!this.isOver()) this.runEnemyTurn();

    this.tickStatusEffects();
    this.checkEnd();

    if (this.state.phase !== 'post_combat') {
      this.setState({
        round:               this.state.round + 1,
        phase:               'awaiting_input',
        playerActionThisRound: null,
      } as Partial<CombatState>);
    }
  }

  // ── Player actions ────────────────────────────────────────

  private playerAttack(targetIdx: number): void {
    const alive  = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
    const target = alive[targetIdx] ?? alive[0];
    if (!target) return;

    const terrified = this.state.player.statusEffects.find(e => e.id === 'terrified');
    const atkMult   = terrified ? (terrified.magnitude ?? 0.7) : 1.0;
    const attackBuff = this.state.player.statusEffects.find(e => e.id === 'attack_buffed');
    const flatAtkBonus = attackBuff ? (attackBuff.magnitude ?? 0) : 0;

    const bardPresent = this.state.companions.some(c => c.archetype === CompanionArchetype.Bard && c.currentHP > 0);
    const effectiveAttack = this.state.player.attack + (bardPresent ? GameBalance.BARD_ATTACK_BONUS : 0);

    const { damage, isCritical } = this.calcDamage(
      (effectiveAttack + flatAtkBonus) * atkMult,
      target.defense,
      target.physicalResistance,
    );

    target.currentHP = Math.max(0, target.currentHP - damage);
    this.log(
      'Player',
      `strikes ${target.name} for ${damage} damage${isCritical ? ' — Critical hit!' : '.'}`,
      this.state.round, damage, undefined, isCritical,
      isCritical ? 'heal' : 'damage',
    );
    if (target.currentHP <= 0) {
      this.log('', `${target.name} has been defeated.`, this.state.round, undefined, undefined, undefined, 'system');
    }
  }

  private playerDefend(): void {
    this.setState({
      player: { ...this.state.player, isDefending: true },
    });
    this.log('Player', 'takes a defensive stance.', this.state.round, undefined, undefined, undefined, 'normal');
  }

  private playerSkill(itemId?: string): void {
    if (!itemId) {
      this.log('Player', 'uses a skill.', this.state.round, undefined, undefined, undefined, 'effect');
      return;
    }

    const def = getItemDef(itemId);
    if (!def) {
      this.log('Player', 'uses a skill.', this.state.round, undefined, undefined, undefined, 'effect');
      return;
    }

    const usedCount = this.state.itemsConsumed.filter(id => id === itemId).length;
    if (def.combatUsesPerBattle !== null && usedCount >= def.combatUsesPerBattle) {
      return;
    }

    this.log('Player', `uses ${def.name}.`, this.state.round, undefined, undefined, undefined, 'effect');
    this.state.itemsConsumed.push(itemId);

    if (itemId === 'smoke_bomb') {
      this.log('Player', 'throws a Smoke Bomb and flees the battle!', this.state.round, undefined, undefined, undefined, 'system');
      this.endCombat('fled');
      return;
    }

    const activeEffect = def.activeEffect;
    if (!activeEffect) return;

    // Apply active effect
    if (activeEffect.healthRestore) {
      const oldHP = this.state.player.currentHP;
      this.state.player.currentHP = Math.min(this.state.player.maxHP, this.state.player.currentHP + activeEffect.healthRestore);
      const healed = this.state.player.currentHP - oldHP;
      this.log('Player', `recovers ${healed} HP.`, this.state.round, healed, undefined, undefined, 'heal');
    }

    if (activeEffect.moraleRestore) {
      this.state.resourceSideEffects.moraleLost = (this.state.resourceSideEffects.moraleLost ?? 0) - activeEffect.moraleRestore;
      this.log('Player', `recovers ${activeEffect.moraleRestore} Morale.`, this.state.round, undefined, undefined, undefined, 'heal');
    }

    if (activeEffect.clearsStatusEffect) {
      const effectId = activeEffect.clearsStatusEffect;
      const hadEffect = this.state.player.statusEffects.some(e => e.id === effectId);
      if (hadEffect) {
        this.state.player.statusEffects = this.state.player.statusEffects.filter(e => e.id !== effectId);
        this.log('Player', `clears the ${effectId} effect.`, this.state.round, undefined, undefined, undefined, 'effect');
      }
    }

    if (activeEffect.grantsStatusEffect) {
      this.state.player.statusEffects.push({
        id: activeEffect.grantsStatusEffect,
        remainingRounds: activeEffect.statusDurationTurns ?? 3,
      });
      this.log('Player', `grants themselves ${activeEffect.grantsStatusEffect}.`, this.state.round, undefined, undefined, undefined, 'effect');
    }

    if (activeEffect.tempAttackBonus) {
      this.state.player.statusEffects.push({
        id: 'attack_buffed',
        remainingRounds: activeEffect.buffDurationRounds ?? 3,
        magnitude: activeEffect.tempAttackBonus,
      });
      this.log('Player', `gains +${activeEffect.tempAttackBonus} Attack.`, this.state.round, undefined, undefined, undefined, 'effect');
    }

    if (activeEffect.tempSpeedBonus) {
      this.state.player.statusEffects.push({
        id: 'speed_buffed',
        remainingRounds: activeEffect.buffDurationRounds ?? 3,
        magnitude: activeEffect.tempSpeedBonus,
      });
      this.log('Player', `gains +${activeEffect.tempSpeedBonus} Speed.`, this.state.round, undefined, undefined, undefined, 'effect');
    }

    if (activeEffect.combatDamage) {
      let targets = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
      if (itemId === 'holy_water') {
        targets = targets.filter(e => e.behavior === EnemyBehavior.Undead || e.behavior === EnemyBehavior.Spectral);
      }
      for (const target of targets) {
        const damage = activeEffect.combatDamage;
        target.currentHP = Math.max(0, target.currentHP - damage);
        this.log(def.name, `deals ${damage} damage to ${target.name}.`, this.state.round, damage, undefined, false, 'damage');
        if (target.currentHP <= 0) {
          this.log('', `${target.name} has been defeated.`, this.state.round, undefined, undefined, undefined, 'system');
        }
      }
    }

    if (activeEffect.combatEffect === SpecialEffect.Stun) {
      const targets = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
      for (const target of targets) {
        target.statusEffects.push({ id: 'stunned', remainingRounds: 1 });
        this.log('Player', `stuns ${target.name} for 1 round.`, this.state.round, undefined, undefined, undefined, 'effect');
      }
    }
  }

  // ── Companion AI ──────────────────────────────────────────

  private companionsAct(): void {
    const alive = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
    if (!alive.length) return;

    for (const companion of this.state.companions) {
      if (companion.currentHP <= 0) continue;

      // Companion panic hesitation based on morale
      const tier = this.state.playerMorale.tier;
      if (tier === MoraleTier.Desperate || tier === MoraleTier.Broken) {
        const panicChance = tier === MoraleTier.Broken ? 0.35 : 0.15;
        if (this.random() < panicChance) {
          this.log(companion.name, 'is too desperate to fight, hesitating this round.', this.state.round, undefined, undefined, undefined, 'system');
          continue;
        }
      }

      switch (companion.archetype) {
        case CompanionArchetype.Warrior:
        case CompanionArchetype.Mercenary:
          this.companionAttack(companion, alive[0]);
          if (
            companion.specialAbilityReady &&
            this.state.player.currentHP / this.state.player.maxHP < 0.4
          ) {
            companion.specialAbilityReady = false;
            this.state.player.statusEffects.push({ id: 'shield_wall', remainingRounds: 1, magnitude: 1.0 });
            this.log(companion.name, 'activates Shield Wall! You are protected this round.', this.state.round, undefined, undefined, undefined, 'system');
          }
          break;

        case CompanionArchetype.Rogue: {
          const weakest = alive.reduce((a, b) => a.currentHP < b.currentHP ? a : b);
          this.companionAttack(companion, weakest, 1.3);
          break;
        }

        case CompanionArchetype.Healer: {
          const pct = this.state.player.currentHP / this.state.player.maxHP;
          if (pct < 0.5) {
            const heal = 8 + companion.level * 3;
            this.state.player.currentHP = Math.min(this.state.player.maxHP, this.state.player.currentHP + heal);
            this.log(companion.name, `heals you for ${heal} HP.`, this.state.round, heal, undefined, undefined, 'heal');
          } else {
            this.companionAttack(companion, alive[0], 0.7);
          }
          break;
        }

        case CompanionArchetype.Bard:
          break;

        case CompanionArchetype.Scout:
        case CompanionArchetype.Sage:
        case CompanionArchetype.Animal:
          this.companionAttack(companion, alive[0]);
          break;
      }
    }
  }

  private companionAttack(c: CompanionCombatant, target: EnemyCombatant, mult = 1.0): void {
    const { damage } = this.calcDamage(c.attack * mult, target.defense, target.physicalResistance);
    target.currentHP = Math.max(0, target.currentHP - damage);
    this.log(c.name, `attacks ${target.name} for ${damage} damage.`, this.state.round, damage, undefined, undefined, 'damage');
    if (target.currentHP <= 0) {
      this.log(c.name, `${target.name} goes down!`, this.state.round, undefined, undefined, undefined, 'system');
    }
  }

  // ── Enemy AI ──────────────────────────────────────────────

  private runEnemyTurn(): void {
    for (const enemy of this.state.enemies) {
      if (enemy.currentHP <= 0 || enemy.isFleeing) continue;

      const stunned = enemy.statusEffects.find(e => e.id === 'stunned');
      if (stunned) {
        this.log(enemy.name, 'is stunned and cannot act.', this.state.round, undefined, undefined, undefined, 'effect');
        continue;
      }

      // Opportunist flee check
      if (enemy.behavior === EnemyBehavior.Opportunist && enemy.currentHP / enemy.maxHP < 0.3) {
        enemy.isFleeing = true;
        this.log(enemy.name, 'turns and flees!', this.state.round, undefined, undefined, undefined, 'system');
        continue;
      }

      // Choose ability or basic attack
      const ability = enemy.abilities.find(a => this.random() < a.probability) ?? null;
      if (ability) {
        this.resolveEnemyAbility(enemy, ability);
      } else {
        this.enemyBasicAttack(enemy);
      }
    }
  }

  private enemyBasicAttack(enemy: EnemyCombatant): void {
    const defMult = this.state.player.isDefending
      ? 1 - GameBalance.DEFEND_DAMAGE_REDUCTION
      : 1.0;
    const shieldWall = this.state.player.statusEffects.find(e => e.id === 'shield_wall');
    if (shieldWall) {
      this.log(enemy.name, 'attacks — blocked by Shield Wall!', this.state.round, 0, undefined, undefined, 'normal');
      return;
    }
    const { damage } = this.calcDamage(enemy.attack * defMult, this.state.player.defense);
    this.state.player.currentHP = Math.max(0, this.state.player.currentHP - damage);
    this.log(enemy.name, `attacks you for ${damage} damage.`, this.state.round, damage, undefined, undefined, 'damage');
  }

  private resolveEnemyAbility(enemy: EnemyCombatant, ability: EnemyAbility): void {
    const defMult = this.state.player.isDefending
      ? 1 - GameBalance.DEFEND_DAMAGE_REDUCTION
      : 1.0;
    let baseDmg   = 0;

    if (ability.damageMultiplier > 0) {
      const res = this.calcDamage(enemy.attack * ability.damageMultiplier * defMult, this.state.player.defense);
      baseDmg   = res.damage;
      this.state.player.currentHP = Math.max(0, this.state.player.currentHP - baseDmg);
    }

    const logText = baseDmg > 0
      ? `uses ${ability.name} on you for ${baseDmg} damage.`
      : `uses ${ability.name}!`;

    this.log(enemy.name, logText, this.state.round, baseDmg || undefined, undefined, undefined, baseDmg > 0 ? 'damage' : 'effect');

    const mag = ability.effectMagnitude ?? 8;
    switch (ability.specialEffect) {
      case SpecialEffect.StealGold: {
        const stolen = Math.min(mag, /* will be applied post-combat */ mag);
        this.state.resourceSideEffects.goldStolen = (this.state.resourceSideEffects.goldStolen ?? 0) + stolen;
        this.log(enemy.name, `steals ${stolen} gold!`, this.state.round, undefined, undefined, undefined, 'effect');
        break;
      }
      case SpecialEffect.StealFood: {
        this.state.resourceSideEffects.foodStolen = (this.state.resourceSideEffects.foodStolen ?? 0) + mag;
        this.log(enemy.name, `grabs ${mag} food from your pack!`, this.state.round, undefined, undefined, undefined, 'effect');
        break;
      }
      case SpecialEffect.Stun:
        this.setState({ isPlayerStunned: true });
        this.log(enemy.name, 'stuns you!', this.state.round, undefined, undefined, undefined, 'effect');
        break;
      case SpecialEffect.MoraleDamage:
        this.state.resourceSideEffects.moraleLost = (this.state.resourceSideEffects.moraleLost ?? 0) + mag;
        this.log(enemy.name, `saps your will. (−${mag} morale)`, this.state.round, undefined, undefined, undefined, 'effect');
        break;
      case SpecialEffect.DrainHealth: {
        const healAmt = Math.floor(baseDmg * 0.5);
        enemy.currentHP = Math.min(enemy.maxHP, enemy.currentHP + healAmt);
        this.log(enemy.name, `drains ${healAmt} HP from you.`, this.state.round, undefined, undefined, undefined, 'effect');
        break;
      }
      case SpecialEffect.Terrify:
        if (this.state.player.immuneToTerrify) {
          this.log(enemy.name, 'tries to terrify you — your resolve holds firm.', this.state.round, undefined, undefined, undefined, 'effect');
        } else {
          this.state.player.statusEffects.push({ id: 'terrified', remainingRounds: 2, magnitude: 0.7 });
          this.log(enemy.name, 'terrifies you! Attacks weakened for 2 rounds.', this.state.round, undefined, undefined, undefined, 'effect');
        }
        break;
      case SpecialEffect.PackCall: {
        this.log(enemy.name, 'calls for backup!', this.state.round, undefined, undefined, undefined, 'system');
        if (enemy.enemyId) {
          const enemyDef = getEnemyDefinition(enemy.enemyId);
          if (enemyDef.packCallSpawnId) {
            const spawnDef = getEnemyDefinition(enemyDef.packCallSpawnId);
            const alreadySpawned = this.spawnedCount[enemy.enemyId] ?? 0;
            const maxSpawns = enemyDef.packCallSpawnMaxPerCombat ?? 1;
            if (alreadySpawned < maxSpawns) {
              const newEnemy = buildEnemyCombatant(spawnDef, this.state.locationId);
              this.state.enemies.push(newEnemy);
              this.spawnedCount[enemy.enemyId] = alreadySpawned + 1;
              this.log('', `A new ${newEnemy.name} joins the fight!`, this.state.round, undefined, undefined, undefined, 'system');
            }
          }
        }
        break;
      }
    }
  }

  // ── Flee / Negotiate ─────────────────────────────────────

  private resolveFlee(): void {
    const activeEnemies = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
    const fastestEnemy = activeEnemies.length > 0 ? Math.max(...activeEnemies.map(e => e.speed)) : 0;
    let fleeChance = GameBalance.FLEE_BASE_CHANCE
      + (this.state.player.speed - fastestEnemy) * GameBalance.FLEE_SPEED_BONUS_PER_POINT;

    const hasScout = this.state.companions.some(
      c => c.archetype === CompanionArchetype.Scout && c.currentHP > 0,
    );
    if (hasScout) fleeChance += GameBalance.FLEE_SCOUT_BONUS;

    // Morale penalty
    const tier = this.state.playerMorale.tier;
    if (tier === MoraleTier.Weary)      fleeChance -= 0.10;
    else if (tier === MoraleTier.Desperate)  fleeChance -= 0.20;
    else if (tier === MoraleTier.Broken)     fleeChance -= 0.35;

    fleeChance = Math.max(0.1, Math.min(0.95, fleeChance));

    const fleeCompanion = this.state.companions.find(
      c => c.guaranteedFleeAtLevel !== undefined && c.level >= c.guaranteedFleeAtLevel && c.currentHP > 0
    );
    if (fleeCompanion?.specialAbilityReady) {
      fleeChance = 1.0;
      fleeCompanion.specialAbilityReady = false;
      this.log(fleeCompanion.name, 'vanishes into shadow, pulling you with them.', this.state.round, undefined, undefined, undefined, 'system');
    }

    if (this.random() < fleeChance) {
      this.endCombat('fled');
    } else {
      this.log('Player', 'tries to flee but can\'t get away!', this.state.round, undefined, undefined, undefined, 'system');
      this.runEnemyTurn();
      this.tickStatusEffects();
      this.checkEnd();
      if (this.state.phase !== 'post_combat') {
        this.setState({ round: this.state.round + 1, phase: 'awaiting_input' });
      }
    }
  }

  private resolveNegotiate(): void {
    const canNeg = this.state.enemies.some(e => {
      const def = ENEMY_DEFINITIONS.find(d => d.id === e.enemyId);
      return def && !def.immuneToNegotiate && e.currentHP > 0;
    });

    if (!canNeg) {
      this.log('Player', 'tries to negotiate — they aren\'t listening.', this.state.round, undefined, undefined, undefined, 'system');
      this.runEnemyTurn();
      this.tickStatusEffects();
      this.checkEnd();
      if (this.state.phase !== 'post_combat') this.setState({ round: this.state.round + 1, phase: 'awaiting_input' });
      return;
    }

    if (this.random() < 0.3) {
      this.log('Player', 'talks them down. They back off.', this.state.round, undefined, undefined, undefined, 'system');
      this.endCombat('negotiated');
    } else {
      this.log('Player', 'fails to negotiate. They attack.', this.state.round, undefined, undefined, undefined, 'system');
      this.runEnemyTurn();
      this.tickStatusEffects();
      this.checkEnd();
      if (this.state.phase !== 'post_combat') this.setState({ round: this.state.round + 1, phase: 'awaiting_input' });
    }
  }

  // ── Damage formula ────────────────────────────────────────

  private calcDamage(attack: number, defense: number, physRes = 0): { damage: number; isCritical: boolean } {
    const varianceRange = GameBalance.DAMAGE_VARIANCE_MAX - GameBalance.DAMAGE_VARIANCE_MIN;
    const variance = GameBalance.DAMAGE_VARIANCE_MIN + this.random() * varianceRange;
    const isCritical  = this.random() < GameBalance.CRIT_CHANCE;
    const critMult    = isCritical ? GameBalance.CRIT_MULTIPLIER : 1.0;
    let damage        = Math.max(1, Math.floor((attack - defense * 0.5) * variance * critMult));
    damage            = Math.floor(damage * (1 - physRes));
    return { damage: Math.max(1, damage), isCritical };
  }

  // ── Win / loss ────────────────────────────────────────────

  private checkEnd(): void {
    const allDead = this.state.enemies.every(e => e.currentHP <= 0 || e.isFleeing);
    if (allDead)                            this.endCombat('victory');
    else if (this.state.player.currentHP <= 0) this.endCombat('defeat');
  }

  private endCombat(outcome: CombatResult['outcome']): void {
    const defeated = this.state.enemies.filter(e => e.currentHP <= 0);

    const xpGained   = defeated.reduce((s, e) => s + (ENEMY_DEFINITIONS.find(d => d.id === e.enemyId)?.xpReward ?? 0), 0)
                     + this.state.enemies.filter(e => e.isFleeing).length * 5;
    const goldGained = defeated.reduce((s, e) => s + (ENEMY_DEFINITIONS.find(d => d.id === e.enemyId)?.goldReward ?? 0), 0);
    const foodGained = defeated.reduce((s, e) => s + (ENEMY_DEFINITIONS.find(d => d.id === e.enemyId)?.foodReward ?? 0), 0);
    const healthLost = Math.max(0, this.initialPlayerHP - this.state.player.currentHP);
    const healthDelta = this.state.player.currentHP - this.initialPlayerHP;

    const moraleDelta = outcome === 'victory'    ?  8
                      : outcome === 'fled'        ? -3
                      : outcome === 'negotiated'  ?  3
                      : -12;

    const lootedItems: string[] = [];
    if (outcome === 'victory') {
      defeated.forEach(enemy => {
        const enemyDef = getEnemyDefinition(enemy.enemyId);
        if (enemyDef.bossLoot && enemyDef.bossLoot.length > 0) {
          lootedItems.push(...enemyDef.bossLoot);
        }
      });
    }

    const result: CombatResult = {
      outcome,
      roundsFought:      this.state.round,
      xpGained,
      goldGained:        goldGained - (this.state.resourceSideEffects.goldStolen ?? 0),
      foodGained:        foodGained - (this.state.resourceSideEffects.foodStolen ?? 0),
      healthLost,
      healthDelta,
      moraleDelta:       moraleDelta - (this.state.resourceSideEffects.moraleLost ?? 0),
      reputationDelta:   outcome === 'victory' && this.state.enemies.some(e => e.isFleeing) ? 5 : 0,
      injuriesGained:    healthLost > 40 ? ['wounded'] : [],
      companionInjuries: {},
      itemsConsumed:     this.state.itemsConsumed,
      lootedItems,
    };

    this.setState({ phase: 'post_combat', result });
  }

  // ── Status effect tick ────────────────────────────────────

  private tickStatusEffects(): void {
    this.state.player.statusEffects = this.state.player.statusEffects
      .map(e => ({ ...e, remainingRounds: e.remainingRounds - 1 }))
      .filter(e => e.remainingRounds > 0);
    this.state.player.isDefending = false;

    this.state.enemies.forEach(enemy => {
      enemy.statusEffects = enemy.statusEffects
        .map(e => ({ ...e, remainingRounds: e.remainingRounds - 1 }))
        .filter(e => e.remainingRounds > 0);
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  private isOver(): boolean {
    return this.state.enemies.every(e => e.currentHP <= 0 || e.isFleeing)
        || this.state.player.currentHP <= 0;
  }

  private log(
    actor:      string,
    action:     string,
    round:      number,
    damage?:    number,
    effect?:    string,
    isCritical?:boolean,
    type:       CombatLogEntry['type'] = 'normal',
  ): void {
    this.state.log.push({ round, actor, action, damage, effect, isCritical, type });
    this.onStateChange(this.state);
  }

  private setState(partial: Partial<CombatState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }
}
