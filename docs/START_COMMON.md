# START_COMMON — Unified Implementation Task List

This document identifies and aggregates common improvement suggestions across `START1.md`,
`START2.md`, and `START3.md`, then expands each into a concrete implementation task.
Items are ordered within each section by recommended implementation sequence.

---

## 1. Core Architecture & Game State Persistence

### 1A. Dialogue Story Flags Persistence

**Sources**: `START1` Workstream 1.1 · `START3` Step 1

**Objective**: Move story flags from the module-level `_sessionFlags` variable in
`DialogueEngine.ts` to the serialized `GameState` so player choices persist across
app restarts. Currently all flags are lost on every restart.

**Files to modify**:
- `src/engine/types.ts`
- `src/engine/GameState.ts`
- `src/engine/SaveEngine.ts`
- `src/engine/DialogueEngine.ts`

**Steps**:
1. In `types.ts`, add `storyFlags: Set<string>` to the `GameState` interface and
   `storyFlags: string[]` to `SerializedGameState`.
2. In `GameState.ts`, update `createNewGameState()` to include
   `storyFlags: new Set<string>()` and bump `SCHEMA_VERSION` to `5`.
3. In `SaveEngine.ts`, update `serialize()` to write
   `storyFlags: Array.from(state.storyFlags)` and `deserialize()` to rebuild it as
   `new Set(saved.storyFlags ?? [])`.
4. In `SaveEngine.ts`'s `migrate()` method, add the v4→v5 transition block:
   ```typescript
   if (current.schemaVersion === 4) {
     const gs = current.gameState as Record<string, unknown>;
     if (gs['storyFlags'] === undefined) gs['storyFlags'] = [];
     current = { ...current, schemaVersion: 5 };
   }
   ```
5. In `DialogueEngine.ts`, remove the module-level flag Set and update flag
   read/write to operate directly on the `GameState` object passed into each method:
   ```typescript
   // Setting a flag during dialogue resolution:
   if (choice.outcome.flagsSet) {
     choice.outcome.flagsSet.forEach(f => gameState.storyFlags.add(f));
   }
   // Reading a flag in condition evaluation:
   if (condition.hasFlag) {
     return gameState.storyFlags.has(condition.hasFlag);
   }
   ```

---

### 1B. Verify and Harden the Location 125 Final Boss Flow

**Sources**: `START1` Phase 0 / Milestone D · `START2` Item 1

**Objective**: Confirm the final boss fight fires and resolves correctly end-to-end.
The mechanism is implemented — `BOSS_EVENT_MAP` includes `125: 'boss_dread_sovereign'`,
the event exists in `EVENT_DEFINITIONS`, and `sampleAndQueueEvents` queues it before
`checkWinLoss` runs — but it has never been manually verified in a full playthrough.

**The early return at line 766 is intentional, not a bug.** It says
*"Boss fight hasn't happened yet — sampleAndQueueEvents will queue it"* and that is
accurate. Do not remove it or replace it with manual event construction.

**Files to check**:
- `src/engine/TurnEngine.ts`
- `src/engine/CombatEngine.ts` — specifically `buildBossEnemy()`

**Verification steps**:
1. In `TurnEngine.sampleAndQueueEvents()`, confirm `BOSS_EVENT_MAP[125]` resolves to
   `'boss_dread_sovereign'` and that `EVENT_DEFINITIONS.find(e => e.id === 'boss_dread_sovereign')`
   returns a valid event (not `undefined`). This is the only thing that could silently
   break the queue.
2. In `CombatEngine.buildBossEnemy()`, confirm it handles the `boss_dread_sovereign`
   event tag and produces a valid enemy definition for Roachak. If it only handles the
   string `'boss'` generically, add an explicit case for the final boss ID.
3. After a boss victory, confirm `resolveInteractiveEvent` correctly sets both
   `bossResults.set(125, result)` and `clearedCombatLocations.add(125)`.
