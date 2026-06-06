# PLAN_COMMON — Settled Decisions and Implementation Plan

All items in this document are decided. Implementation can proceed against this
file without further discussion. Open items and risks are in PLAN_REFINE.

---

## 1. Guiding Principles

- **Content in data files, rules in TypeScript.** Static tables, narrative text,
  rosters, and tuning knobs move to JSON. Validation, formulas, state machines,
  RNG, and persistence stay in TypeScript.
- **One source of truth per rule.** UI renders engine-derived state; it does
  not independently recalculate gameplay behavior.
- **Stabilize before decomposing.** Fix correctness and shared contracts before
  splitting large engine files.
- **Preserve determinism.** All gameplay-affecting randomness goes through the
  seeded Mulberry32 RNG path.

---

## 2. JSON Data Migration — Full List

JSON files live in `src/data/`. Each gets a thin TypeScript loader that imports
the JSON, asserts the type, and re-exports accessor helpers. The rest of the app
calls those helpers — no file imports JSON directly except the loader.

| Data | Source today | Target |
|------|--------------|--------|
| Enemy and boss definitions | `CombatEngine.ts` inline | `src/data/enemies.json` |
| Item definitions | `ItemSystem.ts` inline | `src/data/items.json` |
| Event definitions and pools | `EventSystem.ts` inline | `src/data/events.json` |
| Companion roster | `src/data/companions.ts` | `src/data/companions.json` |
| Location metadata and flavor text | `src/data/locations.ts` | `src/data/locations.json` |
| Shop inventories and merchant stock | `ItemSystem.ts` / implicit | `src/data/shops.json` |
| Dialogue trees and NPC encounters | `DialogueEngine.ts` inline | `src/data/dialogues.json` (single file) |
| XP thresholds, starting resources, boss power | `GameState.ts` / scattered | `src/data/config.json` |
| Formula-coupled balance constants | Scattered engine files | `src/engine/GameBalance.ts` |

**Loading strategy:** `import data from './foo.json'` (static Metro bundle, not
fetch). Works offline, zero runtime parsing cost, typed at compile time via
`resolveJsonModule`. Confirm `resolveJsonModule: true` is set in `tsconfig.json`
before Phase 1 begins.

**What stays in TypeScript:** Enums, interfaces, loader types, RNG utilities,
state machines, save serialization/migration, formulas, AI strategies, condition
evaluation logic.

---

## 3. Balance Constants — Hybrid Split

**`src/engine/GameBalance.ts`** (TypeScript `as const`) for values tightly coupled
to formulas — changing these without understanding the formula is a logic change,
not a content edit:

- Movement: base food cost, forced march multiplier, shortcut cost, max locations/turn
- Combat: crit chance/multiplier, damage variance, defend reduction, flee base
  rate and speed bonus, surprise round threshold
- Morale: dread penalty per turn, dread trigger day, dread pace ratio, rally gain
- Starvation: health and morale penalty base, per-turn escalation, caps

**`src/data/config.json`** for pure lookup tables with no formula dependencies —
safe to edit without touching engine code:

- XP thresholds (array)
- Starting food, gold, health, max inventory slots
- Boss power threshold and ideal power
- Level-up choice definitions

---

## 4. Data Validation Requirements

Validation runs in two places. Mechanism details (Jest vs. runtime guards) are
still open in PLAN_REFINE, but the requirements are settled:

**Cross-reference integrity (every `enemyId`, `companionId`, `nextNodeId`, item
ID must resolve to a real entry in the owning JSON file):**
- `locations.json → mobs[].enemyId` → exists in `enemies.json`
- Dialogue outcome `recruitCompanionId` → exists in `companions.json`
- Dialogue `nextNodeId` → exists as a node in the same tree
- Event and shop item IDs → exist in `items.json`
- Dialogue `flagsSet` IDs → frozen registry (see section 5a)

**Structural invariants (within each file):**
- No duplicate IDs
- Enum-constrained string fields match valid enum values
- Required fields present and correctly typed

---

## 5. Remaining Work — Confirmed Against Current Code

The following were verified against the codebase. Items already implemented
have been removed. This is the accurate current remaining list.

### 5a. Boss Fight — Verify EVENT_DEFINITIONS Coverage

The boss fight flow is substantially implemented: `sampleAndQueueEvents()` queues
boss events from `EVENT_DEFINITIONS`, `checkWinLoss()` reads a `bossResults` Map,
and `clearedCombatLocations` is updated on victory.

**Remaining work:** Verify all four boss event IDs
(`boss_orc_warchief`, `boss_lich`, `boss_white_horseman`, `boss_dread_sovereign`)
are defined in `EVENT_DEFINITIONS` with `interactive: true` and a valid combat
payload. This is a verification step, not a rebuild.

### 5b. Orc Warchief HP Normalization

