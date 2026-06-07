# PLAN_FINAL — Master Refactoring & JSON Migration Plan

This document is the authoritative implementation specification for the
comprehensive refactoring and JSON data migration of **100 Days to Save the
World**. It supersedes PLAN1, PLAN2, PLAN3, and incorporates all decisions
recorded in PLAN_COMMON and PLAN_REFINE.

---

## 1. Architectural Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| JSON file location | `src/data/` | Type-imported alongside existing loaders; `src/assets/` stays for binary assets |
| Dialogue file structure | Single `src/data/dialogues.json` | Simpler loader, one import; per-NPC split rejected |
| Balance constants | Hybrid: `GameBalance.ts` + `config.json` | Formula-coupled values stay in TS for compile-time safety; pure tables go to JSON |
| JSON validation | Both: Jest suite + runtime throw-guards | Jest for cross-reference integrity; runtime guards in `getX(id)` helpers |
| NG+ scope this pass | Schema only — gameplay deferred | `metaProgress` field added to `GameState`; NG+ scaling implemented in future pass |
| Sound | Out of scope | No `sfxId` fields added to any JSON schema |
| Regional difficulty scaling | Deferred | Enemy scaling formula unchanged; revisit after data migration |

---

## 2. New Game+ — Schema Foundation (Gameplay Deferred)

NG+ gameplay (increased difficulty, player bonus) is deferred to a future pass.
This pass adds only the schema infrastructure so it can be added later without
a disruptive save migration.

### What lands now

Add `metaProgress: MetaProgress | null` to `GameState` in `types.ts`:

```typescript
export interface MetaProgress {
  victoriesCount: number;
  ngPlusLevel: number;          // 0 = base game, 1 = NG+, 2 = NG++, etc.
  unlockedCompanionIds: string[]; // reserved — companion unlocks via victories
}
```

- `SaveEngine` serializes and deserializes `metaProgress` alongside all other
  `GameState` fields (no separate AsyncStorage key).
- Schema migration: bump `SCHEMA_VERSION`, add a migration that sets
  `metaProgress = null` for any save that lacks the field.
- `createNewGameState()` accepts an optional `metaProgress` argument and copies
  it into the new run's state, preserving progress across runs.
- `TurnEngine.endRun()` increments `metaProgress.victoriesCount` on victory at
  location 125 before saving.

### What does NOT land now

- Title screen NG+ difficulty selector
- `difficultyMultipliers` in `GameState`
- Enemy HP/damage scaling by NG+ level
- Any NG+ bonus or unlock logic

---

## 3. JSON Schemas

All JSON files reside in `src/data/`. Each has a thin TypeScript loader
(`src/data/foo.ts`) that imports the JSON, asserts the type, and re-exports
accessor helpers. No file outside a loader imports JSON directly.

`resolveJsonModule: true` must be confirmed in `tsconfig.json` before Phase 1.

---

### 3a. `items.json`

Key fields added beyond the existing `ItemDefinition` shape:

```json
[
  {
    "id": "healing_potion",
    "name": "Healing Potion",
    "description": "Restores 25 health immediately.",
    "category": "consumable",
    "slot": null,
    "activeEffect": {
      "type": "restore_health",
      "value": 25,
      "targetSelf": true
    },
    "passiveEffects": [],
    "isConsumable": true,
    "shopPrice": 20,
    "sellPrice": 8,
    "maxStack": 5,
    "combatUsesPerBattle": 2,
    "usableInCombat": true,
    "usableOnRoad": false,
    "stealable": true,
    "unique": false,
    "dropSources": []
  }
]
```

**New fields vs. current `ItemDefinition`:**
- `combatUsesPerBattle` — max uses per battle (null = unlimited). Suggested
  starting values: `healing_potion: 2`, `greater_healing_potion: 1`,
  `battle_draught: 1`, `flash_powder: null`, `smoke_bomb: null`.
- `usableInCombat` / `usableOnRoad` — enforce where items can be activated.
- `stealable` — replaces the hardcoded 4-item steal pool in `TurnEngine`.
- `dropSources` — array of enemy IDs that can drop this item on defeat.

---

### 3b. `enemies.json`

