# PLAN2 — Refactor roadmap for gameplay, performance, UI, and data externalization

## 1. Goals

This plan is **design only**. It does not implement changes.

Primary goals:

1. Improve gameplay clarity, balance control, and long-term maintainability across travel, combat, equipment, mobs, companions, dialogue, and randomness.
2. Move as much static game content to JSON as is practical without pushing core rules, validation, or state transitions out of TypeScript.
3. Reduce render churn and duplicated logic in the React Native UI.
4. Make balancing and content iteration safer through schema validation, deterministic randomness, and better test coverage.

---

## 2. Current review summary

### Strong foundations already in place

- `TurnEngine` already owns the turn lifecycle and seeded RNG progression.
- `GameState` already persists `rngState`, `storyFlags`, `runLayout`, and migrated save data.
- `CombatEngine`, `EventSystem`, `ItemSystem`, and `DialogueEngine` already separate major gameplay domains.
- `docs/ARCHITECTURE.md` remains a good system overview.

### Highest-value issues found in the current code

| Area | Current issue | Key files |
|---|---|---|
| Data placement | Static content is split between `src/data` and large engine files | `src\data\locations.ts`, `src\data\companions.ts`, `src\engine\CombatEngine.ts`, `src\engine\ItemSystem.ts`, `src\engine\EventSystem.ts`, `src\engine\DialogueEngine.ts`, `src\engine\GameState.ts` |
| Engine size | `TurnEngine`, `CombatEngine`, and `DialogueEngine` mix orchestration, rules, and content | same as above |
| Randomness | Deterministic RNG exists, but `Math.random()` still leaks into seed/run-id generation and some fallback helpers | `src\engine\GameState.ts`, `src\data\locations.ts`, `app\game.tsx`, `src\engine\EventSystem.ts`, `src\engine\CombatEngine.ts` |
| Combat depth | Some special effects and archetype hooks are placeholders or partial | `src\engine\CombatEngine.ts` |
| UI duplication | UI owns some gameplay derivation that also exists in the engine | `app\game.tsx`, `src\screens\RoadScreen.tsx`, `src\screens\CombatScreen.tsx` |
| Inventory semantics | Some inventory actions share the wrong underlying logic | `src\hooks\useInventoryActions.ts` |
| Store usage | Many screens receive the full `GameState`, increasing rerender pressure | `app\game.tsx`, `src\store\gameStore.ts`, most screens |
| Validation baseline | Type-check passes, but lint is noisy and currently fails | `package.json`, test files, `src\components\CombatAlertModal.tsx`, multiple UI files |

### Specific code smells worth planning around

- `app\game.tsx` duplicates companion XP and level-up preview logic that already belongs in engine/state code.
- `src\engine\CombatEngine.ts` includes both enemy/boss definitions and combat simulation logic in one file.
- `SpecialEffect.PackCall` only logs instead of applying a real combat consequence.
- Bard combat support only logs “morale banked” without a formal combat or turn-level effect.
- `CombatEngine.resolveFlee()` still references `mira_thorn`, a hard-coded companion id that does not match the current roster.
- `useInventoryActions.dropItem()` currently routes through sell logic, which couples dropping to sale restrictions.
- `goldFindBonus` appears to be displayed with inconsistent units across screens.
- `src\data\locations.ts` still contains non-deterministic flavor helpers even though deterministic `pickLocationText()` helpers already exist in `GameState.ts`.
- `CLAUDE.md` is stale in a few places and should not be treated as a source of truth until refreshed.

---

## 3. Refactor principles

1. **Content in JSON, rules in TypeScript.** Static tables, narrative text, rosters, and tuning knobs move out first. Validation, formulas, state machines, RNG, and persistence stay in TS.
2. **Stabilize before decomposing.** Clean up correctness and shared data contracts before splitting large engine files.
3. **Prefer one source of truth per rule.** UI should render engine-derived state, not recalculate gameplay behavior independently.
4. **Make tuning explicit.** Difficulty curves, drop tables, shop inventories, dialogue triggers, and companion affinity should be data-driven where possible.
5. **Preserve determinism.** All gameplay-affecting randomness should come from the seeded RNG path.

