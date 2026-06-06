import enemiesJson from './enemies.json';
import { EnemyDefinition } from '../engine/types';

function assertEnemyDefinitions(value: unknown): asserts value is EnemyDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid enemies.json: expected an array.');
  }
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid enemies.json: each entry must be an object.');
    }
    const enemy = item as Record<string, unknown>;
    if (typeof enemy.id !== 'string') {
      throw new Error('Invalid enemies.json: id must be a string.');
    }
    if (typeof enemy.name !== 'string') {
      throw new Error('Invalid enemies.json: name must be a string.');
    }
  }
}

assertEnemyDefinitions(enemiesJson);

export const ENEMIES: EnemyDefinition[] = enemiesJson as unknown as EnemyDefinition[];

export function getEnemyDefinition(id: string): EnemyDefinition {
  const def = ENEMIES.find(e => e.id === id);
  if (!def) {
    throw new Error(`Unknown enemy ID: "${id}"`);
  }
  return def;
}
