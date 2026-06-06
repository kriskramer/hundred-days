import itemsJson from './items.json';
import { ItemDefinition } from '../engine/types';

function assertItemDefinitions(value: unknown): asserts value is ItemDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid items.json: expected an array.');
  }
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid items.json: each entry must be an object.');
    }
    const it = item as Record<string, unknown>;
    if (typeof it.id !== 'string') {
      throw new Error('Invalid items.json: id must be a string.');
    }
    if (typeof it.name !== 'string') {
      throw new Error('Invalid items.json: name must be a string.');
    }
  }
}

assertItemDefinitions(itemsJson);

export const ITEMS: ItemDefinition[] = itemsJson as unknown as ItemDefinition[];

export function getItemDefinition(id: string): ItemDefinition {
  const def = ITEMS.find(i => i.id === id);
  if (!def) {
    throw new Error(`Unknown item ID: "${id}"`);
  }
  return def;
}

export function getItemDef(id: string): ItemDefinition | undefined {
  return ITEMS.find(i => i.id === id);
}
