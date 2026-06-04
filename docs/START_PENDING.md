# START_PENDING — Non-Overlapping & Pending Items

This document preserves unique improvement streams from `START1.md`, `START2.md`, and
`START3.md` that do not overlap with the unified task list in `START_COMMON.md`.

Items are annotated with:
- **Complexity**: Low / Medium / High — effort relative to other items here
- **Priority**: Immediate (fold into next sprint) / Soon (next phase) / Later (post-stable)
- **Blocker**: any dependency that must be resolved first

---

## 1. Engine & State Reliability

### 1A. Deterministic Seeded Randomness
**Source**: `START1` Workstream 1.2
**Complexity**: Medium-high · **Priority**: Soon

**Details**: The game stores a `seed` on each run but all random calls still go
through `Math.random()`, making events, hunt yields, and combat outcomes
non-reproducible. This complicates balancing, bug reports, and future challenge modes.

**Implementation**:
1. Add a small seeded RNG utility (e.g., `mulberry32` or `xorshift32` — both are
   < 10 lines):
   ```typescript
   function mulberry32(seed: number) {
     return function() {
       seed |= 0; seed = seed + 0x6D2B79F5 | 0;
       let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
       t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
       return ((t ^ t >>> 14) >>> 0) / 4294967296;
     };
   }
   ```
2. Add `rngState: number` to `GameState` (initialized from `run.seed`).
3. Expose a `nextRandom()` method on `TurnEngine` that uses and advances `rngState`,
   then serialize `rngState` each turn.
4. Route all `Math.random()` calls in `TurnEngine`, `CombatEngine`, and `EventSystem`
   through `nextRandom()`.

**Design decision to make first**: Persist full RNG state each turn (exact
turn-by-turn reproduction) vs. derive per-turn seeds from `seed + dayNumber`
(simpler, slightly less strict). Document the choice before implementing.

---

### 1B. Extended Journal & Turn History Logging
**Source**: `START1` Workstream 1.3
**Complexity**: Low · **Priority**: Soon

**Details**: The current `TurnRecord` captures action type and resource deltas but
`locationBefore` / `locationAfter` are unreliable, and interactive event outcomes
(victory vs. fled vs. negotiated vs. dialogue choice) are not distinguished.

**Implementation**:
1. In `TurnEngine`, capture `locationBefore` at turn start before any action
   resolves, and `locationAfter` at the end of `cleanup()`.
2. Store the selected `action` on the turn record at the moment `submitAction()` is
   called, not after resolution.
3. Add an optional `eventOutcome` field to `TurnRecord`:
   ```typescript
   eventOutcome?: {
     eventId:   string;
     result:    'victory' | 'defeat' | 'fled' | 'negotiated' | 'dialogue_complete';
     summary?:  string;
   };
   ```
4. Populate `eventOutcome` in `resolveInteractiveEvent()` before calling `cleanup()`.
5. Update `JournalModal` to display the outcome label alongside the event ID —
   "Defeated Wolves" reads better than the raw event ID string.

---

### 1C. Decouple Storage Calls from Screens
**Source**: `START1` Workstreams 1.4 and 2.3
**Complexity**: Medium · **Priority**: Soon · **Blocker**: resolve TurnEngine state ownership first

**Details**: `InventoryScreen` and `ShopScreen` call `saveEngine.saveRun()` directly.
This duplicates persistence logic and can produce inconsistent state if save timing
drifts from actual state mutations.

**Implementation**:
1. Create `src/hooks/useInventoryActions.ts`:
   ```typescript
   export function useInventoryActions() {
     const gameState = useGameStore(s => s.gameState);
     const setGame   = useGameStore(s => s.setGameState);

     async function equipItem(itemId: string) {
       const next = ItemSystem.equip(gameState, itemId);
       setGame(next);
       await saveEngine.saveRun(next);
     }
     // unequip, useItem, sellItem follow the same pattern
     return { equipItem, unequipItem, useItem, sellItem };
   }
   ```
