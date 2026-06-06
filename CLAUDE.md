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

## Full architecture reference
See docs/ARCHITECTURE.md for a comprehensive overview: game systems, turn lifecycle
diagram, state model, combat/dialogue/event/item system descriptions, and UI layout.

## Architecture — key files
- src/engine/types.ts           — ALL shared types and enums (start here)
- src/engine/TurnEngine.ts      — 10-phase turn lifecycle, orchestrates everything
- src/engine/GameState.ts       — createNewGameState(), XP thresholds, pure helpers
- src/engine/SaveEngine.ts      — auto-save, backup slot, schema migration (v9)
- src/engine/GameBalance.ts     — formula-coupled balance constants (as const)
- src/engine/EventSystem.ts     — random event pipeline, passive/interactive split
- src/engine/CombatEngine.ts    — full combat resolution, enemies from JSON
- src/engine/DialogueEngine.ts  — branching dialogue evaluation (~200 lines; trees in JSON)
- src/engine/ConditionEvaluator.ts — shared condition evaluation for events + dialogues
- src/engine/ItemSystem.ts      — inventory CRUD, shop logic (items from JSON)
- src/engine/bosses.ts          — BOSS_EVENT_MAP, BOSS_LOCATION_IDS, isBossLocation()
- src/engine/RunLayout.ts       — per-run NPC/shortcut/elite layout generation
- src/data/config.json          — XP thresholds, starting resources, level-up choices
- src/data/items.json           — all item definitions (stealable, combatUsesPerBattle, etc.)
- src/data/enemies.json         — all enemy + boss definitions with bossLoot
- src/data/companions.json      — all 11 companion definitions
- src/data/locations.json       — 125 locations with mob tables and boss flags
- src/data/events.json          — all game event definitions
- src/data/dialogues.json       — all dialogue trees (frozen IDs, see ID_POLICY.md)
- src/data/shops.json           — per-location shop inventories (8 shops)
- src/data/ID_POLICY.md         — ID naming conventions and Math.random audit
- src/store/gameStore.ts        — Zustand store + selector hooks

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

## Data layer
All game content is in JSON files under src/data/ with thin TypeScript loaders.
No file outside a loader imports JSON directly. Each loader exports a typed array
plus a getX(id) throw-guard accessor. ID policy and Math.random audit are in
src/data/ID_POLICY.md.

## What is NOT done yet

  1. Sound assets — SoundEngine.ts is scaffolded but needs .mp3 files placed in
     src/assets/sfx/ and the asset map uncommented. All other systems are complete.

## Design system
Fonts: Cinzel_400Regular, Cinzel_600SemiBold (display), CrimsonText_400Regular,
       CrimsonText_400Regular_Italic, CrimsonText_600SemiBold (body)
Colours: ink #1A1208, parchment #F5EAD6, blood #8B1A1A, gold #B8860B
Screens use StyleSheet.create (not NativeWind classes) for precise layout.
All text uses fontFamily from the above — never system fonts.

## Save system
Schema version: 9
Auto-saves after every turn in TurnEngine.cleanup()
Also saves after every inventory mutation in InventoryScreen
Migration ladder handles v0–v9 — add new migrations at the bottom of
SaveEngine.migrate() and bump SCHEMA_VERSION in GameState.ts

## Running locally
npx expo start
Requires: @expo-google-fonts/cinzel and @expo-google-fonts/crimson-text installed