---

## 4. JSON migration strategy

### Move to JSON in the first pass

| Data | Why it belongs in JSON | Suggested target |
|---|---|---|
| Enemy and boss definitions | Pure content/tuning data; currently embedded in combat engine | `src\assets\data\enemies.json` |
| Item definitions | Pure content/tuning data; large static table | `src\assets\data\items.json` |
| Event definitions and event pools | Pure content and weighting rules | `src\assets\data\events.json` |
| Companion roster | Static content with no runtime logic | `src\assets\data\companions.json` |
| Static location metadata/text | Large content dataset; ideal for design iteration | `src\assets\data\locations.json` |
| Shop inventories and roaming merchant stock | Better handled as data than implicit filters | `src\assets\data\shops.json` |
| Level-up thresholds and level-up card definitions | Tuning content rather than engine logic | `src\assets\data\progression.json` |
| Boss checkpoint metadata and boss intros/outcomes | Content and pacing metadata | `src\assets\data\bosses.json` |
| Narrative text tables | Centralize travel/combat/result text | `src\assets\data\narratives.json` |

### Move to JSON only after schema tooling is in place

| Data | Reason to stage it |
|---|---|
| Dialogue trees | Highest payoff, but also highest reference complexity because they connect conditions, flags, companion ids, and event triggers |
| Run-layout candidate pools | The generated output stays in state, but the static candidate lists for shortcuts/NPC slots/elites can move after loader/validator patterns are proven |
| Status-effect registry metadata | Good candidate once combat/item/event validation is centralized |

### Keep in TypeScript

| Keep in TS | Why |
|---|---|
| Enums, shared interfaces, and loader types | Core type safety |
| RNG utilities and deterministic selection helpers | Logic, not content |
| Turn/combat/dialogue state transitions | Stateful orchestration |
| Save serialization, migration, and validation | Engine/runtime behavior |
| Formulas and calculators | Easier to test and reason about than encoded JSON expressions |
| AI strategies and rule evaluators | Behavior should remain code-driven even if tuned by data |

### Loader/validation recommendation

- Use `import ... from '*.json'` rather than `require(...)`.
- Add a thin runtime validation layer when data loads.
- Keep the first pass simple: hand-written validators are acceptable; a schema library can be introduced later if the repo wants it.

---

## 5. Phased roadmap

## Phase 0 — Baseline stabilization and refactor prep

**Purpose:** clean up the highest-friction correctness and maintenance problems before major movement.

Planned work:

1. Refresh stale documentation in `CLAUDE.md` so it matches the current codebase.
2. Fix the lint baseline enough that refactor PRs do not pile new noise on top of existing failures.
3. Decide the JSON import/validation pattern and document it once.
4. Define a clear content-id policy for enemies, items, companions, statuses, shops, events, and dialogues.
5. Add a short “data contract” checklist for every JSON file: unique ids, enum-safe values, known references, no duplicate keys.

Why first:

- The current lint failure mixes real issues with formatting/style noise.
- Several stale notes in repo documentation describe bugs that are already fixed, which would mislead the refactor.

---

## Phase 1 — Data foundation and loader layer

**Purpose:** separate content from systems without changing game behavior.

Planned work:

1. Create `src\assets\data\` and move static tables out of engine files.
2. Add loader modules that parse and cache JSON into typed registries.
3. Add validation helpers for:
   - item ids and slot/category values
   - enemy behavior and special-effect references
   - event ids, tags, and handler ids
   - companion ids and passive bonus fields
   - location ids, ranges, action metadata, and mob references
4. Replace direct in-file arrays with registry imports.
5. Keep current public helpers (`getItemDef`, `getCompanion`, `getLocation`, etc.) as the stable API so the rest of the app does not need a sweeping rewrite in the same phase.

Expected outcomes:

- Smaller engine files.
- Easier balancing and content editing.
- A safe foundation for later UI and gameplay refactors.

---

## Phase 2 — Travel, pacing, and randomness cleanup

**Purpose:** make the travel loop more tunable, deterministic, and data-driven.

Planned work:

1. Consolidate travel modifiers into a dedicated travel rules module:
   - weather impact
   - movement bonus
   - shortcut rules
   - forced march costs
   - forage/hunt yield modifiers
2. Make all flavor text selection deterministic and remove remaining non-engine `Math.random()` usage.
3. Externalize region/location pacing knobs:
   - travel difficulty
   - hunt yield bands
   - rest quality
   - danger weighting
   - optional region difficulty multipliers
4. Convert roaming elite, merchant, and shortcut candidate tables into data-driven registries if Phase 1 loader patterns are stable.
5. Add simulation-oriented tests for travel pacing over seeded runs.

Travel-specific suggestions:

- Turn current numeric knobs into named balance fields with explicit semantics.
- Add a pace report for design work: average location gain, average food pressure, and event frequency by region.
- Make “good run vs bad run” variability measurable before changing balance.

---

## Phase 3 — Combat refactor and gameplay depth

**Purpose:** improve combat depth while reducing the size and coupling of `CombatEngine`.

Planned work:

1. Split combat data from combat runtime:
   - registry/data loader
   - combat rules/calculation helpers
   - enemy AI selection
   - reward/result summarization
2. Introduce a formal status-effect registry so combat, items, and events stop sharing magic strings implicitly.
3. Replace partial placeholder behaviors with explicit implementations:
   - `PackCall`
   - archetype combat support effects
   - negotiate weighting
   - flee modifiers
4. Remove hard-coded companion-id checks in combat logic and replace them with archetype- or trait-driven hooks.
5. Normalize unit semantics for bonuses such as `goldFindBonus`, `luckModifier`, and loyalty modifiers.
6. Add scenario tests for common combat states, boss encounters, and special effects.

Combat-specific suggestions:

- Make enemy abilities fully declarative in data, but keep resolution code in TS.
- Move reward tables, encounter text, defeat text, and boss metadata out of the engine.
- Treat bosses as first-class content objects rather than special cases scattered across files.

---

## Phase 4 — Companions, NPCs, and dialogue

**Purpose:** make the social layer easier to tune and extend.

Planned work:

1. Extract companion loyalty/affinity calculations into their own rules module.
2. Centralize companion trait application for:
   - travel
   - loyalty
   - combat support
   - event mitigation
3. Move dialogue trees to JSON once the loader/validation pattern has proven reliable.
4. Add validation for dialogue references:
   - node ids
   - next-node links
   - companion ids
   - event payload ids
   - required/forbidden flags
5. Separate runtime dialogue navigation from dialogue content storage.

NPC/companion suggestions:

- Treat companion affinity as data + a shared evaluator, not a TurnEngine concern.
- Add a registry for named NPC encounter types so Road/UI code stops inferring meaning from dialogue ids.
- Keep dialogue outcome execution in TS even if the trees move to JSON.

---

## Phase 5 — UI performance and UX cleanup

**Purpose:** reduce unnecessary rerenders and move gameplay-derived logic back into shared selectors/helpers.

Planned work:

1. Stop passing the full `GameState` through most of the UI tree when a selector or view model would do.
2. Add screen-level view-model helpers for:
   - road action availability
   - inventory summary
   - map detail state
   - combat UI presentation
3. Replace duplicated gameplay derivation in `app\game.tsx` with shared engine/state helpers.
4. Memoize expensive leaf components and list rows after profiling.
5. Consolidate repeated style literals into theme/style modules where it improves reuse and readability.
6. Address lint-driving style noise gradually rather than in one massive styling rewrite.

UI-specific suggestions:

- Use Zustand slice selectors directly in stable leaf components where it clearly reduces prop churn.
- Prefer `React.memo` for repeated rows/cards only after measuring.
- Keep `StyleSheet.create` as the default, but do not do a repo-wide style rewrite as part of the data refactor.

---

## Phase 6 — Save robustness, validation, and test strategy

**Purpose:** make content refactors safe to ship.

Planned work:

1. Strengthen save validation beyond basic shape checks:
   - valid item ids in inventory/equipment
   - valid companion ids
   - valid location ids
   - valid story flags/status ids if registries are introduced
2. Add data-registry tests for every JSON source.
3. Add seeded regression tests for:
   - travel progression
   - combat outcomes
   - event sampling
   - dialogue gating
4. Add golden-seed smoke tests that load a run, advance several turns, save, reload, and confirm stable state evolution.

---

## 6. System-by-system recommendations

### Travel

- Extract movement, food pressure, weather, and shortcut rules into a dedicated module.
- Externalize region pacing modifiers and merchant/shop availability.
- Keep shortcut generation logic in TS, but move static candidate data out of code when practical.

### Combat

- Split runtime from data.
- Replace placeholder/partial ability effects.
- Move enemy/boss/loot/narrative data to JSON.
- Normalize bonus units and remove hard-coded roster assumptions.

### Equipment and inventory

- Decouple drop behavior from sell behavior.
- Unify item effect semantics and bonus display units.
- Externalize shop inventory and item source tables.

### Mobs and enemies

- Move definitions to JSON early.
- Keep AI resolution in TS.
- Add per-region or per-location difficulty controls only after the base migration is stable.

### NPCs and companions

- Move static companion data to JSON.
- Extract loyalty/affinity calculations.
- Validate all ids and preferred-reputation ranges at load time.

### Randomness

- Route all gameplay randomness through seeded helpers.
- Remove stale nondeterministic helpers once deterministic replacements are fully adopted.
- Keep seed generation and run-id concerns explicit and documented.

### UI and efficiency

- Use selector-driven props and view models.
- Remove duplicated rule logic from screens.
- Profile before over-optimizing render paths.

---

## 7. Risks and work to defer

These should **not** be first-pass refactor work:

1. A full rewrite of the turn state machine.
2. A repo-wide style-system rewrite.
3. Aggressive store restructuring before profiling.
4. Replacing every helper with a schema library in one pass.
5. Mixing new features with the JSON migration.

Why defer:

- They increase blast radius without directly helping the main objective of content externalization and targeted gameplay cleanup.

---

## 8. Suggested implementation order

1. Baseline cleanup and documentation refresh.
2. Data loaders + JSON validation layer.
3. Migrate enemies, items, events, progression data, and narrative tables.
4. Migrate companions and static location data.
5. Remove duplicated UI/gameplay derivation.
6. Extract travel and companion rules modules.
7. Refactor combat runtime and special effects.
8. Migrate dialogue trees after schema tooling proves stable.
9. Strengthen save validation and seeded regression coverage.

---

## 9. Open design questions

These are the main decisions worth settling before implementation starts:

1. **Dialogue migration timing:** should dialogue trees move to JSON in the first wave, or only after the data-loader/validator pattern is proven on items/enemies/events?
2. **Validation approach:** do you want lightweight custom validators, or a schema library for JSON/runtime validation?
3. **Balance ownership:** should progression thresholds and level-up choices become fully design-owned data, or stay partly code-owned?
4. **Combat scope:** should the first combat pass only remove placeholder logic, or also rebalance negotiate/flee/support systems?
5. **UI scope:** do you want this refactor to include a meaningful lint/style cleanup pass, or keep UI changes limited to performance and gameplay wiring?

---

## 10. Recommended near-term focus

If this roadmap is executed in slices, the best first slice is:

1. establish the JSON loader/validation pattern,
2. migrate enemies/items/events/progression/narratives,
3. remove duplicated UI gameplay logic,
4. then tackle combat/travel rule extraction.

That path gives the best ratio of gameplay improvement, maintainability, and lower-risk refactor value.
