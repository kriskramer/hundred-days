import eventsJson from './events.json';
import { GameEvent } from '@engine/types';
import { LocationType } from './locations';

interface EventsDataFile {
  events: GameEvent[];
  eventPoolsByType: Partial<Record<LocationType, string[]>>;
}

function assertEventsData(value: unknown): asserts value is EventsDataFile {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid events.json: expected an object.');
  }

  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.events) || !data.eventPoolsByType || typeof data.eventPoolsByType !== 'object') {
    throw new Error('Invalid events.json: expected events array and eventPoolsByType object.');
  }

  for (const event of data.events) {
    if (!event || typeof event !== 'object') {
      throw new Error('Invalid events.json: each event must be an object.');
    }
    const entry = event as Record<string, unknown>;
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      throw new Error('Invalid events.json: malformed event entry.');
    }
  }
}

assertEventsData(eventsJson);

const DATA = eventsJson as unknown as EventsDataFile;

export const EVENT_DEFINITIONS: GameEvent[] = DATA.events;
export const EVENT_POOLS_BY_TYPE: Partial<Record<LocationType, string[]>> = DATA.eventPoolsByType;
