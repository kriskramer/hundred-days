# Implementation Plan: Bug Fixes, Refactoring & Mobile UX

This document covers the full set of improvements identified in the codebase review:
critical bug fixes, code quality refactoring, gameplay depth, and mobile-first UI polish.
See `START3.md` for the companion plans covering story flags, reputation affinity,
weather mechanics, and grid scaling.

---

## Phase 1: Critical Bug Fixes

### 1. Wire Up the Boss Fight at Location 125

**Objective**: The final boss encounter must fire properly so the run can reach `victory`.
Currently `TurnEngine.ts` returns early without triggering combat at location 125.

**Files to modify**:
- `src/engine/TurnEngine.ts`

**Steps**:
1. Locate the checkpoint block at ~line 766 (the guard `if (currentLocationId >= 125 && !this.bossResults.has(125))`).
2. Instead of returning early, queue the boss combat event using the same path as other boss checkpoints (locations 32, 65, 93):
   ```typescript
   const bossEvent: GameEvent = {
     id: 'boss_roachak',
     type: EventType.Combat,
     resolutionType: ResolutionType.Interactive,
     name: 'The Dread Sovereign',
     description: 'Roachak stands before you. The road ends here.',
     conditions: { probability: 1.0 },
     repeatable: false,
     tags: ['boss', 'final'],
   };
   this.pendingEvents.unshift(bossEvent);
   ```
3. In the boss result handler, set `this.state.outcome = 'victory'` and `this.state.isComplete = true`
   only after the `victory` result comes back from `CombatEngine`.
4. Remove the early return; let the turn proceed into `awaitInput`.

---

### 2. Wire `textSpeed` Setting into TypewriterText

**Objective**: The Text Speed option in Settings currently does nothing.
`TypewriterText` in `RoadScreen.tsx` uses a hardcoded 22 ms interval.

**Files to modify**:
- `src/screens/RoadScreen.tsx`
- `src/engine/SaveEngine.ts` (verify `AppSettings.textSpeed` is persisted — it is, no change needed)

**Steps**:
1. In `RoadScreen`, load settings via `saveEngine.loadSettings()` inside a `useEffect` and store in local state:
   ```typescript
   const [textInterval, setTextInterval] = useState(22);
   useEffect(() => {
     saveEngine.loadSettings().then(s => {
       const map = { slow: 45, normal: 22, fast: 8, instant: 0 };
       setTextInterval(map[s.textSpeed] ?? 22);
     });
   }, []);
   ```
2. Pass `interval` as a prop to `TypewriterText`:
   ```typescript
   function TypewriterText({ text, style, interval = 22 }: { text: string; style?: object; interval?: number })
   ```
3. In the `useEffect` inside `TypewriterText`, if `interval === 0` (instant), skip the timer and `setDisplayed(text)` immediately.
4. Use `interval` in the `setInterval` call instead of the hardcoded literal.

---

### 3. Wire `confirmActions` Setting into Action Buttons

**Objective**: The "Confirm actions" toggle in Settings does nothing. High-cost or
irreversible actions (Move, Force March, Camp) should prompt before executing.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. In `RoadScreen`, load settings the same way as step 2 above and pull `confirmActions`.
2. Wrap the `submit()` call for Move, Force March, and Camp actions:
   ```typescript
   function submitWithConfirm(params: ActionParams, label: string, cost: string) {
     if (!confirmActions) { submit(params); return; }
     Alert.alert(
       label,
       cost,
       [
         { text: 'Cancel', style: 'cancel' },
         { text: 'Confirm', onPress: () => submit(params) },
       ]
     );
   }
   ```
3. Forage, Rally, and Trade do not need confirmation (low cost / reversible).

---

### 4. Fix TypewriterText Replaying on Tab Switch

**Objective**: Navigating away from the Road tab and back triggers the journal entry
animation again from the beginning, which is jarring.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. Key the `TypewriterText` component on the turn number so it only remounts when new
   text actually arrives:
   ```tsx
   <TypewriterText
     key={`journal-${gameState.dayNumber}`}
     text={narrative}
     interval={textInterval}
     style={...}
   />
   ```
2. Because React will reuse the component when the key is unchanged, the animation will
   not restart on tab switch — only on a new turn.

---

### 5. Delete the Stray HTML File

**Objective**: `src/screens/map_screen.html` is dead code in a React Native project.

**Files to delete**:
- `src/screens/map_screen.html`

**Steps**:
1. Delete the file.
2. Confirm no import references it (`grep -r "map_screen.html" src/`).

---

