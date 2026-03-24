import {
  GameState,
  Companion,
  MoraleTier,
  ReputationTier,
  CombatResult,
} from './types';

// ─────────────────────────────────────────
// Dialogue types
// ─────────────────────────────────────────

export type ChoiceTone =
  | 'heroic'
  | 'pragmatic'
  | 'cunning'
  | 'intimidating'
  | 'villainous'
  | 'curious'
  | 'humorous';

export type DialogueTrigger =
  | 'location_enter'
  | 'event_fired'
  | 'player_initiated'
  | 'companion_trigger'
  | 'combat_precursor';

export interface DialogueCondition {
  minReputation?:          number;
  maxReputation?:          number;
  minMorale?:              number;
  maxMorale?:              number;
  minPlayerLevel?:         number;
  requiredCompanionId?:    string;
  forbiddenCompanionId?:   string;
  minGold?:                number;
  minFood?:                number;
  locationId?:             number;
  minLocationId?:          number;
  maxLocationId?:          number;
  dayRange?:               [number, number];
  notAlreadyMet?:          boolean;      // fires at most once per run
  requiredFlag?:           string;       // global story flag must be set
  forbiddenFlag?:          string;       // global story flag must NOT be set
}

export interface ChoiceOutcome {
  nextNodeId:        string | null;  // null = end conversation

  resourceDelta?: {
    food?:   number;
    gold?:   number;
    health?: number;
  };

  reputationDelta?:  number;
  moraleDelta?:      number;
  xpGained?:         number;

  companionEffect?: {
    type:          'recruit' | 'loyalty_boost' | 'loyalty_loss' | 'dismiss';
    companionId:   string;
    magnitude?:    number;
  };

  eventTrigger?: {
    type:    'combat' | 'item_gain' | 'status_effect' | 'unlock_location';
    payload: string;
  };

  flagsSet?:       string[];
  outcomeText?:    string;   // brief text shown between nodes
}

export interface DialogueChoice {
  id:          string;
  text:        string;
  tone:        ChoiceTone;
  conditions?: DialogueCondition;
  outcome:     ChoiceOutcome;
  isHidden?:   boolean;   // computed at runtime
}

export interface DialogueNode {
  id:               string;
  speakerName:      string;
  speakerPortraitId?:string;
  text:             string;
  choices:          DialogueChoice[];
  conditions?:      DialogueCondition;
  autoAdvance?:     boolean;
  autoAdvanceToId?: string | null;
  autoAdvanceDelayMs?: number;  // defaults to 1800
}

export interface Dialogue {
  id:               string;
  title:            string;
  triggerType:      DialogueTrigger;
  triggerConditions:DialogueCondition;
  rootNodeId:       string;
  nodes:            Record<string, DialogueNode>;
  repeatable:       boolean;
  tags:             string[];
}

// ─────────────────────────────────────────
// Session outcome — accumulated across the tree
// ─────────────────────────────────────────

export interface DialogueSessionOutcome {
  reputationDelta:   number;
  moraleDelta:       number;
  xpGained:          number;
  resourceDeltas: {
    food:   number;
    gold:   number;
    health: number;
  };
  companionEffects:  ChoiceOutcome['companionEffect'][];
  eventTriggers:     ChoiceOutcome['eventTrigger'][];
  flagsSet:          string[];
}

export interface DialogueSession {
  dialogueId:    string;
  currentNodeId: string;
  choiceHistory: string[];
  isComplete:    boolean;
  outcome:       DialogueSessionOutcome;
}

// ─────────────────────────────────────────
// Global story flags — persisted in GameState
// In the full implementation these live in
// GameState.storyFlags: Set<string>
// Here we use a module-level set as a placeholder
// until GameState is extended.
// ─────────────────────────────────────────

const _sessionFlags = new Set<string>();

export function setStoryFlag(flag: string): void  { _sessionFlags.add(flag); }
export function hasStoryFlag(flag: string): boolean { return _sessionFlags.has(flag); }
export function clearStoryFlags(): void { _sessionFlags.clear(); }

