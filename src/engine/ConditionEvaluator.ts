import { CompanionArchetype, GameState, WeatherType } from './types';
import { getLocation } from '@data/locations';

export interface UnifiedConditions {
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
  minReputation?:           number;
  maxReputation?:           number;
  minMorale?:               number;
  maxMorale?:               number;
  minPlayerLevel?:          number;
  requiredAnyCompanion?:    boolean;
  requiredCompanionCount?:  number;
  requiredCompanionId?:     string;
  requiredCompanionArchetype?: CompanionArchetype;
  minCompanionLoyalty?:     number;
  maxCompanionLoyalty?:     number;
  forbiddenCompanionId?:    string;
  minGold?:                 number;
  locationId?:              number;
  locationIds?:             number[];
  dayRange?:                [number, number];
  notAlreadyMet?:           boolean;
  requiredFlag?:            string;
  forbiddenFlag?:           string;
  requiredConversationId?:  string;
}

/**
 * Shared condition evaluator used by DialogueEngine and EventSystem.
 */
export function evalConditions(
  c: UnifiedConditions,
  game: GameState,
  context?: { dialogueId?: string; eventId?: string; companionId?: string }
): boolean {
  const rep = game.reputation.value;
  const morale = game.morale.value;
  const companions = game.companions;
  const activeEffectIds = game.player.statusEffects.map(effect => effect.id);
  const location = getLocation(game.currentLocationId);

  // Time & Location
  if (c.minDay !== undefined && game.dayNumber < c.minDay) return false;
  if (c.maxDay !== undefined && game.dayNumber > c.maxDay) return false;
  if (c.minLocationId !== undefined && game.currentLocationId < c.minLocationId) return false;
  if (c.maxLocationId !== undefined && game.currentLocationId > c.maxLocationId) return false;

  if (c.dayRange !== undefined) {
    const [min, max] = c.dayRange;
    if (game.dayNumber < min || game.dayNumber > max) return false;
  }

  if (c.locationId !== undefined && game.currentLocationId !== c.locationId) return false;
  if (c.locationIds !== undefined && !c.locationIds.includes(game.currentLocationId)) return false;

  if (location) {
    if (c.locationTypes !== undefined && !c.locationTypes.includes(location.type)) return false;
  }

  // Weather
  if (c.requiredWeather !== undefined && !c.requiredWeather.includes(game.weather)) return false;

  // Status effects
  if (c.requiredStatusEffects !== undefined) {
    if (!c.requiredStatusEffects.every(id => activeEffectIds.includes(id))) return false;
  }
  if (c.forbiddenStatusEffects !== undefined) {
    if (c.forbiddenStatusEffects.some(id => activeEffectIds.includes(id))) return false;
  }

  // Resources
  if (c.minFood !== undefined && game.resources.food < c.minFood) return false;
  if (c.maxFood !== undefined && game.resources.food > c.maxFood) return false;
  if (c.minGold !== undefined && game.resources.gold < c.minGold) return false;

  // Stats
  if (c.minReputation !== undefined && rep < c.minReputation) return false;
  if (c.maxReputation !== undefined && rep > c.maxReputation) return false;
  if (c.minMorale !== undefined && morale < c.minMorale) return false;
  if (c.maxMorale !== undefined && morale > c.maxMorale) return false;
  if (c.minPlayerLevel !== undefined && game.player.level < c.minPlayerLevel) return false;

  // Companions
  if (c.requiredAnyCompanion && companions.length === 0) {
    return false;
  }
  if (c.requiredCompanionCount !== undefined && companions.length < c.requiredCompanionCount) {
    return false;
  }
  if (c.requiredCompanionId !== undefined) {
    if (!companions.some(co => co.id === c.requiredCompanionId)) return false;
  }
  if (c.requiredCompanionArchetype !== undefined) {
    if (!companions.some(co => co.archetype === c.requiredCompanionArchetype)) return false;
  }
  if (c.minCompanionLoyalty !== undefined) {
    const minCompanionLoyalty = c.minCompanionLoyalty;
    if (!companions.some(co => co.loyalty.value >= minCompanionLoyalty)) return false;
  }
  if (c.maxCompanionLoyalty !== undefined) {
    const maxCompanionLoyalty = c.maxCompanionLoyalty;
    if (!companions.some(co => co.loyalty.value <= maxCompanionLoyalty)) return false;
  }
  if (c.forbiddenCompanionId !== undefined) {
    if (companions.some(co => co.id === c.forbiddenCompanionId)) return false;
  }

  // Story Flags
  if (c.requiredFlag !== undefined && !game.storyFlags.has(c.requiredFlag)) return false;
  if (c.forbiddenFlag !== undefined && game.storyFlags.has(c.forbiddenFlag)) return false;

  if (c.requiredConversationId !== undefined) {
    const companionId = c.requiredCompanionId ?? context?.companionId;
    const companion = companionId
      ? companions.find(co => co.id === companionId)
      : companions.find(co => (co.conversationsHad ?? []).includes(c.requiredConversationId!));
    if (!companion?.conversationsHad?.includes(c.requiredConversationId)) return false;
  }

  // Special dialogue "notAlreadyMet" condition
  if (c.notAlreadyMet && context?.dialogueId) {
    const uniqueKey = `${context.dialogueId}_loc${game.currentLocationId}`;
    if (game.firedEventIds.has(uniqueKey)) return false;
  }

  return true;
}