4. Confirm `checkWinLoss` then reaches `this.endRun('victory', ...)` on the next call.
5. Confirm the victory `Alert` in `app/game.tsx` fires as expected.

**If any step above reveals a real gap**, the targeted fix is:
- Missing event definition → add `boss_dread_sovereign` to `EVENT_DEFINITIONS` in
  `EventSystem.ts`
- `buildBossEnemy` not handling final boss → add a case in `CombatEngine.ts`
- `bossResults` / `clearedCombatLocations` not updating → trace `resolveInteractiveEvent`
  through to the result handler at ~line 108

---

## 2. Refactoring & Code Quality

### 2A. Split `src/components/index.tsx` into Focused Files

**Sources**: `START1` Workstream 2.1 · `START2` Item 9

**Objective**: At 629 lines, the single component bundle is hard to navigate and slows
IDE indexing. Split into one file per logical component. All import sites are
unchanged because the barrel re-export stays in place.

**Files to create**:
- `src/components/StatusBar.tsx`
- `src/components/JourneyBar.tsx`
- `src/components/DreadBanner.tsx`
- `src/components/Toast.tsx`
- `src/components/LevelUpModal.tsx`
- `src/components/JournalModal.tsx`
- `src/components/SettingsModal.tsx`

**Files to modify**:
- `src/components/index.tsx` — reduce to barrel re-exports only

**Steps**:
1. For each export in `components/index.tsx`, create a dedicated file containing that
   component and all of its private sub-components (`JournalEntry`, `SettingsSection`,
   `ToggleRow`, etc. move with their parent).
2. Reduce `components/index.tsx` to:
   ```typescript
   export { StatusBar }     from './StatusBar';
   export { JourneyBar }    from './JourneyBar';
   export { DreadBanner }   from './DreadBanner';
   export { Toast }         from './Toast';
   export { LevelUpModal }  from './LevelUpModal';
   export { JournalModal }  from './JournalModal';
   export { SettingsModal } from './SettingsModal';
   ```
3. All import sites (`app/game.tsx`, etc.) continue importing from `@components` —
   no changes required outside the components directory.
4. Do this split before implementing items 4C and 4D, which modify `JourneyBar` and
   `DreadBanner` respectively.

---

### 2B. Shared Theme / Color Constants File

**Sources**: `START1` Workstream 2.4 · `START2` Item 6

**Objective**: Colors are defined in three places — inline hex literals in
`RoadScreen`, a local `C` constant in `CombatScreen`, and Tailwind tokens in
`tailwind.config.js`. A single token source eliminates drift.

**Files to create**:
- `src/theme.ts`

**Files to modify**:
- `src/screens/CombatScreen.tsx`
- `src/screens/RoadScreen.tsx`
- `src/components/index.tsx` (or individual files after 2A)
- `tailwind.config.js`

**Steps**:
1. Create `src/theme.ts`:
   ```typescript
   export const Colors = {
     ink:        '#1A1208',
     inkLight:   '#2D1F0A',
     parchment:  '#F5EAD6',
     parchDark:  '#E8D5B0',
     parchDeep:  '#D4B880',
     blood:      '#8B1A1A',
     gold:       '#B8860B',
     goldLight:  '#D4A017',
     mist:       '#6B7C6E',
     green:      '#4A8A5A',
     greenLight: '#4A9E6B',
   } as const;
   ```
2. In `CombatScreen.tsx`, replace the local `const C = {...}` block with:
   ```typescript
   import { Colors as C } from '@/theme';
   ```
3. In `RoadScreen.tsx` and all component files, replace hardcoded hex strings with
   `Colors.*` references. Start with the most repeated values: `#F5EAD6`, `#1A1208`,
   `#B8860B`, `#6B7C6E`.
