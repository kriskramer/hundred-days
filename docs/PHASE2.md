# PHASE 2 — Future Enhancements

This document tracks items postponed for Phase 2 development.

---

## 4A. Run-to-Run Meta Progression
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

## 4B. Audio Implementation
**Source**: `START1` Workstream 7.2
**Complexity**: Medium · **Priority**: Later · **Blocker**: audio assets must exist first

**Details**: `SoundEngine.ts` is fully scaffolded — the code wiring is straightforward.
The actual blocker is the absence of `.mp3` files. This is primarily a content
production task, not an engineering task.

**Implementation** (once assets exist):
1. Place `.mp3` files in `src/assets/sfx/` following the naming convention the
   `SoundEngine` already expects.
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
