# START1 — Improvement Plan for *100 Days to Save the World*

## Purpose

This document turns the current codebase review into an execution plan. It is intended to guide the next round of work across architecture, gameplay, UI, content, and polish, with a **mobile-first** product standard.

The app already has a strong foundation:

- **Platform:** Expo + React Native + TypeScript
- **Routing:** Expo Router
- **State:** Zustand
- **Persistence:** AsyncStorage via `SaveEngine`
- **Core loop:** travel 125 locations in 100 days, manage resources, survive events, recruit companions, and defeat endgame bosses
- **Major systems already present:** travel, combat, dialogue, inventory, map, shop, run history, settings

The goal of this plan is not to redesign the game from scratch. It is to move the existing prototype into a cleaner, more reliable, more replayable, and more mobile-friendly game.

---

## Product Vision

Build a **mobile-first narrative survival RPG** where each day matters, the player feels the pressure of the 100-day clock, companions create emotional and mechanical texture, and every major screen supports fast, thumb-friendly play on a phone.

Success means:

1. The game is stable and type-safe.
2. The core loop is readable, strategic, and replayable.
3. The UI feels designed for phones first, not adapted downward from a desktop mental model.
4. Systems are modular enough to expand content without increasing fragility.

---

## Current Understanding of the App

## App structure

- `app/index.tsx` — title screen, active save, run history, intro splash
- `app/game.tsx` — main shell, top chrome, bottom tab nav, modal orchestration
- `src/screens/*` — road, combat, dialogue, inventory, map, shop
- `src/engine/*` — game rules and orchestration
- `src/data/*` — locations and companions
- `src/store/gameStore.ts` — global state container

## Core gameplay loop

The player advances one day at a time through a structured turn pipeline:

1. Choose an action on the road screen.
2. Resolve the action in `TurnEngine`.
3. Sample passive and interactive events.
4. Resolve combat or dialogue when triggered.
5. Apply deltas to health, morale, food, gold, reputation, and companions.
6. Check level-up and win/loss conditions.
7. Save the run and advance the day.

## Architectural strengths

- The engine/UI split is directionally correct.
- Gameplay concepts are already defined as explicit types.
- The app has a complete-enough shell to support iterative enhancement.
- The world structure is large enough to support strong progression pacing.

## Architectural concerns

- Several systems are only partially wired.
- Some data and component files are too large to scale comfortably.
- Persistence and determinism are incomplete in key places.
- There is repeated direct state/save wiring in screen code.
- The current build is not fully green.

---

## Guiding Principles

## 1. Mobile-first

All interaction design should assume a handheld device first:

- one-thumb reach for primary actions
- clear hierarchy above density
- large tap targets
- short default reading paths with optional expansion
- responsive layouts that still feel good on small screens

## 2. Fix foundations before polish

Do not add major new features on top of unstable build health or placeholder systems.

## 3. Preserve the existing identity

Keep the dark fantasy road-journey tone, the day-clock pressure, and the authored world structure.

## 4. Favor explicit systems over hidden magic

State transitions, event sampling, progression, and companion effects should remain inspectable and testable.

## 5. Expand through composition

Split large files, isolate reusable logic, and move authored content into maintainable structures so new content does not require risky edits to central files.

---

## Recommended Delivery Order

## Phase 0 — Stabilize the project

**Goal:** create a reliable base for further work.

### Tasks

1. Fix current TypeScript errors.
2. Fix current lint errors that block normal iteration.
3. Remove or archive stray files that do not belong in the app runtime.
4. Update stale documentation that no longer reflects the codebase.

### Specific issues already identified

- `app/game.tsx` has nullability/type mismatches.
- `src/data/companions.ts` references properties missing from type definitions.
- `src/engine/CombatEngine.ts` has typing issues in enemy construction.
- `src/engine/SaveEngine.ts` has migration casting issues.
- `src/screens/DialogueScreen.tsx`, `InventoryScreen.tsx`, and `MapScreen.tsx` have strict typing issues.
- `app/index.tsx` has lint failures for unescaped quotes.
- `src/screens/map_screen.html` is a stray file and should be removed or relocated.