2. Create `src/hooks/useShopActions.ts` similarly for buy/sell.
3. Remove direct `saveEngine.saveRun()` calls from `InventoryScreen.tsx` and
   `ShopScreen.tsx`, replacing them with the hook actions.
4. Do this after confirming the TurnEngine internal state copy and Zustand store
   are in sync — adding a persistence layer on top of an inconsistent state boundary
   will amplify bugs, not fix them.

---

## 2. Combat Mechanics & Systems

### 2A. Stabilize Enemy Construction
**Source**: `START2` Item 8
**Complexity**: Low · **Priority**: Immediate

**Details**: `buildEnemiesFromContext(event, gameState)` is called in the render body
of `CombatScreen.tsx` (line 82). It uses `Math.random()` and runs on every render,
meaning different renders could theoretically produce different enemies mid-combat.

**Implementation**:
1. Remove the top-level call from the component body.
2. Move it inside the engine initialization `useEffect`:
   ```typescript
   useEffect(() => {
     if (engineRef.current) return;
     const enemies = buildEnemiesFromContext(event, gameState); // runs once
     const engine  = new CombatEngine(enemies, gameState, onStateChange);
     engineRef.current = engine;
     // ...
   }, []);
   ```
3. This is a 5-line change with no API surface changes required.

---

### 2B. Combat Consumable Item Picker
**Source**: `START2` Item 11
**Complexity**: Medium · **Priority**: Soon · **Blocker**: confirm `playerSkill()` behavior first

**Details**: The Skill button says "Use consumable" but either picks an item blindly
or does nothing useful. Players should choose which item to use.

**Implementation**:
1. Before building the picker UI, audit `CombatEngine.playerSkill()` to determine
   if it already threads an item ID or uses a placeholder. If placeholder, replace
   the logic before adding the picker.
2. Extend `CombatAction` to carry an optional `itemId`:
   ```typescript
   export type CombatAction =
     | { type: 'attack';    targetEnemyIndex: number }
     | { type: 'defend' }
     | { type: 'skill';     itemId: string }
     | { type: 'flee' }
     | { type: 'negotiate' };
   ```
3. Add state to `CombatScreen`: `const [showItemPicker, setShowItemPicker] = useState(false);`
4. When Skill is tapped, set `showItemPicker(true)` instead of calling
   `handleAction('skill')` directly.
5. Render an overlay above the action grid:
   ```tsx
   {showItemPicker && (
     <View style={s.itemPickerOverlay}>
       <Text style={s.itemPickerTitle}>USE ITEM</Text>
       {usableItems.map(item => (
         <TouchableOpacity key={item.id} onPress={() => {
           setShowItemPicker(false);
           handleAction('skill', 0, item.id);
         }}>
           <Text style={s.itemName}>{item.name}</Text>
           <Text style={s.itemDesc}>{item.activeEffect?.description}</Text>
         </TouchableOpacity>
       ))}
       <TouchableOpacity onPress={() => setShowItemPicker(false)}>
         <Text style={s.cancelText}>Cancel</Text>
       </TouchableOpacity>
     </View>
   )}
   ```
6. Inventory is not a direct field on `GameState` — it is derived from resources.
   Build `usableItems` via the existing helper:
   ```typescript
   import { inventoryFromResources } from '@engine/ItemSystem';
   const inv        = inventoryFromResources(gameState.resources);
   const usableItems = inv.items
     .map(i => getItemDef(i.definitionId))
     .filter((def): def is ItemDefinition => !!def?.activeEffect && def.category === ItemCategory.Consumable);
   ```
   If `usableItems` is empty, show the Skill button as disabled with sub-label "No items".
7. In `CombatEngine.resolvePlayerTurn()`, handle the `skill` action by looking up the
   item by `itemId` and applying its `activeEffect` to the combat state.

---

### 2C. Combat Log Height & Layout
**Source**: `START2` Item 16
**Complexity**: Low · **Priority**: Immediate

**Details**: `maxHeight: 90` on the combat log allows only 4–5 lines. Critical combat
events (stun, drain, pack calls) scroll out of view before the player reads them.