## Phase 2: Code Quality Refactoring

### 6. Extract a Shared Theme / Color Constants File

**Objective**: Colors are defined in three places — inline hex strings in `RoadScreen`,
a local `C` object in `CombatScreen`, and Tailwind tokens in `tailwind.config.js`.
Centralizing them eliminates drift.

**Files to create**:
- `src/theme.ts`

**Files to modify**:
- `src/screens/CombatScreen.tsx`
- `src/screens/RoadScreen.tsx`
- `src/components/index.tsx`

**Steps**:
1. Create `src/theme.ts`:
   ```typescript
   export const Colors = {
     ink:          '#1A1208',
     inkLight:     '#2D1F0A',
     parchment:    '#F5EAD6',
     parchDark:    '#E8D5B0',
     parchDeep:    '#D4B880',
     blood:        '#8B1A1A',
     gold:         '#B8860B',
     goldLight:    '#D4A017',
     mist:         '#6B7C6E',
     green:        '#4A8A5A',
     greenLight:   '#4A9E6B',
   } as const;
   ```
2. In `CombatScreen.tsx`, replace the local `const C = {...}` block with:
   ```typescript
   import { Colors as C } from '@/theme';
   ```
3. In `RoadScreen.tsx` and `components/index.tsx`, replace all hardcoded hex strings
   with `Colors.*` references. Do this incrementally — start with the most-repeated
   values (`#F5EAD6`, `#1A1208`, `#B8860B`, `#6B7C6E`).
4. Tailwind tokens in `tailwind.config.js` can reference the same values to keep both
   systems consistent:
   ```js
   const { Colors } = require('./src/theme');
   module.exports = { theme: { extend: { colors: Colors } } };
   ```

---

### 7. Deduplicate `ACTION_LABELS`

**Objective**: `ACTION_LABEL` in `RoadScreen.tsx` and `ACTION_LABELS` in
`components/index.tsx` are identical. One definition is enough.

**Files to modify**:
- `src/engine/types.ts`
- `src/screens/RoadScreen.tsx`
- `src/components/index.tsx`

**Steps**:
1. Add a shared constant to `types.ts` next to the `PlayerAction` enum:
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
2. Remove the local definitions in both `RoadScreen.tsx` and `components/index.tsx`
   and import from `@engine/types`.

---

### 8. Move Enemy Construction Out of `CombatScreen` Render Body

**Objective**: `buildEnemiesFromContext(event, gameState)` is called directly in the
component body (line 82 of `CombatScreen.tsx`). It runs on every render and uses
`Math.random()`, so in theory different renders could produce different enemies.
The result should be stable.

**Files to modify**:
- `src/screens/CombatScreen.tsx`

**Steps**:
1. Remove the top-level call `const enemies = buildEnemiesFromContext(event, gameState);`.
2. Move it inside the `useEffect` that creates the `CombatEngine`:
   ```typescript
   useEffect(() => {
     if (engineRef.current) return;
     const enemies = buildEnemiesFromContext(event, gameState);
     const engine  = new CombatEngine(enemies, gameState, ...);
     engineRef.current = engine;
     ...
   }, []);
   ```
3. This ensures enemies are determined once at mount and never change mid-combat.

---

### 9. Split `src/components/index.tsx` into Focused Files

**Objective**: At 629 lines, the single component bundle is hard to navigate and slows
TypeScript IDE indexing. Each logical unit deserves its own file.

**Files to create**:
- `src/components/StatusBar.tsx`
- `src/components/JourneyBar.tsx`
- `src/components/DreadBanner.tsx`
- `src/components/Toast.tsx`
- `src/components/LevelUpModal.tsx`
- `src/components/JournalModal.tsx`
- `src/components/SettingsModal.tsx`

**Files to modify**:
- `src/components/index.tsx` (becomes a re-export barrel only)

**Steps**:
1. Extract each export from `components/index.tsx` into its own file, keeping the same
   component code. Move any private sub-components (`JournalEntry`, `SettingsSection`,
   `ToggleRow`, etc.) into the same file as their parent.
2. Reduce `components/index.tsx` to re-exports only:
   ```typescript
   export { StatusBar }    from './StatusBar';
   export { JourneyBar }   from './JourneyBar';
   export { DreadBanner }  from './DreadBanner';
   export { Toast }        from './Toast';
   export { LevelUpModal } from './LevelUpModal';
   export { JournalModal } from './JournalModal';
   export { SettingsModal } from './SettingsModal';
   ```
3. All import sites (`app/game.tsx`) remain unchanged — they still import from `@components`.