```json
[
  {
    "id": "wolves",
    "name": "Wolves",
    "description": "Silent and coordinated.",
    "baseHP": 20,
    "baseAttack": 9,
    "baseDefense": 3,
    "baseSpeed": 9,
    "behavior": "pack",
    "minLocationId": 10,
    "scaleFactor": 1.15,
    "abilities": [
      {
        "id": "hamstring",
        "name": "Hamstring",
        "probability": 0.3,
        "damageMultiplier": 0.8,
        "specialEffect": "stun"
      },
      {
        "id": "howl",
        "name": "Howl",
        "probability": 0.2,
        "damageMultiplier": 0.0,
        "specialEffect": "pack_call"
      }
    ],
    "packCallSpawnId": "wolves",
    "packCallSpawnMaxPerCombat": 1,
    "immuneToNegotiate": true,
    "immuneToFlee": false,
    "physicalResistance": 0.0,
    "moraleDamageOnSight": 2,
    "xpReward": 20,
    "goldReward": 0,
    "foodReward": 3,
    "encounterTexts": ["Yellow eyes in the dark. Then a second pair. Then more."],
    "defeatText": "The wolves melt back into the forest.",
    "victoryText": "The pack closes in from all sides.",
    "tags": ["beast"],
    "isBoss": false
  }
]
```

**New/changed fields:**
- `packCallSpawnId` — enemy ID to spawn when `pack_call` ability fires. Points
  to an entry in this same file. Validated by the data integrity suite.
- `packCallSpawnMaxPerCombat` — maximum additional enemies that can be spawned
  per combat via PackCall (prevents infinite chaining).
- `scaleFactor` replaces the old inline `scaling` field for clarity.
- Boss entries include `isBoss: true` and `bossLoot: string[]` (item IDs).
- Orc Warchief gets `baseHP: 70` (normalizes to the same
  `baseHP + playerLevel × 15` formula used by all other bosses).

---

### 3c. `companions.json`

```json
[
  {
    "id": "mira_thorn",
    "name": "Mira Thorn",
    "archetype": "scout",
    "description": "A shadow in the dark.",
    "level": { "current": 1, "xp": 0, "xpToNext": 30 },
    "loyalty": { "value": 55, "desertsBelow": 15, "complainsBelow": 35 },
    "passiveBonus": {
      "luckModifier": 0.06,
      "goldFindBonus": 0.0,
      "moralePerTurn": 0,
      "foragingBonus": 0,
      "healthPerTurn": 0,
      "foodCostReduction": 0.0,
      "movementBonus": 0.0
    },
    "guaranteedFleeAtLevel": 5,
    "foodCostPerTurn": 1.0,
    "combatPower": 14,
    "loyaltyGains": {
      "onMoraleHigh": 2,
      "onReputationMatch": 2,
      "onRally": 1,
      "onCombatVictory": 2
    },
    "loyaltyLosses": {
      "onStarvation": 6,
      "onMoraleLow": 2,
      "onReputationMismatch": 3,
      "onBrokenPromise": 8
    },
    "preferredReputation": { "max": 50 },
    "recruitRequirements": { "maxReputation": 50 }
  }
]
```

**Key fields:**
- `guaranteedFleeAtLevel` — replaces the hardcoded `mira_thorn` ID check in
  `CombatEngine.resolveFlee()`. Any companion with this field at or above the
  specified level grants guaranteed flee.
- `goldFindBonus` is a **decimal percentage** (`0.04` = +4%). All companions
  and items must use this unit consistently. UI displays as "+4% gold".
- `passiveBonus` shape must exactly match the fields consumed by
  `computeEquippedBonuses()` / `sumEquippedModifiers()`.

---

### 3d. `locations.json`

Shape matches existing `Location` type with one change:

```json
[
  {
    "id": 10,
    "name": "Qanisi Border Post",
    "type": "settlement",
    "region": "Qanisi Borderlands",
    "isTown": false,
    "hasShop": false,
    "mobs": [
      { "enemyId": "bandits", "aggroPct": 0.4 },
      { "enemyId": "wolves",  "aggroPct": 0.2 }
    ],
    "actions": {
      "canSteal": false,
      "huntYield": 2,
      "restQuality": 0.8,
      "travelDifficulty": 1.2
    },
    "bossLevel": null,
    "locationText": "The border post is abandoned. Tracks in the mud.",
    "randomTexts": ["Wind carries distant howling.", "The gate hangs open."]
  }
]
```