**Implementation**:
1. In the `StyleSheet` in `CombatScreen.tsx`, change the `log` style:
   ```typescript
   log: {
     // ... existing styles unchanged ...
     flex:      1,       // remove maxHeight: 90
     minHeight: 80,
     maxHeight: 220,
   },
   ```
2. `s.root` is already `flex: 1`, so the log will naturally grow to fill available
   space between the party row and the action grid.

---

### 2D. Enemy Behavior Long-Press Tooltips
**Source**: `START2` Item 14
**Complexity**: Low · **Priority**: Soon

**Details**: `BehaviorTag` labels ("Pack", "Spectral") are opaque. New players have
no way to learn what enemy behaviors mean without external reference.

**Implementation**:
1. Add a behavior description map in `CombatScreen.tsx`:
   ```typescript
   const BEHAVIOR_DESC: Record<EnemyBehavior, string> = {
     [EnemyBehavior.Aggressive]:  'Attacks every round without hesitation.',
     [EnemyBehavior.Opportunist]: 'Targets the weakest party member preferentially.',
     [EnemyBehavior.Defensive]:   'Takes reduced damage until provoked.',
     [EnemyBehavior.Pack]:        'May call additional enemies when bloodied.',
     [EnemyBehavior.Undead]:      'Cannot flee or be negotiated with.',
     [EnemyBehavior.Spectral]:    'Resists 40% of physical damage.',
   };
   ```
2. Add state: `const [behaviorTip, setBehaviorTip] = useState<string | null>(null);`
3. Wrap `BehaviorTag` in a `TouchableOpacity` with `onLongPress`:
   ```tsx
   <TouchableOpacity onLongPress={() => onToast(BEHAVIOR_DESC[behavior])}>
     <BehaviorTag behavior={behavior} />
   </TouchableOpacity>
   ```
4. Route through the existing `onToast` prop — no new UI component required.
   The toast auto-dismisses after 2.5 seconds.

---

### 2E. Level-Up Choice Stat Preview
**Source**: `START2` Item 13
**Complexity**: Low-medium · **Priority**: Soon

**Details**: Level-up choices show a label and description but no numbers. Seeing
"Max HP 70 → 85" is more compelling and informative than prose alone.

**Implementation**:
1. Add an optional field to `LevelUpChoice` in `types.ts`:
   ```typescript
   export interface LevelUpChoice {
     id:           string;
     label:        string;
     description:  string;
     statPreview?: string;  // e.g. "Max HP  70 → 85"
   }
   ```
2. In `TurnEngine.ts`, where `LevelUpChoice` objects are constructed, compute the
   before/after for numeric stat choices:
   ```typescript
   // Example for a maxHealth choice:
   const before = this.state.player.stats.maxHealth;
   const after  = before + delta.maxHealth;
   choice.statPreview = `Max HP  ${before} → ${after}`;
   ```
3. Not all choices map to a single stat (some grant passive effects or abilities) —
   `statPreview` is intentionally optional for those cases.
4. In `LevelUpModal`, render the preview below the description:
   ```tsx
   {choice.statPreview && (
     <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11,
                    color: '#B8860B', marginTop: 4 }}>
       {choice.statPreview}
     </Text>
   )}
   ```

---

## 3. Gameplay Pacing & Hazards

### 3A. Pre-Action Starvation Alert
**Source**: `START2` Item 12
**Complexity**: Low · **Priority**: Immediate

**Details**: Players can press Move or Force March with `food < 1` without any
warning. The next turn will apply starvation damage and they may not realize it.
This alert is independent of the `confirmActions` setting — it should always show.

**Implementation**:
1. In `RoadScreen.submit()`, intercept travel actions before calling the engine:
   ```typescript
   function submit(params: ActionParams) {
     if (!engine) { onToast('Engine not ready'); return; }

     if (params.action === PlayerAction.Move && gameState.resources.food < 1) {
       Alert.alert(
         'Starving',
         'You have almost no food. Moving will cost health. Continue?',
         [
           { text: 'Stay',  style: 'cancel' },
           { text: 'March', onPress: () => engine.submitAction(params).catch(console.error) },
         ]
       );
       return;
     }

     engine.submitAction(params).catch(console.error);
   }
   ```
