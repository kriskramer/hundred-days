# Refactor Plan 1: Data-Driven Architecture & Gameplay Improvements

**Scope:** Broad refactor to move game data to JSON, fix known gaps, improve code
quality, and tune gameplay across all systems. No new screens required.

---

## 1. JSON Data Migration

The single highest-leverage change. Currently, game content is scattered as
hardcoded TypeScript literals inside engine files. Moving it to JSON files:

- Makes content editable without touching engine logic
- Allows the data to be validated independently (see `game-data-validator` agent)
- Decouples balance tweaking from code changes
- Enables future tooling (editors, spreadsheet imports, community mods)

**Loading strategy:** Static `import data from '@data/foo.json'` bundled by Metro.
No fetch, no runtime parsing — works offline, typed at compile time via TypeScript's
`resolveJsonModule`. Each JSON file gets a companion TypeScript interface in
`types.ts` (most already exist).

---

### 1a. Enemies → `src/data/enemies.json`

**Current state:** 13 base enemy types + 4 bosses are hardcoded as an object
literal inside `CombatEngine.ts` (~300 lines). Each entry contains name, hp,
attack, defense, speed, xpReward, goldReward, behavior, abilities, encounter text,
and scaling parameters.

**Proposed JSON shape:**
```json
[
  {
    "id": "bandit",
    "name": "Bandit",
    "baseHp": 18,
    "baseAttack": 7,
    "baseDefense": 3,
    "baseSpeed": 5,
    "xpReward": 12,
    "goldReward": [4, 10],
    "behavior": "aggressive",
    "scaleFactor": 1.4,
    "minLocationId": 6,
    "abilities": [
      {
        "id": "sucker_punch",
        "name": "Sucker Punch",
        "probability": 0.25,
        "damageMultiplier": 1.3,
        "specialEffect": null,
        "description": "A cheap shot catches you off guard."
      }
    ],
    "encounterTexts": ["A bandit steps out from the shadows."],
    "immuneToNegotiate": false,
    "immuneToFlee": false,
    "tags": ["humanoid"]
  }
]
```

**CombatEngine changes:** Replace the inline enemy registry with
`import enemies from '@data/enemies.json'` and a `getEnemyDefinition(id)` lookup.

**Boss fix included:** Normalize all bosses to the same scaling formula.
Orc Warchief currently has hardcoded `hp = 100` — give it the same
`baseHp + playerLevel × 15` formula the others use, just with a higher `baseHp`.

---

### 1b. Items → `src/data/items.json`

**Current state:** 30+ items defined inline in `ItemSystem.ts` as an array literal.

**Proposed JSON shape:**
```json
[
  {
    "id": "healing_potion",
    "name": "Healing Potion",
    "category": "potion",
    "slot": null,
    "buyPrice": 20,
    "sellPrice": 8,
    "weight": 1,
    "description": "Restores 25 HP.",
    "maxStack": 5,
    "passiveEffects": [],
    "activeEffect": {
      "type": "restore_health",
      "value": 25,
      "targetSelf": true,
      "usableInCombat": true,
      "usableOnRoad": false
    },
    "dropSources": [],
    "unique": false
  }
]
```

**Key addition — `usableInCombat` / `usableOnRoad` flags:** Currently there is no
enforcement on when items can be used. Adding these flags to the JSON definition
lets `ItemSystem.canUseItem(item, context)` enforce them without per-item logic.

**Combat healing abuse:** Add `combatUsesPerBattle: 1` (or 2) to healing item
definitions. `CombatEngine` tracks uses per item ID per battle and refuses once
the limit is reached. Tunable per item in JSON without code changes.

---

### 1c. Events → `src/data/events.json`

**Current state:** EVENT_DEFINITIONS array in `EventSystem.ts` (~200 lines).

**Proposed JSON shape:**
```json
[
  {
    "id": "abandoned_camp",
    "type": "resource_find",
    "name": "Abandoned Camp",
    "description": "You find a recently abandoned campsite.",
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
    "isInteractive": false
  }
]
```