All bosses scale by `baseHp + playerLevel × 15` except Orc Warchief (hardcoded
`hp = 100`). After enemies move to JSON, give Orc Warchief a `baseHp` value
that produces the same approximate result at a typical player level for that
location (~level 2–3 encounter at location 32).

### 5c. New Game+ — `metaProgress` Structure

NG+ is planned (increased difficulty on second run plus an as-yet-undecided
bonus). The `metaProgress` structure must land in `GameState` and `SaveEngine`
during this refactor — adding it later requires a schema migration across all
existing saves. NG+ gameplay is deferred to a future pass.

Add to `GameState`:
```typescript
interface MetaProgress {
  victoriesCount: number;
  ngPlusLevel: number;         // 0 = normal run, 1 = NG+, 2 = NG++
  unlockedCompanionIds: string[]; // reserved for future use
}
// field: metaProgress: MetaProgress | null
```

Add serialization and a migration stub (default to `null`) in `SaveEngine`.

---

## 6. Code Quality Refactors

### 6a. Decompose `TurnEngine.resolveMove()`

Extract into named pure helpers:
- `calculateFoodCostForMove(state, locationsToMove): number`
- `applyCompanionFoodCosts(state, locationsToMove): ResourceDelta`
- `rollLucky3rdLocation(state): boolean`
- `findBossCheckpoint(currentLoc, targetLoc, clearedLocations): number | null`

`resolveMove()` becomes a coordinator. Target: reads like a high-level narrative
of what happens when the player moves, not how each value is calculated.

### 6b. Extract `ConditionEvaluator`

`DialogueEngine` and `EventSystem` each implement condition checking with ~70%
overlapping logic (minDay, maxDay, minReputation, requiredFlag, etc.). Create
`src/engine/ConditionEvaluator.ts` with a single
`evalConditions(conditions, gameState): boolean` used by both. One place to add
new condition types; consistent behavior across dialogue and events.

### 6c. Enemy ID References in Locations

`mobs[]` in each location uses loose string names matched against
`CombatEngine`'s registry. After JSON migration, `mobs[]` entries carry a typed
`enemyId` validated against `enemies.json`. String-matching hazard eliminated.

### 6d. Enforce Inventory Slot Limits at the System Boundary

`ItemSystem.addItem()` should enforce `inventory.items.length < inventory.maxSlots`
before adding. Overflow currently can only be caught in the UI. Engine-level
enforcement is the correct boundary.

### 6e. `mira_thorn` Hard-Coded in `resolveFlee()`

`CombatEngine.resolveFlee()` checks the specific companion ID `mira_thorn`.
After companions move to JSON, add `"guaranteedFleeAtLevel": 5` to Mira's
companion definition. `resolveFlee()` checks whether any companion has this
field and meets the level threshold. No hardcoded IDs in engine logic.

### 6f. `dropItem()` Routes Through Sell Logic

`useInventoryActions.dropItem()` uses the sell code path, coupling dropping to
sale restrictions. Unique items that can't be sold should still be droppable.
Add a dedicated `dropItem()` path that removes from inventory without a gold
transaction or sell-restriction check.

### 6g. `sumEquippedModifiers` Generic Helper

Replace per-effect if/else chains in `CombatEngine` and `TurnEngine`:

```typescript
export function sumEquippedModifiers<K extends keyof ItemPassiveEffect>(
  equipped: ItemPassiveEffect[],
  key: K
): number {
  return equipped.reduce((sum, item) => sum + ((item[key] as number) ?? 0), 0);
}
```

### 6h. `goldFindBonus` — Normalize to Percentage

`goldFindBonus` is a percentage multiplier on the base gold drop (e.g., `0.04`
= +4%). Audit all companion and item definitions for inconsistent units and
normalize during the JSON migration phase. All UI displays must render this as
a percentage, not a flat value.

### 6i. `Math.random()` Audit

All `Math.random()` calls in gameplay paths must be replaced before the refactor
is complete:
- Run IDs: replace with timestamp-based UUID (determinism not required here)
- Any fallback RNG in event sampling or combat: route through the seeded helper
- Confirm zero `Math.random()` in the turn resolution path after cleanup

---

## 7. New Feature Work (Decided This Pass)

### 7a. `PackCall` — Mid-Combat Enemy Spawning

`SpecialEffect.PackCall` currently logs a message only. Implement real spawning:
when a `PackCall` ability fires, one additional enemy is added to the combat
encounter. The enemy type is defined in the spawning enemy's JSON entry
(e.g., a `packCallSpawnId` field, or the same enemy type at reduced stats).

This requires new spawning logic in `CombatEngine` but uses the existing enemy
registry. Combat UI must handle a growing enemy list — verify `CombatScreen`
renders correctly when the enemy count changes mid-fight.

### 7b. Bard — In-Combat Passive Buff