---

## Phase 3: Gameplay Depth

### 10. Companion Detail View (Tap to Expand)

**Objective**: Tapping a `CompanionIcon` on the Road screen does nothing. A compact
detail panel would make companions feel meaningful and give players tactical info.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. Add state: `const [selectedCompanion, setSelectedCompanion] = useState<string | null>(null);`
2. Make `CompanionIcon` accept an `onPress` prop and call it with the companion ID.
3. Render an inline detail card below the companion row when `selectedCompanion` is set:
   ```tsx
   {selectedCompanion && (() => {
     const c = gameState.companions.find(c => c.id === selectedCompanion);
     if (!c) return null;
     return (
       <CompanionDetailCard companion={c} onClose={() => setSelectedCompanion(null)} />
     );
   })()}
   ```
4. `CompanionDetailCard` should show:
   - Name, archetype, level
   - Loyalty bar with numeric value and tier label (e.g. "Loyal", "Wavering")
   - Passive bonus description (from companion definition data)
   - Combat power estimate
   - A muted warning if loyalty < 30: "Growing restless..."
5. Tap anywhere outside (or a close ×) dismisses it.

---

### 11. Combat "Skill" Button — Inline Item Picker

**Objective**: Pressing Skill says "Use consumable" but picks an item blindly (or does
nothing useful). Players should see and choose which item to use.

**Files to modify**:
- `src/screens/CombatScreen.tsx`

**Steps**:
1. Add state: `const [showItemPicker, setShowItemPicker] = useState(false);`
2. When the Skill button is pressed, instead of calling `handleAction('skill')` directly,
   set `setShowItemPicker(true)`.
3. Render an absolute-positioned overlay above the action grid listing the player's
   usable consumables (filter `gameState.inventory` for `category === 'Consumable'`):
   ```tsx
   {showItemPicker && (
     <View style={s.itemPickerOverlay}>
       <Text style={s.itemPickerTitle}>USE ITEM</Text>
       {usableItems.map(item => (
         <TouchableOpacity key={item.id} onPress={() => {
           setShowItemPicker(false);
           handleAction('skill', 0, item.id); // extend CombatAction to carry itemId
         }}>
           <Text>{item.name}</Text>
           <Text>{item.activeEffect?.description}</Text>
         </TouchableOpacity>
       ))}
       <TouchableOpacity onPress={() => setShowItemPicker(false)}>
         <Text>Cancel</Text>
       </TouchableOpacity>
     </View>
   )}
   ```
4. If `usableItems` is empty, show the button as disabled with sub-label "No items".
5. Extend `CombatAction` in `CombatEngine.ts` to carry an optional `itemId` field and
   apply the item's active effect in `CombatEngine.resolvePlayerTurn()`.

---

### 12. Pre-Action Resource Warning

**Objective**: Players can press Move or Force March when food ≤ 0 without any
friction. This should surface a warning before the potentially fatal action.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. In the `submit()` wrapper, check food before travel actions:
   ```typescript
   function submit(params: ActionParams) {
     if (!engine) { onToast('Engine not ready'); return; }

     const isTravel = params.action === PlayerAction.Move;
     if (isTravel && gameState.resources.food < 1) {
       Alert.alert(
         'Starving',
         'You have almost no food. Moving will cost more health. Continue?',
         [
           { text: 'Stay',   style: 'cancel' },
           { text: 'March',  onPress: () => engine.submitAction(params).catch(console.error) },
         ]
       );
       return;
     }

     engine.submitAction(params).catch(console.error);
   }
   ```