### Deliverables

- `npm run lint` passes
- `npm run typecheck` passes
- stale or stray files removed
- docs updated to reflect actual state

### Why this phase comes first

Without a clean baseline, every future refactor or gameplay change becomes more expensive and riskier.

---

## Phase 1 — Make state and progression trustworthy

**Goal:** ensure the run behaves consistently, persists correctly, and is easier to reason about.

### Workstream 1.1 — Persist all meaningful game state

#### Problem

`DialogueEngine` currently uses module-level story flags as a placeholder. That means story state can be lost on restart and is harder to reason about.

#### Plan

1. Add `storyFlags: Set<string>` to `GameState`.
2. Include story flags in serialization and migration logic.
3. Replace module-level flag storage in `DialogueEngine` with reads/writes against `GameState`.
4. Ensure dialogue conditions and branching consume persisted state.

#### Result

Story progression becomes durable, debuggable, and future-proof.

### Workstream 1.2 — Introduce deterministic RNG

#### Problem

The game stores a `seed` but still relies broadly on `Math.random()`. This weakens reproducibility, balancing, and debugging.

#### Plan

1. Add a seeded RNG utility owned by the run state.
2. Route event sampling, flavor text rolls, combat randomness, hunt yields, and movement luck through it.
3. Decide whether the RNG state advances and persists each turn, or whether turn-local seeds are derived from run seed + day + location.
4. Document the chosen strategy.

#### Result

- reproducible bug reports
- easier balancing
- eventual support for daily challenges, replay seeds, and deterministic simulations

### Workstream 1.3 — Repair turn history accuracy

#### Problem

The journal is useful thematically, but some turn-record details are unreliable:

- chosen action is not properly recorded in the turn state
- `locationBefore` and `locationAfter` are not accurately captured
- event reporting can lose fidelity

#### Plan

1. Store the selected action at turn start.
2. Capture `locationBefore` before movement and `locationAfter` after delta application.
3. Record interactive event outcomes distinctly.
4. Expand `TurnRecord` so the journal can communicate what truly happened.

#### Result

The journal becomes a reliable run-history tool instead of flavor-only output.

### Workstream 1.4 — Reduce direct persistence wiring from screens

#### Problem

Multiple screens mutate game state and call `saveEngine.saveRun()` directly. This creates duplication and raises the chance of inconsistent behavior.

#### Plan

1. Create a small app-layer abstraction for run updates.
2. Move save orchestration into shared actions/hooks where possible.
3. Standardize how immediate actions, turn actions, and inventory updates persist.

#### Result

Cleaner screen code and fewer persistence bugs.

---

## Phase 2 — Refactor for maintainability

**Goal:** make the code easier to extend without changing the game’s behavior.

### Workstream 2.1 — Break up oversized files

#### Targets

- `src/components/index.tsx`
- `src/data/locations.ts`
- large engine files as needed

#### Plan

1. Split shared UI components into dedicated files by responsibility:
   - top chrome
   - toasts
   - modals
   - journal
   - settings
2. Split location content by region or generated content modules.
3. Keep central barrel exports for ergonomic imports.

#### Result

Smaller diffs, easier ownership, lower merge conflict risk, and cleaner reasoning.

### Workstream 2.2 — Separate content from system logic

#### Problem

The project currently mixes authored data and engine logic in ways that will become painful as content grows.

#### Plan

1. Treat locations, enemies, items, and dialogue content as data-first modules.
2. Keep system code focused on evaluation and resolution.
3. Introduce generation/import scripts later if spreadsheet-based authoring remains part of the workflow.

#### Result

Non-system content changes become safer and faster.

### Workstream 2.3 — Add a thin domain/action layer

#### Plan

Introduce focused hooks or controllers such as:

- `useRunController`
- `useInventoryActions`
- `useSettings`
- `useDialogueController`

These should:

- encapsulate store access
- handle persistence
- centralize validation and messaging

#### Result

Screens become thinner and easier to refactor for mobile UX.

### Workstream 2.4 — Normalize design tokens

#### Problem

The visual style is strong, but values are scattered across inline styles and repeated literal colors.

#### Plan

1. Create centralized tokens for colors, spacing, radii, shadows, and typography.
2. Standardize panel, button, badge, and divider primitives.
3. Decide clearly whether the project should favor StyleSheet-based design primitives or NativeWind utility usage.

#### Result

A more coherent and scalable UI system.

---

## Phase 3 — Improve the core game loop

**Goal:** make repeated play more strategic and less repetitive.

### Workstream 3.1 — Clarify action roles on the road

#### Problem

The road screen already supports several actions, but the decision space can collapse into a narrow optimal pattern.

#### Plan

Sharpen each action’s identity:

- **Move:** best for pace, baseline risk
- **Force March:** pace spike with stronger cost/exhaustion tradeoff
- **Forage/Hunt:** resource recovery tied strongly to terrain, gear, and companions
- **Rest/Camp:** safety and recovery with tempo cost
- **Rally:** party management and morale/loyalty investment
- **Trade:** strategic conversion and preparation

Then add 1–3 more actions later if needed:

- scout ahead
- guard camp
- perform/bargain/intimidate in settlements
- companion-led road actions

#### Result

Players make more meaningful daily choices.

### Workstream 3.2 — Make pace pressure visible everywhere

#### Problem

The map communicates pace, but the player should not need to visit a separate tab to understand urgency.

#### Plan

1. Surface pace status on the road screen.
2. Show simple messaging such as:
   - on pace
   - 2 locations behind pace
   - must average 2 locations/day from here
3. Tie dread/urgency presentation to this data.

#### Result

The 100-day premise becomes a constant felt pressure, not just a rule in the background.

### Workstream 3.3 — Deepen morale and reputation

#### Problem

Morale and reputation are present, but they should drive more content and strategy.

#### Plan

Increase their impact on:

- event pool weights
- dialogue availability and tone
- recruitment conditions
- companion loyalty drift
- shop pricing and town interactions
- negotiation/flee success
- late-game dread pressure

#### Result

The run feels more reactive to player identity.

### Workstream 3.4 — Strengthen companion systems

#### Problem

Companions are already one of the most compelling parts of the design, but they can matter more moment-to-moment.

#### Plan

1. Make loyalty consequences more visible.
2. Add small companion banter or contextual commentary on the road.
3. Expand companion synergies:
   - scouting pairs
   - morale teams
   - combat frontline/support combinations
4. Add more companion-triggered micro-events and disagreements.
5. Make departure risk feel forecastable rather than sudden.

#### Result

Companions become central to the emotional and strategic arc of a run.

### Workstream 3.5 — Improve run-to-run progression

#### Plan

Add meta progression only after the base loop is stable:

- unlockable starting perks
- codex/journal discoveries
- background/class selection
- alternate seeds or challenge modifiers

#### Result

Improved replayability without compromising the run-based structure.

---

## Phase 4 — Combat improvements

**Goal:** make combat legible, complete, and tactically satisfying on mobile.

### Workstream 4.1 — Replace placeholder skill behavior

#### Problem

`CombatEngine.playerSkill()` currently uses placeholder behavior rather than the real item/skill system.

#### Plan

1. Decide what “Skill” means:
   - consumables in combat
   - player techniques
   - companion commands
   - a hybrid of those
2. Wire it to item and/or skill definitions.
3. Support target selection where needed.
4. Update result logging and resource consumption accordingly.

#### Result

Combat gains meaningful tactical choice beyond attack/defend/flee.

### Workstream 4.2 — Improve combat readability

#### Plan

1. Telegraph dangerous enemy behaviors.
2. Show expected flee and negotiate odds more clearly.
3. Make target selection more explicit.
4. If settings allow, show or hide damage numbers consistently.
5. Highlight status effects with clear iconography and concise text.

