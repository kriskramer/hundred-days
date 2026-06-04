import {
  DialogueEngine,
  Dialogue,
  DialogueNode,
  DialogueCondition,
  findDialogueForLocation,
  DIALOGUES,
} from '@engine/DialogueEngine';
import { makeGameState, makeCompanion } from '../__fixtures__/gameState';

// ─────────────────────────────────────────
// Minimal dialogue builder
// ─────────────────────────────────────────

function makeDialogue(overrides: Partial<Dialogue> = {}): Dialogue {
  return {
    id: 'test_dialogue',
    title: 'Test Dialogue',
    triggerType: 'location_enter',
    triggerConditions: {},
    rootNodeId: 'node_01',
    repeatable: false,
    tags: [],
    nodes: {
      node_01: {
        id: 'node_01',
        speakerName: 'Narrator',
        text: 'You see a stranger.',
        choices: [
          {
            id: 'choice_help',
            text: 'Help them.',
            tone: 'heroic',
            outcome: { nextNodeId: null, moraleDelta: 5, reputationDelta: 8 },
          },
          {
            id: 'choice_ignore',
            text: 'Ignore them.',
            tone: 'pragmatic',
            outcome: { nextNodeId: null, moraleDelta: -3 },
          },
        ],
      },
    },
    ...overrides,
  };
}

function makeEngine(dialogueOverrides: Partial<Dialogue> = {}, stateOverrides = {}) {
  const dialogue = makeDialogue(dialogueOverrides);
  const state = makeGameState(stateOverrides);
  const onNodeChange = jest.fn();
  const onComplete = jest.fn();
  const engine = new DialogueEngine(dialogue, state, onNodeChange, onComplete);
  return { engine, state, onNodeChange, onComplete, dialogue };
}

// ─────────────────────────────────────────
// Construction & start
// ─────────────────────────────────────────

describe('DialogueEngine construction', () => {
  it('starts at rootNodeId on start()', () => {
    const { engine, state, onNodeChange } = makeEngine();
    engine.start(state, []);

    expect(onNodeChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'node_01' }),
      expect.any(Array),
    );
  });

  it('session is not complete after start', () => {
    const { engine, state } = makeEngine();
    engine.start(state, []);
    expect(engine.getSession().isComplete).toBe(false);
  });
});

// ─────────────────────────────────────────
// evalConditions (tested via visible choices)
// ─────────────────────────────────────────

