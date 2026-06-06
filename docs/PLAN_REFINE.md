# PLAN_REFINE — Decisions, Open Questions, and Implementation Risks

Items that required owner input have been answered and are marked **[DECIDED]**.
Items still needing a decision are marked **[OPEN]**.
Items promoted to concrete fixes are in PLAN_COMMON Section 7.

---

## 1. Open Items

---

### 1a. JSON Validation Mechanism  [OPEN]

All three plans agree validation is needed but propose different mechanisms:
- PLAN1: game-data-validator agent (existing tooling)
- PLAN2: runtime TypeScript validators in the loader layer
- PLAN3: Jest `DataIntegrity.test.ts` suite

**Options:**
- **Jest only (build-time):** Catches reference errors before the app ships.
  Zero runtime cost on device. Fails silently if someone skips tests.
- **Runtime validators in loaders:** Each loader asserts IDs and enum values on
  first import. Catches errors even if tests are skipped. Small one-time cost
  at startup.
- **Both:** Jest for exhaustive cross-reference checks; runtime guards in `getX(id)`
  helpers that throw instead of returning `undefined` when given an unknown ID.

**Recommendation:** Both. Jest for cross-reference integrity (mob IDs, node links,
companion IDs, flag names); runtime throw-guards in lookup helpers. No schema
library needed — hand-written guards avoid a mobile runtime dependency.

**Decision needed:** Accept this approach, or prefer Jest-only / runtime-only?

---

### 1b. In-Combat Item Use Limits — Specific Values  [OPEN]

The decision to include per-battle item limits is made (see Section 2). The
specific values are not yet set.

**Suggested starting values for `combatUsesPerBattle`:**
- `healing_potion`: 2 (small heal, allow some flexibility)
- `greater_healing_potion`: 1 (large heal, significant per-battle impact)
- `battle_draught`: 1 (attack buff — unlimited would trivialize every fight)
- `flash_powder`, `smoke_bomb`, `holy_water`: no limit (situational, consumable)

**Decision needed:** Confirm or adjust per-item limits. Should regular and greater
healing potions share a single pool (combined 2 uses per battle), or have
separate independent limits?

---

## 2. Implementation Risks and Confirmed Approaches

---

### 2a. Dialogue IDs Must Be Frozen During Migration  [CONFIRMED]

Dialogue IDs appear in `firedEventIds` in serialized saves (used as keys to
track "already met" state). Renaming an ID mid-migration breaks all in-flight
saves silently.

**Confirmed approach:** Treat all dialogue IDs as primary keys — never rename,
only deprecate. Establish an ID list before migration begins. Deprecated IDs
stay in the JSON flagged `deprecated: true` so the validator can enforce
detection rather than silently skipping broken references.

---

### 2b. Schema Version Bump Planning  [CONFIRMED]

Every structural change to `GameState` requires a migration stub in
`SaveEngine.migrate()` and a `SCHEMA_VERSION` bump.

| Change | Requires migration? |
|--------|---------------------|
| Add `metaProgress` to `GameState` | Yes — default to `null` |
| Add `ngPlusLevel` to run start | Yes |
| Any new fields during companion JSON migration | Audit per field |

**Confirmed approach:** During Phase 0, audit every planned structural change,
draft migration stubs before implementation, and increment `SCHEMA_VERSION` once
per release rather than once per individual change.

---

### 2c. `resolveJsonModule` Must Be Verified Before Phase 1  [CONFIRMED]

JSON imports require `"resolveJsonModule": true` in `tsconfig.json`. Confirm
before writing any `import data from './foo.json'` statement. Add to Phase 0
checklist.

---

## 3. Decided Questions

All items below have been answered by the project owner.

---

### JSON File Location  [DECIDED]

**Answer:** `src/data/` — JSON files alongside existing TypeScript loaders.
`src/assets/` stays for binary assets (fonts, images, audio) only.

---

### Balance Constants Format  [DECIDED]

**Answer:** Hybrid approach.
- `GameBalance.ts` (TypeScript `as const`) for formula-coupled values: combat
  math (crit chance, damage variance, flee rates), starvation escalation,
  movement costs.
- `config.json` (or `progression.json`) for pure lookup tables with no formula
  dependencies: XP thresholds, starting food/gold, boss power thresholds,
  level-up choices.

---

### Dialogue Files — Single File vs. Per-NPC  [DECIDED]

**Answer:** Single `src/data/dialogues.json` containing all dialogue trees as an
array. The `DialogueEngine` loader imports this one file and exposes
`findDialogueForLocation()` and related helpers as before.

