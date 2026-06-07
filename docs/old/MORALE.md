# Nuanced Morale System Redesign Plan

This plan details the design and implementation of a revamped, high-nuance Morale system. Currently, morale takes simple flat hits. This redesign introduces cumulative fatigue, healing periods, combat fatigue, and dangerous low-morale consequences.

---

## User Review Required

Please review the proposed design numbers and penalties.

> [!IMPORTANT]
> **Key Balance Variables**:
> - **Forced March Sequence**: Penalizes consecutive forced marches starting at `-5` morale and incrementing by `-1` each day.
> - **Storm Sequence**: Penalizes consecutive days traveling in Poor (`-2` base + `-1` per consecutive day) and Severe (`-3` base + `-2` per consecutive day) weather.
> - **Combat Fatigue**: Penalizes continuous combat on consecutive days with a `-3` morale penalty per consecutive day beyond the first.
> - **Healing Periods**: Counters do not reset instantly. They decay gradually by `1` per turn of normal travel, or by `2` when resting, camping, or rallying.

---

## Proposed Changes

We will update the game state types, modify action resolution and turn cleanup in the turn engine, and incorporate new combat penalties in the combat engine and screen UI.

```
└── src/
    ├── engine/
    │   ├── types.ts          # [MODIFY] Add consecutiveStormDays, consecutiveCombatDays to GameState, and add morale to CombatState
    │   ├── GameState.ts      # [MODIFY] Bump SCHEMA_VERSION to 10, initialize new counters in createNewGameState()
    │   ├── SaveEngine.ts     # [MODIFY] Add v9 -> v10 migration step
    │   ├── TurnEngine.ts     # [MODIFY] Implement decay logic, storm accumulation, combat fatigue, and mutiny checks
    │   └── CombatEngine.ts   # [MODIFY] Implement low-morale combat penalties (flee chance and companion panic)
    └── screens/
        └── CombatScreen.tsx  # [MODIFY] Aling flee chance UI display with low-morale penalties
```

---

### 1. State Expansion

We will add new counters to `GameState` to track consecutive behaviors, and expose the player's morale status to `CombatState` so the combat engine can evaluate penalties.

#### [MODIFY] [types.ts](file:///D:/source/repos/hundred-days/src/engine/types.ts)
```diff
export interface GameState {
  ...
  consecutiveForcedMarches: number; // Exists, will be modified to decay
+ consecutiveStormDays:     number; // Tracks consecutive days in poor/severe weather
+ consecutiveCombatDays:    number; // Tracks consecutive days of combat
  ...
}

export interface CombatState {
  ...
+ playerMorale:             MoraleState; // Copied from GameState to apply combat penalties
  ...
}
```

#### [MODIFY] [GameState.ts](file:///D:/source/repos/hundred-days/src/engine/GameState.ts)
- Initialize `consecutiveStormDays: 0` and `consecutiveCombatDays: 0` in `createNewGameState()`.
- Bump `SCHEMA_VERSION` to `10`.

#### [MODIFY] [SaveEngine.ts](file:///D:/source/repos/hundred-days/src/engine/SaveEngine.ts)
Add v9 -> v10 migration to initialize the new fields:
```typescript
if (current.schemaVersion === 9) {
  const state = current.gameState as unknown as Record<string, unknown>;
  state['consecutiveStormDays'] = 0;
  state['consecutiveCombatDays'] = 0;
  current = { ...current, schemaVersion: 10 };
}
```

---

### 2. Forced March Sequence & Decay (Healing Period)

Instead of the sequence counter resetting to `0` instantly, it will decay over a **healing period**:
- **On Forced March**: `consecutiveForcedMarches` increases by `1`. The morale hit is:
  $$\text{Morale Hit} = -(3 + \text{consecutiveForcedMarches})$$
  *(Day 1: `-4`, Day 2: `-5`, Day 3: `-6`, etc.)*
- **On Decay (Not Forced Marching)**:
  - If the player performs a **normal move, hunt, trade, or steal** action: `consecutiveForcedMarches` decays by `-1` (floor at `0`).
  - If the player performs a **rest (at an Inn), camp, or rally** action: `consecutiveForcedMarches` decays by `-2` (floor at `0`), simulating faster recovery.

---

### 3. Consecutive Weather (Storm) Penalties

We will penalize traveling multiple days in storms.
- **On Movement in Bad Weather**:
  - Weather is `Poor` (storm): Base penalty is `-2` morale. Add `-1` penalty for each consecutive storm day.
    $$\text{Poor Weather Hit} = -(2 + \text{consecutiveStormDays})$$
  - Weather is `Severe` (severe storm): Base penalty is `-3` morale. Add `-2` penalty for each consecutive storm day.
    $$\text{Severe Weather Hit} = -(3 + 2 \times \text{consecutiveStormDays})$$
  - After calculating the hit, increment `consecutiveStormDays` by `1`.
- **On Decay (Neutral/Good/Ideal weather, or non-move actions)**:
  - Normal travel in good weather: `consecutiveStormDays` decays by `-1` (floor `0`).
  - Resting at an Inn, camping, or rallying: `consecutiveStormDays` decays by `-2` (floor `0`).

---

### 4. Continuous Combat (Combat Fatigue)

Continuous combat exhausts the party's morale.
- **On Combat Turns**:
  - If the turn contains combat (triggered via location entry or random events), increment `consecutiveCombatDays` by `1`.
  - If `consecutiveCombatDays > 1`, apply a combat fatigue penalty upon combat resolution:
    $$\text{Combat Fatigue Hit} = -3 \times (\text{consecutiveCombatDays} - 1)$$
    *(Consecutive Combat Day 2: `-3` morale, Day 3: `-6` morale, etc.)*
- **On Decay (No Combat)**:
  - If a turn does not result in combat, `consecutiveCombatDays` decays by `-1` (floor `0`).

---

### 5. New Low Morale Penalties

We will introduce severe gameplay consequences when morale falls to low tiers:

#### A. Reduced Combat Flee Chance
Low morale drains the party's coordination, making retreat harder:
- **Weary** morale: `-10%` penalty to escape chance.
- **Desperate** morale: `-20%` penalty to escape chance.
- **Broken** morale: `-35%` penalty to escape chance.
- Applied in both `calcFleeChance` ([CombatScreen.tsx](file:///D:/source/repos/hundred-days/src/screens/CombatScreen.tsx)) and `resolveFlee` ([CombatEngine.ts](file:///D:/source/repos/hundred-days/src/engine/CombatEngine.ts)).

#### B. Companion Combat Panic
Companions lose their resolve and might hesitate in battle:
- **Desperate** morale: At the start of each combat round, each companion has a `15%` chance to panic/hesitate, skipping their action for that round.
- **Broken** morale: Companion hesitation chance increases to `35%`.
- Hesitation displays a combat log message: *"Companion [Name] is too desperate to fight, hesitating this round."*

#### C. Immediate Mutiny Risk
When morale is completely shattered, companions might leave regardless of loyalty:
- **Broken** morale: At the end of each turn, there is a `15%` chance that a random companion deserts immediately, stating they have lost all confidence in the player's survival.

#### D. Starvation Damage Amplification
Broken spirits weaken physical endurance:
- **Broken** morale: If the party is starving (runs out of food), the health damage taken during moves/turns is multiplied by `1.5x` (e.g., `-10 HP` starvation hit becomes `-15 HP`).