4. For Tailwind: `tailwind.config.js` runs at build time via CommonJS `require()`.
   Importing a TypeScript file directly may fail depending on the Metro/Babel toolchain.
   The safest approach is a plain JS token file that both sides consume:
   ```js
   // src/tokens.js  (CommonJS, no TypeScript)
   module.exports = {
     ink:        '#1A1208',
     parchment:  '#F5EAD6',
     blood:      '#8B1A1A',
     gold:       '#B8860B',
     mist:       '#6B7C6E',
     // ... full set
   };
   ```
   In `tailwind.config.js`:
   ```js
   const tokens = require('./src/tokens');
   module.exports = { theme: { extend: { colors: tokens } } };
   ```
   In `src/theme.ts`, re-export the same values with TypeScript types:
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-var-requires
   export const Colors = require('./tokens') as Record<string, string>;
   ```
   Alternatively, if the Expo Babel config already handles TS in config files, the
   single `theme.ts` approach works — confirm before assuming.

---

### 2C. Deduplicate `ACTION_LABELS`

**Sources**: `START1` Workstream 2.1 (file cleanup) · `START2` Item 7

**Objective**: `ACTION_LABEL` in `RoadScreen.tsx` and `ACTION_LABELS` in
`components/index.tsx` are identical maps. One canonical definition belongs in
`types.ts` next to the enum it maps.

**Files to modify**:
- `src/engine/types.ts`
- `src/screens/RoadScreen.tsx`
- `src/components/index.tsx`

**Steps**:
1. In `types.ts`, add the shared constant immediately after the `PlayerAction` enum:
   ```typescript
   export const ACTION_LABELS: Record<PlayerAction, string> = {
     [PlayerAction.Move]:  'Travelled',
     [PlayerAction.Hunt]:  'Foraged',
     [PlayerAction.Rest]:  'Rested',
     [PlayerAction.Trade]: 'Traded',
     [PlayerAction.Rally]: 'Rallied',
     [PlayerAction.Camp]:  'Made Camp',
   };
   ```
2. In `RoadScreen.tsx`, delete the local `ACTION_LABEL` constant and import
   `ACTION_LABELS` from `@engine/types`.
3. In `components/index.tsx` (or `JournalModal.tsx` after 2A), delete the local
   `ACTION_LABELS` constant and import from `@engine/types`.

---

## 3. Settings & Options Integration

### 3A. Wire `textSpeed` into TypewriterText

**Sources**: `START1` Workstream 7.1 · `START2` Item 2

**Objective**: The Text Speed option in Settings does nothing. `TypewriterText` in
`RoadScreen.tsx` uses a hardcoded 22 ms interval regardless of the setting.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. In `RoadScreen`, load settings inside a `useEffect` and derive a `textInterval`:
   ```typescript
   const [textInterval, setTextInterval] = useState(22);
   useEffect(() => {
     saveEngine.loadSettings().then(s => {
       const map = { slow: 45, normal: 22, fast: 8, instant: 0 };
       setTextInterval(map[s.textSpeed] ?? 22);
     });
   }, []);
   ```
2. Update the `TypewriterText` signature to accept an `interval` prop:
   ```typescript
   function TypewriterText({ text, style, interval = 22 }:
     { text: string; style?: object; interval?: number })
   ```
3. If `interval === 0` (instant), skip the timer entirely and call
   `setDisplayed(text)` immediately in the effect.
4. Pass `textInterval` to every `TypewriterText` call in `RoadScreen`.

---

### 3B. Wire `confirmActions` into Road Action Buttons

**Sources**: `START1` Workstream 7.1 · `START2` Item 3

**Objective**: The "Confirm actions" toggle does nothing. High-cost actions (Move,
Force March, Camp) should prompt for confirmation when this setting is enabled.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. Load `confirmActions` from settings in the same `useEffect` as 3A:
   ```typescript
   const [confirmActions, setConfirmActions] = useState(false);
   useEffect(() => {
     saveEngine.loadSettings().then(s => {
       setConfirmActions(s.confirmActions ?? false);
       // ... textInterval as above
     });
   }, []);
   ```
2. Introduce a `submitWithConfirm` wrapper for costly actions:
   ```typescript
   function submitWithConfirm(params: ActionParams, label: string, costDesc: string) {
     if (!confirmActions) { submit(params); return; }
     Alert.alert(label, costDesc, [
       { text: 'Cancel', style: 'cancel' },
       { text: 'Confirm', onPress: () => submit(params) },
     ]);
   }
   ```
3. Use `submitWithConfirm` for Move (`1 food`), Force March (`1.5 food`), and Camp
   (`rest — costs a turn`). Forage, Rally, and Trade do not need confirmation.

---

### 3C. Fix TypewriterText Replaying on Tab Switch

**Sources**: `START1` Workstream 5.2 (general dialogue UX) · `START2` Item 4 (Road
screen specific fix)

**Objective**: Switching away from the Road tab and back replays the journal entry
typewriter animation from the beginning. The animation should run once per new
turn entry, not once per mount. Note: START1 5.2 addresses the broader dialogue UX
(no dead-end transitions, textSpeed honoured); this task targets the Road screen bug.

**Root cause**: `app/game.tsx` renders `RoadScreen` conditionally:
`{activeTab === 'road' && <RoadScreen />}`. Every tab switch unmounts and remounts
`RoadScreen` entirely, so all local state — including animation progress — is lost.
Keying `TypewriterText` by `dayNumber` does not help because the component is inside
a screen that is fully destroyed on each switch.

**Files to modify**:
- `app/game.tsx`
- `src/screens/RoadScreen.tsx`

**Recommended fix — keep screens mounted, hide inactive ones**:
1. In `app/game.tsx`, replace conditional rendering with visibility toggling using
   `display: 'none'` / `'flex'`:
   ```tsx
   {(['road', 'combat', 'dialogue', 'inventory', 'map'] as Tab[]).map(tab => (
     <View
       key={tab}
       style={{ flex: 1, display: activeTab === tab ? 'flex' : 'none' }}
     >
       {tab === 'road'      && <RoadScreen ... />}
       {tab === 'combat'    && <CombatScreen ... />}
       {tab === 'dialogue'  && <DialogueScreen ... />}
       {tab === 'inventory' && <InventoryScreen ... />}
       {tab === 'map'       && <MapScreen ... />}
     </View>
   ))}
   ```
   This keeps all screens mounted; inactive screens have zero size and are not
   rendered to the GPU. Local state (including animation progress) is preserved.
2. Once screens stay mounted, key `TypewriterText` by `dayNumber` as originally
   planned — now the key genuinely controls when the animation reruns:
   ```tsx
   <TypewriterText
     key={`journal-${gameState.dayNumber}`}
     text={narrative}
     interval={textInterval}
     style={...}
   />
   ```

**Alternative fix — lift "already animated" state above RoadScreen**:
If keeping all screens mounted causes performance concerns (CombatScreen and
DialogueScreen re-rendering while invisible), lift a `Set<number>` of "animated
day numbers" into `app/game.tsx` and pass it down:
```tsx
const [animatedDays, setAnimatedDays] = useState<Set<number>>(new Set());
// In RoadScreen, if animatedDays.has(gameState.dayNumber), render text instantly.
// Otherwise animate and call onAnimationComplete(gameState.dayNumber).
```
This is more code but avoids mounting all screens simultaneously.

---

### 3D. Delete Stray Legacy HTML File

**Sources**: `START1` Phase 0 · `START2` Item 5

**Objective**: `src/screens/map_screen.html` is a legacy prototyping asset with no
place in a React Native project.

**Files to delete**:
- `src/screens/map_screen.html`

**Steps**:
1. Verify no import references it: `grep -r "map_screen" src/`
2. Delete the file.

---

## 4. Mobile-First Layouts & UX

### 4A. Companion Detail View (Tap to Expand)

**Sources**: `START1` Workstream 3.4 (companion emotional depth) · `START2` Item 10

**Objective**: Tapping a companion icon on the Road screen does nothing. An inline
detail card gives players tactical info and makes companions feel meaningful.
Note: companion reputation affinity (a TurnEngine mechanic) is a separate task — see 4B.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. Add state for the selected companion:
   ```typescript
   const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
   ```
2. Update `CompanionIcon` to accept and call an `onPress` prop with the companion ID.
3. Render an inline detail card beneath the companion row when a selection exists:
   ```tsx
   {selectedCompanionId && (() => {
     const c = gameState.companions.find(c => c.id === selectedCompanionId);
     if (!c) return null;
     return <CompanionDetailCard companion={c} onClose={() => setSelectedCompanionId(null)} />;
   })()}
   ```
4. `CompanionDetailCard` should display:
   - Name, archetype, and level
   - Loyalty bar with numeric value and tier label (Loyal / Wavering / Restless)
   - Passive bonus description pulled from companion definitions
   - Estimated combat power contribution
   - A muted warning line when loyalty < 30: *"Growing restless..."*
5. Tapping the close button or re-tapping the same icon dismisses the card.

---

### 4B. Companion Reputation Affinity

**Sources**: `START3` Step 2 · `START1` Workstream 3.4

**Objective**: Fix the conflation between *recruitment gating* and *ongoing loyalty
compatibility*. `isReputationInCompanionRange()` currently reads `COMPANION_REQUIREMENTS`
(a recruitment-gate structure), but it is called every turn inside the loyalty update
loop — meaning it drives ongoing loyalty drift using data designed only for initial
recruitment. Several companions also have empty `{}` requirements, so their loyalty
never shifts due to reputation mismatch even if they should thematically care.

**The actual state of the code** (do not describe this as "always returns true"):
- `COMPANION_REQUIREMENTS` exists and has meaningful data for some companions (emmy,
  scarface, lefty, velma, glubglub) — those entries work correctly for recruitment.
- Several companions have `{}` (joe, jenn, ivan, ick, rex) — no min/max fields, so
  the check always returns `true` for them.
- `dain` has `{ minReputation: 0 }` — always passes since reputation can't go below 0.
- The function is reused for per-turn loyalty drift, but `COMPANION_REQUIREMENTS` was
  never designed with that use case in mind.

**Files to modify**:
- `src/engine/types.ts`
- `src/data/companions.ts`
- `src/engine/TurnEngine.ts`

**Steps**:
1. Keep `COMPANION_REQUIREMENTS` as-is for recruitment gating — do not change it.
2. In `types.ts`, add a separate optional field to the `Companion` interface for
   ongoing compatibility preferences:
   ```typescript
   preferredReputation?: { min?: number; max?: number; };
   ```
3. In `companions.ts`, populate `preferredReputation` on each companion to express
   their thematic alignment while recruited:
   - **dain**: `preferredReputation: { min: 40 }` — prefers honorable heroes
   - **emmy**: `preferredReputation: { min: 20 }` — already has a recruitment gate;
     same threshold makes sense for ongoing loyalty
   - **joe / jenn**: `preferredReputation: { min: 25, max: 75 }` — prefer balanced players
   - **velma**: `preferredReputation: { min: 55 }` — highly principled
   - **scarface / lefty / glubglub**: `preferredReputation: { max: 40 }` — prefers
     morally flexible or low-rep heroes
   - **rex / ivan / ick**: omit — no reputation preference
4. In `TurnEngine.isReputationInCompanionRange()`, switch from `COMPANION_REQUIREMENTS`
   to the new `preferredReputation` field on the `Companion` object:
   ```typescript
   private isReputationInCompanionRange(companion: Companion): boolean {
     const pref = companion.preferredReputation;
     if (!pref) return true;
     const rep = this.state.reputation.value;
     if (pref.min !== undefined && rep < pref.min) return false;
     if (pref.max !== undefined && rep > pref.max) return false;
     return true;
   }
   ```
   `COMPANION_REQUIREMENTS` continues to be used only in the recruitment path
   (wherever `canRecruit()` from `companions.ts` is called).

---

### 4C. UI Adaptability & Screen Economy

**Sources**: `START1` Phase 6 · `START2` Items 15, 18, 19 · `START3` Step 5

**Objective**: Several layout issues compress usable screen space on small phones.
This is a multi-part task — all changes are mechanical and can be done independently.

**Files to modify**:
- `src/screens/RoadScreen.tsx` (action button pinning)
- `src/screens/InventoryScreen.tsx` (dynamic grid)
- `src/screens/ShopScreen.tsx` (dynamic grid)
- `src/components/StatusBar.tsx` (location display — after 2A)
- `src/components/JourneyBar.tsx` (dread integration — after 2A)
- `app/game.tsx` (remove standalone DreadBanner)

**Part 1 — Pin action grid above the tab bar** (START2 Item 15):
1. Change `RoadScreen` from a full-screen `ScrollView` to a two-region layout:
   ```tsx
   <View style={{ flex: 1 }}>
     <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
       {/* location header, narrative, companions, journal */}
     </ScrollView>
     <View style={{ borderTopWidth: 1, borderTopColor: '#C8B89A', padding: 12 }}>
       <SectionHeader label="Actions" right="Choose wisely" centered />
       <ActionGrid actions={...} />
     </View>
   </View>
   ```
2. `LatestJournalEntry` remains inside the `ScrollView`.

**Part 2 — Dynamic inventory grid sizing** (START3 Step 5):
`InventoryScreen` uses a slot grid and benefits from dynamic sizing.
`ShopScreen` is a row list (`BuyRow` / `SellRow` inside a `ScrollView`) — dynamic
slot sizing does not apply there. Improve the shop separately in Part 2b below.

1. In `InventoryScreen`, replace the static `GRID_SLOT_SIZE = 76` with a
   viewport-relative calculation:
   ```typescript
   const { width } = useWindowDimensions();
   const slotSize = Math.floor((width - 32) / 4); // 4 columns, 16px side padding each
   ```
2. Apply `slotSize` to the grid cell `width` and `height` style props.

**Part 2b — Shop row mobile readability**:
1. Ensure `BuyRow` and `SellRow` have a minimum height of 60px for comfortable
   tap targets.
2. Increase item name font size to at least 14px if not already.
3. Truncate long descriptions with `numberOfLines={2}` to keep rows consistent height.
4. Confirm the BUY / SELL action buttons within each row meet the 44×44pt tap target
   minimum — add `hitSlop` if the button itself is smaller.

**Part 3 — StatusBar location display** (START2 Item 18):
1. In `StatusBar`, import `getLocation` from `@data/locations`.
2. Replace the raw location number pill:
   ```typescript
   const loc      = getLocation(gameState.currentLocationId);
   const locShort = loc.name.length > 10 ? loc.name.slice(0, 9) + '…' : loc.name;
   ```
3. Show `locShort` as the value and `${gameState.currentLocationId}/125` as the
   sub-label. Give the pill `flex: 1.5` to avoid aggressive truncation.

**Part 4 — Collapse DreadBanner into JourneyBar** (START2 Item 19):
1. Pass `dreadActive` into `JourneyBar`:
   ```tsx
   <JourneyBar locationId={gameState.currentLocationId} dreadActive={gameState.morale.dreadActive} />
   ```
2. In `JourneyBar`, pulse the progress dot and recolor the bar when dread is active:
   ```typescript
   const barColor = dreadActive ? '#8B1A1A' : '#B8860B';
   const dotColor = dreadActive ? '#C94040' : '#D4A017';
   ```
3. Remove the standalone `<DreadBanner>` render from `app/game.tsx`. Keep the
   component file — it may be reused as a full-screen alert near day 90+.

---

### 4D. Haptic Feedback Expansion

**Sources**: `START1` Phase 6 (mobile accessibility) · `START3` Step 6

**Objective**: `expo-haptics` is already used in `CombatScreen` for hits and victory.
Extend it to key interactions on the Road screen and Inventory screen.

**Files to modify**:
- `src/screens/RoadScreen.tsx`
- `src/screens/InventoryScreen.tsx`

**Steps**:
1. In `RoadScreen`, add a light impact when a primary action button is tapped:
   ```typescript
   import * as Haptics from 'expo-haptics';

   // Inside ActionButton.onPress wrapper:
   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
   ```
2. In `InventoryScreen`, trigger:
   - `ImpactFeedbackStyle.Medium` on equip/unequip
   - `ImpactFeedbackStyle.Light` on item use or sell
3. Wrap all haptic calls in `.catch(() => {})` — haptics are unavailable in the
   simulator and on some Android devices.
4. Do not add haptics to passive UI (scrolling, tab switches, modal opens).

---

## 5. Verification Checklist

Run these after completing each phase above:

1. `npm run typecheck` — zero errors, particularly around:
   - `storyFlags` on `GameState` and `SerializedGameState` (task 1A)
   - `preferredReputation` on `Companion` (task 4B)
   - `Colors` import path resolution (task 2B)
2. `npm run lint` — zero violations.
3. **Save migration smoke test**: Load a schema v4 save and confirm the v5 migration
   populates `storyFlags: []` without corrupting the active run.
4. **Boss fight smoke test**: Travel to location 125 and confirm a real combat event
   fires. Confirm `isComplete = true` and the victory alert appear after the boss
   is defeated.
5. **Road screen layout**: On a simulated iPhone SE (375 × 667), confirm action
   buttons are visible without scrolling and the DreadBanner no longer occupies its
   own row.
6. **TypewriterText**: Switch tabs and return — confirm the journal animation does
   not replay. Advance a turn — confirm it plays once on the new entry.

---

## 6. Parallel Execution Plan

This section identifies which tasks can be run in parallel without stepping on the
same files or introducing avoidable merge conflicts.

### Parallelization rules

- Tasks that modify the **same file** should usually stay sequential unless they are
  deliberately coordinated in a single branch.
- Tasks that depend on a **shared refactor** should wait for that refactor to land first.
- Verification can also be parallelized: one person can execute implementation while
  another prepares migration or device smoke-test steps.

### Recommended sequencing anchors

Treat these as dependency anchors for the rest of the plan:

1. `2A. Split src/components/index.tsx into Focused Files`
2. `2B. Shared Theme / Color Constants File`
3. `1A. Dialogue Story Flags Persistence`
4. `3C. Fix TypewriterText Replaying on Tab Switch`

These touch shared structures that other tasks build on.

### Parallel Track A — Engine / persistence

These tasks can run in parallel with most UI work, but should stay coordinated with
each other because they touch engine and state boundaries.

- `1A. Dialogue Story Flags Persistence`
- `1B. Verify and Harden the Location 125 Final Boss Flow`
- `4B. Companion Reputation Affinity`

**Notes**:

- `1A` and `4B` can proceed at the same time if different people own different files,
  but both touch engine types and should be rebased carefully.
- `1B` is mostly validation-driven and can run in parallel with either one.

### Parallel Track B — Refactor / code quality

These are good early parallel tasks because they are mostly structural.

- `2A. Split src/components/index.tsx into Focused Files`
- `2C. Deduplicate ACTION_LABELS`
- `3D. Delete Stray Legacy HTML File`

**Notes**:

- `2C` can be done independently of `2A`, but if `JournalModal` moves during `2A`,
  coordinate the import update so the constant is deduplicated in the final file layout.
- `3D` is fully independent and can be done anytime.

### Parallel Track C — Settings and Road screen behavior

These tasks are naturally grouped because they all affect the Road screen, but some
can still be split between people if changes are rebased carefully.

- `3A. Wire textSpeed into TypewriterText`
- `3B. Wire confirmActions into Road Action Buttons`
- `3C. Fix TypewriterText Replaying on Tab Switch`
- `4A. Companion Detail View (Tap to Expand)`

**Notes**:

- `3A` and `3B` both touch `RoadScreen.tsx` and are best combined in one branch.
- `3C` also touches `RoadScreen.tsx` and `app/game.tsx`, so it should either land
  before `3A/3B` or be implemented together with them.
- `4A` also modifies `RoadScreen.tsx`, so it is not a clean parallel task with the
  others unless someone owns a single consolidated Road-screen branch.

### Parallel Track D — Post-split component work

These are parallel-friendly **after** `2A` lands.

- `4C Part 3 — StatusBar location display`
- `4C Part 4 — Collapse DreadBanner into JourneyBar`
- `4D. Haptic Feedback Expansion` *(Inventory half only)*

**Notes**:

- After component extraction, `StatusBar.tsx`, `JourneyBar.tsx`, and
  `InventoryScreen.tsx` can be worked on independently.
- The Road-screen half of `4D` should stay with the Road-screen branch from Track C.

### Parallel Track E — Mobile layout polish

These can run in parallel once the shared prerequisites are clear.

- `4C Part 1 — Pin action grid above the tab bar`
- `4C Part 2 — Dynamic inventory grid sizing`
- `4C Part 2b — Shop row mobile readability`

**Notes**:

- `4C Part 1` is another `RoadScreen.tsx` task and should stay with Track C unless a
  single owner is coordinating all Road-screen work.
- `4C Part 2` and `4C Part 2b` are independent from each other and can safely run in
  parallel because they touch different screens.

### Suggested parallel bundles

If multiple people are working at once, these bundles minimize conflicts:

#### Bundle 1 — Core engine

- `1A. Dialogue Story Flags Persistence`
- `4B. Companion Reputation Affinity`
- `1B. Verify and Harden the Location 125 Final Boss Flow`

#### Bundle 2 — Shared cleanup

- `2A. Split src/components/index.tsx into Focused Files`
- `2C. Deduplicate ACTION_LABELS`
- `3D. Delete Stray Legacy HTML File`

#### Bundle 3 — Road screen / settings

- `3A. Wire textSpeed into TypewriterText`
- `3B. Wire confirmActions into Road Action Buttons`
- `3C. Fix TypewriterText Replaying on Tab Switch`
- `4A. Companion Detail View (Tap to Expand)`
- `4C Part 1 — Pin action grid above the tab bar`
- `4D. Haptic Feedback Expansion` *(RoadScreen portion)*

#### Bundle 4 — Mobile inventory / shop polish

- `4C Part 2 — Dynamic inventory grid sizing`
- `4C Part 2b — Shop row mobile readability`
- `4D. Haptic Feedback Expansion` *(InventoryScreen portion)*

#### Bundle 5 — Post-split top chrome polish

- `4C Part 3 — StatusBar location display`
- `4C Part 4 — Collapse DreadBanner into JourneyBar`

### Tasks that should stay sequential

These should not be treated as independent parallel tasks:

- `2A` before any task that directly edits extracted component files
- `2B` before large-scale visual cleanup that depends on shared color tokens
- `3C` before final verification of typewriter behavior
- any two tasks that both heavily rewrite `RoadScreen.tsx`

### Fastest safe delivery strategy

If speed matters more than maximum concurrency, the safest order is:

1. Run **Bundle 2** first
2. In parallel, run **Bundle 1**
3. After `2A` lands, split into **Bundle 3**, **Bundle 4**, and **Bundle 5**
4. Finish with the verification checklist