#### Result

Players can understand what happened and what to do next.

### Workstream 4.3 — Tune combat pacing for phones

#### Plan

1. Reduce unnecessary log noise.
2. Keep the most important state visible without scrolling.
3. Make result overlays immediate and readable.
4. Keep high-frequency actions within comfortable thumb range.

#### Result

Combat becomes better suited to short mobile play sessions.

### Workstream 4.4 — Expand encounter variety

#### Plan

Once the base system is solid, add:

- elite variants
- environmental hazards
- multi-wave encounters
- unique boss mechanics
- companion-specific counters

#### Result

Combat remains interesting deeper into long runs.

---

## Phase 5 — Dialogue and narrative improvements

**Goal:** make the narrative layer more persistent, reactive, and readable on mobile.

### Workstream 5.1 — Persist story consequences

This is already covered architecturally in Phase 1, but the narrative layer also needs design follow-through:

1. mark critical choices as story flags
2. let later dialogue and events react
3. surface payoff in later regions

### Workstream 5.2 — Improve dialogue UX

#### Plan

1. Honor `textSpeed` settings.
2. Make “no dialogue here” transitions feel cleaner and route the player back naturally.
3. Reduce dead-end interactions that strand the player on a tab.
4. Keep response options visually distinct but not visually noisy.

### Workstream 5.3 — Add more authored narrative structure

#### Plan

1. Add recurring story threads across regions.
2. Tie companions and reputation more tightly into authored dialogue.
3. Add region-intro and region-exit narrative beats.
4. Make bosses feel foreshadowed, not isolated.

#### Result

The journey feels like a coherent campaign rather than a string of isolated nodes.

---

## Phase 6 — Mobile-first UI overhaul

**Goal:** make the experience feel intentionally designed for phones.

## UI design principles

- prioritize the current decision
- reveal detail progressively
- keep primary actions near the thumb zone
- use short labels and strong visual hierarchy
- avoid forcing tab switches just to understand urgency

### Workstream 6.1 — Road screen redesign

This should be the single highest-priority UI surface.

#### Plan

1. Rebuild the screen around a compact mobile hierarchy:
   - top: critical run status
   - middle: location summary and one primary narrative block
   - bottom: primary actions
2. Keep long flavor text collapsible.
3. Promote the most likely action and best alternative.
4. Show danger, dialogue, pace, and supply warnings at a glance.
5. Consider reducing the action grid from a dense 3-column presentation to a more thumb-friendly layout on phones.

#### Desired outcome

The player can open the game, understand the situation in seconds, and act one-handed.

### Workstream 6.2 — Navigation polish

#### Plan

1. Strengthen active tab states.
2. Add contextual badges for danger, shop access, or unread journal-worthy events.
3. Ensure the bottom nav remains readable and tappable on smaller devices.

### Workstream 6.3 — Map improvements

#### Plan

1. Keep the vertical-road concept.
2. Make the detail panel feel like a true mobile bottom sheet.
3. Add stronger preview information:
   - next shop
   - boss checkpoints
   - pace markers
   - region transitions
4. Consider a compact “next 5 locations” view on the road screen so the full map becomes optional rather than required.

### Workstream 6.4 — Inventory and shop improvements

#### Plan

1. Optimize for compare/equip/use/sell speed.
2. Highlight upgrades, equipped items, and new finds.
3. Reduce text density by default.
4. Make inventory capacity and item category filters more obvious.

### Workstream 6.5 — Typography and accessibility

#### Plan

1. Revisit all-caps density and tiny labels.
2. Increase minimum tap target sizes.
3. Validate contrast for muted text and decorative colors.
4. Support dynamic type and screen-reader-friendly labeling where possible.

---

## Phase 7 — Settings, feedback, and polish

**Goal:** finish the player-facing systems that already exist conceptually.

### Workstream 7.1 — Wire existing settings into the actual experience

#### Problem

Some settings appear in the UI but are not meaningfully applied.

#### Plan

