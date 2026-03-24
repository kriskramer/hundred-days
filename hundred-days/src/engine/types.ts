// ============================================================
// 100 Days to Save the World — Shared Types
// Single source of truth for all engine types.
// ============================================================

// ─────────────────────────────────────────
// Enums
// ─────────────────────────────────────────

export enum WeatherType {
  Severe  = 'severe',
  Poor    = 'poor',
  Neutral = 'neutral',
  Good    = 'good',
  Ideal   = 'ideal',
}

export enum PlayerAction {
  Move    = 'move',
  Hunt    = 'hunt',
  Rest    = 'rest',
  Trade   = 'trade',
  Rally   = 'rally',
  Camp    = 'camp',
}

export enum MoraleTier {
  Inspired   = 'inspired',
  Steady     = 'steady',
  Weary      = 'weary',
  Desperate  = 'desperate',
  Broken     = 'broken',
}

export enum ReputationTier {
  LegendaryHero  = 'legendary_hero',
  Honorable      = 'honorable',
  Neutral        = 'neutral',
  Disreputable   = 'disreputable',
  Infamous       = 'infamous',
}

export enum CompanionArchetype {
  Warrior    = 'warrior',
  Scout      = 'scout',
  Healer     = 'healer',
  Rogue      = 'rogue',
  Sage       = 'sage',
  Bard       = 'bard',
  Mercenary  = 'mercenary',
  Animal     = 'animal',
}

export enum TurnPhase {
  Validating       = 'validating',
  AwaitingAction   = 'awaiting_action',
  ResolvingAction  = 'resolving_action',
  SamplingEvents   = 'sampling_events',
  ResolvingEvents  = 'resolving_events',
  AwaitingPlayer   = 'awaiting_player',
  UpdatingStats    = 'updating_stats',
  CheckingLevelUp  = 'checking_level_up',
  AwaitingLevelUp  = 'awaiting_level_up',
  CheckingWinLoss  = 'checking_win_loss',
  Cleanup          = 'cleanup',
  Complete         = 'complete',
}

export enum EventType {
  WeatherChange    = 'weather_change',
  ResourceFind     = 'resource_find',
  ResourceLoss     = 'resource_loss',
  StatusGain       = 'status_gain',
  MoraleShift      = 'morale_shift',
  Combat           = 'combat',
  Dialogue         = 'dialogue',
  MoralChoice      = 'moral_choice',
  CompanionMeet    = 'companion_meet',
  BossEncounter    = 'boss_encounter',
}

export enum ResolutionType {
  Passive     = 'passive',
  Interactive = 'interactive',
}

export enum ItemCategory {
  Consumable = 'consumable',
  Weapon     = 'weapon',
  Armor      = 'armor',
  Gear       = 'gear',
  Trinket    = 'trinket',
  QuestItem  = 'quest_item',
}

export enum ItemSlot {
  Hand   = 'hand',
  Body   = 'body',
  Back   = 'back',
  Neck   = 'neck',
  Finger = 'finger',
  None   = 'none',
}

export enum CombatActionType {
  Attack    = 'attack',
  Defend    = 'defend',
  Skill     = 'skill',
  Flee      = 'flee',
  Negotiate = 'negotiate',
}

export enum EnemyBehavior {
  Aggressive  = 'aggressive',
  Opportunist = 'opportunist',
  Defensive   = 'defensive',
  Pack        = 'pack',
  Undead      = 'undead',
  Spectral    = 'spectral',
}

export enum SpecialEffect {
  StealFood    = 'steal_food',
  StealGold    = 'steal_gold',
  MoraleDamage = 'morale_damage',
  Stun         = 'stun',
  DrainHealth  = 'drain_health',
  PackCall     = 'pack_call',
  Terrify      = 'terrify',
}

// ─────────────────────────────────────────
// Core state
// ─────────────────────────────────────────

export interface PlayerStats {
  maxHealth:   number;
  attack:      number;
  defense:     number;
  speed:       number;
  endurance:   number;
  perception:  number;
  leadership:  number;
}

export interface StatusEffect {
  id:               string;
  durationTurns:    number;
  magnitude?:       number;
}

export interface PlayerState {
  name:          string;
  level:         number;
  xp:            number;
  health:        number;
  stats:         PlayerStats;
  statusEffects: StatusEffect[];
}

export interface PlayerResources {
  food:          number;
  gold:          number;
  items:         InventoryItem[];
  maxSlots:      number;                             // 8 base, 10 with Traveler's Pack
  equippedItems: Partial<Record<ItemSlot, string>>;  // slot → itemDefinitionId
}