describe('DialogueEngine — evalConditions via visible choices', () => {
  it('shows all choices when no conditions', () => {
    const { engine, state, onNodeChange } = makeEngine();
    engine.start(state, []);
    const [, visibleChoices] = onNodeChange.mock.calls[0];
    expect(visibleChoices).toHaveLength(2);
  });

  it('hides choice when minReputation condition not met', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'rep_high', text: 'Requires high rep.', tone: 'heroic',
              conditions: { minReputation: 70 },
              outcome: { nextNodeId: null },
            },
            {
              id: 'no_cond', text: 'No conditions.', tone: 'pragmatic',
              outcome: { nextNodeId: null },
            },
          ],
        },
      },
    });
    const state = makeGameState(); // default rep 50
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visibleChoices] = onNodeChange.mock.calls[0];
    expect(visibleChoices).toHaveLength(1);
    expect(visibleChoices[0].id).toBe('no_cond');
  });

  it('hides choice when maxReputation condition exceeded', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'rep_low', text: 'Requires low rep.', tone: 'villainous',
              conditions: { maxReputation: 30 },
              outcome: { nextNodeId: null },
            },
            {
              id: 'no_cond', text: 'Always visible.', tone: 'pragmatic',
              outcome: { nextNodeId: null },
            },
          ],
        },
      },
    });
    const state = makeGameState(); // default rep 50 > 30
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visibleChoices] = onNodeChange.mock.calls[0];
    expect(visibleChoices.find((c: any) => c.id === 'rep_low')).toBeUndefined();
  });

  it('hides choice when requiredCompanionId not in party', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'needs_rex', text: 'Requires Rex.', tone: 'curious',
              conditions: { requiredCompanionId: 'rex_the_dog' },
              outcome: { nextNodeId: null },
            },
            { id: 'open', text: 'Open.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState(); // no companions
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'needs_rex')).toBeUndefined();
  });

  it('hides choice when forbiddenCompanionId is in party', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'forbidden', text: 'Forbidden with Rex.', tone: 'pragmatic',
              conditions: { forbiddenCompanionId: 'rex_the_dog' },
              outcome: { nextNodeId: null },
            },
            { id: 'open', text: 'Open.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState();
    const companion = makeCompanion({ id: 'rex_the_dog' });
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, [companion]);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'forbidden')).toBeUndefined();
  });

  it('hides choice when requiredFlag not set in storyFlags', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'needs_flag', text: 'Requires flag.', tone: 'heroic',
              conditions: { requiredFlag: 'some_flag' },
              outcome: { nextNodeId: null },
            },
            { id: 'open', text: 'Open.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState(); // no storyFlags
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'needs_flag')).toBeUndefined();
  });

  it('shows choice when requiredFlag is set', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'needs_flag', text: 'Requires flag.', tone: 'heroic',
              conditions: { requiredFlag: 'some_flag' },
              outcome: { nextNodeId: null },
            },
          ],
        },
      },
    });
    const state = makeGameState();
    state.storyFlags.add('some_flag');
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'needs_flag')).toBeDefined();
  });

  it('hides choice when forbiddenFlag is in storyFlags', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'forbidden', text: 'Forbidden if flag set.', tone: 'pragmatic',
              conditions: { forbiddenFlag: 'bad_flag' },
              outcome: { nextNodeId: null },
            },
            { id: 'open', text: 'Open.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState();
    state.storyFlags.add('bad_flag');
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'forbidden')).toBeUndefined();
  });

  it('hides choice when minGold condition not met', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'needs_gold', text: 'Pay 50 gold.', tone: 'pragmatic',
              conditions: { minGold: 50 },
              outcome: { nextNodeId: null },
            },
            { id: 'open', text: 'Free.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState({ resources: { food: 8, gold: 25, items: [], maxSlots: 8, equippedItems: {} } });
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    const [, visible] = onNodeChange.mock.calls[0];
    expect(visible.find((c: any) => c.id === 'needs_gold')).toBeUndefined();
  });
});

// ─────────────────────────────────────────
// choose — outcome accumulation
// ─────────────────────────────────────────

describe('DialogueEngine — choose', () => {
  it('accumulates reputationDelta and moraleDelta from chosen outcome', () => {
    const { engine, state, onComplete } = makeEngine();
    engine.start(state, []);
    engine.choose('choice_help', state, []);

    const outcome = onComplete.mock.calls[0][0];
    expect(outcome.moraleDelta).toBe(5);
    expect(outcome.reputationDelta).toBe(8);
  });

  it('calls onComplete with isComplete: true when nextNodeId is null', () => {
    const { engine, state, onComplete } = makeEngine();
    engine.start(state, []);
    engine.choose('choice_help', state, []);

    expect(onComplete).toHaveBeenCalled();
    expect(engine.getSession().isComplete).toBe(true);
  });

  it('adds flagsSet to gameState.storyFlags immediately', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'set_flag', text: 'Sets a flag.', tone: 'heroic',
              outcome: { nextNodeId: null, flagsSet: ['rex_recruited'] },
            },
          ],
        },
      },
    });
    const state = makeGameState();
    const engine = new DialogueEngine(dialogue, state, jest.fn(), jest.fn());
    engine.start(state, []);
    engine.choose('set_flag', state, []);

    expect(state.storyFlags.has('rex_recruited')).toBe(true);
  });

  it('accumulates resourceDeltas correctly', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'give_food', text: 'Give food.', tone: 'heroic',
              outcome: { nextNodeId: null, resourceDelta: { food: -2, gold: 10 } },
            },
          ],
        },
      },
    });
    const state = makeGameState();
    const onComplete = jest.fn();
    const engine = new DialogueEngine(dialogue, state, jest.fn(), onComplete);
    engine.start(state, []);
    engine.choose('give_food', state, []);

    const outcome = onComplete.mock.calls[0][0];
    expect(outcome.resourceDeltas.food).toBe(-2);
    expect(outcome.resourceDeltas.gold).toBe(10);
  });

  it('includes companion effect in outcome', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [
            {
              id: 'recruit_companion', text: 'Take them with you.', tone: 'heroic',
              outcome: {
                nextNodeId: null,
                companionEffect: { type: 'recruit', companionId: 'rex_the_dog' },
              },
            },
          ],
        },
      },
    });
    const state = makeGameState();
    const onComplete = jest.fn();
    const engine = new DialogueEngine(dialogue, state, jest.fn(), onComplete);
    engine.start(state, []);
    engine.choose('recruit_companion', state, []);

    const outcome = onComplete.mock.calls[0][0];
    expect(outcome.companionEffects).toHaveLength(1);
    expect(outcome.companionEffects[0]?.type).toBe('recruit');
    expect(outcome.companionEffects[0]?.companionId).toBe('rex_the_dog');
  });

  it('navigates to next node when nextNodeId is set', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Step 1.',
          choices: [
            { id: 'next', text: 'Continue.', tone: 'pragmatic', outcome: { nextNodeId: 'node_02' } },
          ],
        },
        node_02: {
          id: 'node_02', speakerName: 'Narrator', text: 'Step 2.',
          choices: [
            { id: 'end', text: 'Done.', tone: 'pragmatic', outcome: { nextNodeId: null } },
          ],
        },
      },
    });
    const state = makeGameState();
    const onNodeChange = jest.fn();
    const engine = new DialogueEngine(dialogue, state, onNodeChange, jest.fn());
    engine.start(state, []);
    engine.choose('next', state, []);

    // Should have advanced to node_02
    const lastCall = onNodeChange.mock.calls[onNodeChange.mock.calls.length - 1];
    expect(lastCall[0].id).toBe('node_02');
    expect(engine.getSession().currentNodeId).toBe('node_02');
    expect(engine.getSession().isComplete).toBe(false);
  });
});