2. The threshold is `< 1`, not `< 0` — the turn hasn't consumed food yet so
   checking after-cost would be off by one.

---

### 3B. Rest & Hunt Hazard Ambush Risk
**Source**: `START3` Step 3
**Complexity**: Low-medium · **Priority**: Soon

**Details**: Rest and Forage are currently safe actions with no chance of interruption.
Adding a region-dependent ambush risk makes wilderness resource actions feel genuinely
dangerous and adds meaningful tension to the recovery decision.

**Implementation**:
1. In `TurnEngine.ts`, add a private helper. Note: `dangerLevel` lives on the
   `RegionDefinition`, not on `Location` — use `getRegion(locationId).dangerLevel`:
   ```typescript
   private maybeTriggerAmbush(action: PlayerAction): void {
     const loc      = getLocation(this.state.currentLocationId);
     const region   = getRegion(this.state.currentLocationId);
     const isSafe   = loc.isTown || region.dangerLevel <= 1;
     const chance   = isSafe ? 0 : region.dangerLevel * 0.05; // 5% per danger tier (max 50%)
     if (Math.random() > chance) return;

     const ambush: GameEvent = {
       id:             `ambush_${action}_day${this.state.dayNumber}`,
       type:           EventType.Combat,
       resolutionType: ResolutionType.Interactive,
       name:           action === PlayerAction.Rest
                         ? 'Disturbed Sleep'
                         : 'Predator in the Brush',
       description:    action === PlayerAction.Rest
                         ? 'Your camp is breached while you sleep.'
                         : 'Something was hunting you while you were hunting.',
       conditions:     { probability: 1.0 },
       repeatable:     true,
       tags:           ['combat', 'hazard_ambush'],
     };
     this.pendingEvents.unshift(ambush);
   }
   ```
2. Call `this.maybeTriggerAmbush(PlayerAction.Rest)` at the end of `resolveRest()`.
3. Call `this.maybeTriggerAmbush(PlayerAction.Hunt)` at the end of `resolveHunt()`.
4. Use `loc.dangerLevel` to scale probability so towns and low-danger regions feel
   genuinely safe, while deep wilderness feels threatening.
5. Add a narrative toast or journal note when an ambush triggers so the player
   understands why their rest was interrupted.

---

### 3C. Active Weather Effects
**Source**: `START3` Step 4
**Complexity**: Low · **Priority**: Soon

**Details**: Weather is shown as a label with minimal mechanical effect. Severe
weather should threaten food stores; ideal weather should reward travel with a
small morale boost.

**Implementation**:
1. In `TurnEngine.cleanup()` or `updateStats()`, add weather consequence checks:
   ```typescript
   if (this.state.weather === WeatherType.Severe && Math.random() < 0.10) {
     this.applyDelta({ food: -1, narrative: 'Rations ruined by the storm.' });
   }
   if (this.state.weather === WeatherType.Ideal
       && this.state.currentTurn?.action === PlayerAction.Move) {
     this.applyDelta({ morale: 2, narrative: 'Morale lifts under clear skies.' });
   }
   ```
2. Always surface weather consequence via a journal narrative line — a silent
   food loss is frustrating without explanation.
3. Do not add effects for `WeatherType.Neutral` or `WeatherType.Poor` — those
   tiers should feel neutral. Reserve active effects for the extremes.

---

## 4. Content, Audio & Progression

### 4A. Run-to-Run Meta Progression
**Source**: `START1` Workstream 3.5
**Complexity**: High · **Priority**: Later — do not start before Milestones A–D

**Details**: Unlockable starting perks, alternate backgrounds, class choices, and
challenge modifiers. Meaningful replayability driver, but requires the base loop
to be balanced and stable first.

