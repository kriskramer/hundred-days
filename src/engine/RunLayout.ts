import { getAllShops, type ShopStockEntry } from '../data/shops';
import { nextMulberry32 } from './Random';

export interface PathShortcut {
  from: number;
  to: number;
  label: string;
  perceptionThreshold: number;
  scenarioId?: string;
}

export interface NpcSlot {
  locationId: number;
  npcEventId: string;
  arcStage: number;
}

export interface DetourDefinition {
  forkAt: number;
  rejoinAt: number;
  threadId: string;
  label: string;
  rumor?: string;
  dialogueId: string;
  storyFlag: string;
  moraleDelta?: number;
  foodDelta?: number;
}

export interface SagaThreadBeat {
  minLoc: number;
  maxLoc: number;
  eventId: string;
  requiredFlag?: string;
  forbiddenFlag?: string;
}

export interface SagaThread {
  threadId: string;
  label: string;
  beats: SagaThreadBeat[];
}

export type RoamingMerchantArchetypeId =
  | 'roadside-provisions'
  | 'battlefield-surplus'
  | 'pilgrim-curios'
  | 'shadow-peddler';

export interface RoamingMerchant {
  id: string;
  locationId: number;
  merchantName: string;
  archetypeId: RoamingMerchantArchetypeId;
  stock: ShopStockEntry[];
}

export interface RunLayout {
  npcSlots: NpcSlot[];
  roamingMerchants: RoamingMerchant[];
  activeShortcuts: PathShortcut[];
  eliteSpawns: Array<{ locationId: number; enemyType: string }>;
  activeDetours: DetourDefinition[];
  sagaThreads: SagaThread[];
}

export interface LegacyRunLayout {
  npcSlots: Array<{ locationId: number; npcEventId: string; arcStage?: number }>;
  merchantLocations?: number[];
  roamingMerchants?: RoamingMerchant[];
  activeShortcuts: PathShortcut[];
  eliteSpawns: Array<{ locationId: number; enemyType: string }>;
  activeDetours?: DetourDefinition[];
  sagaThreads?: SagaThread[];
}

interface RoamingMerchantArchetype {
  id: RoamingMerchantArchetypeId;
  stock: ShopStockEntry[];
}

const ROAMING_MERCHANT_ARCHETYPES: RoamingMerchantArchetype[] = [
  {
    id: 'roadside-provisions',
    stock: [
      { itemId: 'dried_rations', maxQuantity: 5 },
      { itemId: 'hunters_jerky', maxQuantity: 3 },
      { itemId: 'healing_potion', maxQuantity: 2 },
      { itemId: 'warm_cloak', maxQuantity: 1 },
      { itemId: 'travelers_pack', maxQuantity: 1 },
    ],
  },
  {
    id: 'battlefield-surplus',
    stock: [
      { itemId: 'healing_potion', maxQuantity: 2 },
      { itemId: 'battle_draught', maxQuantity: 2 },
      { itemId: 'flash_powder', maxQuantity: 2 },
      { itemId: 'smoke_bomb', maxQuantity: 2 },
      { itemId: 'chainmail', maxQuantity: 1 },
    ],
  },
  {
    id: 'pilgrim-curios',
    stock: [
      { itemId: 'hearty_meal', maxQuantity: 2 },
      { itemId: 'spirit_tonic', maxQuantity: 2 },
      { itemId: 'holy_water', maxQuantity: 1 },
      { itemId: 'stone_of_comfort', maxQuantity: 1 },
      { itemId: 'lucky_coin', maxQuantity: 1 },
    ],
  },
  {
    id: 'shadow-peddler',
    stock: [
      { itemId: 'greater_healing_potion', maxQuantity: 1 },
      { itemId: 'battle_draught', maxQuantity: 2 },
      { itemId: 'silver_blade', maxQuantity: 1 },
      { itemId: 'scout_kit', maxQuantity: 1 },
      { itemId: 'merchants_ring', maxQuantity: 1 },
    ],
  },
];

const ROAMING_MERCHANT_NAMES = [
  'Mira of the Red Cart',
  'Old Bran the Tinker',
  'Sable the Quiet Trader',
  'Brother Caldus',
  'Ysra of the Crossroads',
  'Toma the Packhand',
] as const;

const PERMANENT_SHOP_IDS = new Set(getAllShops().map(shop => shop.locationId));

