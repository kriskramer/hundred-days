import locationsJson from './locations.json';

export type LocationType = 'town' | 'settlement' | 'wilderness' | 'dungeon';

export type Region =
  | 'Senin Valley'
  | 'Qanisi Borderlands'
  | 'Qanisi Territory'
  | 'Eastern Wilds'
  | 'The Midlands'
  | 'The Dark Reaches'
  | 'Edge of the Known World'
  | 'Colrandrir Mountains'
  | 'The Blasted Lands';

export interface MobEncounter {
  enemyId:     string;
  aggroPct:    number;
  isCompanion?: boolean;
}

export interface LocationActions {
  canSteal:         boolean;
  huntYield:        number | null;
  restQuality:      number | null;
  travelDifficulty: number | null;
  hasBossFight:     boolean;
}

export interface Location {
  id:           number;
  name:         string;
  type:         LocationType;
  region:       Region;
  isTown:       boolean;
  hasShop:      boolean;
  mobs:         MobEncounter[];
  actions:      LocationActions;
  bossLevel:    number | null;
  locationText: string | null;
  randomTexts:  string[];
  eventPool?:   string[];
}

export interface RegionDefinition {
  name:          Region;
  locationRange: [number, number];
  description:   string;
  dangerLevel:   number;
}

interface LocationsDataFile {
  regions: RegionDefinition[];
  locations: Location[];
}

function assertLocationsData(value: unknown): asserts value is LocationsDataFile {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid locations.json: expected an object.');
  }

  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.regions) || !Array.isArray(data.locations)) {
    throw new Error('Invalid locations.json: expected regions and locations arrays.');
  }

  for (const region of data.regions) {
    if (!region || typeof region !== 'object') {
      throw new Error('Invalid locations.json: each region must be an object.');
    }
    const entry = region as Record<string, unknown>;
    if (typeof entry.name !== 'string') {
      throw new Error('Invalid locations.json: region.name must be a string.');
    }
  }

  for (const location of data.locations) {
    if (!location || typeof location !== 'object') {
      throw new Error('Invalid locations.json: each location must be an object.');
    }
    const entry = location as Record<string, unknown>;
    if (typeof entry.id !== 'number' || typeof entry.name !== 'string') {
      throw new Error('Invalid locations.json: malformed location entry.');
    }
  }
}

assertLocationsData(locationsJson);

const DATA = locationsJson as unknown as LocationsDataFile;

export const REGIONS: RegionDefinition[] = DATA.regions;
export const LOCATIONS: Location[] = DATA.locations;

export function findLocation(id: number): Location | undefined {
  return LOCATIONS.find(location => location.id === id);
}

export function getLocation(id: number): Location {
  const location = findLocation(id);
  if (!location) {
    return {
      id,
      name: `Location ${id}`,
      type: 'wilderness',
      region: getRegion(id).name,
      isTown: false,
      hasShop: false,
      mobs: [],
      actions: {
        canSteal: false,
        huntYield: 1.0,
        restQuality: 0.6,
        travelDifficulty: 1,
        hasBossFight: false,
      },
      bossLevel: null,
      locationText: 'The road continues.',
      randomTexts: [],
    };
  }

  return location;
}

export function getRegion(locationId: number): RegionDefinition {
  return REGIONS.find(
    region => locationId >= region.locationRange[0] && locationId <= region.locationRange[1],
  ) ?? REGIONS[REGIONS.length - 1];
}

export const SHOP_LOCATION_IDS: number[] = LOCATIONS.filter(location => location.hasShop).map(location => location.id);
export const WILDERNESS_LOCATION_IDS: number[] = LOCATIONS
  .filter(location => location.type === 'wilderness')
  .map(location => location.id);
export const TOWN_LOCATION_IDS: number[] = LOCATIONS.filter(location => location.isTown).map(location => location.id);