export interface MoraleState {
  value:               number;
  tier:                MoraleTier;
  tierChangedThisTurn: boolean;
  dreadActive:         boolean;
}

export interface ReputationState {
  value:               number;
  tier:                ReputationTier;
  tierChangedThisTurn: boolean;
  notoriety:           boolean;
  renown:              boolean;
}

// ─────────────────────────────────────────
// Companion
// ─────────────────────────────────────────

export interface CompanionLevel {
  current:   number;
  xp:        number;
  xpToNext:  number;
}

export interface CompanionLoyalty {
  value:          number;
  desertsBelow:   number;
  complainsBelow: number;
}

export interface CompanionPassiveBonus {
  luckModifier?:            number;
  foodCostModifier?:        number;
  foragingBonus?:           number;
  goldFindBonus?:           number;
  moralePerTurn?:           number;
  healthRegenPerTurn?:      number;
  movementBonus?:           number;
  eventMitigation?:         string[];
}

export interface Companion {
  id:                   string;
  name:                 string;
  archetype:            CompanionArchetype;
  description:          string;
  portraitId:           string;
  level:                CompanionLevel;
  loyalty:              CompanionLoyalty;
  passiveBonus:         CompanionPassiveBonus;
  foodCostPerTurn:      number;
  combatPower:          number;
  loyaltyGains: {
    onMoraleHigh:       number;
    onReputationMatch:  number;
    onRally:            number;
    onCombatVictory:    number;
  };
  loyaltyLosses: {
    onStarvation:           number;
    onMoraleLow:            number;
    onReputationMismatch:   number;
    onBrokenPromise:        number;
  };
  personalQuestEventId?:  string;
  departureNarrative:     string;
  recruitNarrative:       string;
}

// ─────────────────────────────────────────
// Items
// ─────────────────────────────────────────

export interface ItemPassiveEffect {
  attackBonus?:               number;
  defenseBonus?:              number;
  speedBonus?:                number;
  physicalResistanceBonus?:   number;
  forcedMarchCostReduction?:  number;
  weatherProtection?:         boolean;
  travelDifficultyReduction?: number;
  foodCostReduction?:         number;
  foragingBonus?:             number;
  goldFindBonus?:             number;
  luckModifier?:              number;
  moralePerTurn?:             number;
  reputationModifier?:        number;
  immuneToTerrify?:           boolean;
  revealHiddenLocations?:     boolean;
  companionLoyaltyBonus?:     number;
}

export interface ItemActiveEffect {
  foodRestore?:        number;
  healthRestore?:      number;
  moraleRestore?:      number;
  goldGain?:           number;
  tempAttackBonus?:    number;
  tempDefenseBonus?:   number;
  tempSpeedBonus?:     number;
  buffDurationRounds?: number;
  clearsStatusEffect?: string;
  grantsStatusEffect?: string;
  statusDurationTurns?:number;
  grantsExtraMovement?:number;
  combatDamage?:       number;
  combatEffect?:       SpecialEffect;
}

export interface ItemDefinition {
  id:            string;
  name:          string;
  description:   string;
  category:      ItemCategory;
  slot:          ItemSlot;
  passiveEffect?: ItemPassiveEffect;
  activeEffect?:  ItemActiveEffect;
  isConsumable:  boolean;
  shopPrice?:    number;
  foundInRegions?: string[];
  dropsFrom?:    string[];
  maxStack:      number;
  iconId:        string;
  rarity:        'common' | 'uncommon' | 'rare' | 'unique';
  questDialogueId?: string;
}

export interface InventoryItem {
  definitionId:  string;
  quantity:      number;
  isEquipped:    boolean;
  equippedSlot?: ItemSlot;
}

// ─────────────────────────────────────────
// Events
// ─────────────────────────────────────────

export interface EventConditions {
  minDay?:                  number;
  maxDay?:                  number;
  minLocationId?:           number;
  maxLocationId?:           number;
  requiredWeather?:         WeatherType[];
  requiredStatusEffects?:   string[];
  forbiddenStatusEffects?:  string[];
  minFood?:                 number;
  maxFood?:                 number;
  locationTypes?:           string[];
  probability:              number;
}

export interface PassiveOutcome {
  resourceDelta?: {
    food?:   number;
    gold?:   number;
    health?: number;
    morale?: number;
  };
  statusEffectsAdded?:   string[];
  statusEffectsRemoved?: string[];
  weatherOverride?:      WeatherType;
  narrativeText:         string;
}