**Why it must wait**: Any meta-perk needs to be validated against the full
encounter/event/companion ecosystem. Starting this before core balance is settled
creates compounding design debt.

**When ready, implementation approach**:
1. Add `unlockedPerks: string[]` to a new `MetaState` stored separately from
   `GameState` (it persists across runs, not within them).
2. Build a pre-run selection screen between "New Game" and the first turn.
3. Apply selected perk modifiers to the initial `GameState` in `createNewGameState()`.

---

### 4B. Audio Implementation
**Source**: `START1` Workstream 7.2
**Complexity**: Medium · **Priority**: Later · **Blocker**: audio assets must exist first

**Details**: `SoundEngine.ts` is fully scaffolded — the code wiring is straightforward.
The actual blocker is the absence of `.mp3` files. This is primarily a content
production task, not an engineering task.

**Implementation** (once assets exist):
1. Place `.mp3` files in `src/assets/sfx/` following the naming convention the
   scaffolded `SoundEngine` already expects.
2. Uncomment the asset map in `SoundEngine.ts`.
3. Wire trigger calls for: button taps, combat hits, victory/defeat stings, level-up
   chime, item use.
4. At app start in `app/_layout.tsx`, call the static setup and configure with
   loaded settings — `SoundEngine` uses `setup()` (static, sets audio mode) and
   `soundEngine.configure(settings)` (instance, applies volume/enabled):
   ```typescript
   import { soundEngine } from '@engine/SoundEngine';
   // In _layout.tsx useEffect:
   SoundEngine.setup();                              // audio session
   saveEngine.loadSettings().then(s => soundEngine.configure(s));  // volume
   ```
5. `soundEnabled` and `musicVolume` from `AppSettings` are consumed by
   `soundEngine.configure()` — no separate wiring needed.

---

### 4C. Bottom Tab Navigation Polish
**Source**: `START2` Item 20
**Complexity**: Low · **Priority**: Immediate

**Details**: "PACK" as an inventory label is jargon; the geometric symbols (`◆ ▲ ◈`)
don't communicate function. The disabled Combat tab fades to near-invisible rather
than showing a clear locked state.

**Implementation**:
1. In `app/game.tsx`, update the `TABS` array labels. Keep the existing aesthetic
   symbols for icons — emoji are inconsistent with the Cinzel/parchment design —
   but update the text labels:
   ```typescript
   const TABS = [
     { id: 'road',      label: 'Road',   icon: '◆' },
     { id: 'combat',    label: 'Combat', icon: '⚔' },
     { id: 'dialogue',  label: 'Talk',   icon: '◇' },
     { id: 'inventory', label: 'Gear',   icon: '▲' },
     { id: 'map',       label: 'Map',    icon: '◈' },
   ];
   ```
2. For the disabled Combat tab, add a "LOCKED" sub-label instead of just fading:
   ```tsx
   {disabled && (
     <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 8,
                    color: '#555', marginTop: 1, letterSpacing: 0.5 }}>
       LOCKED
     </Text>
   )}
   ```

---

## Priority Summary

| Item  | Description                      | Complexity | Priority  |
|-------|----------------------------------|------------|-----------|
| 2A    | Stabilize enemy construction     | Low        | Immediate |
| 2C    | Combat log height                | Low        | Immediate |
| 3A    | Starvation alert                 | Low        | Immediate |
| 4C    | Tab navigation labels            | Low        | Immediate |
| 1B    | Extended journal logging         | Low        | Soon      |
| 2D    | Behavior tooltips                | Low        | Soon      |
| 2E    | Level-up stat preview            | Low-med    | Soon      |
| 3B    | Rest/Hunt ambush risk            | Low-med    | Soon      |
| 3C    | Active weather effects           | Low        | Soon      |
| 2B    | Combat item picker               | Medium     | Soon      |
| 1C    | Decouple storage from screens    | Medium     | Soon      |
| 1A    | Seeded RNG                       | Med-high   | Soon      |
| 4B    | Audio wiring                     | Medium     | Later     |
| 4A    | Meta progression                 | High       | Later     |
