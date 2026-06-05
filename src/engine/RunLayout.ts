import { nextMulberry32 } from './Random';

export interface PathShortcut {
  from: number;
  to: number;
  label: string;
  perceptionThreshold: number;
}

export interface RunLayout {
  npcSlots: Array<{ locationId: number; npcEventId: string }>;
  merchantLocations: number[];       // subset of locationIds
  activeShortcuts: Array<PathShortcut>;
  eliteSpawns: Array<{ locationId: number; enemyType: string }>;
}

export function generateRunLayout(seed: number): RunLayout {
  let rngState = seed >>> 0;
  function rng() {
    const res = nextMulberry32(rngState);
    rngState = res.state;
    return res.value;
  }

  // 1. NPC Slots (18 candidates pointing to 6 distinct NPC event dialogues)
  const npcCandidates = [
    // Coron, the Wandering Priest
    { minLoc: 15, maxLoc: 30, npcEventId: 'coron_priest' },
    { minLoc: 40, maxLoc: 55, npcEventId: 'coron_priest' },
    { minLoc: 75, maxLoc: 90, npcEventId: 'coron_priest' },
    // Finn, the Quick-Fingered Kid
    { minLoc: 35, maxLoc: 50, npcEventId: 'finn_pickpocket' },
    { minLoc: 55, maxLoc: 70, npcEventId: 'finn_pickpocket' },
    { minLoc: 80, maxLoc: 95, npcEventId: 'finn_pickpocket' },
    // Sylas, the Shady Collector
    { minLoc: 45, maxLoc: 60, npcEventId: 'sylas_collector' },
    { minLoc: 65, maxLoc: 80, npcEventId: 'sylas_collector' },
    { minLoc: 95, maxLoc: 110, npcEventId: 'sylas_collector' },
    // Griselda, the Herbalist
    { minLoc: 70, maxLoc: 85, npcEventId: 'griselda_herbalist' },
    { minLoc: 85, maxLoc: 100, npcEventId: 'griselda_herbalist' },
    { minLoc: 100, maxLoc: 115, npcEventId: 'griselda_herbalist' },
    // Rex the Dog
    { minLoc: 2, maxLoc: 10, npcEventId: 'rex_the_dog' },
    { minLoc: 10, maxLoc: 20, npcEventId: 'rex_the_dog' },
    { minLoc: 20, maxLoc: 30, npcEventId: 'rex_the_dog' },
    // Wounded Stranger
    { minLoc: 10, maxLoc: 25, npcEventId: 'wounded_stranger' },
    { minLoc: 30, maxLoc: 45, npcEventId: 'wounded_stranger' },
    { minLoc: 50, maxLoc: 65, npcEventId: 'wounded_stranger' },
  ];

  // Shuffle npcCandidates using Fisher-Yates with rng()
  const shuffledNpc = [...npcCandidates];
  for (let i = shuffledNpc.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledNpc[i];
    shuffledNpc[i] = shuffledNpc[j];
    shuffledNpc[j] = temp;
  }

  // Select 5-7 npc slots. Let's select e.g. 6 of them.
  const numNpcSlots = 5 + Math.floor(rng() * 3); // 5, 6, or 7
  const selectedNpc = shuffledNpc.slice(0, numNpcSlots);

  // Assign unique locationIds within ranges, ensuring no overlap of locationIds if possible
  const chosenLocs = new Set<number>();
  const npcSlots = selectedNpc.map(candidate => {
    let locationId = candidate.minLoc + Math.floor(rng() * (candidate.maxLoc - candidate.minLoc + 1));
    // Simple retry to avoid duplicate locationIds
    for (let attempts = 0; attempts < 10; attempts++) {
      if (!chosenLocs.has(locationId)) break;
      locationId = candidate.minLoc + Math.floor(rng() * (candidate.maxLoc - candidate.minLoc + 1));
    }
    chosenLocs.add(locationId);
    return { locationId, npcEventId: candidate.npcEventId };
  });

  // 2. Merchant Locations
  // Pick 3-4 locations in range 10-120 excluding permanent shop locations (14, 35, 54, 74, 93)
  const permanentShops = [14, 35, 54, 74, 93];
  const candidateMerchantLocs: number[] = [];
  for (let loc = 10; loc <= 120; loc++) {
    if (!permanentShops.includes(loc)) {
      candidateMerchantLocs.push(loc);
    }
  }

  // Shuffle candidateMerchantLocs
  for (let i = candidateMerchantLocs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = candidateMerchantLocs[i];
    candidateMerchantLocs[i] = candidateMerchantLocs[j];
    candidateMerchantLocs[j] = temp;
  }
  const numMerchants = 3 + Math.floor(rng() * 2); // 3 or 4
  const merchantLocations = candidateMerchantLocs.slice(0, numMerchants).sort((a, b) => a - b);

  // 3. Path Shortcuts
  const shortcutCandidates: PathShortcut[] = [
    { from: 12, to: 16, label: "The Hidden Forest Path", perceptionThreshold: 4 },
    { from: 28, to: 34, label: "The Old Smuggler's Pass", perceptionThreshold: 5 },
    { from: 40, to: 46, label: "The Rocky Ravine Bypass", perceptionThreshold: 6 },
    { from: 48, to: 54, label: "The Abandoned Mine Shaft", perceptionThreshold: 5 },
    { from: 60, to: 64, label: "The River Forging Shallows", perceptionThreshold: 4 },
    { from: 68, to: 74, label: "The Overgrown Deer Trail", perceptionThreshold: 6 },
    { from: 80, to: 86, label: "The Forgotten Mountain Pass", perceptionThreshold: 7 },
    { from: 88, to: 92, label: "The Whispering Woods Cut", perceptionThreshold: 5 },
    { from: 96, to: 102, label: "The Shadowy Caves Shortcut", perceptionThreshold: 7 },
    { from: 104, to: 110, label: "The Castle Moat Tunnel", perceptionThreshold: 8 },
    { from: 18, to: 24, label: "The Sunken Meadow Shortcut", perceptionThreshold: 4 },
    { from: 76, to: 82, label: "The High Cliff Ledge", perceptionThreshold: 6 },
  ];

  // Shuffle shortcutCandidates
  const shuffledShortcuts = [...shortcutCandidates];
  for (let i = shuffledShortcuts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffledShortcuts[i];
    shuffledShortcuts[i] = shuffledShortcuts[j];
    shuffledShortcuts[j] = temp;
  }
  const activeShortcuts = shuffledShortcuts.slice(0, 3);

  // 4. Roaming Elite Mobs
  // generateRunLayout picks 6–8 elite spawns from wilderness/dungeon locations (locs 15–110)
  const bossLocs = [32, 65, 93, 125];
  const candidateEliteLocs: number[] = [];
  for (let loc = 15; loc <= 110; loc++) {
    if (!permanentShops.includes(loc) && !merchantLocations.includes(loc) && !bossLocs.includes(loc)) {
      candidateEliteLocs.push(loc);
    }
  }

  // Shuffle candidateEliteLocs
  for (let i = candidateEliteLocs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = candidateEliteLocs[i];
    candidateEliteLocs[i] = candidateEliteLocs[j];
    candidateEliteLocs[j] = temp;
  }

  const numElites = 6 + Math.floor(rng() * 3); // 6, 7, or 8
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
    'Thralls'
  ];

  const eliteSpawns = selectedEliteLocs.map(locationId => {
    const enemyType = enemyTypes[Math.floor(rng() * enemyTypes.length)];
    return { locationId, enemyType };
  });

  return {
    npcSlots,
    merchantLocations,
    activeShortcuts,
    eliteSpawns,
  };
}