**Change:** `mobs[]` entries now carry `enemyId` (validated against `enemies.json`)
instead of loose string names. `aggroPct` is the probability of encountering this
mob type when a combat event triggers at this location.

---

### 3e. `shops.json`

```json
[
  {
    "id": "okuna_general",
    "locationId": 1,
    "merchantName": "The Dockside Trader",
    "stock": [
      { "itemId": "dried_rations",    "maxQuantity": 5 },
      { "itemId": "healing_potion",   "maxQuantity": 3 },
      { "itemId": "traveler_blade",   "maxQuantity": 1 },
      { "itemId": "warm_cloak",       "maxQuantity": 1 }
    ],
    "goldFindMultiplier": 1.0
  }
]
```

This replaces the implicit "all items with a buyPrice are available everywhere"
behavior. `ItemSystem.getShopInventory(locationId)` loads from this registry.

---

### 3f. `events.json`

Shape matches existing `GameEvent` with the inline array removed from
`EventSystem.ts`:

```json
[
  {
    "id": "abandoned_camp",
    "type": "resource_find",
    "name": "Abandoned Camp",
    "probability": 0.12,
    "conditions": {
      "maxDay": 80,
      "forbiddenStatusEffects": ["Well-Fed"]
    },
    "passiveOutcome": {
      "narrative": "Whoever camped here left in a hurry.",
      "resourceDeltas": { "food": 3, "gold": 5 },
      "moraleChange": 2
    },
    "isInteractive": false,
    "repeatable": true,
    "tags": ["resource"]
  }
]
```

---

### 3g. `dialogues.json`

Single file containing all dialogue trees as an array. `DialogueEngine` loads
this one file at startup.

```json
[
  {
    "id": "rex_the_dog",
    "triggerType": "location",
    "triggerLocationIds": [2, 3, 4],
    "conditions": {
      "notAlreadyMet": true,
      "forbiddenCompanionId": "rex"
    },
    "nodes": {
      "root": {
        "id": "root",
        "text": "A mangy dog blocks the road, tail wagging hopefully.",
        "autoAdvanceMs": null,
        "choices": [
          {
            "id": "take",
            "text": "Take the dog with you.",
            "tone": "heroic",
            "conditions": {},
            "outcome": {
              "nextNodeId": "end",
              "recruitCompanionId": "rex",
              "moraleChange": 5,
              "reputationChange": 3,
              "flagsSet": ["rex_recruited"]
            }
          }
        ]
      },
      "end": {
        "id": "end",
        "text": "Rex leaps forward, tail a blur.",
        "autoAdvanceMs": 1800,
        "choices": []
      }
    }
  }
]
```

**ID freeze policy:** All dialogue IDs and node IDs are treated as primary keys.
Once the file is created, IDs are never renamed — only deprecated (flagged
`"deprecated": true`). The data integrity suite enforces that all
`nextNodeId`, `recruitCompanionId`, and `flagsSet` references are valid.

---

### 3h. `config.json`

```json
{
  "xpThresholds": [0, 30, 75, 140, 230, 350, 500, 680, 900, 1200],
  "startingResources": {
    "food": 8,
    "gold": 25,
    "health": 100,
    "maxInventorySlots": 8
  },
  "bossPowerThreshold": 180,
  "bossPowerIdeal": 240,
  "levelUpChoices": [
    { "id": "strength",   "label": "Strength",   "stat": "attack",    "bonus": 3 },
    { "id": "endurance",  "label": "Endurance",  "stat": "defense",   "bonus": 3 },
    { "id": "agility",    "label": "Agility",    "stat": "speed",     "bonus": 3 },
    { "id": "leadership", "label": "Leadership", "stat": "leadership","bonus": 2 },
    { "id": "vitality",   "label": "Vitality",   "stat": "maxHealth", "bonus": 15 },
    { "id": "fortune",    "label": "Fortune",    "stat": "luck",      "bonus": 5 },
    { "id": "resilience", "label": "Resilience", "stat": "defense",   "bonus": 2 }
  ]
}
```

