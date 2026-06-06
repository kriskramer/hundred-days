import { DIALOGUES, getDialogue } from '@data/dialogues';
import { evalConditions } from './ConditionEvaluator';
import type {
  ChoiceOutcome,
  Companion,
  Dialogue,
  DialogueChoice,
  DialogueNode,
  DialogueSession,
  DialogueSessionOutcome,
  GameState,
} from './types';

export { DIALOGUES, getDialogue };
export type {
  ChoiceTone,
  DialogueTrigger,
  DialogueCondition,
  ChoiceOutcome,
  DialogueChoice,
  DialogueNode,
  Dialogue,
  DialogueSessionOutcome,
  DialogueSession,
} from './types';

export class DialogueEngine {
  private session: DialogueSession;
  private dialogue: Dialogue;
  private onNodeChange: (node: DialogueNode, choices: DialogueChoice[]) => void;
  private onComplete: (outcome: DialogueSessionOutcome) => void;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    dialogue: Dialogue,
    _gameState: GameState,
    onNodeChange: (node: DialogueNode, choices: DialogueChoice[]) => void,
    onComplete: (outcome: DialogueSessionOutcome) => void,
  ) {
    this.dialogue = dialogue;
    this.onNodeChange = onNodeChange;
    this.onComplete = onComplete;
    this.session = {
      dialogueId: dialogue.id,
      currentNodeId: dialogue.rootNodeId,
      choiceHistory: [],
      isComplete: false,
      outcome: emptyOutcome(dialogue.id),
    };
  }

  start(gameState: GameState, companions: Companion[]): void {
    this.advanceTo(this.dialogue.rootNodeId, gameState, companions);
  }

  choose(choiceId: string, gameState: GameState, companions: Companion[]): void {
    if (this.session.isComplete) return;

    const node = this.dialogue.nodes[this.session.currentNodeId];
    if (!node) return;

    const choice = node.choices.find(entry => entry.id === choiceId);
    if (!choice) return;

    this.session.choiceHistory.push(choiceId);
    this.accumulateOutcome(choice.outcome);

    if (choice.outcome.flagsSet) {
      choice.outcome.flagsSet.forEach(flag => gameState.storyFlags.add(flag));
    }

    if (choice.outcome.nextNodeId) {
      this.advanceTo(choice.outcome.nextNodeId, gameState, companions);
      return;
    }

    this.end();
  }

  advance(gameState: GameState, companions: Companion[]): void {
    const node = this.dialogue.nodes[this.session.currentNodeId];
    if (!node?.autoAdvance) return;

    if (node.autoAdvanceToId) {
      this.advanceTo(node.autoAdvanceToId, gameState, companions);
      return;
    }

    this.end();
  }

  destroy(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
    }
  }

  getSession(): DialogueSession {
    return this.session;
  }

  private advanceTo(nodeId: string, gameState: GameState, companions: Companion[]): void {
    const node = this.dialogue.nodes[nodeId];
    if (!node) {
      this.end();
      return;
    }

    this.session.currentNodeId = nodeId;

    const visibleChoices = node.choices.filter(choice =>
      !choice.conditions || evalConditions(choice.conditions, { ...gameState, companions }, { dialogueId: this.dialogue.id }),
    );

    this.onNodeChange(node, visibleChoices);

    if (!node.autoAdvance) {
      return;
    }

    const delay = node.autoAdvanceDelayMs ?? 1800;
    this.autoAdvanceTimer = setTimeout(() => this.advance(gameState, companions), delay);
  }

  private end(): void {
    this.session.isComplete = true;
    this.onComplete(this.session.outcome);
  }

  private accumulateOutcome(outcome: ChoiceOutcome): void {
    const sessionOutcome = this.session.outcome;

    if (outcome.reputationDelta) sessionOutcome.reputationDelta += outcome.reputationDelta;
    if (outcome.moraleDelta) sessionOutcome.moraleDelta += outcome.moraleDelta;
    if (outcome.xpGained) sessionOutcome.xpGained += outcome.xpGained;
    if (outcome.resourceDelta?.food) sessionOutcome.resourceDeltas.food += outcome.resourceDelta.food;
    if (outcome.resourceDelta?.gold) sessionOutcome.resourceDeltas.gold += outcome.resourceDelta.gold;
    if (outcome.resourceDelta?.health) sessionOutcome.resourceDeltas.health += outcome.resourceDelta.health;
    if (outcome.companionEffect) sessionOutcome.companionEffects.push(outcome.companionEffect);
    if (outcome.eventTrigger) sessionOutcome.eventTriggers.push(outcome.eventTrigger);
    if (outcome.flagsSet) sessionOutcome.flagsSet.push(...outcome.flagsSet);
  }
}

function emptyOutcome(dialogueId = ''): DialogueSessionOutcome {
  return {
    dialogueId,
    reputationDelta: 0,
    moraleDelta: 0,
    xpGained: 0,
    resourceDeltas: { food: 0, gold: 0, health: 0 },
    companionEffects: [],
    eventTriggers: [],
    flagsSet: [],
  };
}

export function isNpcDialogue(id: string): boolean {
  return getDialogue(id)?.displayName !== undefined;
}

export function canStealFromDialogue(id: string): boolean {
  return getDialogue(id)?.canSteal ?? true;
}

export function getDialogueDisplayName(id: string): string {
  const dialogue = getDialogue(id);
  if (!dialogue) {
    return id
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  if (dialogue.displayName) {
    return dialogue.displayName;
  }

  const rootNode = dialogue.nodes[dialogue.rootNodeId];
  if (rootNode && rootNode.speakerName !== 'Narrator') {
    return rootNode.speakerName;
  }

  return dialogue.title.split(',')[0] ?? dialogue.title;
}

function recruitsExistingCompanion(dialogue: Dialogue, gameState: GameState): boolean {
  if (gameState.companions.length === 0) return false;

  const recruitedCompanionIds = new Set(gameState.companions.map(companion => companion.id));

  return Object.values(dialogue.nodes).some(node =>
    node.choices.some(choice => {
      const effect = choice.outcome.companionEffect;
      return effect?.type === 'recruit' && recruitedCompanionIds.has(effect.companionId);
    }),
  );
}

export function findDialogueForLocation(locationId: number, gameState: GameState): Dialogue | null {
  for (const dialogue of DIALOGUES) {
    if (dialogue.triggerType !== 'location_enter') continue;

    const checkState = { ...gameState, currentLocationId: locationId };
    if (!evalConditions(dialogue.triggerConditions, checkState, { dialogueId: dialogue.id })) continue;
    if (recruitsExistingCompanion(dialogue, gameState)) continue;

    return dialogue;
  }

  return null;
}