1. `textSpeed` affects dialogue and any typewriter/reveal behaviors.
2. `showDamageNumbers` affects combat presentation.
3. `confirmActions` affects destructive or costly actions.
4. `soundEnabled` and `musicVolume` affect actual audio playback once assets exist.

### Workstream 7.2 — Complete audio implementation

#### Plan

1. Add actual sound assets.
2. Configure audio mode at app start.
3. Trigger sound effects for:
   - button taps
   - combat hits
   - victory/defeat
   - level-ups
   - item use
4. Keep it lightweight and optional.

### Workstream 7.3 — End-of-run presentation

#### Plan

Expand the run-end sequence to include:

- cause of victory/defeat/timeout
- major stats
- companions retained/lost
- distance from success
- notable choices or milestones

#### Result

Runs end with more payoff and better replay motivation.

---

## Phase 8 — Content expansion

**Goal:** deepen the world once the systems are reliable.

### Priorities

1. richer location-specific events
2. more dialogue chains and companion interactions
3. boss buildup and post-boss fallout
4. better region identity through encounter patterns
5. more item variety with clearer build paths

### Content design guidelines

- every region should feel mechanically and narratively distinct
- every 10–15 locations should introduce or reinforce a new pressure
- at least some events should have follow-up consequences later in the run
- companions should not feel like isolated recruitables; they should shape the journey

---

## Proposed Milestones

## Milestone A — Stable foundation

- build clean
- strict typing issues resolved
- stray files removed
- story flags persisted
- journal data corrected

## Milestone B — Trustworthy systems

- seeded randomness in place
- turn records accurate
- save/load migrations updated
- shared action/state layer introduced

## Milestone C — Core loop upgrade

- road screen updated for mobile-first play
- clearer pace pressure
- deeper morale/reputation effects
- stronger companion integration

## Milestone D — Combat and narrative completion

- real skill system
- dialogue consequences persist
- settings fully wired
- improved end-of-run presentation

## Milestone E — Content and polish

- additional events/dialogues/items
- sound implemented
- richer region identity
- replayability features

---

## Recommended Immediate Backlog

If work starts now, this is the recommended first sprint:

1. Fix TypeScript and lint failures.
2. Remove `map_screen.html`.
3. Persist story flags in `GameState`.
4. Correct turn record fields and journal accuracy.
5. Replace repeated direct save wiring with shared actions where practical.
6. Wire `textSpeed`, `showDamageNumbers`, and `confirmActions`.
7. Redesign the road screen for a clearer mobile-first hierarchy.

This sequence gives the best return: it improves reliability, supports future development, and upgrades the player’s most-used screen early.

---

## Risks and Mitigations

## Risk: content work lands on unstable systems

**Mitigation:** do foundation phases first.

## Risk: UI polish happens before interaction priorities are clear

**Mitigation:** redesign around mobile task flows, not visual embellishment.

## Risk: file splitting causes churn without reducing complexity

**Mitigation:** split by clear ownership boundaries and introduce barrel exports.

## Risk: deterministic RNG complicates persistence

**Mitigation:** decide early whether to persist RNG state directly or derive turn-local seeds from stable inputs.

## Risk: over-expanding scope too early

**Mitigation:** complete placeholder systems before adding major new subsystems.

---

## Definition of Done for the Next Major Iteration

The next major iteration should be considered successful when:

1. The app builds cleanly and passes lint/typecheck.
2. Run state is trustworthy across save/load.
3. The road screen clearly supports one-handed mobile play.
4. Combat, dialogue, and settings no longer contain placeholder-critical behavior.
5. Journal/history reflects actual gameplay outcomes.
6. The player can feel urgency, pacing, and companion impact without digging through tabs.

---

## Final Recommendation

Do **not** start with broad new content drops. Start with a **stability + systems pass**, then do a **mobile-first road-screen redesign**, then complete the **combat/dialogue/settings wiring**, and only then expand content aggressively.

That order preserves momentum, reduces rework, and gives the existing game structure the best chance to become a strong, shippable mobile experience.