---

### 3i. `GameBalance.ts`

TypeScript `as const` — formula-coupled values only:

```typescript
export const GameBalance = {
  // Movement
  BASE_FOOD_COST_PER_MOVE:       1.0,
  FORCED_MARCH_FOOD_MULTIPLIER:  1.5,
  SHORTCUT_FOOD_COST:            2.0,
  MAX_LOCATIONS_PER_TURN:        3,

  // Combat
  CRIT_CHANCE:                   0.10,
  CRIT_MULTIPLIER:               1.75,
  DAMAGE_VARIANCE_MIN:           0.80,
  DAMAGE_VARIANCE_MAX:           1.20,
  DEFEND_DAMAGE_REDUCTION:       0.40,
  FLEE_BASE_CHANCE:              0.40,
  FLEE_SPEED_BONUS_PER_POINT:    0.05,
  FLEE_SCOUT_BONUS:              0.15,
  SURPRISE_ROUND_THRESHOLD:      0.04,
  BARD_ATTACK_BONUS:             1,      // flat attack bonus per round with Bard

  // Morale / Reputation
  DREAD_MORALE_PENALTY_PER_TURN: 3,
  DREAD_TRIGGER_DAY:             70,
  DREAD_PACE_RATIO:              1.5,
  RALLY_BASE_MORALE_GAIN:        10,
  RALLY_LEADERSHIP_MULTIPLIER:   2,

  // Starvation
  STARVATION_HEALTH_BASE:        10,
  STARVATION_HEALTH_PER_TURN:    5,
  STARVATION_HEALTH_MAX:         40,
  STARVATION_MORALE_BASE:        8,
  STARVATION_MORALE_PER_TURN:    2,
  STARVATION_MORALE_MAX:         20,
} as const;
```

---

## 4. Engine Changes

### 4a. Travel — Decompose `resolveMove()`

Extract from `TurnEngine` into `src/engine/helpers/TravelCalculator.ts`:

```typescript
// Returns total food cost for moving N locations
calculateFoodCostForMove(state: GameState, locationsToMove: number, forcedMarch: boolean): number

// Returns companion food cost delta for N locations traveled
applyCompanionFoodCosts(state: GameState, locationsToMove: number): ResourceDelta

// Returns true if the seeded RNG hits the luck threshold for a 3rd location
rollLucky3rdLocation(state: GameState): boolean

// Returns the first uncleared boss location in [currentLoc+1 .. targetLoc], or null
findBossCheckpoint(currentLoc: number, targetLoc: number, cleared: Set<number>): number | null
```

`resolveMove()` in `TurnEngine` becomes a coordinator calling these in sequence.

### 4b. Shared `ConditionEvaluator`

`DialogueEngine` and `EventSystem` each implement condition evaluation with ~70%
overlapping logic. Create `src/engine/ConditionEvaluator.ts`:

```typescript
export function evalConditions(conditions: Conditions, gameState: GameState): boolean
```

Both systems call this function. Adding a new condition type (e.g., `minCompanions`)
requires one change in one file.

### 4c. `sumEquippedModifiers` Helper

```typescript
export function sumEquippedModifiers<K extends keyof ItemPassiveEffect>(
  equipped: ItemPassiveEffect[],
  key: K
): number {
  return equipped.reduce((sum, e) => sum + ((e[key] as number) ?? 0), 0);
}
```

Replaces per-effect if/else chains in `CombatEngine` and `TurnEngine`.

### 4d. Combat — PackCall Spawning

When an ability with `specialEffect: "pack_call"` fires, `CombatEngine` spawns
one additional enemy using the triggering enemy's `packCallSpawnId` field:

```typescript
// In CombatEngine, after resolving the PackCall ability:
const spawnDef = getEnemyDefinition(triggeringEnemy.packCallSpawnId);
const alreadySpawned = combat.spawnedCount[triggeringEnemy.id] ?? 0;
if (alreadySpawned < spawnDef.packCallSpawnMaxPerCombat) {
  const newEnemy = buildCombatant(spawnDef, state.currentLocationId, state.player.level);
  combat.enemies.push(newEnemy);
  combat.spawnedCount[triggeringEnemy.id] = alreadySpawned + 1;
}
```

