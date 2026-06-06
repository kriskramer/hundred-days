// ─────────────────────────────────────────
// Engine barrel — import everything from '@engine'
// ─────────────────────────────────────────

export * from './types';
export * from './GameState';
export * from './EventSystem';
export * from './GameBalance';
export { TurnEngine }  from './TurnEngine';
export type { ActionParams } from './TurnEngine';
export { saveEngine }  from './SaveEngine';
export { CombatEngine, buildEnemiesForLocation, buildBossEnemy } from './CombatEngine';
export type {
  CombatState, CombatAction, CombatLogEntry,
  EnemyCombatant, CompanionCombatant, PlayerCombatant,
  CombatPhase,
} from './CombatEngine';
export { ENEMIES, getEnemyDefinition } from '../data/enemies';

export {
  DialogueEngine,
  DIALOGUES,
  getDialogue,
  findDialogueForLocation,
} from './DialogueEngine';
export type {
  Dialogue, DialogueNode, DialogueChoice, DialogueSessionOutcome,
  ChoiceTone, DialogueTrigger, DialogueCondition, ChoiceOutcome,
} from './DialogueEngine';

export {
  ITEM_DEFINITIONS,
  getItemDef,
  addItem,
  removeItem,
  equipItem,
  unequipItem,
  useItem,
  sellItem,
  buyItem,
  getShopInventory,
  computeEquippedBonuses,
  sumEquippedModifiers,
  createEmptyInventory,
  inventoryFromResources,
  resourcesToInventory,
  isItemEquipped,
  RARITY_COLOURS,
  RARITY_BG,
  SLOT_LABELS,
  CATEGORY_ICONS,
} from './ItemSystem';
export type { Inventory, ShopItem, InventoryResult } from './ItemSystem';
export type { SaveResult, LoadResult } from './SaveEngine';
export { soundEngine } from './SoundEngine';
export type { SoundId } from './SoundEngine';