const DETOUR_CANDIDATES: DetourDefinition[] = [
  {
    forkAt: 22,
    rejoinAt: 25,
    threadId: 'refugee_trail',
    label: 'Refugee Trail',
    rumor: 'They say a side path near location 22 leads through a refugee camp — slower, but safer.',
    dialogueId: 'detour_refugee_trail',
    storyFlag: 'detour_refugee_trail',
    moraleDelta: 5,
    foodDelta: -1,
  },
  {
    forkAt: 45,
    rejoinAt: 48,
    threadId: 'marsh_abbey',
    label: 'Abbey Ruins',
    rumor: 'Pilgrims speak of abbey ruins off the road near location 45.',
    dialogueId: 'detour_marsh_abbey',
    storyFlag: 'detour_marsh_abbey',
    moraleDelta: 8,
  },
  {
    forkAt: 72,
    rejoinAt: 75,
    threadId: 'smuggler_debt',
    label: 'Smuggler\'s Cut',
    rumor: 'A smuggler\'s cut bypasses the ridge near location 72 — if you dare.',
    dialogueId: 'detour_smuggler_debt',
    storyFlag: 'detour_smuggler_debt',
    moraleDelta: -3,
    foodDelta: 1,
  },
  {
    forkAt: 88,
    rejoinAt: 91,
    threadId: 'haunted_ford',
    label: 'Haunted Ford',
    rumor: 'Locals avoid the ford near location 88. Some travelers swear by it.',
    dialogueId: 'detour_haunted_ford',
    storyFlag: 'detour_haunted_ford',
    moraleDelta: -5,
  },
];

const SAGA_THREAD_CANDIDATES: SagaThread[] = [
  {
    threadId: 'missing_courier',
    label: 'The Missing Courier',
    beats: [
      { minLoc: 12, maxLoc: 28, eventId: 'saga_courier_1' },
      { minLoc: 35, maxLoc: 55, eventId: 'saga_courier_2', requiredFlag: 'saga_courier_1_done' },
    ],
  },
  {
    threadId: 'strange_lights',
    label: 'Strange Lights',
    beats: [
      { minLoc: 50, maxLoc: 70, eventId: 'saga_lights_1' },
      { minLoc: 75, maxLoc: 95, eventId: 'saga_lights_2', requiredFlag: 'saga_lights_1_done' },
    ],
  },
  {
    threadId: 'broken_bell',
    label: 'The Broken Bell',
    beats: [
      { minLoc: 20, maxLoc: 40, eventId: 'saga_bell_1' },
      { minLoc: 60, maxLoc: 80, eventId: 'saga_bell_2', requiredFlag: 'saga_bell_1_done' },
    ],
  },
];

function cloneStock(stock: ShopStockEntry[]): ShopStockEntry[] {
  return stock.map(entry => ({ ...entry }));
}

function nextSeededIndex(state: number, length: number): { index: number; state: number } {
  const result = nextMulberry32(state);
  return {
    index: Math.floor(result.value * length),
    state: result.state,
  };
}

function getRoamingMerchantSeed(seed: number, locationId: number, index: number): number {
  const locSalt = Math.imul(locationId + 1, 0x45d9f3b);
  const idxSalt = Math.imul(index + 1, 0x9e3779b1);
  return (seed ^ locSalt ^ idxSalt) >>> 0;
}

function buildRoamingMerchant(locationId: number, seed: number, index: number): RoamingMerchant {
  let state = getRoamingMerchantSeed(seed, locationId, index);
  const archetypePick = nextSeededIndex(state, ROAMING_MERCHANT_ARCHETYPES.length);
  state = archetypePick.state;

  const namePick = nextSeededIndex(state, ROAMING_MERCHANT_NAMES.length);
  const archetype = ROAMING_MERCHANT_ARCHETYPES[archetypePick.index];

  return {
    id: `roaming_merchant_${locationId}`,
    locationId,
    merchantName: ROAMING_MERCHANT_NAMES[namePick.index],
    archetypeId: archetype.id,
    stock: cloneStock(archetype.stock),
  };
}

export function buildRoamingMerchants(locationIds: number[], seed: number): RoamingMerchant[] {
  return [...locationIds]
    .sort((a, b) => a - b)
    .map((locationId, index) => buildRoamingMerchant(locationId, seed, index));
}

export function findRoamingMerchant(
  runLayout: Pick<RunLayout, 'roamingMerchants'> | null | undefined,
  locationId: number,
): RoamingMerchant | undefined {
  return runLayout?.roamingMerchants.find(merchant => merchant.locationId === locationId);
}

function assignArcStages(
  slots: Array<{ locationId: number; npcEventId: string }>,
): NpcSlot[] {
  const byNpc = new Map<string, Array<{ locationId: number; npcEventId: string }>>();
  for (const slot of slots) {
    const group = byNpc.get(slot.npcEventId) ?? [];
    group.push(slot);
    byNpc.set(slot.npcEventId, group);
  }

  const result: NpcSlot[] = [];
  for (const [, group] of byNpc) {
    group.sort((a, b) => a.locationId - b.locationId);
    group.forEach((slot, index) => {
      result.push({ ...slot, arcStage: index + 1 });
    });
  }

  return result.sort((a, b) => a.locationId - b.locationId);
}

