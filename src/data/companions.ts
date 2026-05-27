import { Companion, CompanionArchetype } from '@engine/types';

export const COMPANIONS: Companion[] = [

  // ── Rex the Dog ───────────────────────────────────────────
  {
    id:          'rex_the_dog',
    name:        'Rex the Dog',
    archetype:   CompanionArchetype.Animal,
    description: 'A scrappy brown dog who has decided you are going somewhere interesting.',
    portraitId:  'portrait_rex',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 80, desertsBelow: 10, complainsBelow: 30 },
    passiveBonus:{
      luckModifier:   0.03,
      foragingBonus:  1,        // Dog finds things
      moralePerTurn:  1,        // Just having him helps
    },
    foodCostPerTurn:  0.5,
    combatPower:      8,
    loyaltyGains: { onMoraleHigh: 2, onReputationMatch: 0, onRally: 1, onCombatVictory: 3 },
    loyaltyLosses:{ onStarvation: 8, onMoraleLow: 1, onReputationMismatch: 0, onBrokenPromise: 5 },
    recruitNarrative:  'Rex leaps forward and falls into step. He immediately finds something dead to sniff.',
    departureNarrative:'Rex stops. He sits down in the road and watches you go, tail still.',
  },

  // ── Emmy ──────────────────────────────────────────────────
  {
    id:          'emmy',
    name:        'Emmy',
    archetype:   CompanionArchetype.Healer,
    description: 'A travelling herbalist from Lahonis with a practical mind and steady hands.',
    portraitId:  'portrait_emmy',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 60, desertsBelow: 20, complainsBelow: 40 },
    passiveBonus:{
      healthRegenPerTurn: 2,
      foodCostModifier:   0.95,
      moralePerTurn:      1,
    },
    foodCostPerTurn: 1.0,
    combatPower:     12,
    loyaltyGains: { onMoraleHigh: 2, onReputationMatch: 1, onRally: 3, onCombatVictory: 2 },
    loyaltyLosses:{ onStarvation: 6, onMoraleLow: 2, onReputationMismatch: 2, onBrokenPromise: 10 },
    recruitNarrative:  '"You\'re heading east," Emmy says. "So am I. We may as well be useful to each other."',
    departureNarrative:'"I came to help people. I\'m not sure that\'s what we\'re doing anymore."',
  },

  // ── Dain ──────────────────────────────────────────────────
  {
    id:          'dain',
    name:        'Dain',
    archetype:   CompanionArchetype.Warrior,
    description: 'A Qanisi warrior who has walked the eastern road further than most and offers to walk it again.',
    portraitId:  'portrait_dain',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 65, desertsBelow: 22, complainsBelow: 42 },
    passiveBonus:{
      luckModifier:    0.03,
      moralePerTurn:   1,
      eventMitigation: ['bandit_ambush'],
    },
    foodCostPerTurn: 1.2,
    combatPower:     18,
    loyaltyGains: { onMoraleHigh: 1, onReputationMatch: 2, onRally: 4, onCombatVictory: 6 },
    loyaltyLosses:{ onStarvation: 5, onMoraleLow: 2, onReputationMismatch: 3, onBrokenPromise: 12 },
    recruitNarrative:  '"Then I walk with you." He falls into step, movements practiced and quiet.',
    departureNarrative:'"The road is yours to walk as you choose." He returns to his post without looking back.',
  },

  // ── Joe ───────────────────────────────────────────────────
  {
    id:          'joe',
    name:        'Joe',
    archetype:   CompanionArchetype.Scout,
    description: 'An amiable traveller at Kita with a good eye for the road ahead. Appears on odd days.',
    portraitId:  'portrait_joe',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 55, desertsBelow: 18, complainsBelow: 35 },
    passiveBonus:{
      luckModifier:   0.04,
      foragingBonus:  1,
      movementBonus:  0.08,
    },
    foodCostPerTurn: 0.9,
    combatPower:     10,
    loyaltyGains: { onMoraleHigh: 1, onReputationMatch: 1, onRally: 2, onCombatVictory: 3 },
    loyaltyLosses:{ onStarvation: 5, onMoraleLow: 1, onReputationMismatch: 1, onBrokenPromise: 8 },
    recruitNarrative:  '"Sure, I\'ll tag along for a bit. Always wanted to see what\'s east of Kita."',
    departureNarrative:'"This is about as far east as I go. Good luck with the rest."',
  },

  // ── Jenn ─────────────────────────────────────────────────
  {
    id:          'jenn',
    name:        'Jenn',
    archetype:   CompanionArchetype.Bard,
    description: 'Joe\'s counterpart at Kita. A storyteller who lifts morale through the hardest stretches. Appears on even days.',
    portraitId:  'portrait_jenn',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 55, desertsBelow: 18, complainsBelow: 35 },
    passiveBonus:{
      moralePerTurn:  2,
      luckModifier:   0.02,
    },
    foodCostPerTurn: 0.9,
    combatPower:     6,
    loyaltyGains: { onMoraleHigh: 2, onReputationMatch: 1, onRally: 3, onCombatVictory: 1 },
    loyaltyLosses:{ onStarvation: 4, onMoraleLow: 1, onReputationMismatch: 1, onBrokenPromise: 7 },
    recruitNarrative:  '"Every great quest deserves someone to remember it. I\'ll come."',
    departureNarrative:'"I\'ll write a song about this. The ending\'s still unclear." She smiles and leaves.',
  },

  // ── Scarface ──────────────────────────────────────────────
  {
    id:          'scarface',
    name:        'Scarface',
    archetype:   CompanionArchetype.Rogue,
    description: 'A dangerous-looking individual at Ualla who favours travelling with people of bad reputation.',
    portraitId:  'portrait_scarface',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 58, desertsBelow: 15, complainsBelow: 30 },
    passiveBonus:{
      goldFindBonus:   4,
      luckModifier:    0.06,
      eventMitigation: ['pickpocket', 'toll_road'],
    },
    foodCostPerTurn: 1.1,
    combatPower:     16,
    loyaltyGains: { onMoraleHigh: 0, onReputationMatch: 2, onRally: 1, onCombatVictory: 5 },
    loyaltyLosses:{ onStarvation: 7, onMoraleLow: 0, onReputationMismatch: 4, onBrokenPromise: 15 },
    recruitNarrative:  'Scarface looks you over slowly. "You\'ll do," he says, and stands up.',
    departureNarrative:'"Business elsewhere." He\'s gone before you finish blinking.',
  },

  // ── Lefty the Crook ───────────────────────────────────────
  {
    id:          'lefty_the_crook',
    name:        'Lefty the Crook',
    archetype:   CompanionArchetype.Rogue,
    description: 'A thief with a grudge against the powerful and a talent for finding things that are not his.',
    portraitId:  'portrait_lefty',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 60, desertsBelow: 20, complainsBelow: 35 },
    passiveBonus:{
      goldFindBonus:   3,
      eventMitigation: ['pickpocket'],
      luckModifier:    0.08,
    },
    foodCostPerTurn: 0.8,
    combatPower:     14,
    loyaltyGains: { onMoraleHigh: 1, onReputationMatch: 2, onRally: 2, onCombatVictory: 5 },
    loyaltyLosses:{ onStarvation: 8, onMoraleLow: 1, onReputationMismatch: 3, onBrokenPromise: 10 },
    recruitNarrative:  '"You\'ve got that look. Like someone who does what needs doing. Fine. I\'m in — for now."',
    departureNarrative:'You wake and Mira is gone. A note: "Nothing personal. Good luck." Your gold is accounted for. Barely.',
  },

  // ── Velma ─────────────────────────────────────────────────
  {
    id:          'velma',
    name:        'Velma',
    archetype:   CompanionArchetype.Sage,
    description: 'A scholar passing through Yichesny who favours those with good reputations.',
    portraitId:  'portrait_velma',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 62, desertsBelow: 22, complainsBelow: 42 },
    passiveBonus:{
      luckModifier:          0.05,
      revealHiddenLocations: true,
      moralePerTurn:         1,
    },
    foodCostPerTurn: 1.0,
    combatPower:     8,
    loyaltyGains: { onMoraleHigh: 2, onReputationMatch: 2, onRally: 3, onCombatVictory: 1 },
    loyaltyLosses:{ onStarvation: 5, onMoraleLow: 3, onReputationMismatch: 4, onBrokenPromise: 12 },
    recruitNarrative:  '"I\'ve been waiting for someone worth travelling with. Let\'s see if you qualify."',
    departureNarrative:'"The evidence suggests you\'re not who I thought. I need to reconsider my position."',
  },

  // ── Ivan ──────────────────────────────────────────────────
  {
    id:          'ivan',
    name:        'Ivan',
    archetype:   CompanionArchetype.Mercenary,
    description: 'A professional who asks no questions and works for coin. Found at Shishy\'s Tavern.',
    portraitId:  'portrait_ivan',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 70, desertsBelow: 15, complainsBelow: 30 },
    passiveBonus:{
      luckModifier:    0.04,
      eventMitigation: ['bandit_ambush', 'wolf_attack'],
    },
    foodCostPerTurn: 1.5,
    combatPower:     22,
    loyaltyGains: { onMoraleHigh: 0, onReputationMatch: 0, onRally: 1, onCombatVictory: 6 },
    loyaltyLosses:{ onStarvation: 10, onMoraleLow: 0, onReputationMismatch: 0, onBrokenPromise: 20 },
    recruitNarrative:  'Ivan counts the gold without looking up. "You\'ve bought reliable. Don\'t waste it."',
    departureNarrative:'"Contract\'s done." He heads south. That\'s all.',
  },

  // ── Ick the Rat ───────────────────────────────────────────
  {
    id:          'ick_the_rat',
    name:        'Ick the Rat',
    archetype:   CompanionArchetype.Animal,
    description: 'A large, unnervingly intelligent rat found near the Glittering Gate. Possibly magical.',
    portraitId:  'portrait_ick',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 75, desertsBelow: 10, complainsBelow: 20 },
    passiveBonus:{
      luckModifier:          0.06,
      revealHiddenLocations: true,
    },
    foodCostPerTurn: 0.3,
    combatPower:     4,
    loyaltyGains: { onMoraleHigh: 1, onReputationMatch: 0, onRally: 0, onCombatVictory: 2 },
    loyaltyLosses:{ onStarvation: 3, onMoraleLow: 0, onReputationMismatch: 0, onBrokenPromise: 3 },
    recruitNarrative:  'Ick the Rat appears at your feet and regards you with unsettling intelligence. He follows.',
    departureNarrative:'Ick is simply not there one morning. No explanation. Just gone.',
  },

  // ── Glubglub the Goblin ───────────────────────────────────
  {
    id:          'glubglub_the_goblin',
    name:        'Glubglub the Goblin',
    archetype:   CompanionArchetype.Rogue,
    description: 'A goblin of unusual ambition found at the base of Colrandrir. Only travels with the truly infamous.',
    portraitId:  'portrait_glubglub',
    level:       { current: 1, xp: 0, xpToNext: 20 },
    loyalty:     { value: 55, desertsBelow: 12, complainsBelow: 28 },
    passiveBonus:{
      goldFindBonus: 5,
      luckModifier:  0.05,
      foragingBonus: 2,
    },
    foodCostPerTurn: 0.7,
    combatPower:     12,
    loyaltyGains: { onMoraleHigh: 0, onReputationMatch: 3, onRally: 1, onCombatVictory: 4 },
    loyaltyLosses:{ onStarvation: 4, onMoraleLow: 0, onReputationMismatch: 5, onBrokenPromise: 8 },
    recruitNarrative:  '"Glubglub comes! Glubglub is VERY useful. You will see." He is already rifling through your pack.',
    departureNarrative:'"Glubglub finds better opportunity. No hard feelings yes?" He is gone with your spare rations.',
  },
];

