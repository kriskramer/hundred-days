import {
  GameEvent,
  GameState,
  WeatherType,
  EventType,
  ResolutionType,
  PassiveOutcome,
  StatDelta,
} from './types';
import { LOCATIONS } from '@data/locations';

// ─────────────────────────────────────────
// Event definitions
// ─────────────────────────────────────────
export const EVENT_DEFINITIONS: GameEvent[] = [

  // ── Weather ──────────────────────────────────────────────

  {
    id: 'weather_storm_rolls_in',
    type: EventType.WeatherChange,
    resolutionType: ResolutionType.Passive,
    name: 'Storm Rolls In',
    description: 'Dark clouds gather and a cold rain begins to fall.',
    conditions: {
      probability: 0.15,
      forbiddenStatusEffects: ['in_storm'],
    },
    passiveOutcome: {
      weatherOverride: WeatherType.Severe,
      statusEffectsAdded: ['in_storm'],
      narrativeText: 'The storm settles in. Movement will be slow and dangerous today.',
    },
    repeatable: true,
    tags: ['weather', 'danger'],
  },

  {
    id: 'weather_clears',
    type: EventType.WeatherChange,
    resolutionType: ResolutionType.Passive,
    name: 'Skies Clear',
    description: 'The clouds part and warm sunlight breaks through.',
    conditions: {
      probability: 0.30,
      requiredStatusEffects: ['in_storm'],
    },
    passiveOutcome: {
      weatherOverride: WeatherType.Good,
      statusEffectsRemoved: ['in_storm'],
      narrativeText: 'The storm passes. The road ahead looks clear.',
    },
    repeatable: true,
    tags: ['weather', 'positive'],
  },

  {
    id: 'weather_ideal',
    type: EventType.WeatherChange,
    resolutionType: ResolutionType.Passive,
    name: 'Perfect Travelling Weather',
    description: 'A rare day of clear skies and good road.',
    conditions: {
      probability: 0.08,
      forbiddenStatusEffects: ['in_storm'],
    },
    passiveOutcome: {
      weatherOverride: WeatherType.Ideal,
      resourceDelta: { morale: 3 },
      narrativeText: 'The weather is perfect. The party moves with unusual spirit.',
    },
    repeatable: true,
    tags: ['weather', 'positive'],
  },

  // ── Resource finds ────────────────────────────────────────

  {
    id: 'find_abandoned_camp',
    type: EventType.ResourceFind,
    resolutionType: ResolutionType.Passive,
    name: 'Abandoned Camp',
    description: 'You stumble upon an abandoned campsite.',
    conditions: {
      probability: 0.12,
      locationTypes: ['wilderness'],
      maxDay: 85,
    },
    passiveOutcome: {
      resourceDelta: { food: 3, gold: 5 },
      narrativeText: 'You rifle through the camp and find some dried provisions and a small purse.',
    },
    repeatable: true,
    tags: ['wilderness', 'resource', 'positive'],
  },

  {
    id: 'find_hidden_stash',
    type: EventType.ResourceFind,
    resolutionType: ResolutionType.Passive,
    name: 'Hidden Stash',
    description: 'A loose stone catches your eye.',
    conditions: {
      probability: 0.06,
      minLocationId: 20,
    },
    passiveOutcome: {
      resourceDelta: { gold: 15 },
      narrativeText: 'A tidy sum of gold, wrapped in oilskin. Someone\'s rainy day fund — now yours.',
    },
    repeatable: true,
    tags: ['resource', 'positive', 'rare'],
  },

  {
    id: 'forage_roadside',
    type: EventType.ResourceFind,
    resolutionType: ResolutionType.Passive,
    name: 'Roadside Foraging',
    description: 'The hedgerows are thick with berries.',
    conditions: {
      probability: 0.18,
      requiredWeather: [WeatherType.Good, WeatherType.Ideal],
      locationTypes: ['wilderness'],
    },
    passiveOutcome: {
      resourceDelta: { food: 2 },
      narrativeText: 'You pick as you walk, arriving at camp with a welcome handful of food.',
    },
    repeatable: true,
    tags: ['wilderness', 'resource', 'food', 'positive'],
  },

  // ── Resource loss ─────────────────────────────────────────

  {
    id: 'food_spoils',
    type: EventType.ResourceLoss,
    resolutionType: ResolutionType.Passive,
    name: 'Supplies Spoil',
    description: 'The heat and damp have gotten to your provisions.',
    conditions: {
      probability: 0.10,
      minFood: 4,
      requiredWeather: [WeatherType.Poor, WeatherType.Severe],
    },
    passiveOutcome: {
      resourceDelta: { food: -2 },
      narrativeText: 'You open your pack to find half your food has gone bad. A bitter loss.',
    },
    repeatable: true,
    tags: ['resource', 'danger', 'food'],
  },

  {
    id: 'toll_road',
    type: EventType.ResourceLoss,
    resolutionType: ResolutionType.Passive,
    name: 'Toll Road',
    description: 'A bridge keeper demands a toll.',
    conditions: {
      probability: 0.08,
      locationTypes: ['wilderness', 'town'],
      maxLocationId: 60,
    },
    passiveOutcome: {
      resourceDelta: { gold: -8 },
      narrativeText: 'You pay the toll and cross. An unwelcome but unavoidable expense.',
    },
    repeatable: true,
    tags: ['gold', 'resource', 'neutral'],
  },

  {
    id: 'pickpocket',
    type: EventType.ResourceLoss,
    resolutionType: ResolutionType.Passive,
    name: 'Pickpocketed',
    description: 'A jostling crowd and a light hand.',
    conditions: {
      probability: 0.07,
      locationTypes: ['town'],
      minLocationId: 10,
    },
    passiveOutcome: {
      resourceDelta: { gold: -10 },
      narrativeText: 'You reach for your gold and find far less than you left with. Someone had nimble fingers.',
    },
    repeatable: true,
    tags: ['gold', 'town', 'danger'],
  },

  // ── Morale ────────────────────────────────────────────────

  {
    id: 'inspiring_vista',
    type: EventType.MoraleShift,
    resolutionType: ResolutionType.Passive,
    name: 'Inspiring Vista',
    description: 'You crest a hill and the view takes your breath away.',
    conditions: {
      probability: 0.10,
      locationTypes: ['wilderness'],
      requiredWeather: [WeatherType.Good, WeatherType.Ideal],
    },
    passiveOutcome: {
      resourceDelta: { morale: 10 },
      narrativeText: 'For a moment, the weight of the quest lifts. You feel equal to the challenge ahead.',
    },
    repeatable: true,
    tags: ['morale', 'positive', 'wilderness'],
  },

  {
    id: 'bad_dream',
    type: EventType.MoraleShift,
    resolutionType: ResolutionType.Passive,
    name: 'Troubled Sleep',
    description: 'Dark dreams leave you shaken come morning.',
    conditions: {
      probability: 0.08,
      minDay: 30,
    },
    passiveOutcome: {
      resourceDelta: { morale: -8 },
      statusEffectsAdded: ['fatigued'],
      narrativeText: 'You wake unrested, the nightmare clinging to you. The road feels longer today.',
    },
    repeatable: true,
    tags: ['morale', 'danger', 'status'],
  },

  {
    id: 'dread_milestone',
    type: EventType.MoraleShift,
    resolutionType: ResolutionType.Passive,
    name: 'The Clock Ticks',
    description: 'The deadline presses.',
    conditions: {
      probability: 0.25,
      minDay: 70,
    },
    passiveOutcome: {
      resourceDelta: { morale: -5 },
      narrativeText: 'The days are running short. Every hour feels stolen.',
    },
    repeatable: true,
    tags: ['morale', 'dread'],
  },

  // ── Final boss ────────────────────────────────────────────

  {
    id: 'boss_dread_sovereign',
    type: EventType.BossEncounter,
    resolutionType: ResolutionType.Interactive,
    name: 'The Dread Sovereign',
    description: 'The final confrontation at the Inner Castle.',
    conditions: {
      probability: 1.0,   // always fires — force-queued by TurnEngine at loc 125
      minLocationId: 125,
    },
    interactiveHandlerId: 'combat_handler',
    repeatable: false,
    tags: ['boss', 'combat'],
  },

  // ── Interactive — placeholder wires ──────────────────────

  {
    id: 'bandit_ambush',
    type: EventType.Combat,
    resolutionType: ResolutionType.Interactive,
    name: 'Bandit Ambush',
    description: 'Armed figures step out from the treeline.',
    conditions: {
      probability: 0.12,
      locationTypes: ['wilderness'],
      minLocationId: 6,
      minDay: 3,
    },
    interactiveHandlerId: 'combat_handler',
    repeatable: true,
    tags: ['combat', 'wilderness', 'danger', 'bandit'],
  },

  {
    id: 'wolf_attack',
    type: EventType.Combat,
    resolutionType: ResolutionType.Interactive,
    name: 'Wolf Pack',
    description: 'Yellow eyes in the dark. Then more yellow eyes.',
    conditions: {
      probability: 0.10,
      locationTypes: ['wilderness'],
      minLocationId: 10,
    },
    interactiveHandlerId: 'combat_handler',
    repeatable: true,
    tags: ['combat', 'wilderness', 'wolves'],
  },

  {
    id: 'mysterious_stranger',
    type: EventType.Dialogue,
    resolutionType: ResolutionType.Interactive,
    name: 'Mysterious Stranger',
    description: 'A hooded figure sits alone by the road.',
    conditions: {
      probability: 0.07,
      minLocationId: 10,
      maxLocationId: 80,
    },
    interactiveHandlerId: 'dialogue_handler',
    repeatable: false,
    tags: ['dialogue', 'story'],
  },
];

