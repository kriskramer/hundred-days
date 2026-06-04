# Implementation Plan: Gameplay, Architecture, & UX Enhancements

This document outlines the step-by-step implementation plan for the architecture, gameplay, and mobile UI improvements identified during the codebase review.

---

## Phase 1: Architecture & State Persistence

### 1. Dialogue Story Flags Persistence
**Objective**: Move story flags from a module-level variable to the serialized game state so player choices persist across app restarts.

*   **Files to modify**:
    *   [src/engine/types.ts](file:///D:/source/repos/hundred-days/src/engine/types.ts)
    *   [src/engine/GameState.ts](file:///D:/source/repos/hundred-days/src/engine/GameState.ts)
    *   [src/engine/SaveEngine.ts](file:///D:/source/repos/hundred-days/src/engine/SaveEngine.ts)
    *   [src/engine/DialogueEngine.ts](file:///D:/source/repos/hundred-days/src/engine/DialogueEngine.ts)
*   **Steps**:
    1.  In `types.ts`, add `storyFlags: string[]` to `SerializedGameState`, and `storyFlags: Set<string>` to `GameState`.
    2.  In `GameState.ts`, update `createNewGameState` to include `storyFlags: new Set<string>()`, and increment `SCHEMA_VERSION` to `5`.
    3.  In `SaveEngine.ts`, update the `serialize` method to convert `state.storyFlags` to `Array.from(state.storyFlags)`. Update the `deserialize` method to rebuild it as `new Set(saved.storyFlags || [])`.
    4.  In `SaveEngine.ts`'s `migrate` method, add the transition block:
        ```typescript
        // v4 → v5: add storyFlags if missing
        if (current.schemaVersion === 4) {
          const state = current.gameState as unknown as Record<string, unknown>;
          if (state['storyFlags'] === undefined) {
            state['storyFlags'] = [];
          }
          current = { ...current, schemaVersion: 5 };
        }
        ```
    5.  In `DialogueEngine.ts`, refactor the global story flag helpers (`setStoryFlag`, `hasStoryFlag`, `clearStoryFlags`) to accept the active `GameState` object, or handle flag mutation inside `DialogueEngine.choose()` and `evalConditions()` directly on the `game` object:
        ```typescript
        // In DialogueEngine.choose:
        if (choice.outcome.flagsSet) {
          choice.outcome.flagsSet.forEach(f => gameState.storyFlags.add(f));
        }
        ```

### 2. Refined Companion Reputation Affinity
**Objective**: Prevent companions with no recruitment requirements from always matching reputation, and introduce active loyalty decay for mismatched reputations.

*   **Files to modify**:
    *   [src/engine/types.ts](file:///D:/source/repos/hundred-days/src/engine/types.ts)
    *   [src/data/companions.ts](file:///D:/source/repos/hundred-days/src/data/companions.ts)
    *   [src/engine/TurnEngine.ts](file:///D:/source/repos/hundred-days/src/engine/TurnEngine.ts)
*   **Steps**:
    1.  In `types.ts`, add optional `preferredReputation` properties to the `Companion` interface:
        ```typescript
        export interface Companion {
          // ... existing fields
          preferredReputation?: {
            min?: number;
            max?: number;
          };
        }
        ```
    2.  In `companions.ts`, update companion definitions with their preferred reputation values. Examples:
        *   **Dain**: `preferredReputation: { min: 40 }` (prefers neutral/honorable heroes).
        *   **Joe** / **Jenn**: `preferredReputation: { min: 30, max: 80 }` (prefer balanced, non-extreme heroes).
        *   **Rex the Dog**: (remains undefined, has no reputation preference).
    3.  In `TurnEngine.ts`, update `isReputationInCompanionRange` to check `companion.preferredReputation` instead of `COMPANION_REQUIREMENTS`:
        ```typescript
        private isReputationInCompanionRange(companion: Companion): boolean {
          const pref = companion.preferredReputation;
          if (!pref) return true;
          const repValue = this.state.reputation.value;
          if (pref.min !== undefined && repValue < pref.min) return false;
          if (pref.max !== undefined && repValue > pref.max) return false;
          return true;
        }
        ```

---

## Phase 2: Gameplay Mechanics

### 3. Rest & Hunt Hazard Risk (Ambushes)
**Objective**: Introduce a chance of random encounters during `Hunt` and `Rest` actions in dangerous regions.

*   **Files to modify**:
    *   [src/engine/TurnEngine.ts](file:///D:/source/repos/hundred-days/src/engine/TurnEngine.ts)
*   **Steps**:
    1.  Create a helper `maybeTriggerRestOrHuntAmbush(action: PlayerAction)` in `TurnEngine.ts`.
    2.  Check the region difficulty or location hazard levels. If a random roll succeeds (e.g., 8-15% chance in wilderness, 0% in towns), queue a combat event similar to `maybeInjectDangerCombat`:
        ```typescript
        const ambush: GameEvent = {
          id: `ambush_${action}_day${this.state.dayNumber}`,
          type: EventType.Combat,
          resolutionType: ResolutionType.Interactive,
          name: action === PlayerAction.Rest ? 'Disturbed Sleep' : 'Predator in the Brush',
          description: action === PlayerAction.Rest 
            ? 'Your camp is breached while you sleep.' 
            : 'Something was hunting you while you were hunting.',
          conditions: { probability: 1.0 },
          repeatable: true,
          tags: ['combat', 'hazard_ambush'],
        };
        ```
    3.  Call this helper in `resolveHunt` and `resolveRest` methods.

### 4. Active Weather & Consumable Deterioration
**Objective**: Add realistic hazards and benefits to weather systems.

*   **Files to modify**:
    *   [src/engine/TurnEngine.ts](file:///D:/source/repos/hundred-days/src/engine/TurnEngine.ts)
*   **Steps**:
    1.  In `TurnEngine.ts`'s `updateStats()` or `cleanup()`, evaluate weather effects:
        *   **Severe Weather**: Apply a 10% chance to decay 1 unit of food due to storm damage.
        *   **Good / Ideal Weather**: Add a small morale boost (+1 or +2) if moving.
    2.  Add logs to notify the player (e.g., `"Morale rises under clear blue skies."` or `"Rations ruined by rain."`).

---

## Phase 3: Mobile UI & UX Polish

### 5. Dynamic Grid Scaling
**Objective**: Adjust grid cell sizes to fit various portrait aspect ratios and viewport widths.

*   **Files to modify**:
    *   [src/screens/InventoryScreen.tsx](file:///D:/source/repos/hundred-days/src/screens/InventoryScreen.tsx)
    *   [src/screens/ShopScreen.tsx](file:///D:/source/repos/hundred-days/src/screens/ShopScreen.tsx)
*   **Steps**:
    1.  Import `useWindowDimensions` from `react-native`.
    2.  Calculate the grid slot size dynamically based on `width`:
        ```typescript
        const { width } = useWindowDimensions();
        const GRID_PADDING = 32;
        const COLUMNS = 4;
        const slotSize = Math.floor((width - GRID_PADDING) / COLUMNS);
        ```
    3.  Replace static styles using `GRID_SLOT_SIZE = 76` with dynamic layouts.

### 6. Expanded Haptic Feedback
**Objective**: Integrate tactile feedback for key interaction nodes.

*   **Files to modify**:
    *   [src/screens/RoadScreen.tsx](file:///D:/source/repos/hundred-days/src/screens/RoadScreen.tsx)
    *   [src/screens/InventoryScreen.tsx](file:///D:/source/repos/hundred-days/src/screens/InventoryScreen.tsx)
*   **Steps**:
    1.  Import `expo-haptics`.
    2.  Add light haptic impacts when:
        *   A player taps the main action button (e.g. "Move").
        *   Equipping/unequipping items.
        *   Receiving loot or gold in shop screens.

---

## Phase 4: Testing & Verification

1.  **TypeScript Verification**: Run `npm run typecheck` to confirm that schema changes and interface additions compile perfectly.
2.  **Lint Checklist**: Validate modifications with `npm run lint` to guarantee no style sorting or hook rule violations.
3.  **State Migration Test**: Load V4 save data files in AsyncStorage and confirm that the V5 schema migration populates the `storyFlags` array correctly without corrupting active runs.
