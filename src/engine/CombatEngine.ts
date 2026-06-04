import {
  GameState,
  Companion,
  CompanionArchetype,
  CombatResult,
  EnemyBehavior,
  SpecialEffect,
} from './types';
import {
  computeEquippedBonuses,
  inventoryFromResources,
} from './ItemSystem';

// ─────────────────────────────────────────
// Enemy definitions
// ─────────────────────────────────────────

export interface EnemyDefinition {
  id:                   string;
  name:                 string;
  description:          string;
  baseHP:               number;
  baseAttack:           number;
  baseDefense:          number;
  baseSpeed:            number;
  behavior:             EnemyBehavior;
  minLocationId:        number;
  scaling:              number;           // Power multiplier per 10 locs past min
  abilities:            EnemyAbility[];
  immuneToNegotiate:    boolean;
  physicalResistance:   number;           // 0.0–1.0
  moraleDamageOnSight:  number;
  xpReward:             number;
  goldReward:           number;
  foodReward:           number;
  encounterText:        string[];
  defeatText:           string;
  victoryText:          string;
}

export interface EnemyAbility {
  id:               string;
  name:             string;
  probability:      number;
  damageMultiplier: number;
  specialEffect?:   SpecialEffect;
  effectMagnitude?: number;             // How much the effect applies (gold stolen, morale lost, etc.)
}

// ─────────────────────────────────────────
// Live combatant state
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// Combat state
// ─────────────────────────────────────────

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
}

export type CombatActionType = 'attack' | 'defend' | 'skill' | 'flee' | 'negotiate';

export interface CombatAction {
  type:             CombatActionType;
  targetEnemyIndex?: number;
  skillId?:         string;
}

// ─────────────────────────────────────────
// Enemy roster
// ─────────────────────────────────────────

