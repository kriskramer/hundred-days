# ID Policy — `src/data/` JSON Files

Primary keys for all JSON data files. IDs are treated as immutable once a file
is created — they may only be deprecated (`"deprecated": true`), never renamed.

---

## Per-file naming conventions

| File | ID type | Format | Example |
|------|---------|--------|---------|
| `enemies.json` | string | `snake_case` noun phrase | `orc_warchief`, `wolves` |
| `items.json` | string | `snake_case` noun phrase | `healing_potion`, `traveler_blade` |
| `companions.json` | string | `snake_case` full name | `mira_thorn`, `rex` |
| `locations.json` | integer | sequential 1–125 | `10`, `32` |
| `shops.json` | string | `snake_case` settlement key | `okuna_general` |
| `events.json` | string | `snake_case` verb/noun phrase | `find_abandoned_camp`, `boss_orc_warchief` |
| `dialogues.json` | string | `snake_case` NPC or scene name | `rex_the_dog`, `wounded_stranger` |
| `config.json` | — | no top-level ID field | — |

## Boss event IDs (canonical)

These IDs are frozen. The PLAN_FINAL.md draft referenced `boss_lich`; the
canonical ID in `EventSystem.ts` is `boss_lich_of_vorishy`. Use the latter
everywhere.

| Boss | Event ID | Location |
|------|----------|----------|
| Orc Warchief | `boss_orc_warchief` | 32 |
| Lich | `boss_lich_of_vorishy` | 65 |
| White Horseman | `boss_white_horseman` | 93 |
| Dread Sovereign | `boss_dread_sovereign` | 125 |

All four are verified: `resolutionType: Interactive`, `interactiveHandlerId:
'combat_handler'`, `repeatable: false`.

---

## `Math.random()` Audit (Phase 0 — to be fixed in Phase 3)

All `Math.random()` calls found in `src/` as of Phase 0:

| File | Line(s) | Category | Fix |
|------|---------|----------|-----|
| `src/data/locations.ts` | 132–138 | **Turn path** — `getRandomLocationText()` picks display text during road events | Phase 3: accept seeded `rng` parameter; TurnEngine passes `() => this.nextRandom()` |
| `src/engine/CombatEngine.ts` | 562 | Default param (`random = Math.random`) — overridden by all production callers | Phase 3: remove default; all callers already supply seeded RNG |
| `src/engine/EventSystem.ts` | 411 | Default param (`rng = Math.random`) — overridden by all production callers | Phase 3: remove default; all callers already supply seeded RNG |
| `src/engine/GameState.ts` | 95 | Seed generation in `createNewGameState()` — non-deterministic by design | Phase 3: replace with `Date.now() % 999_999` |
| `src/engine/GameState.ts` | 254–255 | `getRandomLevelUpChoices()` wrapper — **never called** (TurnEngine uses `WithRng` variant directly) | Phase 3: delete this wrapper |
| `src/engine/GameState.ts` | 312 | Run ID generation — non-deterministic by design | Phase 3: replace with `Date.now().toString(36).slice(-8)` |
| `src/screens/CombatScreen.tsx` | 110 | Fallback when no engine (`engine ? engine.nextRandom() : Math.random`) — not in turn resolution path | No change needed; unreachable in normal gameplay |

**Expected result after Phase 3:** zero `Math.random` calls in `src/engine/` and
`src/data/`; the one in `CombatScreen.tsx` remains as a defensive fallback.