export interface GameEvent {
  id:                   string;
  type:                 EventType;
  resolutionType:       ResolutionType;
  name:                 string;
  description:          string;
  conditions:           EventConditions;
  passiveOutcome?:      PassiveOutcome;
  interactiveHandlerId?:string;
  repeatable:           boolean;
  tags:                 string[];
}

// ─────────────────────────────────────────
// Turn state
// ─────────────────────────────────────────

export interface TurnLogEntry {
  timestamp: number;
  text:      string;
}

export interface StatDelta {
  source:               string;
  food?:                number;
  gold?:                number;
  health?:              number;
  morale?:              number;
  reputation?:          number;
  xp?:                  number;
  companionLoyalty?:    Record<string, number>;
  statusEffectsAdded?:  string[];
  statusEffectsRemoved?:string[];
  weatherOverride?:     WeatherType;
  narrative?:           string;
}

export interface TurnRecord {
  dayNumber:       number;
  locationBefore:  number;
  locationAfter:   number;
  action:          PlayerAction;
  weather:         WeatherType;
  eventsTriggered: string[];
  deltas:          StatDelta[];
  levelUpOccurred: boolean;
  narrativeSummary:string;
}

export interface TurnState {
  phase:                  TurnPhase;
  action:                 PlayerAction | null;
  eventsQueue:            GameEvent[];
  activeInteractiveEvent: GameEvent | null;
  pendingDeltas:          StatDelta[];
  log:                    TurnLogEntry[];
}

// ─────────────────────────────────────────
// Game state (master)
// ─────────────────────────────────────────

export interface GameState {
  runId:              string;
  seed:               number;
  dayNumber:          number;
  currentLocationId:  number;
  isComplete:         boolean;
  outcome:            'victory' | 'defeat' | 'timeout' | null;

  player:             PlayerState;
  resources:          PlayerResources;
  morale:             MoraleState;
  reputation:         ReputationState;
  weather:            WeatherType;

  companions:         Companion[];
  firedEventIds:      Set<string>;
  visitedLocationIds: Set<number>;

  starvationTurns:        number;
  clearedCombatLocations: Set<number>;
  currentTurn:            TurnState | null;
  turnHistory:        TurnRecord[];
}

// ─────────────────────────────────────────
// Combat
// ─────────────────────────────────────────

export interface CombatResult {
  outcome:            'victory' | 'defeat' | 'fled' | 'negotiated';
  roundsFought:       number;
  xpGained:          number;
  goldGained:        number;
  foodGained:        number;
  healthLost:        number;
  moraleDelta:       number;
  reputationDelta:   number;
  injuriesGained:    string[];
  companionInjuries: Record<string, string[]>;
}

// ─────────────────────────────────────────
// Level up
// ─────────────────────────────────────────

export interface LevelUpChoice {
  id:          string;
  label:       string;
  description: string;
  effect:      Partial<PlayerStats> & { luckModifier?: number; foodCostModifier?: number; foragingBonus?: number; moralePerTurn?: number };
}

// ─────────────────────────────────────────
// Save system
// ─────────────────────────────────────────

export interface SerializedGameState extends Omit<GameState, 'firedEventIds' | 'visitedLocationIds' | 'clearedCombatLocations' | 'currentTurn'> {
  firedEventIds:          string[];
  visitedLocationIds:     number[];
  clearedCombatLocations: number[];
  currentTurn:            null;
}

export interface SaveFile {
  schemaVersion: number;
  savedAt:       string;
  runId:         string;
  dayNumber:     number;
  locationId:    number;
  playerLevel:   number;
  isComplete:    boolean;
  outcome:       GameState['outcome'];
  gameState:     SerializedGameState;
}

export interface RunHistoryEntry {
  runId:               string;
  startedAt:           string;
  endedAt:             string;
  outcome:             'victory' | 'defeat' | 'timeout' | 'abandoned';
  finalDay:            number;
  finalLocation:       number;
  finalLevel:          number;
  companionsRecruited: string[];
  turnsPlayed:         number;
  summary:             string;
}

export interface AppSettings {
  soundEnabled:    boolean;
  musicVolume:     number;
  textSpeed:       'slow' | 'normal' | 'fast' | 'instant';
  showDamageNumbers: boolean;
  confirmActions:  boolean;
  lastPlayedAt:    string;
}