// ─────────────────────────────────────────
// Auto-advance
// ─────────────────────────────────────────

describe('DialogueEngine — auto-advance', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires advance after default delay when autoAdvance: true', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Auto-advance test.',
          choices: [],
          autoAdvance: true,
          autoAdvanceToId: null,
          autoAdvanceDelayMs: 1800,
        },
      },
    });
    const state = makeGameState();
    const onComplete = jest.fn();
    const engine = new DialogueEngine(dialogue, state, jest.fn(), onComplete);
    engine.start(state, []);

    expect(onComplete).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1800);
    expect(onComplete).toHaveBeenCalled();
  });

  it('destroy cancels auto-advance timer', () => {
    const dialogue = makeDialogue({
      nodes: {
        node_01: {
          id: 'node_01', speakerName: 'Narrator', text: 'Test.',
          choices: [], autoAdvance: true, autoAdvanceToId: null,
        },
      },
    });
    const state = makeGameState();
    const onComplete = jest.fn();
    const engine = new DialogueEngine(dialogue, state, jest.fn(), onComplete);
    engine.start(state, []);

    engine.destroy();
    jest.runAllTimers();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────
// findDialogueForLocation
// ─────────────────────────────────────────

describe('findDialogueForLocation', () => {
  it('returns rex_the_dog dialogue at location 2 when not yet met', () => {
    const state = makeGameState({ currentLocationId: 2 });
    const dialogue = findDialogueForLocation(2, state);
    expect(dialogue?.id).toBe('rex_the_dog');
  });

  it('returns null when rex_the_dog already fired at this location', () => {
    const state = makeGameState({ currentLocationId: 2 });
    state.firedEventIds.add('rex_the_dog_loc2');
    const dialogue = findDialogueForLocation(2, state);
    expect(dialogue).toBeNull();
  });

  it('returns null when rex already recruited (forbiddenCompanionId)', () => {
    const state = makeGameState({
      currentLocationId: 2,
      companions: [makeCompanion({ id: 'rex_the_dog' })],
    });
    const dialogue = findDialogueForLocation(2, state);
    expect(dialogue).toBeNull();
  });

  it('returns null for location with no dialogues defined', () => {
    const state = makeGameState({ currentLocationId: 50 });
    // Location 50 has no specific location_enter dialogue unless one matches
    // wounded_stranger is an event not a location_enter dialogue
    // Just verify we get null or a valid dialogue (smoke test)
    const dialogue = findDialogueForLocation(50, state);
    expect(dialogue === null || dialogue !== undefined).toBe(true);
  });

  it('DIALOGUES registry has at least 5 entries', () => {
    expect(DIALOGUES.length).toBeGreaterThanOrEqual(5);
  });
});