export function normalizeRunLayout(layout: LegacyRunLayout, seed: number): RunLayout {
  const roamingMerchants = Array.isArray(layout.roamingMerchants)
    ? [...layout.roamingMerchants]
      .sort((a, b) => a.locationId - b.locationId)
      .map(merchant => ({
        ...merchant,
        stock: cloneStock(merchant.stock),
      }))
    : buildRoamingMerchants(layout.merchantLocations ?? [], seed);

  const npcSlots: NpcSlot[] = layout.npcSlots.map(slot => ({
    locationId: slot.locationId,
    npcEventId: slot.npcEventId,
    arcStage: slot.arcStage ?? 1,
  }));

  return {
    npcSlots,
    roamingMerchants,
    activeShortcuts: layout.activeShortcuts,
    eliteSpawns: layout.eliteSpawns,
    activeDetours: layout.activeDetours ?? [],
    sagaThreads: layout.sagaThreads ?? [],
  };
}

export function generateRunLayout(seed: number): RunLayout {
  let rngState = seed >>> 0;
  function rng() {
    const res = nextMulberry32(rngState);
    rngState = res.state;
    return res.value;
  }

  const npcCandidates = [
    { minLoc: 15, maxLoc: 30, npcEventId: 'coron_priest' },
    { minLoc: 40, maxLoc: 55, npcEventId: 'coron_priest' },
    { minLoc: 75, maxLoc: 90, npcEventId: 'coron_priest' },
    { minLoc: 35, maxLoc: 50, npcEventId: 'finn_pickpocket' },
    { minLoc: 55, maxLoc: 70, npcEventId: 'finn_pickpocket' },
    { minLoc: 80, maxLoc: 95, npcEventId: 'finn_pickpocket' },
    { minLoc: 45, maxLoc: 60, npcEventId: 'sylas_collector' },
    { minLoc: 65, maxLoc: 80, npcEventId: 'sylas_collector' },
    { minLoc: 95, maxLoc: 110, npcEventId: 'sylas_collector' },
    { minLoc: 70, maxLoc: 85, npcEventId: 'griselda_herbalist' },
    { minLoc: 85, maxLoc: 100, npcEventId: 'griselda_herbalist' },
    { minLoc: 100, maxLoc: 115, npcEventId: 'griselda_herbalist' },
    { minLoc: 2, maxLoc: 10, npcEventId: 'rex_the_dog' },
    { minLoc: 10, maxLoc: 20, npcEventId: 'rex_the_dog' },
    { minLoc: 20, maxLoc: 30, npcEventId: 'rex_the_dog' },
    { minLoc: 10, maxLoc: 25, npcEventId: 'wounded_stranger' },
    { minLoc: 30, maxLoc: 45, npcEventId: 'wounded_stranger' },
    { minLoc: 50, maxLoc: 65, npcEventId: 'wounded_stranger' },
  ];

  const shuffledNpc = [...npcCandidates];
  for (let i = shuffledNpc.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledNpc[i];
    shuffledNpc[i] = shuffledNpc[j];
    shuffledNpc[j] = temp;
  }

  const numNpcSlots = 5 + Math.floor(rng() * 3);
  const selectedNpc = shuffledNpc.slice(0, numNpcSlots);

  const chosenLocs = new Set<number>();
  const rawNpcSlots = selectedNpc.map(candidate => {
    let locationId = candidate.minLoc + Math.floor(rng() * (candidate.maxLoc - candidate.minLoc + 1));
    for (let attempts = 0; attempts < 10; attempts++) {
      if (!chosenLocs.has(locationId)) break;
      locationId = candidate.minLoc + Math.floor(rng() * (candidate.maxLoc - candidate.minLoc + 1));
    }
    chosenLocs.add(locationId);
    return { locationId, npcEventId: candidate.npcEventId };
  });
  const npcSlots = assignArcStages(rawNpcSlots);

  const candidateMerchantLocs: number[] = [];
  for (let loc = 10; loc <= 120; loc++) {
    if (!PERMANENT_SHOP_IDS.has(loc)) {
      candidateMerchantLocs.push(loc);
    }
  }

  for (let i = candidateMerchantLocs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = candidateMerchantLocs[i];
    candidateMerchantLocs[i] = candidateMerchantLocs[j];
    candidateMerchantLocs[j] = temp;
  }

  const numMerchants = 3 + Math.floor(rng() * 2);
  const merchantLocations = candidateMerchantLocs.slice(0, numMerchants).sort((a, b) => a - b);
  const roamingMerchants = buildRoamingMerchants(merchantLocations, seed);
  const roamingMerchantLocationIds = new Set(roamingMerchants.map(merchant => merchant.locationId));

  const shortcutCandidates: PathShortcut[] = [
    { from: 12, to: 16, label: 'The Hidden Forest Path', perceptionThreshold: 4, scenarioId: '12_16' },
    { from: 28, to: 34, label: "The Old Smuggler's Pass", perceptionThreshold: 5, scenarioId: 'smugglers_pass' },
    { from: 40, to: 46, label: 'The Rocky Ravine Bypass', perceptionThreshold: 6, scenarioId: '40_46' },
    { from: 48, to: 54, label: 'The Abandoned Mine Shaft', perceptionThreshold: 5, scenarioId: '48_54' },
    { from: 60, to: 64, label: 'The River Forging Shallows', perceptionThreshold: 4, scenarioId: '60_64' },
    { from: 68, to: 74, label: 'The Overgrown Deer Trail', perceptionThreshold: 6, scenarioId: '68_74' },
    { from: 80, to: 86, label: 'The Forgotten Mountain Pass', perceptionThreshold: 7, scenarioId: '80_86' },
    { from: 88, to: 92, label: 'The Whispering Woods Cut', perceptionThreshold: 5, scenarioId: '88_92' },
    { from: 96, to: 102, label: 'The Shadowy Caves Shortcut', perceptionThreshold: 7, scenarioId: 'shadowy_caves' },
    { from: 104, to: 110, label: 'The Castle Moat Tunnel', perceptionThreshold: 8, scenarioId: 'castle_moat_tunnel' },
    { from: 18, to: 24, label: 'The Sunken Meadow Shortcut', perceptionThreshold: 4, scenarioId: '18_24' },
    { from: 76, to: 82, label: 'The High Cliff Ledge', perceptionThreshold: 6, scenarioId: '76_82' },
  ];

  const shuffledShortcuts = [...shortcutCandidates];
  for (let i = shuffledShortcuts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledShortcuts[i];
    shuffledShortcuts[i] = shuffledShortcuts[j];
    shuffledShortcuts[j] = temp;
  }
  const activeShortcuts = shuffledShortcuts.slice(0, 3);

  const shuffledDetours = [...DETOUR_CANDIDATES];
  for (let i = shuffledDetours.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledDetours[i];
    shuffledDetours[i] = shuffledDetours[j];
    shuffledDetours[j] = temp;
  }
  const activeDetours = shuffledDetours.slice(0, 2 + Math.floor(rng() * 2));

  const shuffledSaga = [...SAGA_THREAD_CANDIDATES];
  for (let i = shuffledSaga.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledSaga[i];
    shuffledSaga[i] = shuffledSaga[j];
    shuffledSaga[j] = temp;
  }
  const sagaThreads = shuffledSaga.slice(0, 2);

  const bossLocs = [32, 65, 93, 125];
  const candidateEliteLocs: number[] = [];
  for (let loc = 15; loc <= 110; loc++) {
    if (!PERMANENT_SHOP_IDS.has(loc) && !roamingMerchantLocationIds.has(loc) && !bossLocs.includes(loc)) {
      candidateEliteLocs.push(loc);
    }
  }

  for (let i = candidateEliteLocs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = candidateEliteLocs[i];
    candidateEliteLocs[i] = candidateEliteLocs[j];
    candidateEliteLocs[j] = temp;
  }

  const numElites = 6 + Math.floor(rng() * 3);
  const selectedEliteLocs = candidateEliteLocs.slice(0, numElites);

  const enemyTypes = [
    'Giant Spiders',
    'Wild Dogs',
    'Bandits',
    'Wolves',
    'Qanisi Warrior',
    'Goblins',
    'Orcs',
    'Ogres',
    'Wraiths',
    'Zombies',
    'Thralls',
  ];

  const eliteSpawns = selectedEliteLocs.map(locationId => {
    const enemyType = enemyTypes[Math.floor(rng() * enemyTypes.length)];
    return { locationId, enemyType };
  });

  return {
    npcSlots,
    roamingMerchants,
    activeShortcuts,
    eliteSpawns,
    activeDetours,
    sagaThreads,
  };
}

export function findDetourAtLocation(
  runLayout: RunLayout | null | undefined,
  locationId: number,
): DetourDefinition | undefined {
  return runLayout?.activeDetours?.find(d => d.forkAt === locationId);
}