// ─────────────────────────────────────────
// Event pools per location type
//
// Controls which type-specific events are eligible at each location type.
// Global events (no locationTypes condition) bypass this filter entirely
// and can fire anywhere.
// Individual locations may override via their eventPool field.
// ─────────────────────────────────────────
export const EVENT_POOLS_BY_TYPE: Partial<Record<string, string[]>> = {
  wilderness: [
    'bandit_ambush',
    'wolf_attack',
    'find_abandoned_camp',
    'forage_roadside',
    'food_spoils',
    'inspiring_vista',
    'bad_dream',
  ],
  town: [
    'pickpocket',
    'toll_road',
    'weather_storm_rolls_in',
    'bad_dream',
  ],
  dungeon: [
    'bandit_ambush',
    'wolf_attack',
    'bad_dream',
  ],
};

// ─────────────────────────────────────────
// Build lookup map
// ─────────────────────────────────────────
export function buildEventRegistry(
  events: GameEvent[],
): Map<string, GameEvent> {
  return new Map(events.map(e => [e.id, e]));
}

// ─────────────────────────────────────────
// Event sampler — called each turn
// ─────────────────────────────────────────
export function sampleEventsForTurn(
  state: GameState,
): GameEvent[] {
  const location = LOCATIONS.find(l => l.id === state.currentLocationId);
  if (!location) return [];

  const activeEffectIds = state.player.statusEffects.map(e => e.id);

  // Resolve the event pool for this location: per-location override first,
  // then type-based default, then undefined (no pool restriction).
  const pool: string[] | undefined =
    location.eventPool ?? EVENT_POOLS_BY_TYPE[location.type];

  const eligible = EVENT_DEFINITIONS.filter(event => {
    const c = event.conditions;

    if (!event.repeatable && state.firedEventIds.has(event.id)) return false;

    if (c.minDay        && state.dayNumber         < c.minDay)        return false;
    if (c.maxDay        && state.dayNumber         > c.maxDay)        return false;
    if (c.minLocationId && state.currentLocationId < c.minLocationId) return false;
    if (c.maxLocationId && state.currentLocationId > c.maxLocationId) return false;
    if (c.minFood       && state.resources.food    < c.minFood)       return false;
    if (c.maxFood       && state.resources.food    > c.maxFood)       return false;

    if (c.locationTypes && !c.locationTypes.includes(location.type)) return false;

    if (c.requiredWeather && !c.requiredWeather.includes(state.weather)) return false;

    if (c.requiredStatusEffects) {
      const hasAll = c.requiredStatusEffects.every(id => activeEffectIds.includes(id));
      if (!hasAll) return false;
    }

    if (c.forbiddenStatusEffects) {
      const hasAny = c.forbiddenStatusEffects.some(id => activeEffectIds.includes(id));
      if (hasAny) return false;
    }

    // Pool filter: only applies to type-specific events (those that declare
    // locationTypes). Global events (no locationTypes) are not pool-gated
    // and fire at any location type.
    if (pool && c.locationTypes && !pool.includes(event.id)) return false;

    return true;
  });

  const fired: GameEvent[] = [];
  for (const event of eligible) {
    if (Math.random() < event.conditions.probability) {
      fired.push(event);
      if (fired.length >= 2) break; // max 2 per turn
    }
  }

  return fired;
}