---

### Regions as a Separate JSON File  [DECIDED — Deferred]

Not added in this pass. If enemy scaling by region is implemented in a future
pass, `regions.json` will be added at that point when the engine has consumers.

---

### Enemy Scaling Cap by Region  [DECIDED — Deferred]

Deferred until after the data migration is stable. The current scaling formula
stays in place for this pass. Revisit after enemies.json is settled and
playtesting can inform the difficulty curve.

---

### In-Combat Item Use Limits  [DECIDED — Include; Values TBD]

**Answer:** Include in the item JSON migration phase. Add `combatUsesPerBattle`
to item definitions. Specific per-item values are still open (see Section 1b).

---

### Steal Action Loot Pool Expansion  [DECIDED — Include]

**Answer:** Include. Add `"stealable": true` to item definitions. `resolveSteal()`
filters the item registry at runtime — pool expands automatically as items are
added to JSON.

---

### Luck System Transparency Indicator  [DECIDED — Include]

**Answer:** Include a subtle visual highlight on the move action button when the
player's luck threshold is elevated. No numeric display — a visual cue only.
Implement in the UI polish phase.

---

### Companion Loyalty Display  [DECIDED — Companion Detail Page]

**Answer:** Create a companion detail page (modal or full screen) accessible by
tapping a companion in the road screen companion list. Content: loyalty tier,
preferred reputation range, current morale contribution, and a desertion warning
when loyalty is low. This is a new UI component, not a new tab in the navigator.

---

### `PackCall` Special Effect  [DECIDED — Implement Full Feature]

**Answer:** Implement real mid-combat enemy spawning. When a `PackCall` ability
fires, one additional enemy of the same type (or a weaker variant defined in the
enemy's JSON) is added to the combat encounter. Requires new spawning logic in
`CombatEngine` but uses the existing enemy registry — no new data format needed.

---

### Bard Combat Support  [DECIDED — In-Combat Passive Buff]

**Answer:** In-combat passive buff. When a Bard companion is in the party, all
player attack rolls gain a small bonus (suggested: +1 to effective attack for the
purpose of damage calculation) each round. Replace the log-only "morale banked"
message with this active effect. Post-combat morale grant can be added separately
if desired.

---

### `goldFindBonus` Semantics  [DECIDED — Percentage]

**Answer:** `goldFindBonus` is a percentage multiplier on the base gold drop.
All companion passive bonuses, item passives, and UI displays must use this
interpretation consistently. For example, Scarface's `goldFindBonus: 0.04` means
+4% gold on eligible finds.

Audit all existing companion and item definitions and normalize units during the
JSON migration phase.

---

### Shops as a Separate `shops.json`  [DECIDED — Include as Migration]

**Answer:** Shop stock is explicitly defined (not fully implicit). Add
`shops.json` as part of the data migration. This is a migration of existing data,
not a new feature.

The JSON should define per-shop or per-location-type item availability, enabling
regional shop variety without changing `ItemSystem` logic.

---

### Difficulty Modes  [DECIDED — Out of Scope]

Out of scope for this refactor pass. Will be addressed as part of New Game+ in a
future pass. `GameBalance.ts` uses flat constants, not multiplier tables.

---

### New Game+ / Meta-Progression  [DECIDED — Schema In Scope]

NG+ is planned. On beating the final boss, the player may start a new run with
increased difficulty and an as-yet-undecided bonus. The `metaProgress` structure
must be added to `GameState` and `SaveEngine` now to avoid a future schema
migration. NG+ gameplay is deferred. See PLAN_COMMON Section 6c.

---

### RunLayout Seed Stability  [DECIDED — Already Solved]

`runLayout` is already stored on `GameState` and serialized by `SaveEngine`.
The remaining action is ensuring all future schema migrations preserve the stored
layout rather than regenerating from the seed.

---

### Sound Assets  [DECIDED — Out of Scope]

Not in scope for this pass. Do not add `sfxId` fields to JSON schemas.

---

## 4. Concrete Items Without Decisions (No Owner Input Needed)

---

### `Math.random()` Audit — Mandatory

Remaining `Math.random()` calls in seed/run-ID generation and fallback helpers
must be removed before the refactor is complete. Required steps:
- Run IDs: replace with timestamp-based UUID
- Any fallback RNG in event sampling or combat: route through the seeded helper
- Confirm no `Math.random()` exists in the turn resolution path after cleanup

Schedule in Phase 0 (audit) and Phase 3 (replace).

---

### Stray `src/screens/map_screen.html`

Delete in Phase 0. It has no role in the Expo project.