`CombatScreen` already renders a dynamic enemy list — verify no hard-coded
enemy-count assumptions exist in the HP bar layout.

### 4e. Combat — Bard Passive

In `CombatEngine.resolvePlayerAttack()`, check for a Bard companion before
computing damage:

```typescript
const bardPresent = state.companions.some(c => c.archetype === CompanionArchetype.Bard);
const effectiveAttack = player.attack + (bardPresent ? GameBalance.BARD_ATTACK_BONUS : 0);
```

Remove the "morale banked" log entry from the Bard's per-round handler.

### 4f. Combat — In-Combat Item Limits

`CombatEngine` maintains a transient `Map<string, number>` (`itemUsesThisBattle`)
that resets on combat start. Before activating an item:

```typescript
const def = getItemDefinition(item.definitionId);
const usedCount = itemUsesThisBattle.get(item.definitionId) ?? 0;
if (def.combatUsesPerBattle !== null && usedCount >= def.combatUsesPerBattle) {
  return; // item unavailable this battle
}
itemUsesThisBattle.set(item.definitionId, usedCount + 1);
```

`CombatScreen` disables the item button when the limit is reached. The
`Map` is not persisted — it lives only in the active `CombatEngine` instance.

### 4g. Flee — Remove `mira_thorn` Hardcode

In `CombatEngine.resolveFlee()`, replace:
```typescript
// OLD
if (companions.some(c => c.id === 'mira_thorn' && c.level >= 5)) { ... }
```
with:
```typescript
// NEW
if (companions.some(c => c.guaranteedFleeAtLevel !== undefined && c.level >= c.guaranteedFleeAtLevel)) { ... }
```

### 4h. Steal — Expand Loot Pool

In `TurnEngine.resolveSteal()`, replace the hardcoded 4-item array with:
```typescript
const stealableItems = getAllItems().filter(def => def.stealable);
const stolen = pickWithRng(stealableItems, this.state.rngState);
```

### 4i. Inventory Slot Enforcement

In `ItemSystem.addItem()`, add before the item is pushed:
```typescript
if (inventory.items.length >= inventory.maxSlots) {
  return { success: false, reason: 'inventory_full' };
}
```

### 4j. `dropItem()` Separated from Sell Logic

Add a dedicated path in `useInventoryActions`:
```typescript
dropItem(itemId: string): void {
  // Removes item from inventory. No gold transaction. No sell restrictions.
  const inv = inventoryFromResources(resources);
  const updated = removeItem(inv, itemId);
  writeInventory(updated);
}
```

### 4k. `goldFindBonus` Normalization

`goldFindBonus` is a decimal percentage multiplier (`0.04` = +4%). Audit all
companion and item definitions during migration and normalize any flat values.
UI displays render as `+X% gold`, e.g.:
```typescript
const bonusPct = Math.round(totalGoldFindBonus * 100);
label = bonusPct > 0 ? `+${bonusPct}% gold` : '';
```

### 4l. `Math.random()` Removal

Audit all files for `Math.random()` calls. Required changes:
- **Run IDs:** Replace with `Date.now().toString(36)` or a similar timestamp UUID.
  Run IDs do not need to be deterministic.
- **Turn resolution path:** Any `Math.random()` call in `TurnEngine`,
  `CombatEngine`, `EventSystem`, `DialogueEngine`, or `RunLayout` must be
  replaced with the seeded `nextMulberry32()` helper.
- **Confirm:** After cleanup, grep for `Math.random` — zero results expected in
  all engine files.

---

## 5. Data Validation

Two-layer approach:

### Layer 1 — Jest (`src/__tests__/unit/DataIntegrity.test.ts`)

Run as part of the standard test suite. Checks that do not belong at runtime:
- Every `enemyId` in `locations.json → mobs[]` exists in `enemies.json`
- Every `companionId` in dialogue outcomes exists in `companions.json`
- Every `nextNodeId` points to a node in the same dialogue tree
- Every `itemId` in `events.json`, `shops.json`, and dialogue outcomes exists in `items.json`
- Every `packCallSpawnId` in `enemies.json` references a valid enemy
- No duplicate IDs within any file
- All enum-constrained string fields (behavior, category, slot, tone, archetype) match valid values
- All dialogue `flagsSet` values are non-empty strings (content, not format)