**EventSystem changes:** Load from JSON, keep all condition evaluation and sampling
logic in TypeScript. The engine logic stays; only the data moves.

---

### 1d. Locations → `src/data/locations.json`

**Current state:** `src/data/locations.ts` exports a typed array. This is
already close to data-only; the main change is format.

**Why JSON over .ts here:** The `game-data-validator` agent can validate JSON
files directly (cross-reference mob IDs against enemies.json, shop flags, boss
positions). TypeScript files require compilation first.

**Proposed change:** Convert `locations.ts` → `locations.json` with an identical
shape. Keep a thin `locations.ts` loader that imports the JSON and re-exports it
typed. Zero gameplay change, immediate tooling benefit.

**Location mob references:** Each location's `mobs[]` array currently uses string
IDs that must match `CombatEngine`'s internal registry. After enemies move to JSON,
the validator can enforce that every mob ID in locations.json exists in enemies.json.

---

### 1e. Companions → `src/data/companions.json`

**Current state:** `src/data/companions.ts` exports a typed array. Same situation
as locations — nearly data-only already.

**Convert to JSON**, keep a typed loader. Enables the validator to cross-check
recruitment dialogue (DialogueEngine must reference valid companion IDs).

---

### 1f. Dialogues → `src/data/dialogues.json`

**Current state:** All 10 dialogue trees are hardcoded inline inside
`DialogueEngine.ts` (~1000 lines of data inside a 1200-line file).

This is the most impactful migration. Moving dialogue to JSON:
- Shrinks DialogueEngine.ts to pure evaluation logic (~200 lines)
- Makes writing new NPCs/quests a JSON edit, not a code change
- Enables the validator to check: all `nextNodeId` references exist, all
  companion IDs referenced in outcomes exist in companions.json, all required
  flags are valid strings

**Proposed JSON shape:**
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
    "nodes": [
      {
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
              "reputationChange": 3
            }
          }
        ]
      }
    ]
  }
]
```

**DialogueEngine changes:** Remove the inline registry. Load from JSON at startup.
All existing eval/accumulation logic stays — only the data source changes.

---

### 1g. Balance Constants → `src/engine/GameBalance.ts`

**Not JSON — TypeScript constants.** Balance values need compile-time type
checking and are tightly coupled to engine logic. A separate `GameBalance.ts`
file collects every magic number currently scattered across engines:

```typescript
export const GameBalance = {
  // Movement
  BASE_FOOD_COST_PER_MOVE: 1.0,
  FORCED_MARCH_FOOD_MULTIPLIER: 1.5,
  SHORTCUT_FOOD_COST: 2.0,
  MAX_LOCATIONS_PER_TURN: 3,

  // Combat
  CRIT_CHANCE: 0.10,
  CRIT_MULTIPLIER: 1.75,
  DAMAGE_VARIANCE: [0.8, 1.2],
  DEFEND_DAMAGE_REDUCTION: 0.40,
  FLEE_BASE_CHANCE: 0.40,
  FLEE_SPEED_BONUS_PER_POINT: 0.05,
  FLEE_SCOUT_BONUS: 0.15,
  SURPRISE_ROUND_THRESHOLD: 0.04,

  // Leveling
  XP_THRESHOLDS: [0, 30, 75, 140, 230, 350, 500, 680, 900, 1200],
  BOSS_POWER_THRESHOLD: 180,
  BOSS_POWER_IDEAL: 240,

  // Morale / Reputation
  DREAD_MORALE_PENALTY_PER_TURN: 3,
  DREAD_TRIGGER_DAY: 70,
  DREAD_PACE_RATIO: 1.5,
  RALLY_BASE_MORALE_GAIN: 10,
  RALLY_LEADERSHIP_MULTIPLIER: 2,

  // Starvation
  STARVATION_HEALTH_BASE: 10,
  STARVATION_HEALTH_PER_TURN: 5,
  STARVATION_HEALTH_MAX: 40,
  STARVATION_MORALE_BASE: 8,
  STARVATION_MORALE_PER_TURN: 2,
  STARVATION_MORALE_MAX: 20,
} as const;
```

Every engine imports `GameBalance` instead of using bare numbers. Tuning a
value becomes a single-line change in one file.

---

## 2. Gameplay Bug Fixes & Feature Completions

These are existing gaps noted in CLAUDE.md and discovered during the analysis.

---

### 2a. Story Flags — Fix Persistence

**Current bug:** `DialogueEngine` maintains a module-level `Set<string>` for story
flags. It is never serialized to `GameState`, so flags reset on every app restart.
Replaying a run loses all "already met" state.

**Fix:**
- `DialogueEngine.setFlag(flag, gameState)` → mutates `gameState.storyFlags`
- `DialogueEngine.hasFlag(flag, gameState)` → reads `gameState.storyFlags`
- Remove the module-level Set entirely
- `SaveEngine` already serializes `storyFlags` (it's already in `GameState`) — 
  no save/load changes needed

**Risk:** Low. The Set and GameState field are parallel structures; this collapses
them into one.

---

### 2b. Companion Reputation Affinity — Implement

**Current stub:** `TurnEngine.isReputationInCompanionRange()` always returns `true`.
Companion data already has `preferredRepMin` / `preferredRepMax` fields defined.

**Implementation in `TurnEngine.updateStats()`:**
```
For each active companion:
  if player reputation is within companion's preferred range:
    loyalty += companion.loyaltyGainRate.reputationMatch
  else:
    loyalty -= companion.loyaltyLossRate.reputationMismatch