2. Threshold: warn when `food < 1` (not `< 0` — the turn hasn't consumed food yet).
3. Keep this separate from the `confirmActions` setting — starvation warnings should
   always show regardless of that toggle.

---

### 13. Level-Up Choices Show Stat Deltas

**Objective**: Level-up choices currently show a label and description but no numbers.
"Hardy Constitution" is more motivating as "+15 Max HP (70 → 85)".

**Files to modify**:
- `src/engine/TurnEngine.ts` (or wherever `LevelUpChoice` objects are built)
- `src/components/LevelUpModal.tsx` (after Phase 2 split)

**Steps**:
1. When building `LevelUpChoice` objects in `TurnEngine.ts`, populate an optional
   `statPreview` field:
   ```typescript
   export interface LevelUpChoice {
     id:          string;
     label:       string;
     description: string;
     statPreview?: string; // e.g. "Max HP  70 → 85"
   }
   ```
2. For each choice that modifies a stat, compute the before/after value using the
   current `this.state.player.stats` and the choice's delta, then set `statPreview`.
3. In `LevelUpModal`, render the preview below the description in a smaller, muted font:
   ```tsx
   {choice.statPreview && (
     <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: '#B8860B', marginTop: 4 }}>
       {choice.statPreview}
     </Text>
   )}
   ```

---

### 14. Enemy Behavior Tooltips

**Objective**: `BehaviorTag` labels ("Pack", "Spectral", "Undead") are opaque to new
players. A long-press tooltip should explain the mechanic.

**Files to modify**:
- `src/screens/CombatScreen.tsx`

**Steps**:
1. Define a behavior description map:
   ```typescript
   const BEHAVIOR_DESC: Record<EnemyBehavior, string> = {
     [EnemyBehavior.Aggressive]:  'Attacks every round without hesitation.',
     [EnemyBehavior.Opportunist]: 'Targets weakened party members preferentially.',
     [EnemyBehavior.Defensive]:   'Takes reduced damage until provoked.',
     [EnemyBehavior.Pack]:        'May call additional enemies if damaged.',
     [EnemyBehavior.Undead]:      'Cannot flee. Immune to negotiation.',
     [EnemyBehavior.Spectral]:    'Partially resists physical damage (40% reduction).',
   };
   ```
2. Add state to `CombatScreen`: `const [behaviorTip, setBehaviorTip] = useState<string | null>(null);`
3. Wrap `BehaviorTag` in a `TouchableOpacity` with `onLongPress` that sets the tip.
4. Render the tip as a small positioned label near the tag (or as a brief toast via
   `onToast`). Dismiss on next tap.

---

## Phase 4: Mobile-First UI Polish

### 15. Pin Action Buttons Above the Tab Bar

**Objective**: On phones with short screens, the Road screen action grid is below the
fold and requires scrolling to reach. The primary interaction should never require
scrolling.

**Files to modify**:
- `src/screens/RoadScreen.tsx`

**Steps**:
1. Change `RoadScreen` layout from a single `ScrollView` to a two-region layout:
   ```
   <View flex:1>
     <ScrollView>          ← location header, narrative, companions, journal
     </ScrollView>
     <ActionGrid />        ← pinned at bottom, outside the scroll area
   </View>
   ```
2. Move `<ActionGrid>` and `<SectionHeader label="Actions">` outside of the
   `ScrollView`, placing them in a `View` with a top border at the bottom of the screen.
3. Add `paddingBottom: 12` to the `ScrollView` container so content is not hidden
   behind the action grid when scrolled fully down.
4. The `LatestJournalEntry` stays inside the `ScrollView` — it's informational, not
   interactive.

---

### 16. Combat Log Height

**Objective**: `maxHeight: 90` in the combat log shows only 4-5 lines. Players miss
critical combat events. The log should be at least 3× taller.

**Files to modify**:
- `src/screens/CombatScreen.tsx`

**Steps**:
1. Change the log style from `maxHeight: 90` to a flex-based approach that takes
   available space between the party row and action grid:
   ```typescript
   log: {
     ...existing styles,
     flex: 1,           // replaces maxHeight: 90
     minHeight: 80,
     maxHeight: 220,
   },
   ```
2. The combat layout is already `flex: 1` via `s.root`, so the log will naturally
   expand to fill available vertical space between the fixed-height party and action rows.

---

### 17. Journal and Settings Touch Targets

**Objective**: `◎ JOURNAL` and `⚙ SETTINGS` are 10 px text with no padding. On mobile
this is hard to tap accurately. Apple HIG requires at least 44×44 pt tap targets.

**Files to modify**:
- `app/game.tsx`

**Steps**:
1. Replace the text-only `TouchableOpacity` buttons with properly padded targets:
   ```tsx
   <TouchableOpacity
     onPress={() => setJournalOpen(true)}
     activeOpacity={0.7}
     style={{ paddingVertical: 10, paddingHorizontal: 14 }}  // 44pt+ tap area
   >
     <Text style={{ fontFamily: 'Cinzel_400Regular', fontSize: 11, color: '#A0B8AA', letterSpacing: 1 }}>
       ◎ JOURNAL
     </Text>
   </TouchableOpacity>
   ```
2. Apply the same padding to the Settings button.
3. Ensure the utility bar `View` has enough vertical height to accommodate the taller
   tap targets without overflowing the top chrome.

---

### 18. StatusBar Location Display

**Objective**: `LOC 23` is a raw number with no context. Players know location names
not numbers. Replace with an abbreviated location name or progress fraction.

**Files to modify**:
- `src/components/StatusBar.tsx` (after Phase 2 split; currently `components/index.tsx`)

**Steps**:
1. Import `getLocation` from `@data/locations`.
2. Derive a short name — truncate to 10 chars with ellipsis if needed:
   ```typescript
   const loc      = getLocation(gameState.currentLocationId);
   const locShort = loc.name.length > 10 ? loc.name.slice(0, 9) + '…' : loc.name;
   ```
3. Change the `StatusPill` for location to show `locShort` as the value and
   `gameState.currentLocationId + '/125'` as the `sub` label.
4. Widen the location pill slightly (it is `flex: 1` like the others — may need
   `flex: 1.5` or `minWidth` to avoid truncating too aggressively on narrow screens).

---

### 19. Collapse the DreadBanner into the Journey Bar

**Objective**: When dread is active, the top chrome stack grows to ~120 px, eating
nearly 20% of a small phone screen. The dread warning should be visible without
occupying a dedicated row.

**Files to modify**:
- `src/components/JourneyBar.tsx` (after Phase 2 split)
- `src/components/DreadBanner.tsx` (after Phase 2 split)
- `app/game.tsx`

**Steps**:
1. Pass `dreadActive` into `JourneyBar`:
   ```tsx
   <JourneyBar locationId={gameState.currentLocationId} dreadActive={gameState.morale.dreadActive} />
   ```
2. In `JourneyBar`, when `dreadActive` is true, pulse the progress dot (red border,
   animated opacity) and change the bar fill color from gold to blood:
   ```typescript
   const barColor = dreadActive ? '#8B1A1A' : '#B8860B';
   const dotColor = dreadActive ? '#C94040' : '#D4A017';
   ```
3. Remove the standalone `<DreadBanner>` from `app/game.tsx`. The `DreadBanner`
   component can be kept for potential reuse but is no longer rendered in the main shell.
4. Keep the `DreadBanner` component in the codebase (do not delete) — it may be useful
   as a full-screen alert for the final countdown (day 90+).

---

### 20. Bottom Tab Bar Clarity

**Objective**: Tab labels and icons are not intuitive on mobile. "PACK" for inventory
is jargon; the symbols (`◆ ⚔ ◇ ▲ ◈`) don't communicate function.

**Files to modify**:
- `app/game.tsx`

**Steps**:
1. Update the `TABS` array:
   ```typescript
   const TABS: { id: Tab; label: string; icon: string }[] = [
     { id: 'road',      label: 'Road',    icon: '🛤' },
     { id: 'combat',    label: 'Combat',  icon: '⚔' },
     { id: 'dialogue',  label: 'Talk',    icon: '💬' },
     { id: 'inventory', label: 'Gear',    icon: '🎒' },
     { id: 'map',       label: 'Map',     icon: '🗺' },
   ];
   ```
   Note: if emoji feel inconsistent with the medieval aesthetic, use character icons
   from the existing design system — but keep labels concrete (`Gear`, not `Pack`).
2. For the disabled Combat tab, add a visual lock indicator rather than just fading:
   ```tsx
   {disabled && (
     <Text style={{ fontSize: 8, color: '#555', marginTop: 1 }}>LOCKED</Text>
   )}
   ```
   This communicates intent (locked) rather than absence (disappeared).

---

## Phase 5: Verification

1. **TypeScript**: `npm run typecheck` — confirm zero new errors, especially around
   the `LevelUpChoice.statPreview` addition, the `CombatAction` `itemId` extension,
   and the `Colors` import path.
2. **Lint**: `npm run lint` — confirm no ESLint violations introduced by the refactors.
3. **Manual smoke test — Road screen**:
   - Confirm action buttons are visible without scrolling on a simulated iPhone SE (375 × 667).
   - Confirm TypewriterText does not replay when switching tabs.
   - Confirm food < 1 triggers the starvation warning.
4. **Manual smoke test — Combat**:
   - Confirm the combat log shows ~8–10 lines before scrolling.
   - Confirm Skill button opens the item picker when consumables are in inventory, and
     shows disabled state when inventory is empty.
   - Confirm enemies are identical between round 1 and round 5 (no randomness on re-render).
5. **Manual smoke test — Boss fight**:
   - Travel to location 125 and confirm a combat event triggers rather than a silent
     auto-resolve.
   - Confirm `isComplete = true` and the victory alert fires after the boss is defeated.
6. **Save migration**: Confirm an existing save (schema v4) loads without errors after
   any `GameState` interface changes.