### Layer 2 — Runtime throw-guards in loaders

Each `getX(id)` helper throws (not returns `undefined`) on an unknown ID:
```typescript
export function getEnemyDefinition(id: string): EnemyDefinition {
  const def = ENEMIES.find(e => e.id === id);
  if (!def) throw new Error(`Unknown enemy ID: "${id}"`);
  return def;
}
```

This surfaces bugs immediately at the call site even if tests are skipped.

---

## 6. Boss Fight — Verification Required

The boss fight flow is substantially implemented. This pass only verifies it
and adds loot tables — no engine rebuild needed.

**Verify:** All four boss event IDs exist in `EVENT_DEFINITIONS` with
`isInteractive: true` and a combat payload:
- `boss_orc_warchief` (location 32)
- `boss_lich` (location 65)
- `boss_white_horseman` (location 93)
- `boss_dread_sovereign` (location 125)

**Add:** Boss-specific loot (`bossLoot: string[]` in `enemies.json`) awarded
via `CombatEngine` on victory. Orc Warchief HP normalizes to
`baseHP: 70` (same formula as all other bosses).

---

## 7. UI Changes

### 7a. Zustand Selectors in Leaf Components

`app/game.tsx` stops passing `gameState` as a prop to `StatusBar`, `JourneyBar`,
and overlay components. Each leaf component imports its selector directly:
```typescript
const day = useDay();
const resources = useResources();
```
This eliminates shell-level rerenders on unrelated state changes.

### 7b. Remove Duplicated Gameplay Derivation

`app/game.tsx` duplicates companion XP and level-up preview logic. Move to
engine/state helpers. Screens render engine output only.

### 7c. Companion Detail Page

New modal/screen accessible by tapping a companion in the road screen companion
list. All data comes from `Companion` on `GameState` — no new engine fields
needed. Contents:

- Companion name, archetype, and level
- Loyalty tier label + visual bar (Devoted / Steady / Wavering / Disloyal)
- Preferred reputation range with in-range / out-of-range indicator
- Current food cost per turn
- Combat power and passive bonus summary
- Desertion warning when loyalty is below `complainsBelow`

### 7d. Luck Indicator on Move Button

When `getLuckThreshold(morale) + itemLuckModifier > base threshold`, the move
action button in `RoadScreen` shows a subtle visual highlight (e.g., a faint
gold border or star icon). No numeric value displayed.

### 7e. `React.memo` — Profile First

Candidates after profiling: `InventoryRow`, `CombatLogRow`, map region row
components. Do not wrap speculatively before measuring.

---

## 8. Phased Implementation Roadmap

### Phase 0 — Stabilize and Verify

**Goal:** Clean baseline before any file is moved or created.

1. Verify `"resolveJsonModule": true` in `tsconfig.json`.
2. Verify all four boss event IDs exist in `EVENT_DEFINITIONS` with
   `isInteractive: true` and combat payloads. Note any missing ones.
3. Delete `src/screens/map_screen.html`.
4. Audit all `Math.random()` calls across engine files. Document each location
   and its replacement plan.
