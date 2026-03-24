# 100 Days to Save the World — Project Context

## What this is
A mobile RPG built in React Native + Expo (TypeScript). The player has 100 turns
to travel 125 locations, managing food, gold, morale, reputation, and companions
before facing a final boss. Every screen and engine system is built; the project
is in wiring and content-completion phase.

## Tech stack
- React Native + Expo ~52, Expo Router ~4
- TypeScript, strict mode
- Zustand for state (src/store/gameStore.ts)
- NativeWind (Tailwind for RN) for styling — but screens use StyleSheet.create
- AsyncStorage for persistence (src/engine/SaveEngine.ts)
- Path aliases: @engine, @data, @screens, @components, @hooks, @store, @utils

## Architecture — read these files first
- src/engine/types.ts         — ALL shared types and enums (start here)
- src/engine/TurnEngine.ts    — 10-phase turn lifecycle, orchestrates everything
- src/engine/GameState.ts     — createNewGameState(), XP thresholds, pure helpers
- src/engine/SaveEngine.ts    — auto-save, backup slot, schema migration (v2)
- src/engine/EventSystem.ts   — random event pipeline, passive/interactive split
- src/engine/CombatEngine.ts  — full combat resolution, 13 enemy types
- src/engine/DialogueEngine.ts— branching dialogue trees, condition evaluation
- src/engine/ItemSystem.ts    — 30+ item definitions, inventory CRUD, shop logic
- src/data/locations.ts       — 125 location stubs (see NOTE below)
- src/data/companions.ts      — all 11 companion definitions
- src/store/gameStore.ts      — Zustand store + selector hooks

## Screens (all complete)
- app/index.tsx               — Title screen, run history, new game
- app/game.tsx                — Game shell, 5-tab navigator, engine init
- src/screens/RoadScreen.tsx  — Main game loop, action buttons, wired to TurnEngine
- src/screens/CombatScreen.tsx— Full combat UI, HP bars, log, result overlay
- src/screens/DialogueScreen.tsx — Branching dialogue, tone-coded choices
- src/screens/InventoryScreen.tsx— 3-tab inventory, equip/use/sell, wired to store
- src/screens/MapScreen.tsx   — Scrollable road map, region rows, detail card

## Key wiring: how inventory connects to game state
GameState.resources has three fields:
  items: InventoryItem[]
  maxSlots: number            (8 base, 10 with Traveler's Pack)
  equippedItems: Partial<Record<ItemSlot, string>>  (slot → itemDefinitionId)

Use inventoryFromResources(resources) to get an Inventory object.
Use resourcesToInventory(resources, inv) to write it back.
The TurnEngine reads computeEquippedBonuses() every turn for passive effects.
InventoryScreen writes directly to the Zustand store + triggers saveEngine.saveRun().

## What is NOT done yet (priority order)

Functional gaps (game won't feel complete without these):

  1. Boss fight — TurnEngine.checkWinLoss has a // TODO: Trigger boss combat event comment. When the player reaches location 125, it currently just checks combat power and auto-resolves to victory/defeat. A real boss combat event needs to be       
  triggered through the CombatEngine.
  2. Companion reputation affinity — isReputationInCompanionRange() in TurnEngine always returns true. Companions each have preferred rep ranges that should affect loyalty gain/loss each turn.
  3. Component import paths — game.tsx imports like import { StatusBar } from '@components/StatusBar' point to files that don't exist (everything is in src/components/index.ts). This will cause build failures. The imports need to be changed to from
   '@components', or each component needs to be split into its own file.

  Content / polish:

  4. Sound assets — SoundEngine.ts is scaffolded but needs .mp3 files placed in src/assets/sfx/ and the asset map uncommented.
  5. map_screen.html — there's a stray HTML file in src/screens/ that shouldn't be there.
  6. CLAUDE.md is stale — the "What is NOT done yet" section still lists items 1–8 as todo. It should be updated to reflect current state.
  7. Story flags — DialogueEngine uses a module-level Set for story flags (noted as a placeholder). These don't persist across app restarts since they're not saved to GameState.

## Design system
Fonts: Cinzel_400Regular, Cinzel_600SemiBold (display), CrimsonText_400Regular,
       CrimsonText_400Regular_Italic, CrimsonText_600SemiBold (body)
Colours: ink #1A1208, parchment #F5EAD6, blood #8B1A1A, gold #B8860B
Screens use StyleSheet.create (not NativeWind classes) for precise layout.
All text uses fontFamily from the above — never system fonts.

## Save system
Schema version: 2
Auto-saves after every turn in TurnEngine.cleanup()
Also saves after every inventory mutation in InventoryScreen
Migration ladder handles v0, v1, v2 — add new migrations at bottom of
SaveEngine.migrate() and bump SCHEMA_VERSION in GameState.ts

## Running locally
npx expo start
Requires: @expo-google-fonts/cinzel and @expo-google-fonts/crimson-text installed