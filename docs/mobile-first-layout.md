# Plan: Mobile-First Fixed Layout

## Context

The app needs a reliable "fixed chrome, scrollable content" structure on all screen sizes. The shell in `app/game.tsx` already achieves this architecturally (top chrome in normal flow → `flex:1` content area → `position:absolute` bottom nav), but `CombatScreen` has no outer `ScrollView`, so its content clips silently on small devices (e.g., iPhone SE at 568px height). Every other screen already scrolls correctly.

## What's Already Correct — No Change Needed

- **`app/game.tsx` shell** — top chrome (StatusBar + JourneyBar + utility bar) sits above the `flex:1` content area; the bottom nav is `position:absolute, bottom:0`; the content area uses `paddingBottom: bottomNavInset` (66 + `insets.bottom`). This is already the correct mobile-first pattern.
- **`RoadScreen`** — root is a `ScrollView`.
- **`DialogueScreen`** — root is a `ScrollView`.
- **`MapScreen`** — `ScrollView` for main content with a fixed in-flow header and absolute slide-up panel.
- **`InventoryScreen`** — `flex:1` two-pane body, each pane with its own `ScrollView`.

## Changes Required

### 1. `src/screens/CombatScreen.tsx` (primary fix)

The root `<View style={s.root}>` has `flex: 1` but no `ScrollView`. The inner log has `flex: 1, minHeight: 80, maxHeight: 220`.

**New structure:**

```
<View style={s.root}>                         // flex: 1, unchanged
  <ScrollView style={{ flex: 1 }}             // NEW — upper content scrolls
              contentContainerStyle={{ paddingBottom: 8 }}>
    encounterBanner (conditional)
    enemiesSection
    divider
    partyRow
    <ScrollView style={s.log} ...>            // UNCHANGED, but remove flex:1 from s.log
      log entries
    </ScrollView>
  </ScrollView>
  <View style={s.actionsGrid}>...</View>      // stays OUTSIDE ScrollView — always visible
  {isComplete && <View style={s.overlay}>}   // absoluteFillObject — stays as child of root View
</View>
```

**Style change:** In `s.log`, remove `flex: 1`. Keep `minHeight: 80` and `maxHeight: 220`. Rationale: `flex: 1` doesn't work inside a ScrollView (content is unbounded); the `maxHeight` cap is sufficient to bound the log area.

**UX rationale:** Keeping `actionsGrid` outside the ScrollView means action buttons are always visible without scrolling — the correct UX for a turn-based combat screen.

### 2. `app/game.tsx` — top chrome grouping (minor clarity improvement)

Wrap StatusBar + JourneyBar + utility bar in a single `View` with no flex to make the "fixed top chrome" intent explicit in code. No functional change — this just makes the structure self-documenting.

```jsx
{/* Fixed top chrome */}
<View>
  <StatusBar gameState={gameState} />
  <JourneyBar ... />
  <View style={{ /* utility bar */ }}>...</View>
</View>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/screens/CombatScreen.tsx` | Add `ScrollView` wrapper around upper sections; remove `flex:1` from `s.log` |
| `app/game.tsx` | Group top chrome in a single `View` wrapper |

## Verification

1. Run `npx expo start` and open on a small device/simulator (iPhone SE ~568px, or use browser with narrow viewport)
2. **CombatScreen**: trigger a combat encounter; verify all content (enemies + party + log + actions) is reachable; verify action buttons stay pinned at the bottom without scrolling
3. **All screens**: confirm StatusBar + JourneyBar + utility bar stay fixed at top while scrolling content on each tab
4. **CombatScreen result overlay**: complete a combat; verify the victory/defeat overlay covers the full screen
5. Run `rtk tsc` to confirm no TypeScript errors introduced