5. Define the content-ID policy for each JSON file (document in a short
   `src/data/ID_POLICY.md` or inline in this plan's Section 3).
6. Draft schema migration stubs: identify which `GameState` changes require a
   version bump and write the stubs before implementing the changes.
   Minimum: `metaProgress` field addition.

**Exit criteria:** All boss events confirmed; ID policy documented; migration
stubs written; `Math.random()` audit complete.

---

### Phase 1 — Foundation Constants and Schema

**Goal:** Establish shared constants and the NG+ schema foundation before any
data file moves.

1. Create `src/engine/GameBalance.ts` with all formula-coupled constants
   (see Section 3i). Replace bare literals in `TurnEngine`, `CombatEngine`,
   `GameState` with `GameBalance.*` references.
2. Create `src/data/config.json` with XP thresholds, starting resources, and
   level-up choices (see Section 3h). Update `GameState.ts` to load from it.
3. Add `metaProgress: MetaProgress | null` to `GameState` in `types.ts`.
4. Add `metaProgress` serialization to `SaveEngine`. Bump `SCHEMA_VERSION`.
   Add migration stub that sets `metaProgress = null` for older saves.
5. Update `TurnEngine.endRun()` to increment `metaProgress.victoriesCount` on
   victory and write it back to state before saving.

**Exit criteria:** App builds and runs; all existing tests pass;
`GameBalance.ts` imports compile; `metaProgress` round-trips through save/load.

---

### Phase 2 — Enemies and Items → JSON

**Goal:** Migrate the two highest-value data sets. Unblocks PackCall, steal
pool, item limits, and mira_thorn fixes.

1. Create `src/data/enemies.json` with all 13 base enemies + 4 bosses.
   Include `packCallSpawnId`, `packCallSpawnMaxPerCombat`, `bossLoot`, and
   normalized `scaleFactor`. Set Orc Warchief `baseHP: 70`.
2. Create `src/data/enemies.ts` loader with `getEnemyDefinition(id)` throw-guard.
3. Remove inline enemy registry from `CombatEngine.ts`. Update
   `buildEnemiesForLocation()` to use the loader.
4. Create `src/data/items.json` with all 30+ items. Include `stealable`,
   `combatUsesPerBattle`, `usableInCombat`, `usableOnRoad`, `dropSources`,
   `goldFindBonus` (decimal percentage for any item that grants it).
5. Create `src/data/items.ts` loader with `getItemDefinition(id)` throw-guard.
6. Remove inline item registry from `ItemSystem.ts`. Update all item lookups
   to use the loader.
7. Update `locations.ts` (temporarily, until Phase 4) to use `enemyId` format
   in `mobs[]` rather than string names.
8. Replace `mira_thorn` hardcode in `resolveFlee()` with `guaranteedFleeAtLevel`
   check (Section 4g). Mira's entry in the current `companions.ts` gains this
   field immediately.
9. Replace hardcoded steal pool with `stealable` flag filter (Section 4h).
10. Implement in-combat item limits in `CombatEngine` (Section 4f).
11. Implement Bard in-combat attack passive (Section 4e).
12. Implement PackCall spawning (Section 4d).
13. Add `sumEquippedModifiers` helper to `ItemSystem` (Section 4c).

**Exit criteria:** App builds; existing tests pass; combat uses JSON enemy
definitions; items loaded from JSON; stealable items and item limits functional.

---

### Phase 3 — Shops, Fixes, and Normalization

**Goal:** Shop migration, code correctness fixes, and the `goldFindBonus` audit.

1. Create `src/data/shops.json` with per-location shop inventories
   (Section 3e). Create `src/data/shops.ts` loader.
2. Update `ItemSystem.getShopInventory(locationId)` to read from the loader.
3. Audit all companion and item definitions for `goldFindBonus` unit
   consistency. Normalize to decimal percentage. Update UI display (Section 4k).
4. Fix `dropItem()` in `useInventoryActions` to bypass sell logic (Section 4j).
5. Enforce inventory slot limit in `ItemSystem.addItem()` (Section 4i).
6. Replace all `Math.random()` calls identified in Phase 0 audit (Section 4l).

**Exit criteria:** Shop stock comes from JSON; `goldFindBonus` normalized;
`Math.random()` zero in engine files; slot enforcement tested.

---

### Phase 4 — Events, Locations, and Companions → JSON

**Goal:** Complete the data migration for all non-dialogue content.

1. Create `src/data/events.json` with all event definitions. Create loader.
   Remove inline array from `EventSystem.ts`.
2. Create `src/data/locations.json` from `locations.ts`. Create loader.
   Replace `locations.ts` export with a re-export from the loader.
3. Create `src/data/companions.json` from `companions.ts`. Include
   `guaranteedFleeAtLevel` on Mira (already added to `companions.ts` in Phase 2;
   move to JSON here). Create loader.
4. Update all consumers of the companion registry to use the loader.

**Exit criteria:** No inline data arrays remain in `EventSystem`, locations, or
companion modules. All data integrity checks pass.

---

### Phase 5 — Engine Cleanup and Refactors

**Goal:** Reduce engine complexity. Makes Phase 6 (dialogue migration) safer.

1. Extract `TravelCalculator.ts` from `TurnEngine.resolveMove()` (Section 4a).
   `resolveMove()` becomes a coordinator.
2. Create `ConditionEvaluator.ts` and migrate `DialogueEngine` + `EventSystem`
   to use it (Section 4b).
3. Verify the data integrity Jest suite covers all cross-references defined in
   Section 5. Fix any gaps.

**Exit criteria:** `resolveMove()` delegates to extracted helpers; both
`DialogueEngine` and `EventSystem` use `evalConditions()`; Jest integrity suite
complete.

---

### Phase 6 — Combat Feature Verification

**Goal:** Confirm all combat features are working correctly after Phase 2.

1. End-to-end test boss fight flow for all four bosses. Verify `EVENT_DEFINITIONS`
   coverage (identified in Phase 0, fixed here if missing).
2. Add boss loot tables to `enemies.json`. Verify loot is awarded on boss victory.
3. Verify `CombatScreen` renders correctly when a PackCall spawns a new enemy
   mid-combat. Fix any hard-coded enemy-count assumptions in the HP bar layout.
4. Verify in-combat item limits work in the UI (buttons disabled correctly).

**Exit criteria:** All four bosses can be triggered, fought, and resolved; boss
loot is awarded; PackCall spawning works in UI.

---

### Phase 7 — Dialogues → JSON

**Goal:** Move the largest inline data set to JSON. Highest-risk migration.

**Prerequisites:** Phase 5 complete (ConditionEvaluator in place); data integrity
suite covers all dialogue cross-references; all dialogue IDs frozen and documented.

1. Create `src/data/dialogues.json` (single file, array of all dialogue trees).
2. Migrate all 10+ dialogue trees from `DialogueEngine.ts` into the JSON file.
3. Create `src/data/dialogues.ts` loader.
4. Refactor `DialogueEngine.ts` to load from the loader. Remove all inline tree
   definitions. Engine shrinks from ~1200 lines to ~200 lines of evaluation logic.
5. Run the data integrity suite against the new file. Fix any reference errors.

**Exit criteria:** All dialogue trees in JSON; `DialogueEngine.ts` contains zero
inline tree definitions; all integrity tests pass; in-game dialogues function
identically to pre-migration.

---

### Phase 8 — UI Pass

**Goal:** Performance improvements and new UI features.

1. Migrate `StatusBar`, `JourneyBar`, and overlays to Zustand selectors
   (Section 7a). Remove `gameState` prop drilling from `app/game.tsx`.
2. Remove duplicated gameplay derivation from `app/game.tsx` (Section 7b).
3. Implement companion detail page (Section 7c). Wire to companion tap in
   `RoadScreen` companion list.
4. Implement luck indicator on move button in `RoadScreen` (Section 7d).
5. Profile render cost of `InventoryRow`, `CombatLogRow`, and map region rows.
   Apply `React.memo` only where profiling shows measurable benefit.

**Exit criteria:** No `gameState` prop passed to leaf components; companion
detail page accessible from road screen; luck indicator visible when threshold
is elevated.

---

### Phase 9 — Regression Testing and Sign-Off

**Goal:** Lock in stability across all migration phases.

1. Run the full Jest suite. Zero regressions expected.
2. Run the `DataIntegrity.test.ts` suite in isolation. Zero failures expected.
3. Manual playthroughs: at least 3 seeded runs of 20+ turns each. Verify:
   - All four boss fights trigger and resolve correctly
   - Companion loyalty, desertion, and affinity behave as expected
   - Dialogue trees trigger and complete with correct flag persistence
   - Shop inventories match `shops.json` definitions
   - PackCall spawning works in mid-combat scenarios
   - Bard attack bonus applies each round
   - Item use limits enforce correctly in combat
   - Boss loot is awarded on victory
   - `metaProgress.victoriesCount` increments after a victory
4. Save/load: verify `metaProgress` round-trips correctly. Verify RunLayout is
   preserved (not regenerated) on load.
5. Update `CLAUDE.md` "What is NOT done yet" section to reflect current state.

**Exit criteria:** All tests pass; manual playthroughs complete without
regressions; `CLAUDE.md` updated.