// ── Lookup helper ─────────────────────────

export function getCompanion(id: string): Companion | undefined {
  return COMPANIONS.find(c => c.id === id);
}

// ── Recruitment condition evaluator ──────
// Returns true if the companion can be recruited
// given the current rep value and morale value.

export interface RecruitmentRequirements {
  minReputation?: number;
  maxReputation?: number;
  minMorale?:     number;
  maxMorale?:     number;
}

export const COMPANION_REQUIREMENTS: Record<string, RecruitmentRequirements> = {
  rex_the_dog:          {},                                      // Anyone
  emmy:                 { minReputation: 20 },
  dain:                 { minReputation: 0 },
  joe:                  {},                                      // Odd days only — checked in dialogue
  jenn:                 {},                                      // Even days only — checked in dialogue
  scarface:             { maxReputation: 35 },
  lefty_the_crook:      { maxReputation: 25 },
  velma:                { minReputation: 55 },
  ivan:                 {},                                      // Gold cost, no rep gate
  ick_the_rat:          {},
  glubglub_the_goblin:  { maxReputation: 15 },
};

export function canRecruit(
  companionId: string,
  repValue:    number,
  moraleValue: number,
): boolean {
  const req = COMPANION_REQUIREMENTS[companionId];
  if (!req) return false;
  if (req.minReputation !== undefined && repValue < req.minReputation) return false;
  if (req.maxReputation !== undefined && repValue > req.maxReputation) return false;
  if (req.minMorale     !== undefined && moraleValue < req.minMorale)  return false;
  if (req.maxMorale     !== undefined && moraleValue > req.maxMorale)  return false;
  return true;
}
