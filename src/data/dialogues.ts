import dialoguesJson from './dialogues.json';
import type { Dialogue, DialogueNode } from '@engine/types';

function assertDialogueNode(
  dialogueId: string,
  nodeKey: string,
  node: unknown,
): asserts node is DialogueNode {
  if (!node || typeof node !== 'object') {
    throw new Error(`Invalid dialogues.json: dialogue "${dialogueId}" node "${nodeKey}" must be an object.`);
  }

  const entry = node as Record<string, unknown>;
  if (typeof entry.id !== 'string' || typeof entry.speakerName !== 'string' || typeof entry.text !== 'string') {
    throw new Error(`Invalid dialogues.json: dialogue "${dialogueId}" node "${nodeKey}" is malformed.`);
  }

  if (!Array.isArray(entry.choices)) {
    throw new Error(`Invalid dialogues.json: dialogue "${dialogueId}" node "${nodeKey}" must define a choices array.`);
  }
}

function assertDialogues(value: unknown): asserts value is Dialogue[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid dialogues.json: expected an array.');
  }

  for (const dialogue of value) {
    if (!dialogue || typeof dialogue !== 'object') {
      throw new Error('Invalid dialogues.json: each dialogue must be an object.');
    }

    const entry = dialogue as Record<string, unknown>;
    if (
      typeof entry.id !== 'string'
      || typeof entry.title !== 'string'
      || typeof entry.rootNodeId !== 'string'
      || typeof entry.triggerType !== 'string'
      || !entry.triggerConditions
      || typeof entry.triggerConditions !== 'object'
      || typeof entry.nodes !== 'object'
      || !entry.nodes
      || !Array.isArray(entry.tags)
    ) {
      throw new Error('Invalid dialogues.json: malformed dialogue entry.');
    }

    if (entry.displayName !== undefined && typeof entry.displayName !== 'string') {
      throw new Error(`Invalid dialogues.json: dialogue "${entry.id}" displayName must be a string.`);
    }

    if (entry.canSteal !== undefined && typeof entry.canSteal !== 'boolean') {
      throw new Error(`Invalid dialogues.json: dialogue "${entry.id}" canSteal must be a boolean.`);
    }

    const nodes = entry.nodes as Record<string, unknown>;
    if (!(entry.rootNodeId in nodes)) {
      throw new Error(`Invalid dialogues.json: dialogue "${entry.id}" root node "${entry.rootNodeId}" is missing.`);
    }

    for (const [nodeKey, node] of Object.entries(nodes)) {
      assertDialogueNode(entry.id, nodeKey, node);
      if ((node as DialogueNode).id !== nodeKey) {
        throw new Error(`Invalid dialogues.json: dialogue "${entry.id}" node key "${nodeKey}" must match node.id.`);
      }
    }
  }
}

assertDialogues(dialoguesJson);

export const DIALOGUES: Dialogue[] = dialoguesJson as unknown as Dialogue[];

export function getDialogue(id: string): Dialogue | undefined {
  return DIALOGUES.find(dialogue => dialogue.id === id);
}
