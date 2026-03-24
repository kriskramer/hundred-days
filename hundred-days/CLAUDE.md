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

### 1. Paste full location data
src/data/locations.ts has only location 1 as a stub.
The full 125-location data was generated as locations.ts in a previous session.
Paste all 124 remaining location objects from the generated file into the
LOCATIONS array, or import from a separate locations.generated.ts file.

### 2. Shop screen
No ShopScreen component exists yet. It should:
- Be reachable from RoadScreen when location.hasShop is true
- Use getShopInventory(locationId, playerGold, hasMerchantsRing) from ItemSystem
- Use buyItem(inventory, itemId, gold, hasMerchantsRing) to purchase
- Write result back with resourcesToInventory + setGame + saveEngine.saveRun
- Same parchment/ink aesthetic as InventoryScreen

### 3. Wire use-item effects back into GameState
When a consumable is used (healing potion, spirit tonic, etc.),
ItemSystem returns the active effect but the effect is only shown as a toast.
The actual GameState deltas (health, food, morale) are not applied yet.
In InventoryScreen.handleUse, after persistInventory(result.inventory),
also apply result.effect values to gameState.player.health,
gameState.resources.food, and gameState.morale.

### 4. Wire attack bonus into CombatEngine
CombatEngine builds PlayerCombatant from GameState but doesn't read
equipped item bonuses. In CombatEngine.buildPlayer(), add:
  const bonuses = computeEquippedBonuses(inventoryFromResources(game.resources))
  attack:  game.player.stats.attack  + (bonuses.attackBonus  ?? 0)
  defense: game.player.stats.defense + (bonuses.defenseBonus ?? 0)
  speed:   game.player.stats.speed   + (bonuses.speedBonus   ?? 0)
Also wire immuneToTerrify: if bonuses.immuneToTerrify, skip Terrify effect.

### 5. Location event pools
Each Location has an eventPool field that should list event IDs eligible to
fire there. Currently sampleEventsForTurn() samples globally.
Assign event pools per location type:
  wilderness: ['bandit_ambush', 'wolf_attack', 'find_abandoned_camp',
               'forage_roadside', 'food_spoils', 'inspiring_vista', 'bad_dream']
  town:       ['pickpocket', 'toll_road', 'weather_storm_rolls_in', 'bad_dream']
  dungeon:    ['bandit_ambush', 'wolf_attack', 'bad_dream']

### 6. Companion recruitment wiring
When DialogueEngine returns a companionEffect of type 'recruit',
game.tsx calls onComplete(result) but doesn't actually add the companion.
In game.tsx handleInteractiveEventComplete(), check result for companionEffects
and call the companion recruitment logic:
  import { COMPANIONS } from '@data/companions'
  const toRecruit = outcome.companionEffects.filter(e => e.type === 'recruit')
  // add each to gameState.companions if not already present

### 7. Gold from selling not persisted to status bar
InventoryScreen.handleSell writes gold back correctly but the status bar
gold display reads from gameState.resources.gold via the Zustand selector.
Verify useGameStore re-renders the StatusBar after a sell — should work
automatically since setGame triggers a re-render, but worth confirming.

### 8. Polish / nice-to-have
- Haptic feedback on combat hits (expo-haptics)
- Turn history log viewer (GameState.turnHistory is populated, just needs a UI)
- Settings screen (AppSettings type exists, saveEngine.saveSettings() works)
- Sound design (expo-av is installed)

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