The Bard companion currently writes "morale banked" to the combat log but
applies no effect. Replace with an active in-combat passive: when a Bard
companion is present, the player's effective attack is increased by +1 each
round for the purpose of damage calculation. Apply this in
`CombatEngine.resolvePlayerAttack()` by checking the companion archetype list.

### 7c. In-Combat Item Use Limits

Add `combatUsesPerBattle` to item definitions. `CombatEngine` tracks uses per
item per battle in a transient `Map<itemId, usesThisBattle>` (not persisted —
resets each fight). When uses reach the limit, the item is unavailable for that
combat. Specific per-item values are in PLAN_REFINE Section 1b.

### 7d. Steal Action — Expand Loot Pool

Add `"stealable": true` to item definitions. `TurnEngine.resolveSteal()` filters
the item registry for stealable items and samples from it using the seeded RNG.
The hardcoded 4-item pool is removed. Pool grows automatically as items are
added to `items.json`.

### 7e. Luck Indicator on Move Button

When the player's current luck threshold is above the base (due to equipped
items, Scout companion, or morale bonus), the move action button shows a subtle
visual highlight. No numeric display. Implemented in `RoadScreen` using the
existing `getLuckThreshold()` helper.

### 7f. Companion Detail Page

A new detail modal or screen accessible by tapping a companion in the road
screen's companion list. Contents:
- Companion name, archetype, level
- Loyalty tier label and visual bar (e.g., Devoted / Steady / Wavering / Disloyal)
- Preferred reputation range (with indicator of whether current reputation is
  in range)
- Current food cost per turn
- Combat power and passive bonuses summary
- Desertion warning when loyalty is below the complain threshold

This is a new UI component. No new engine data needed — all fields already exist
on `Companion` in `GameState`.

### 7g. Shops JSON Migration

Shop stock is explicitly defined. Move it to `src/data/shops.json` during the
item migration phase. The JSON should define per-location or per-region item
availability, enabling shop variety without changing `ItemSystem` logic.

---

## 8. UI Improvements

### 8a. Stop Passing Full `GameState` Through the UI Tree

Leaf components (`StatusBar`, `JourneyBar`) should use Zustand slice selectors
directly (`useDay()`, `useResources()`, etc.) rather than receiving the full
`gameState` as a prop. Shell-level rerenders on single-stat changes are
eliminated.

### 8b. Remove Duplicated Gameplay Derivation from Screens

`app/game.tsx` duplicates companion XP and level-up preview logic from the
engine. Screens render engine output; they do not recompute it.

### 8c. `React.memo` — Profile Before Applying

Apply only where profiling shows a concrete render cost. Likely candidates:
inventory item rows, combat log entries, map region rows. Do not wrap
speculatively.

---

## 9. Phased Implementation Order

| Phase | Work |
|-------|------|
| **0 — Stabilize** | Verify `resolveJsonModule` in tsconfig; verify all 4 boss event IDs in `EVENT_DEFINITIONS`; delete `src/screens/map_screen.html`; audit `Math.random()` calls; define content-ID policy; draft schema migration stubs for `metaProgress` and any other new fields |
| **1 — Foundation** | Create `GameBalance.ts`; create `src/data/config.json`; add `metaProgress` stub to `GameState` + `SaveEngine` (schema version bump) |
| **2 — Enemies + Items → JSON** | `enemies.json` + loader; `items.json` + loader with `stealable`, `combatUsesPerBattle`, `usableInCombat` fields; normalize Orc Warchief HP; update `mobs[]` in locations to use `enemyId`; replace `mira_thorn` hardcode with `guaranteedFleeAtLevel` |
| **3 — Shops + Config data** | `shops.json` + loader; normalize `goldFindBonus` to percentage across all companion/item definitions; audit and replace `Math.random()` in turn path |
| **4 — Events + Locations + Companions → JSON** | `events.json`, `locations.json`, `companions.json` + loaders; full data migration complete |
| **5 — Engine cleanup** | Decompose `resolveMove()`; extract `ConditionEvaluator`; enforce inventory slot limits; add `sumEquippedModifiers` helper; fix `dropItem()` path |
| **6 — Combat feature work** | PackCall spawning; Bard in-combat passive; in-combat item use limits; validate `CombatScreen` handles mid-combat enemy count changes |
| **7 — Dialogues → JSON** | `dialogues.json` (single file) + loader; freeze all dialogue IDs before starting; validator must be in place |
| **8 — Boss fight verification + loot** | Verify `EVENT_DEFINITIONS` coverage for all 4 bosses; add boss loot tables to `enemies.json`; end-to-end test the boss flow |
| **9 — UI pass** | Selectors in leaf components; remove duplicated derivation from `game.tsx`; companion detail page; luck indicator; `React.memo` where profiling justifies |
| **10 — Validation + regression tests** | Data integrity test suite; seeded regression tests for travel, combat, event sampling, dialogue gating; golden-seed smoke tests |