```

This is a one-function implementation — the data is already there. It activates
an entire designed system with ~20 lines of code.

---

### 2c. Boss Fight — Complete the Flow

**Current state:** `TurnEngine.checkWinLoss()` has a `// TODO: Trigger boss combat
event` comment. The boss location map exists (`bosses.ts`), movement correctly
stops at boss locations, but no combat is triggered.

**Proposed flow:**
1. When player arrives at a boss location, `resolveMove()` already stops movement.
2. `checkWinLoss()` detects `currentLocationId` is in `BOSS_EVENT_MAP`.
3. If the boss location is not in `clearedCombatLocations`, create a `CombatEvent`
   with the boss enemy ID and push it onto the event queue.
4. `CombatScreen` handles it identically to normal combat.
5. On victory, add location to `clearedCombatLocations` and award boss loot.

Boss-specific loot tables should live in `enemies.json` (a `bossLoot` array
alongside each boss entry).

---

### 2d. Component Import Paths — Fix Build Blocker

**Current bug:** `game.tsx` imports like:
```typescript
import { StatusBar } from '@components/StatusBar'  // file doesn't exist
```

Should be:
```typescript
import { StatusBar } from '@components'  // re-exported from index.ts
```

**Fix:** A simple find-and-replace across `game.tsx` (and any other file with the
same pattern). This is blocking builds.

---

### 2e. Stray HTML File

`src/screens/map_screen.html` should be deleted. It has no role in the Expo
project and will confuse file searches.

---

## 3. Code Quality Refactors

---

### 3a. Decompose `TurnEngine.resolveMove()`

At 117 lines with 4 levels of nesting, `resolveMove()` is the hardest function
to reason about in the codebase. Extract into clearly-named helpers:

- `calculateFoodCostForMove(state, locationsToMove): number`
  Handles base cost + weather modifier + chainmail penalty + morale scaling
- `applyCompanionFoodCosts(state, locationsToMove): ResourceDelta`
  Companion food per turn, returned as a delta (not applied inline)
- `rollLucky3rdLocation(state): boolean`
  Checks luck threshold + item luck bonus + RNG roll
- `findBossCheckpoint(currentLoc, targetLoc): number | null`
  Scans BOSS_EVENT_MAP for uncleared bosses in the movement range
- `resolveMove()` becomes a coordinator calling these helpers in order

Target: `resolveMove()` should read like a high-level description of what happens
when the player moves, not how it's calculated.

---

### 3b. Deduplicate Condition Evaluation

`DialogueEngine` has `evalConditions()` for dialogue triggers and per-choice
conditions. `EventSystem` has its own condition checking. These share ~70% of
their logic (minDay, maxDay, minReputation, requiredFlag, etc.) but are
implemented independently.

**Proposed:** Create `src/engine/ConditionEvaluator.ts` with a single
`evalConditions(conditions, gameState): boolean` that both systems use.

Benefits: one place to add new condition types, consistent behavior.

---

### 3c. Normalize Boss HP Scaling

Orc Warchief (`locationId: 32`) has `hp: 100` hardcoded.  
All other bosses use: `baseHp + playerLevel × 15`.

After enemies move to JSON, set Orc Warchief's `baseHp: 70` (equivalent to
~level 2 player encounter) and remove the hardcode. All bosses scale the same way.

---

### 3d. Enforce Inventory Slot Limits

`ItemSystem.addItem()` should check `inventory.items.length < inventory.maxSlots`
before adding. Currently items can silently overflow if the check is missing or
bypassed. After JSON migration, `maxSlots` per item type (e.g., Traveler's Pack
expands to 10) should be enforced at the system boundary, not the UI.

---

### 3e. RunLayout — Seed Stability

`RunLayout.ts` generates a seeded layout (NPC placements, merchant locations,
shortcuts). If the companion list or NPC candidate list changes (new content is
added), existing save seeds will produce different layouts on reload, breaking
saved runs.

**Proposed:** Add a `layoutVersion` field (separate from `schemaVersion`) that
invalidates cached layouts when content changes. SaveEngine stores the full layout
alongside the GameState so it's always consistent.

---

## 4. Gameplay Tuning Suggestions

These are design observations, not bugs. Include or exclude based on vision.

---

### 4a. In-Combat Item Use Limits

Unlimited healing potions trivialize long combats. Add `combatUsesPerBattle`
to item definitions (suggested: `healing_potion: 1`, `greater_healing_potion: 1`,
`battle_draught: 1`). Track per-combat uses in a transient `CombatEngine` field
(not persisted — resets each fight).

---

### 4b. Enemy Scaling Refinement

Current scaling: `HP/attack/defense = base × (1 + (locationId - minLoc) / 10 × (scaleFactor - 1))`

This creates enemies in location 125 that are significantly more powerful than
those in location 100, even within the same region. Consider capping scaling at
region boundaries and resetting for each new region, so regional identity is
preserved and the difficulty ramp feels intentional rather than algorithmic.

Tunable via `scalingCapByRegion` in `enemies.json`.

---

### 4c. Steal Action — Expand Loot Pool

The steal action pulls from a hardcoded pool of 4 items:
`['dried_rations', 'hunters_jerky', 'healing_potion', 'spirit_tonic']`

After items move to JSON, add a `"stealable": true` flag to item definitions.
`TurnEngine.resolveSteal()` filters the item registry for stealable items and
samples from it. Loot pool grows automatically as items are added to JSON.

---

### 4d. Luck System Transparency

Luck affects the "lucky 3rd location" roll but is invisible to the player.
Consider a small luck indicator (e.g., a star icon on the move action button
when luck threshold is high) so players feel the Scout's Kit and Lucky Coin are
working. No new screen — just a tooltip or icon state in `RoadScreen`.

---

### 4e. Companion Loyalty UI

Companions show in the game but their loyalty values aren't surfaced anywhere in
the UI. The `MapScreen` detail card or a `CompanionScreen` tab (or a modal from
the existing party list) should show:
- Current loyalty (numeric or tier)
- Preferred reputation range (so players know why loyalty is dropping)
- Desertion threshold warning

This is a UI addition, not a new engine feature — data already exists.

---

### 4f. Difficulty Modes

Suggested: Easy / Normal / Hard as a `difficulty` field on `GameState`, set at
new game. The `GameBalance` module applies a difficulty multiplier to:
- Starting food/gold
- Enemy HP scaling factor
- Starvation penalty rate
- Dread trigger day

No new engine code — just a multiplier table in `GameBalance.ts` keyed by
difficulty. Title screen shows difficulty picker alongside existing run history.

---

## 5. Performance

The game's performance profile is low-risk — turn-based with small state. But
two areas are worth noting:

**Event sampling:** `EventSystem.sampleEventsForTurn()` likely iterates all
event definitions and checks conditions on every turn. With ~20 events this is
negligible. If the event count grows significantly after JSON migration (easy to
add new events), pre-bucket events by `locationType` and `dayRange` at startup
so sampling only checks a subset.

**Set serialization:** `SaveEngine` converts `firedEventIds`, `visitedLocationIds`,
`clearedCombatLocations`, and `storyFlags` from `Set` to array on every save.
These sets grow over a 100-turn run (max ~500 entries total). No change needed
at current scale, but if `firedEventIds` grows large, consider using a
`Map<eventId, count>` instead to prevent duplicate-fire events without Set overhead.

---

## 6. Phased Implementation Order

| Phase | Work | Rationale |
|-------|------|-----------|
| **0** | Fix component imports in game.tsx; delete map_screen.html | Unblocks builds first |
| **1** | Create `GameBalance.ts` | Lays foundation; low risk; pure extraction |
| **2** | Enemies → JSON + boss HP normalization | Highest-value single migration; fixes boss bug |
| **3** | Items → JSON + usableInCombat/combatUsesPerBattle flags | Fixes healing abuse; grows steal pool |
| **4** | Story flags persistence | Bug fix; high gameplay impact; low risk |
| **5** | Companion reputation affinity | Activates an entire designed system |
| **6** | Decompose resolveMove(); extract ConditionEvaluator | Code quality; makes Phase 7 safer |
| **7** | Dialogues → JSON | Biggest migration; do after engine is cleaner |
| **8** | Events → JSON; Locations + Companions → JSON | Completes the data migration |
| **9** | Boss fight flow (checkWinLoss → combat event) | Requires phases 2+3 stable |
| **10** | RunLayout seed stability | Do after content is finalized |
| **11** | UI: companion loyalty display, luck indicator | Polish pass |
| **12** | Difficulty modes | New feature; lowest priority |

---

## 7. Open Questions

Before finalizing, your input is needed on:

**Q1 — Dialogue JSON granularity:**  
The 10 dialogue trees total ~1000 lines of narrative text + conditions. Should
they go in a single `dialogues.json` or one file per NPC/tree
(e.g., `src/data/dialogues/rex.json`)? Single file is simpler to load; split
files are easier to edit individually and git-diff.

**Q2 — Combat healing limits:**  
Should healing potions be limited to 1 use per combat, or 1 use per 3 rounds,
or stay unlimited? This significantly affects combat difficulty. Related: should
greater healing potions and regular potions share the same limit pool, or have
separate counts?

**Q3 — Enemy scaling cap by region:**  
Do you want enemies to reset their scaling at each region boundary (so a
"Hard" region starts fresh rather than compounding from region 1 scaling)?
This changes the difficulty curve noticeably.

**Q4 — Difficulty modes:**  
Is this in scope for this pass, or a future feature? It affects how `GameBalance.ts`
is structured (multiplier tables vs. flat constants).

**Q5 — New Game+ / carry-overs:**  
The run history tracks victories. Is any carry-over planned (starting gold bonus,
unlockable companions, cosmetics)? If yes, `GameState.ts` and `SaveEngine.ts`
need a `metaProgress` structure now rather than bolted on later.

**Q6 — Sound assets:**  
`SoundEngine.ts` is scaffolded. Is adding sound in scope for this refactor pass,
or explicitly out of scope? If in scope, the JSON migration is a good time to add
`sfxId` fields to enemy abilities, item use, and events so the engine knows what
to play without hardcoding.