// ─────────────────────────────────────────
// Check if any dialogue/companion events are eligible this turn
// (used to show a visual indicator on the Road screen)
// ─────────────────────────────────────────
export function hasEligibleDialogue(state: GameState): boolean {
  const location = LOCATIONS.find(l => l.id === state.currentLocationId);
  if (!location) return false;

  const activeEffectIds = state.player.statusEffects.map(e => e.id);

  return EVENT_DEFINITIONS.some(event => {
    if (event.type !== EventType.Dialogue && event.type !== EventType.CompanionMeet) return false;
    if (!event.repeatable && state.firedEventIds.has(event.id)) return false;

    const c = event.conditions;
    if (c.minDay        && state.dayNumber         < c.minDay)        return false;
    if (c.maxDay        && state.dayNumber         > c.maxDay)        return false;
    if (c.minLocationId && state.currentLocationId < c.minLocationId) return false;
    if (c.maxLocationId && state.currentLocationId > c.maxLocationId) return false;
    if (c.locationTypes && !c.locationTypes.includes(location.type))  return false;
    if (c.requiredWeather && !c.requiredWeather.includes(state.weather)) return false;

    if (c.requiredStatusEffects) {
      if (!c.requiredStatusEffects.every(id => activeEffectIds.includes(id))) return false;
    }
    if (c.forbiddenStatusEffects) {
      if (c.forbiddenStatusEffects.some(id => activeEffectIds.includes(id))) return false;
    }

    return true;
  });
}

// ─────────────────────────────────────────
// Convert passive outcome → StatDelta
// ─────────────────────────────────────────
export function passiveOutcomeToDelta(
  event: GameEvent,
  outcome: PassiveOutcome,
): StatDelta {
  return {
    source:               `event:${event.id}`,
    food:                 outcome.resourceDelta?.food,
    gold:                 outcome.resourceDelta?.gold,
    health:               outcome.resourceDelta?.health,
    morale:               outcome.resourceDelta?.morale,
    statusEffectsAdded:   outcome.statusEffectsAdded,
    statusEffectsRemoved: outcome.statusEffectsRemoved,
    weatherOverride:      outcome.weatherOverride,
    narrative:            outcome.narrativeText,
  };
}