// ─────────────────────────────────────────
// DialogueEngine
// ─────────────────────────────────────────

export class DialogueEngine {
  private session:        DialogueSession;
  private dialogue:       Dialogue;
  private onNodeChange:   (node: DialogueNode, choices: DialogueChoice[]) => void;
  private onComplete:     (outcome: DialogueSessionOutcome) => void;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    dialogue:     Dialogue,
    _gameState:    GameState,         // future: used for seeded randoms
    onNodeChange: (node: DialogueNode, choices: DialogueChoice[]) => void,
    onComplete:   (outcome: DialogueSessionOutcome) => void,
  ) {
    this.dialogue     = dialogue;
    this.onNodeChange = onNodeChange;
    this.onComplete   = onComplete;
    this.session = {
      dialogueId:    dialogue.id,
      currentNodeId: dialogue.rootNodeId,
      choiceHistory: [],
      isComplete:    false,
      outcome:       emptyOutcome(),
    };
  }

  /** Start the conversation — call once after construction. */
  start(gameState: GameState, companions: Companion[]): void {
    this.advanceTo(this.dialogue.rootNodeId, gameState, companions);
  }

  /** Submit the player's chosen choice. */
  choose(choiceId: string, gameState: GameState, companions: Companion[]): void {
    if (this.session.isComplete) return;
    const node   = this.dialogue.nodes[this.session.currentNodeId];
    if (!node)   return;
    const choice = node.choices.find(c => c.id === choiceId);
    if (!choice) return;

    this.session.choiceHistory.push(choiceId);
    this.accumulateOutcome(choice.outcome);

    if (choice.outcome.flagsSet) {
      choice.outcome.flagsSet.forEach(f => setStoryFlag(f));
    }

    if (choice.outcome.nextNodeId) {
      this.advanceTo(choice.outcome.nextNodeId, gameState, companions);
    } else {
      this.end();
    }
  }

  /** Advance an auto-advance node. */
  advance(gameState: GameState, companions: Companion[]): void {
    const node = this.dialogue.nodes[this.session.currentNodeId];
    if (!node?.autoAdvance) return;
    if (node.autoAdvanceToId) {
      this.advanceTo(node.autoAdvanceToId, gameState, companions);
    } else {
      this.end();
    }
  }

  /** Cancel any pending auto-advance (call on unmount). */
  destroy(): void {
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
  }

  getSession(): DialogueSession { return this.session; }

  // ── Private ───────────────────────────────────────────────

  private advanceTo(nodeId: string, gameState: GameState, companions: Companion[]): void {
    const node = this.dialogue.nodes[nodeId];
    if (!node) { this.end(); return; }

    this.session.currentNodeId = nodeId;

    const visibleChoices = node.choices.filter(
      c => !c.conditions || this.evalConditions(c.conditions, gameState, companions),
    );

    this.onNodeChange(node, visibleChoices);

    if (node.autoAdvance) {
      const delay = node.autoAdvanceDelayMs ?? 1800;
      this.autoAdvanceTimer = setTimeout(
        () => this.advance(gameState, companions),
        delay,
      );
    }
  }

  private end(): void {
    this.session.isComplete = true;
    this.onComplete(this.session.outcome);
  }

  private evalConditions(
    c:          DialogueCondition,
    game:       GameState,
    companions: Companion[],
  ): boolean {
    const rep    = game.reputation.value;
    const morale = game.morale.value;

    if (c.minReputation !== undefined && rep    < c.minReputation) return false;
    if (c.maxReputation !== undefined && rep    > c.maxReputation) return false;
    if (c.minMorale     !== undefined && morale < c.minMorale)     return false;
    if (c.maxMorale     !== undefined && morale > c.maxMorale)     return false;
    if (c.minPlayerLevel!== undefined && game.player.level < c.minPlayerLevel) return false;
    if (c.minGold       !== undefined && game.resources.gold  < c.minGold)  return false;
    if (c.minFood       !== undefined && game.resources.food  < c.minFood)  return false;

    if (c.requiredCompanionId) {
      if (!companions.some(co => co.id === c.requiredCompanionId)) return false;
    }
    if (c.forbiddenCompanionId) {
      if (companions.some(co => co.id === c.forbiddenCompanionId)) return false;
    }

    if (c.requiredFlag && !hasStoryFlag(c.requiredFlag)) return false;
    if (c.forbiddenFlag && hasStoryFlag(c.forbiddenFlag)) return false;

    if (c.notAlreadyMet && game.firedEventIds.has(this.dialogue.id)) return false;

    return true;
  }

  private accumulateOutcome(o: ChoiceOutcome): void {
    const out = this.session.outcome;
    if (o.reputationDelta)      out.reputationDelta  += o.reputationDelta;
    if (o.moraleDelta)          out.moraleDelta       += o.moraleDelta;
    if (o.xpGained)             out.xpGained          += o.xpGained;
    if (o.resourceDelta?.food)  out.resourceDeltas.food  += o.resourceDelta.food;
    if (o.resourceDelta?.gold)  out.resourceDeltas.gold  += o.resourceDelta.gold;
    if (o.resourceDelta?.health)out.resourceDeltas.health+= o.resourceDelta.health;
    if (o.companionEffect)      out.companionEffects.push(o.companionEffect);
    if (o.eventTrigger)         out.eventTriggers.push(o.eventTrigger);
    if (o.flagsSet)             out.flagsSet.push(...o.flagsSet);
  }
}