export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
  {
    id: 'small_rats', name: 'Small Rats',
    description: 'A skittering swarm — more nuisance than threat.',
    baseHP: 8, baseAttack: 3, baseDefense: 1, baseSpeed: 6,
    behavior: EnemyBehavior.Pack, minLocationId: 1, scaling: 1.0,
    abilities: [
      { id: 'swarm', name: 'Swarm', probability: 0.3, damageMultiplier: 1.2, specialEffect: SpecialEffect.Stun },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 0,
    xpReward: 5, goldReward: 0, foodReward: 0,
    encounterText: [
      'A swarm of rats boils up from a drain, teeth bared.',
      'Dozens of small eyes catch the light. Then they rush.',
      'The scratching under the floorboards gets louder. Then it gets closer.',
    ],
    defeatText: 'The rats scatter back into the dark.',
    victoryText: 'You\'ve been overwhelmed by rats. Embarrassing, but painful.',
  },
  {
    id: 'giant_spiders', name: 'Giant Spiders',
    description: 'Fast, venomous, and disturbingly clever about ambush.',
    baseHP: 14, baseAttack: 5, baseDefense: 2, baseSpeed: 8,
    behavior: EnemyBehavior.Opportunist, minLocationId: 1, scaling: 1.05,
    abilities: [
      { id: 'venom_bite', name: 'Venom Bite', probability: 0.35, damageMultiplier: 0.8, specialEffect: SpecialEffect.Stun },
      { id: 'web', name: 'Web', probability: 0.25, damageMultiplier: 0, specialEffect: SpecialEffect.Stun },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 2,
    xpReward: 8, goldReward: 0, foodReward: 0,
    encounterText: [
      'Something large drops from the branches above you.',
      'You walk through a web. The shaking brings its owner.',
      'Eight eyes open in the darkness ahead. They don\'t blink.',
    ],
    defeatText: 'The spider curls and goes still.',
    victoryText: 'The venom does its work before you can find help.',
  },
  {
    id: 'wild_dogs', name: 'Wild Dogs',
    description: 'Feral and hungry. They travel in packs.',
    baseHP: 12, baseAttack: 6, baseDefense: 2, baseSpeed: 7,
    behavior: EnemyBehavior.Pack, minLocationId: 3, scaling: 1.1,
    abilities: [
      { id: 'pack_surge', name: 'Pack Surge', probability: 0.3, damageMultiplier: 1.3, specialEffect: SpecialEffect.PackCall },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 0,
    xpReward: 8, goldReward: 0, foodReward: 2,
    encounterText: [
      'A pack of gaunt dogs circles you, growling low.',
      'Something has been following you. Several somethings.',
      'You hear padding paws on all sides before you see them.',
    ],
    defeatText: 'The pack breaks and retreats into the brush.',
    victoryText: 'The pack brings you down through sheer numbers.',
  },
  {
    id: 'bandits', name: 'Bandits',
    description: 'Desperate men with weapons and nothing to lose.',
    baseHP: 22, baseAttack: 8, baseDefense: 4, baseSpeed: 5,
    behavior: EnemyBehavior.Opportunist, minLocationId: 6, scaling: 1.15,
    abilities: [
      { id: 'shakedown', name: 'Shakedown', probability: 0.25, damageMultiplier: 0.5, specialEffect: SpecialEffect.StealGold, effectMagnitude: 8 },
      { id: 'grab_pack', name: 'Grab the Pack', probability: 0.2, damageMultiplier: 0.3, specialEffect: SpecialEffect.StealFood, effectMagnitude: 2 },
      { id: 'heavy_blow', name: 'Heavy Blow', probability: 0.3, damageMultiplier: 1.5 },
    ],
    immuneToNegotiate: false, physicalResistance: 0, moraleDamageOnSight: 3,
    xpReward: 18, goldReward: 10, foodReward: 1,
    encounterText: [
      'Armed figures step out from behind the rocks. "Toll road," one says.',
      '"Empty your pockets and we let you walk." The blade makes it less optional.',
      'A figure drops from the tree above. Two more step out of the brush.',
      'You smell them before you see them. Then they\'re everywhere.',
    ],
    defeatText: 'The bandits cut their losses and scatter.',
    victoryText: 'There were more of them than you counted. The road takes you.',
  },
  {
    id: 'wolves', name: 'Wolves',
    description: 'Silent, coordinated, and utterly without mercy.',
    baseHP: 20, baseAttack: 9, baseDefense: 3, baseSpeed: 9,
    behavior: EnemyBehavior.Pack, minLocationId: 10, scaling: 1.15,
    abilities: [
      { id: 'hamstring', name: 'Hamstring', probability: 0.3, damageMultiplier: 0.8, specialEffect: SpecialEffect.Stun },
      { id: 'howl', name: 'Howl', probability: 0.2, damageMultiplier: 0, specialEffect: SpecialEffect.PackCall },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 2,
    xpReward: 20, goldReward: 0, foodReward: 3,
    encounterText: [
      'Yellow eyes in the dark. Then more yellow eyes.',
      'The howl comes from your left. The pack comes from your right.',
      'A wolf steps into the moonlight ahead. It is not alone.',
    ],
    defeatText: 'The wolves melt back into the forest.',
    victoryText: 'The pack closes in from all sides.',
  },
  {
    id: 'qanisi_warrior', name: 'Qanisi Warrior',
    description: 'A disciplined fighter from the eastern clans. Territorial, not evil.',
    baseHP: 28, baseAttack: 10, baseDefense: 6, baseSpeed: 6,
    behavior: EnemyBehavior.Defensive, minLocationId: 13, scaling: 1.2,
    abilities: [
      { id: 'shield_bash', name: 'Shield Bash', probability: 0.3, damageMultiplier: 0.7, specialEffect: SpecialEffect.Stun },
      { id: 'precision_strike', name: 'Precision Strike', probability: 0.25, damageMultiplier: 1.6 },
    ],
    immuneToNegotiate: false, physicalResistance: 0, moraleDamageOnSight: 0,
    xpReward: 22, goldReward: 8, foodReward: 0,
    encounterText: [
      'A Qanisi warrior steps into the road, hand on weapon.',
      '"This land is not yours to cross." The warrior draws.',
      'The warrior emerges from the treeline. No words. Just a raised blade.',
    ],
    defeatText: 'The warrior steps aside and lets you pass.',
    victoryText: 'The warrior\'s discipline outlasts your endurance.',
  },
  {
    id: 'goblins', name: 'Goblins',
    description: 'Small, fast, annoyingly numerous.',
    baseHP: 16, baseAttack: 7, baseDefense: 3, baseSpeed: 8,
    behavior: EnemyBehavior.Pack, minLocationId: 21, scaling: 1.2,
    abilities: [
      { id: 'swarm_attack', name: 'Swarm Attack', probability: 0.35, damageMultiplier: 1.1, specialEffect: SpecialEffect.PackCall },
      { id: 'steal_shiny', name: 'Steal Shiny', probability: 0.2, damageMultiplier: 0, specialEffect: SpecialEffect.StealGold, effectMagnitude: 5 },
    ],
    immuneToNegotiate: false, physicalResistance: 0, moraleDamageOnSight: 0,
    xpReward: 16, goldReward: 5, foodReward: 0,
    encounterText: [
      'High-pitched cackling from the undergrowth. Then small shapes, rushing.',
      'Something throws a rock. Then everything starts throwing rocks.',
      '"Get it! Get it! Get it!" They\'re already on you.',
    ],
    defeatText: 'The goblins trip over themselves retreating, shrieking.',
    victoryText: 'There were simply too many of them.',
  },
  {
    id: 'orcs', name: 'Orcs',
    description: 'Large, organised, angry. They don\'t flee.',
    baseHP: 40, baseAttack: 14, baseDefense: 8, baseSpeed: 4,
    behavior: EnemyBehavior.Aggressive, minLocationId: 32, scaling: 1.25,
    abilities: [
      { id: 'brutal_strike', name: 'Brutal Strike', probability: 0.3, damageMultiplier: 1.8 },
      { id: 'war_cry', name: 'War Cry', probability: 0.2, damageMultiplier: 0, specialEffect: SpecialEffect.Terrify, effectMagnitude: 8 },
    ],
    immuneToNegotiate: false, physicalResistance: 0, moraleDamageOnSight: 5,
    xpReward: 28, goldReward: 12, foodReward: 0,
    encounterText: [
      'An orc steps out from behind a ruin. It doesn\'t say anything.',
      'The orc was waiting. It has been waiting a long time.',
      'Three of them. They fan out to cut off your retreat.',
    ],
    defeatText: 'The orc goes down hard, shaking the ground.',
    victoryText: 'The orc\'s strike ends it.',
  },
  {
    id: 'ogres', name: 'Ogres',
    description: 'Huge, slow, devastating. One hit can end a fight.',
    baseHP: 60, baseAttack: 18, baseDefense: 10, baseSpeed: 3,
    behavior: EnemyBehavior.Aggressive, minLocationId: 62, scaling: 1.3,
    abilities: [
      { id: 'crushing_blow', name: 'Crushing Blow', probability: 0.25, damageMultiplier: 2.2 },
      { id: 'terrifying_roar', name: 'Terrifying Roar', probability: 0.3, damageMultiplier: 0, specialEffect: SpecialEffect.Terrify, effectMagnitude: 10 },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 8,
    xpReward: 38, goldReward: 5, foodReward: 0,
    encounterText: [
      'The ground shakes before you see it. Then you see it.',
      'The trees ahead have been snapped like twigs. Fresh.',
      'It hears you long before you hear it. It was ready.',
    ],
    defeatText: 'The ogre crashes to its knees, then sideways.',
    victoryText: 'One swing. That\'s all it took.',
  },
  {
    id: 'wraiths', name: 'Wraiths',
    description: 'The lingering dead. Physical attacks barely slow them.',
    baseHP: 35, baseAttack: 12, baseDefense: 6, baseSpeed: 7,
    behavior: EnemyBehavior.Spectral, minLocationId: 46, scaling: 1.25,
    abilities: [
      { id: 'life_drain', name: 'Life Drain', probability: 0.4, damageMultiplier: 1.0, specialEffect: SpecialEffect.DrainHealth },
      { id: 'terror_gaze', name: 'Terror Gaze', probability: 0.3, damageMultiplier: 0, specialEffect: SpecialEffect.MoraleDamage, effectMagnitude: 12 },
    ],
    immuneToNegotiate: true, physicalResistance: 0.4, moraleDamageOnSight: 10,
    xpReward: 35, goldReward: 0, foodReward: 0,
    encounterText: [
      'The temperature drops. A shape that isn\'t quite a shape drifts toward you.',
      'Your torch gutters and dies. Something in the dark notices.',
      'The whispers started miles back. They\'ve been leading you here.',
    ],
    defeatText: 'The wraith tears apart with a sound like a long exhale.',
    victoryText: 'Cold. Darkness. The road ends here.',
  },
  {
    id: 'zombies', name: 'Zombies',
    description: 'Slow but relentless. They heal what you deal.',
    baseHP: 45, baseAttack: 11, baseDefense: 5, baseSpeed: 2,
    behavior: EnemyBehavior.Undead, minLocationId: 67, scaling: 1.2,
    abilities: [
      { id: 'rend', name: 'Rend', probability: 0.3, damageMultiplier: 1.2 },
      { id: 'undying', name: 'Undying', probability: 0.4, damageMultiplier: 0, specialEffect: SpecialEffect.DrainHealth, effectMagnitude: 8 },
    ],
    immuneToNegotiate: true, physicalResistance: 0.2, moraleDamageOnSight: 8,
    xpReward: 30, goldReward: 0, foodReward: 0,
    encounterText: [
      'Something that used to be a person lurches toward you.',
      'The smell reaches you first. Then the sounds. Then they do.',
      'There\'s one. Then there are five. They were waiting in the ditch.',
    ],
    defeatText: 'It collapses and stays down. Finally.',
    victoryText: 'There were too many and they would not stop.',
  },
  {
    id: 'thralls', name: 'Thralls',
    description: 'Soldiers broken to Roachak\'s will. Trained precision, dead eyes.',
    baseHP: 50, baseAttack: 16, baseDefense: 12, baseSpeed: 5,
    behavior: EnemyBehavior.Aggressive, minLocationId: 79, scaling: 1.3,
    abilities: [
      { id: 'disciplined_strike', name: 'Disciplined Strike', probability: 0.3, damageMultiplier: 1.5 },
      { id: 'dark_mark', name: 'Dark Mark', probability: 0.25, damageMultiplier: 0.5, specialEffect: SpecialEffect.MoraleDamage, effectMagnitude: 8 },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 6,
    xpReward: 40, goldReward: 15, foodReward: 2,
    encounterText: [
      'Soldiers march toward you in formation. Their eyes are wrong.',
      'Roachak\'s mark is burned into their armor. They don\'t slow down.',
      'They don\'t speak. They don\'t hesitate. They just advance.',
    ],
    defeatText: 'The thrall crumples. Whatever was left of the person inside is released.',
    victoryText: 'The formation breaks over you like a wave.',
  },
  {
    id: 'white_horseman', name: 'The White Horseman',
    description: 'One of Roachak\'s heralds. It has been following you.',
    baseHP: 80, baseAttack: 22, baseDefense: 15, baseSpeed: 8,
    behavior: EnemyBehavior.Spectral, minLocationId: 93, scaling: 1.2,
    abilities: [
      { id: 'herald_strike', name: 'Herald Strike', probability: 0.3, damageMultiplier: 1.8 },
      { id: 'soul_chill', name: 'Soul Chill', probability: 0.35, damageMultiplier: 0.5, specialEffect: SpecialEffect.MoraleDamage, effectMagnitude: 15 },
      { id: 'drain_will', name: 'Drain Will', probability: 0.25, damageMultiplier: 1.0, specialEffect: SpecialEffect.DrainHealth },
    ],
    immuneToNegotiate: true, physicalResistance: 0.5, moraleDamageOnSight: 15,
    xpReward: 55, goldReward: 0, foodReward: 0,
    encounterText: [
      'A pale rider crests the hill and turns its hollow gaze on you.',
      'The horse makes no sound. Neither does its rider. They have been behind you for days.',
      'The horizon dims where it rides. It has found what it was looking for.',
    ],
    defeatText: 'The Horseman dissolves with a sound like wind through a keyhole.',
    victoryText: 'The Horseman\'s chill finds every weakness.',
  },

  // ── Mid-bosses ────────────────────────────────────────────

  {
    id: 'orc_warchief', name: 'The Orc Warchief',
    description: 'The warlord who holds Samson\'s Bridge. Armies have broken against him.',
    baseHP: 65, baseAttack: 17, baseDefense: 10, baseSpeed: 5,
    behavior: EnemyBehavior.Aggressive, minLocationId: 32, scaling: 1.0,
    abilities: [
      { id: 'warchief_strike', name: 'Warchief Strike', probability: 0.30, damageMultiplier: 1.9 },
      { id: 'war_drum',        name: 'War Drum',        probability: 0.25, damageMultiplier: 0.3, specialEffect: SpecialEffect.PackCall },
      { id: 'shield_wall',     name: 'Shield Wall',     probability: 0.20, damageMultiplier: 0,   specialEffect: SpecialEffect.Stun },
    ],
    immuneToNegotiate: true, physicalResistance: 0, moraleDamageOnSight: 10,
    xpReward: 50, goldReward: 20, foodReward: 3,
    encounterText: [
      'The bridge is blocked by a figure twice your height. He doesn\'t move.',
      'The Orc Warchief stands at the centre of the bridge, arms crossed, waiting.',
      '"No one crosses. Not today. Not you." He draws a weapon the size of a door.',
    ],
    defeatText: 'The Warchief crashes to his knees. The bridge is yours.',
    victoryText: 'The Warchief\'s blow sends you over the railing.',
  },

  {
    id: 'lich_of_vorishy', name: 'The Lich of Vorishy',
    description: 'An ancient sorcerer who refused death. The bane the road is named for.',
    baseHP: 90, baseAttack: 20, baseDefense: 12, baseSpeed: 6,
    behavior: EnemyBehavior.Spectral, minLocationId: 65, scaling: 1.0,
    abilities: [
      { id: 'soul_rend',      name: 'Soul Rend',      probability: 0.35, damageMultiplier: 1.3, specialEffect: SpecialEffect.DrainHealth },
      { id: 'dread_gaze',     name: 'Dread Gaze',     probability: 0.30, damageMultiplier: 0,   specialEffect: SpecialEffect.MoraleDamage, effectMagnitude: 15 },
      { id: 'necrotic_burst', name: 'Necrotic Burst',  probability: 0.25, damageMultiplier: 1.7 },
    ],
    immuneToNegotiate: true, physicalResistance: 0.4, moraleDamageOnSight: 12,
    xpReward: 70, goldReward: 0, foodReward: 0,
    encounterText: [
      'The sunken road fills with cold light. A figure rises from the mud — old, wrong, patient.',
      '"I have been here since before your ancestors had names." The Lich raises one hand.',
      'The ground beneath Vorishy\'s Bane cracks open. Something old crawls out.',
    ],
    defeatText: 'The Lich collapses into dust and old bones. Whatever bound it here is gone.',
    victoryText: 'The cold takes you. Another soul to feed the Lich\'s eternity.',
  },

  // ── Final boss ───────────────────────────────────────────

  {
    id: 'dread_sovereign', name: 'Roachak',
    description: 'Ancient evil made manifest. The reason this journey began.',
    baseHP: 200, baseAttack: 28, baseDefense: 16, baseSpeed: 7,
    behavior: EnemyBehavior.Aggressive, minLocationId: 125, scaling: 1.0,
    abilities: [
      { id: 'dark_smite',          name: 'Dark Smite',          probability: 0.30, damageMultiplier: 2.0 },
      { id: 'terrifying_presence', name: 'Terrifying Presence', probability: 0.25, damageMultiplier: 0.4, specialEffect: SpecialEffect.Terrify },
      { id: 'soul_drain',          name: 'Soul Drain',          probability: 0.20, damageMultiplier: 0.8, specialEffect: SpecialEffect.DrainHealth },
      { id: 'dread_shout',         name: 'Dread Shout',         probability: 0.25, damageMultiplier: 0.5, specialEffect: SpecialEffect.MoraleDamage, effectMagnitude: 20 },
    ],
    immuneToNegotiate: true, physicalResistance: 0.25, moraleDamageOnSight: 25,
    xpReward: 500, goldReward: 0, foodReward: 0,
    encounterText: [
      'The Dread Sovereign rises from its throne of shadow. The air turns cold. This is what the world feared.',
      'The shadow at the end of the world has a face. It is looking at you.',
    ],
    defeatText: 'The Sovereign collapses, its form unravelling into dark smoke. It is over.',
    victoryText: 'Your strength was not enough. The world falls into shadow.',
  },
];

// ─────────────────────────────────────────
// Build combatants from location mob table
// ─────────────────────────────────────────

export function buildEnemiesForLocation(
  mobNames:  string[],
  locationId: number,
): EnemyCombatant[] {
  return mobNames
    .slice(0, 3)
    .map(name => {
      const def = ENEMY_DEFINITIONS.find(
        e => e.name.toLowerCase() === name.toLowerCase()
          || e.id === name.toLowerCase().replace(/\s+/g, '_'),
      );
      if (!def) return null;

      const locationScale = 1 + Math.max(0, (locationId - def.minLocationId) / 10) * (def.scaling - 1);
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
    })
    .filter((e): e is EnemyCombatant => e !== null);
}

// ─────────────────────────────────────────
// Build boss combatant — scales with player level
// ─────────────────────────────────────────

const BOSS_ENEMY_BY_LOC: Record<number, string> = {
  32:  'orc_warchief',
  65:  'lich_of_vorishy',
  93:  'white_horseman',
  125: 'dread_sovereign',
};

export function buildBossEnemy(game: GameState): EnemyCombatant[] {
  const enemyId = BOSS_ENEMY_BY_LOC[game.currentLocationId] ?? 'dread_sovereign';
  const def   = ENEMY_DEFINITIONS.find(e => e.id === enemyId)!;
  const level = game.player.level;
  // Scale boss HP/attack/defense with player level so the fight is
  // always meaningful regardless of when the boss location is reached.
  const hp      = def.baseHP   + level * 15;
  const attack  = def.baseAttack  + level * 2;
  const defense = def.baseDefense + level;

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

  constructor(
    enemies:       EnemyCombatant[],
    gameState:     GameState,
    onStateChange: (state: CombatState) => void,
  ) {
    this.onStateChange   = onStateChange;
    this.state           = this.init(enemies, gameState);
    this.initialPlayerHP = this.state.player.currentHP;
    // Start in awaiting_input (or after surprise round)
    if (this.state.surpriseRound) {
      this.runEnemyTurn();
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
    const surprised    = Math.random() < Math.max(0, (fastestEnemy - game.player.stats.speed) * 0.04);

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
      if (action.type === 'skill')  this.playerSkill(action.skillId);
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
    const { damage, isCritical } = this.calcDamage(
      this.state.player.attack * atkMult,
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

  private playerSkill(skillId?: string): void {
    // Skill resolution will be wired to the item system in the next phase.
    // For now apply a generic battle draught effect as a placeholder.
    this.state.player.statusEffects.push({ id: 'attack_buffed', remainingRounds: 3, magnitude: 1.5 });
    this.log('Player', `uses ${skillId ?? 'a skill'}.`, this.state.round, undefined, undefined, undefined, 'effect');
  }

  // ── Companion AI ──────────────────────────────────────────

  private companionsAct(): void {
    const alive = this.state.enemies.filter(e => e.currentHP > 0 && !e.isFleeing);
    if (!alive.length) return;

    for (const companion of this.state.companions) {
      if (companion.currentHP <= 0) continue;

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
          this.log(companion.name, 'rallies the party. (+2 morale banked)', this.state.round, undefined, undefined, undefined, 'effect');
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

      // Opportunist flee check
      if (enemy.behavior === EnemyBehavior.Opportunist && enemy.currentHP / enemy.maxHP < 0.3) {
        enemy.isFleeing = true;
        this.log(enemy.name, 'turns and flees!', this.state.round, undefined, undefined, undefined, 'system');
        continue;
      }

      // Choose ability or basic attack
      const ability = enemy.abilities.find(a => Math.random() < a.probability) ?? null;
      if (ability) {
        this.resolveEnemyAbility(enemy, ability);
      } else {
        this.enemyBasicAttack(enemy);
      }
    }
  }

  private enemyBasicAttack(enemy: EnemyCombatant): void {
    const defMult    = this.state.player.isDefending ? 0.6 : 1.0;
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
    const defMult = this.state.player.isDefending ? 0.6 : 1.0;
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
      case SpecialEffect.PackCall:
        this.log(enemy.name, 'calls for backup!', this.state.round, undefined, undefined, undefined, 'system');
        break;
    }
  }

  // ── Flee / Negotiate ─────────────────────────────────────

  private resolveFlee(): void {
    const fastestEnemy = Math.max(...this.state.enemies.map(e => e.speed));
    let fleeChance     = 0.4 + (this.state.player.speed - fastestEnemy) * 0.05;

    const mira = this.state.companions.find(c => c.companionId === 'mira_thorn' && c.currentHP > 0);
    if (mira?.specialAbilityReady && mira.level >= 5) {
      fleeChance = 1.0;
      mira.specialAbilityReady = false;
      this.log('Mira', 'vanishes into shadow, pulling you with her.', this.state.round, undefined, undefined, undefined, 'system');
    }

    const hasScout = this.state.companions.some(
      c => c.archetype === CompanionArchetype.Scout && c.currentHP > 0,
    );
    if (hasScout) fleeChance += 0.15;

    fleeChance = Math.max(0.1, Math.min(0.95, fleeChance));

    if (Math.random() < fleeChance) {
      this.endCombat('fled');
    } else {
      this.log('Player', 'tries to flee but can\'t get away!', this.state.round, undefined, undefined, undefined, 'system');
      this.runEnemyTurn();
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
      this.checkEnd();
      if (this.state.phase !== 'post_combat') this.setState({ round: this.state.round + 1, phase: 'awaiting_input' });
      return;
    }

    if (Math.random() < 0.3) {
      this.log('Player', 'talks them down. They back off.', this.state.round, undefined, undefined, undefined, 'system');
      this.endCombat('negotiated');
    } else {
      this.log('Player', 'fails to negotiate. They attack.', this.state.round, undefined, undefined, undefined, 'system');
      this.runEnemyTurn();
      this.checkEnd();
      if (this.state.phase !== 'post_combat') this.setState({ round: this.state.round + 1, phase: 'awaiting_input' });
    }
  }

  // ── Damage formula ────────────────────────────────────────

  private calcDamage(attack: number, defense: number, physRes = 0): { damage: number; isCritical: boolean } {
    const variance    = 0.8 + Math.random() * 0.4;
    const isCritical  = Math.random() < 0.10;
    const critMult    = isCritical ? 1.75 : 1.0;
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

    const moraleDelta = outcome === 'victory'    ?  8
                      : outcome === 'fled'        ? -3
                      : outcome === 'negotiated'  ?  3
                      : -12;

    const result: CombatResult = {
      outcome,
      roundsFought:      this.state.round,
      xpGained,
      goldGained:        goldGained - (this.state.resourceSideEffects.goldStolen ?? 0),
      foodGained:        foodGained - (this.state.resourceSideEffects.foodStolen ?? 0),
      healthLost,
      moraleDelta:       moraleDelta - (this.state.resourceSideEffects.moraleLost ?? 0),
      reputationDelta:   outcome === 'victory' && this.state.enemies.some(e => e.isFleeing) ? 5 : 0,
      injuriesGained:    healthLost > 40 ? ['wounded'] : [],
      companionInjuries: {},
    };

    this.setState({ phase: 'post_combat', result });
  }

  // ── Status effect tick ────────────────────────────────────

  private tickStatusEffects(): void {
    this.state.player.statusEffects = this.state.player.statusEffects
      .map(e => ({ ...e, remainingRounds: e.remainingRounds - 1 }))
      .filter(e => e.remainingRounds > 0);
    this.state.player.isDefending = false;
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
