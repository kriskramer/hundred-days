import { COMPANIONS } from '@data/companions';
import { ENEMIES } from '@data/enemies';
import { DIALOGUES } from '@data/dialogues';
import { EVENT_DEFINITIONS, EVENT_POOLS_BY_TYPE } from '@data/events';
import { LOCATIONS, REGIONS } from '@data/locations';
import { getAllShops } from '@data/shops';
import { ITEMS } from '@data/items';
import { TRAVEL_DIALOGUES } from '@data/travelDialogues';
import { BOSS_EVENT_MAP } from '@engine/bosses';
import {
  CompanionArchetype,
  EventType,
  ResolutionType,
  WeatherType,
  EnemyBehavior,
  ItemCategory,
  ItemSlot,
} from '@engine/types';

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  return [...duplicates];
}

describe('Data integrity', () => {
  it('has no duplicate IDs in core data files', () => {
    expect(findDuplicates(LOCATIONS.map(location => String(location.id)))).toEqual([]);
    expect(findDuplicates(EVENT_DEFINITIONS.map(event => event.id))).toEqual([]);
    expect(findDuplicates(COMPANIONS.map(companion => companion.id))).toEqual([]);
    expect(findDuplicates(DIALOGUES.map(dialogue => dialogue.id))).toEqual([]);
    expect(findDuplicates(TRAVEL_DIALOGUES.map(dialogue => dialogue.id))).toEqual([]);
    expect(findDuplicates(getAllShops().map(shop => shop.id))).toEqual([]);
    expect(findDuplicates(ENEMIES.map(enemy => enemy.id))).toEqual([]);
    expect(findDuplicates(ITEMS.map(item => item.id))).toEqual([]);
  });

  it('keeps location IDs contiguous from 1 to 125', () => {
    expect(LOCATIONS.map(location => location.id)).toEqual(
      Array.from({ length: 125 }, (_, index) => index + 1),
    );
  });

  it('ensures every location mob references a valid enemy', () => {
    const enemyIds = new Set(ENEMIES.map(enemy => enemy.id));

    for (const location of LOCATIONS) {
      for (const mob of location.mobs) {
        expect(enemyIds.has(mob.enemyId)).toBe(true);
      }
    }
  });

  it('ensures every event pool entry references a valid event', () => {
    const eventIds = new Set(EVENT_DEFINITIONS.map(event => event.id));

    for (const pool of Object.values(EVENT_POOLS_BY_TYPE)) {
      for (const eventId of pool ?? []) {
        expect(eventIds.has(eventId)).toBe(true);
      }
    }

    for (const location of LOCATIONS) {
      for (const eventId of location.eventPool ?? []) {
        expect(eventIds.has(eventId)).toBe(true);
      }
    }
  });

  it('ensures companion event references are valid', () => {
    const eventIds = new Set(EVENT_DEFINITIONS.map(event => event.id));

    for (const companion of COMPANIONS) {
      for (const eventId of companion.passiveBonus.eventMitigation ?? []) {
        expect(eventIds.has(eventId)).toBe(true);
      }

      if (companion.personalQuestEventId) {
        expect(eventIds.has(companion.personalQuestEventId)).toBe(true);
      }
    }
  });

  it('ensures dialogue trees have valid node and next-node references', () => {
    for (const dialogue of DIALOGUES) {
      const nodeIds = new Set(Object.keys(dialogue.nodes));

      expect(nodeIds.has(dialogue.rootNodeId)).toBe(true);

      for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
        expect(node.id).toBe(nodeId);

        if (node.autoAdvanceToId) {
          expect(nodeIds.has(node.autoAdvanceToId)).toBe(true);
        }

        for (const choice of node.choices) {
          if (choice.outcome.nextNodeId) {
            expect(nodeIds.has(choice.outcome.nextNodeId)).toBe(true);
          }
        }
      }
    }
  });

  it('ensures dialogue references point to valid content', () => {
    const companionIds = new Set(COMPANIONS.map(companion => companion.id));
    const enemyIds = new Set(ENEMIES.map(enemy => enemy.id));
    const itemIds = new Set(ITEMS.map(item => item.id));
    const locationIds = new Set(LOCATIONS.map(location => location.id));
    const dialogueIds = new Set(DIALOGUES.map(dialogue => dialogue.id));

    for (const dialogue of DIALOGUES) {
      for (const node of Object.values(dialogue.nodes)) {
        for (const choice of node.choices) {
          const companionEffect = choice.outcome.companionEffect;
          if (companionEffect?.type === 'recruit') {
            expect(companionIds.has(companionEffect.companionId)).toBe(true);
          }

          const eventTrigger = choice.outcome.eventTrigger;
          if (!eventTrigger) {
            continue;
          }

          if (eventTrigger.type === 'combat') {
            expect(enemyIds.has(eventTrigger.payload)).toBe(true);
          }

          if (eventTrigger.type === 'item_gain') {
            expect(itemIds.has(eventTrigger.payload)).toBe(true);
          }

          if (eventTrigger.type === 'unlock_location') {
            expect(locationIds.has(Number(eventTrigger.payload))).toBe(true);
          }
        }
      }
    }

    for (const event of EVENT_DEFINITIONS) {
      if (event.interactiveHandlerId === 'dialogue_handler') {
        expect(dialogueIds.has(event.id)).toBe(true);
      }
    }

    for (const item of ITEMS) {
      if (item.questDialogueId) {
        expect(dialogueIds.has(item.questDialogueId)).toBe(true);
      }
    }
  });

  it('ensures shops point to valid locations', () => {
    const locationIds = new Set(LOCATIONS.map(location => location.id));

    for (const shop of getAllShops()) {
      expect(locationIds.has(shop.locationId)).toBe(true);
    }
  });

  it('ensures every shop stock entry references a valid item', () => {
    const itemIds = new Set(ITEMS.map(item => item.id));

    for (const shop of getAllShops()) {
      for (const stock of shop.stock) {
        expect(itemIds.has(stock.itemId)).toBe(true);
      }
    }
  });

  it('ensures every enemy packCallSpawnId references a valid enemy', () => {
    const enemyIds = new Set(ENEMIES.map(enemy => enemy.id));

    for (const enemy of ENEMIES) {
      if (enemy.packCallSpawnId) {
        expect(enemyIds.has(enemy.packCallSpawnId)).toBe(true);
      }
    }
  });

  it('ensures every boss loot item references a valid item', () => {
    const itemIds = new Set(ITEMS.map(item => item.id));

    for (const enemy of ENEMIES) {
      if (enemy.bossLoot) {
        for (const itemId of enemy.bossLoot) {
          expect(itemIds.has(itemId)).toBe(true);
        }
      }
    }
  });

  it('ensures enum-backed fields contain valid values', () => {
    const eventTypes = new Set(Object.values(EventType));
    const resolutionTypes = new Set(Object.values(ResolutionType));
    const weatherTypes = new Set(Object.values(WeatherType));
    const companionArchetypes = new Set(Object.values(CompanionArchetype));
    const enemyBehaviors = new Set(Object.values(EnemyBehavior));
    const itemCategories = new Set(Object.values(ItemCategory));
    const itemSlots = new Set(Object.values(ItemSlot));
    const locationTypes = new Set(['town', 'settlement', 'wilderness', 'dungeon']);

    for (const event of EVENT_DEFINITIONS) {
      expect(eventTypes.has(event.type)).toBe(true);
      expect(resolutionTypes.has(event.resolutionType)).toBe(true);

      for (const weather of event.conditions.requiredWeather ?? []) {
        expect(weatherTypes.has(weather)).toBe(true);
      }

      for (const locationType of event.conditions.locationTypes ?? []) {
        expect(locationTypes.has(locationType)).toBe(true);
      }
    }

    for (const companion of COMPANIONS) {
      expect(companionArchetypes.has(companion.archetype)).toBe(true);
    }

    for (const enemy of ENEMIES) {
      expect(enemyBehaviors.has(enemy.behavior)).toBe(true);
    }

    for (const item of ITEMS) {
      expect(itemCategories.has(item.category)).toBe(true);
      if (item.slot) {
        expect(itemSlots.has(item.slot)).toBe(true);
      }
    }

    for (const dialogue of TRAVEL_DIALOGUES) {
      if (dialogue.speakerArchetype) {
        expect(companionArchetypes.has(dialogue.speakerArchetype)).toBe(true);
      }

      for (const locationType of dialogue.conditions.locationTypes ?? []) {
        expect(locationTypes.has(locationType)).toBe(true);
      }
    }
  });

  it('keeps boss events aligned with boss locations and map metadata', () => {
    const bossEntries = Object.entries(BOSS_EVENT_MAP).map(([locationId, eventId]) => ({
      locationId: Number(locationId),
      eventId,
    }));

    for (const boss of bossEntries) {
      const event = EVENT_DEFINITIONS.find(entry => entry.id === boss.eventId);
      const location = LOCATIONS.find(entry => entry.id === boss.locationId);

      expect(event?.conditions.minLocationId).toBe(boss.locationId);
      expect(location?.actions.hasBossFight).toBe(true);
    }
  });

  it('keeps region metadata aligned with the location list', () => {
    const allCoveredIds = REGIONS.flatMap(region =>
      Array.from(
        { length: region.locationRange[1] - region.locationRange[0] + 1 },
        (_, index) => region.locationRange[0] + index,
      ),
    );

    expect(allCoveredIds).toEqual(LOCATIONS.map(location => location.id));
  });
});