function emptyOutcome(): DialogueSessionOutcome {
  return {
    reputationDelta: 0,
    moraleDelta:     0,
    xpGained:        0,
    resourceDeltas:  { food: 0, gold: 0, health: 0 },
    companionEffects:[],
    eventTriggers:   [],
    flagsSet:        [],
  };
}

// ─────────────────────────────────────────
// Dialogue registry
// ─────────────────────────────────────────

export const DIALOGUES: Dialogue[] = [

  // ── Rex the Dog ────────────────────────────────────────────
  {
    id:          'rex_the_dog',
    title:       'Rex Wants to Come',
    triggerType: 'location_enter',
    triggerConditions: { locationId: 2, notAlreadyMet: true },
    rootNodeId:  'rex_01',
    repeatable:  false,
    tags:        ['companion', 'early_game', 'animal'],
    nodes: {
      rex_01: {
        id:          'rex_01',
        speakerName: 'Narrator',
        text:        'A scruffy brown dog has been following you since Okuna. As you leave the outskirts he sits in the road ahead of you, tail wagging, blocking your path with cheerful obstinacy.',
        choices: [
          {
            id:   'rex_take',
            text: '"Alright. Come on then."',
            tone: 'heroic',
            outcome: {
              nextNodeId:      'rex_joins',
              moraleDelta:     5,
              companionEffect: { type: 'recruit', companionId: 'rex_the_dog' },
              flagsSet:        ['rex_recruited'],
            },
          },
          {
            id:   'rex_food',
            text: 'Give him some food and send him home.',
            tone: 'pragmatic',
            outcome: {
              nextNodeId:      'rex_stays',
              resourceDelta:   { food: -1 },
              flagsSet:        ['rex_fed_stayed'],
            },
          },
          {
            id:   'rex_shoo',
            text: 'Shoo him away. No place for a dog.',
            tone: 'pragmatic',
            outcome: {
              nextNodeId: 'rex_dismissed',
              flagsSet:   ['rex_dismissed_early'],
            },
          },
        ],
      },
      rex_joins: {
        id:          'rex_joins',
        speakerName: 'Narrator',
        text:        'Rex leaps forward and falls into step beside you, tail still going. He immediately finds something dead to sniff.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      rex_stays: {
        id:          'rex_stays',
        speakerName: 'Narrator',
        text:        'Rex eats the food enthusiastically, watches you go, and sits down in the road. He will find his own way.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      rex_dismissed: {
        id:          'rex_dismissed',
        speakerName: 'Narrator',
        text:        'Rex watches you walk away with a look of profound, tail-drooping disappointment. You feel it between your shoulder blades for the next mile.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
    },
  },

  // ── Wounded Stranger ───────────────────────────────────────
  {
    id:          'wounded_stranger',
    title:       'Someone Needs Help',
    triggerType: 'event_fired',
    triggerConditions: { minLocationId: 5, maxLocationId: 30 },
    rootNodeId:  'stranger_01',
    repeatable:  false,
    tags:        ['moral_choice', 'reputation', 'early_mid_game'],
    nodes: {
      stranger_01: {
        id:          'stranger_01',
        speakerName: 'Narrator',
        text:        'A figure is slumped against a milestone at the side of the road. Alive — barely. A travelling merchant by the look of them, pack still on their back. They look up at you with exhausted eyes.',
        choices: [
          {
            id:   'stranger_help',
            text: 'Help them. Share food and water.',
            tone: 'heroic',
            outcome: {
              nextNodeId:       'stranger_helped',
              resourceDelta:    { food: -2 },
              reputationDelta:  8,
              moraleDelta:      5,
              xpGained:         8,
            },
          },
          {
            id:   'stranger_ask',
            text: '"What happened to you?"',
            tone: 'curious',
            outcome: { nextNodeId: 'stranger_explains' },
          },
          {
            id:   'stranger_take',
            text: 'Search their pack while they\'re too weak to stop you.',
            tone: 'villainous',
            outcome: {
              nextNodeId:      'stranger_robbed',
              resourceDelta:   { food: 3, gold: 12 },
              reputationDelta: -10,
              moraleDelta:     -8,
            },
          },
          {
            id:   'stranger_pass',
            text: 'Keep walking. You cannot save everyone.',
            tone: 'pragmatic',
            outcome: {
              nextNodeId:      null,
              reputationDelta: -3,
            },
          },
        ],
      },
      stranger_explains: {
        id:          'stranger_explains',
        speakerName: 'Merchant',
        speakerPortraitId: 'portrait_merchant_wounded',
        text:        '"Bandits. Three of them, back on the Archer\'s Bend road. Took most of my coin. Left me the pack — said the goods weren\'t worth carrying." He coughs. "I\'d give anything for water."',
        choices: [
          {
            id:   'stranger_help_after',
            text: 'Give them water and food.',
            tone: 'heroic',
            outcome: {
              nextNodeId:      'stranger_helped',
              resourceDelta:   { food: -2 },
              reputationDelta: 8,
              moraleDelta:     5,
              xpGained:        8,
            },
          },
          {
            id:   'stranger_info_only',
            text: '"I\'ll watch out for those bandits. Good luck."',
            tone: 'pragmatic',
            outcome: {
              nextNodeId: null,
              flagsSet:   ['knows_archers_bend_bandits'],
            },
          },
        ],
      },
      stranger_helped: {
        id:          'stranger_helped',
        speakerName: 'Merchant',
        text:        '"Bless you." He sits up straighter, colour returning. "I\'ve nothing to give but this — there\'s a cave near Sapphire Lake, south side. Travelers have hidden supplies there. Most don\'t know about it."',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      stranger_robbed: {
        id:          'stranger_robbed',
        speakerName: 'Narrator',
        text:        'The merchant is too weak to resist. He watches you go through his pack with dull, defeated eyes. "I thought—" he starts, then doesn\'t finish.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
    },
  },

  // ── Bandit Shakedown ───────────────────────────────────────
  {
    id:          'bandit_shakedown',
    title:       'Bandits on the Road',
    triggerType: 'combat_precursor',
    triggerConditions: { minLocationId: 6, maxLocationId: 80 },
    rootNodeId:  'bandit_01',
    repeatable:  true,
    tags:        ['combat_precursor', 'bandit', 'reputation'],
    nodes: {
      bandit_01: {
        id:          'bandit_01',
        speakerName: 'Bandit Leader',
        speakerPortraitId: 'portrait_bandit',
        text:        '"End of the road, friend. Gold and food — leave it on the ground and walk away. We\'re not looking for trouble."',
        choices: [
          {
            id:   'bandit_pay',
            text: 'Pay them off.',
            tone: 'pragmatic',
            conditions: { minGold: 10 },
            outcome: {
              nextNodeId:      'bandit_paid',
              resourceDelta:   { gold: -10 },
              reputationDelta: -3,
              moraleDelta:     -5,
            },
          },
          {
            id:   'bandit_intimidate',
            text: '"You clearly don\'t know who I am."',
            tone: 'intimidating',
            conditions: { minReputation: 70 },
            outcome: { nextNodeId: 'bandit_intimidated' },
          },
          {
            id:   'bandit_villain_rep',
            text: 'Let your reputation speak for itself.',
            tone: 'villainous',
            conditions: { maxReputation: 25 },
            outcome: { nextNodeId: 'bandit_backs_down' },
          },
          {
            id:   'bandit_negotiate_food',
            text: 'Offer food instead of gold.',
            tone: 'cunning',
            conditions: { minFood: 4 },
            outcome: {
              nextNodeId:    'bandit_deal_food',
              resourceDelta: { food: -3 },
              xpGained:      5,
            },
          },
          {
            id:   'bandit_fight',
            text: 'Draw your weapon.',
            tone: 'heroic',
            outcome: {
              nextNodeId:    null,
              eventTrigger:  { type: 'combat', payload: 'bandits' },
              xpGained:      0,
            },
          },
        ],
      },
      bandit_paid: {
        id:          'bandit_paid',
        speakerName: 'Bandit Leader',
        text:        'He counts the gold, nods, and steps aside. "Pleasure doing business." The others laugh. You keep walking.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      bandit_intimidated: {
        id:          'bandit_intimidated',
        speakerName: 'Bandit Leader',
        text:        'He squints at you. Something clicks. His eyes widen slightly. "Let them through. Let them through." They step aside. Fast.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      bandit_backs_down: {
        id:          'bandit_backs_down',
        speakerName: 'Bandit Leader',
        text:        'The blood drains from his face. He\'s heard the name. He\'s heard the stories. "We don\'t want trouble," he says quietly. They melt back into the trees.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      bandit_deal_food: {
        id:          'bandit_deal_food',
        speakerName: 'Bandit Leader',
        text:        'He looks at the food, looks at you, and makes the practical decision. "Move on." A couple of the others look almost grateful.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
    },
  },

  // ── Dain recruitment ───────────────────────────────────────
  {
    id:          'dain_recruitment',
    title:       'The Qanisi Warrior',
    triggerType: 'location_enter',
    triggerConditions: { locationId: 19, notAlreadyMet: true, minReputation: 0 },
    rootNodeId:  'dain_01',
    repeatable:  false,
    tags:        ['companion', 'good_alignment', 'mid_game'],
    nodes: {
      dain_01: {
        id:          'dain_01',
        speakerName: 'Dain',
        speakerPortraitId: 'portrait_dain',
        text:        '"You move like someone who knows where they\'re going but not what\'s ahead of them. I\'ve walked the eastern road further than most. Where it gets... difficult." He pauses. "I could walk it again. With the right purpose."',
        choices: [
          {
            id:   'dain_recruit',
            text: '"Then walk with me."',
            tone: 'heroic',
            outcome: {
              nextNodeId:      'dain_joins',
              moraleDelta:     8,
              xpGained:        10,
              companionEffect: { type: 'recruit', companionId: 'dain' },
            },
          },
          {
            id:   'dain_ask_price',
            text: '"What would you want in return?"',
            tone: 'cunning',
            outcome: { nextNodeId: 'dain_pitch' },
          },
          {
            id:   'dain_ask_info',
            text: '"Tell me about the road ahead first."',
            tone: 'curious',
            outcome: { nextNodeId: 'dain_info' },
          },
          {
            id:   'dain_decline',
            text: 'Decline politely and move on.',
            tone: 'pragmatic',
            outcome: { nextNodeId: 'dain_refused' },
          },
        ],
      },
      dain_pitch: {
        id:          'dain_pitch',
        speakerName: 'Dain',
        text:        '"Nothing beyond fair passage and honest purpose," he says. "I travel east in any case. Call it aligned interests."',
        choices: [
          {
            id:   'dain_accept_after_pitch',
            text: '"Alright. Keep up."',
            tone: 'pragmatic',
            outcome: {
              nextNodeId:      'dain_joins',
              moraleDelta:     5,
              xpGained:        10,
              companionEffect: { type: 'recruit', companionId: 'dain' },
            },
          },
          {
            id:   'dain_still_decline',
            text: '"Still no."',
            tone: 'pragmatic',
            outcome: { nextNodeId: 'dain_refused' },
          },
        ],
      },
      dain_info: {
        id:          'dain_info',
        speakerName: 'Dain',
        text:        '"The Badlands ahead are worse than the maps say. Two bridges are out. And something moves in the Brownback Wilds that is not bandits." He pauses. "That is free. My company costs more."',
        choices: [
          {
            id:   'dain_accept_after_info',
            text: '"Fair enough. Come along."',
            tone: 'pragmatic',
            outcome: {
              nextNodeId:      'dain_joins',
              moraleDelta:     5,
              xpGained:        12,
              companionEffect: { type: 'recruit', companionId: 'dain' },
              flagsSet:        ['knows_badlands_bridges_out'],
            },
          },
          {
            id:   'dain_info_decline',
            text: '"Good to know. I\'ll go alone."',
            tone: 'pragmatic',
            outcome: {
              nextNodeId: 'dain_refused',
              flagsSet:   ['knows_badlands_bridges_out'],
            },
          },
        ],
      },
      dain_joins: {
        id:          'dain_joins',
        speakerName: 'Dain',
        text:        '"Then I walk with you." He falls into step, movements practiced and quiet. The party feels steadier already.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
      dain_refused: {
        id:          'dain_refused',
        speakerName: 'Dain',
        text:        '"The road is yours to walk as you choose." He returns to his post without looking back.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
    },
  },

  // ── Lefty the Crook ────────────────────────────────────────
  {
    id:          'lefty_recruitment',
    title:       'Lefty Has a Proposition',
    triggerType: 'location_enter',
    triggerConditions: { locationId: 64, maxReputation: 45, notAlreadyMet: true },
    rootNodeId:  'lefty_01',
    repeatable:  false,
    tags:        ['companion', 'evil_alignment', 'mid_game'],
    nodes: {
      lefty_01: {
        id:          'lefty_01',
        speakerName: 'Lefty',
        speakerPortraitId: 'portrait_lefty',
        text:        'A lean man with quick eyes and a missing finger leans against a wall. "Heard about you. Word travels. You\'ve made some interesting choices on the road." He finally looks at you. "Could use someone like you. Or you could use someone like me. Same thing, really."',
        choices: [
          {
            id:   'lefty_interested',
            text: '"What are you offering?"',
            tone: 'cunning',
            outcome: { nextNodeId: 'lefty_pitch' },
          },
          {
            id:   'lefty_suspicious',
            text: '"I don\'t trust anyone who opens with flattery."',
            tone: 'pragmatic',
            outcome: { nextNodeId: 'lefty_pushback' },
          },
          {
            id:   'lefty_walk',
            text: 'Keep walking without acknowledging him.',
            tone: 'pragmatic',
            outcome: { nextNodeId: null },
          },
        ],
      },
      lefty_pitch: {
        id:          'lefty_pitch',
        speakerName: 'Lefty',
        text:        '"I know which merchants short-weigh, which innkeepers water the ale, and which guards can be... reasoned with. I\'m good at finding things that aren\'t mine, and better at not getting caught." He smiles with half his mouth. "You\'re going somewhere dangerous. I\'ve been there."',
        choices: [
          {
            id:   'lefty_recruit',
            text: '"You\'re in. Try not to steal from me."',
            tone: 'cunning',
            outcome: {
              nextNodeId:      'lefty_joins',
              moraleDelta:     -3,
              xpGained:        8,
              companionEffect: { type: 'recruit', companionId: 'lefty_the_crook' },
            },
          },
          {
            id:   'lefty_no_thanks',
            text: '"I work alone."',
            tone: 'pragmatic',
            outcome: { nextNodeId: null },
          },
        ],
      },
      lefty_pushback: {
        id:          'lefty_pushback',
        speakerName: 'Lefty',
        text:        'He raises his hands. "Fair. No flattery then. You need someone who knows how to survive in places that want you dead. That\'s me. No pretty words about it."',
        choices: [
          {
            id:   'lefty_convinced',
            text: '"Alright. Keep up."',
            tone: 'pragmatic',
            outcome: {
              nextNodeId:      'lefty_joins',
              xpGained:        8,
              companionEffect: { type: 'recruit', companionId: 'lefty_the_crook' },
            },
          },
          {
            id:   'lefty_still_no',
            text: '"Still no."',
            tone: 'pragmatic',
            outcome: { nextNodeId: null },
          },
        ],
      },
      lefty_joins: {
        id:          'lefty_joins',
        speakerName: 'Lefty',
        text:        '"Good call." He peels off the wall, pockets something you didn\'t see him pick up, and falls into step. "By the way — that innkeeper back there owes me three gold. We might want to leave quickly."',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: null,
      },
    },
  },

  // ── Brannik's Tent ─────────────────────────────────────────
  {
    id:          'branniks_tent',
    title:       'Brannik Speaks',
    triggerType: 'location_enter',
    triggerConditions: { locationId: 118, notAlreadyMet: true },
    rootNodeId:  'brannik_01',
    repeatable:  false,
    tags:        ['story', 'endgame', 'no_choices'],
    nodes: {
      brannik_01: {
        id:          'brannik_01',
        speakerName: 'Brannik',
        speakerPortraitId: 'portrait_brannik',
        text:        'The old man doesn\'t look up from his fire. "Sit for a moment." It isn\'t a question. You sit.',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: 'brannik_02',
        autoAdvanceDelayMs: 2200,
      },
      brannik_02: {
        id:          'brannik_02',
        speakerName: 'Brannik',
        text:        '"I\'ve watched a hundred people walk this road. Some came back. Most didn\'t. You want to know the difference?" He pokes the fire. "The ones who came back weren\'t stronger. They weren\'t faster. They just didn\'t stop believing the road was going somewhere."',
        choices:     [],
        autoAdvance: true,
        autoAdvanceToId: 'brannik_03',
        autoAdvanceDelayMs: 3000,
      },
      brannik_03: {
        id:            'brannik_03',
        speakerName:   'Brannik',
        text:          '"Roachak knows you\'re coming. Has for a while. He\'s not afraid. That\'s his mistake." He goes back to his fire. "You should go. You\'ve got what you came for."',
        choices:       [],
        autoAdvance:   true,
        autoAdvanceToId: null,
        autoAdvanceDelayMs: 2800,
      },
    },
  },
];

// ─────────────────────────────────────────
// Registry helpers
// ─────────────────────────────────────────

export function getDialogue(id: string): Dialogue | undefined {
  return DIALOGUES.find(d => d.id === id);
}

export function findDialogueForLocation(
  locationId: number,
  gameState:  GameState,
): Dialogue | null {
  for (const d of DIALOGUES) {
    if (d.triggerType !== 'location_enter') continue;
    const c = d.triggerConditions;
    if (c.locationId !== undefined && c.locationId !== locationId) continue;
    if (c.minLocationId !== undefined && locationId < c.minLocationId) continue;
    if (c.maxLocationId !== undefined && locationId > c.maxLocationId) continue;
    if (c.notAlreadyMet && gameState.firedEventIds.has(d.id)) continue;
    if (c.minReputation !== undefined && gameState.reputation.value < c.minReputation) continue;
    if (c.maxReputation !== undefined && gameState.reputation.value > c.maxReputation) continue;
    return d;
  }
  return null;
}
