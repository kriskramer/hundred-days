import {
  GameState,
  GameEvent,
  PlayerAction,
  TurnPhase,
  TurnState,
  StatDelta,
  TurnRecord,
  ResolutionType,
  EventType,
  WeatherType,
  MoraleTier,
  CombatResult,
  LevelUpChoice,
  Companion,
  StatusEffect,
  PlayerStats,
} from './types';
import { BOSS_EVENT_MAP } from './bosses';

import {
  getMoraleTier,
  getReputationTier,
  getLuckThreshold,
  getFoodCostMultiplier,
  applyMoraleDelta,
  applyReputationDelta,
  applyXP,
  applyLevelUpChoice,
  isDreadActive,
  calculateCombatPower,
  BOSS_POWER_THRESHOLD,
  XP_THRESHOLDS,
  LEVEL_UP_CHOICES,
  clamp,
  getRandomLevelUpChoicesWithRng,
} from './GameState';

import {
  sampleEventsForTurn,
  passiveOutcomeToDelta,
  EVENT_DEFINITIONS,
} from './EventSystem';

import { saveEngine } from './SaveEngine';

import {
  computeEquippedBonuses,
  inventoryFromResources,
  removeItem,
  addItem,
  getItemDef,
  resourcesToInventory,
} from './ItemSystem';

import { getLocation, getRegion } from '@data/locations';
import { nextMulberry32, normalizeRngState } from './Random';

// ─────────────────────────────────────────
// Action param types
// ─────────────────────────────────────────

export type ActionParams =
  | { action: PlayerAction.Move;  forcedMarch: boolean; shortcutTo?: number }
  | { action: PlayerAction.Hunt;  method: 'forage' | 'hunt' }
  | { action: PlayerAction.Trade; purchases: { itemId: string; cost: number }[] }
  | { action: PlayerAction.Rest;  atInn: boolean }
  | { action: PlayerAction.Rally; targetCompanionId?: string }
  | { action: PlayerAction.Camp }
  | { action: PlayerAction.Steal }

// ─────────────────────────────────────────
// TurnEngine
// ─────────────────────────────────────────

export class TurnEngine {
  private state:    GameState;
  private onStateChange:  (state: GameState) => void;
  private onAwaitInput:   (event: GameEvent)  => void;
  private onLevelUp:      (choices: LevelUpChoice[]) => void;
  private bossResults: Map<number, CombatResult> = new Map();
  private readonly randomOverride?: () => number;

  constructor(
    initialState:   GameState,
    onStateChange:  (state: GameState) => void,
    onAwaitInput:   (event: GameEvent)  => void,
    onLevelUp:      (choices: LevelUpChoice[]) => void,
    randomOverride?: () => number,
  ) {
    this.state          = {
      ...initialState,
      rngState: initialState.rngState ?? normalizeRngState(initialState.seed),
    };
    this.onStateChange  = onStateChange;
    this.onAwaitInput   = onAwaitInput;
    this.onLevelUp      = onLevelUp;
    this.randomOverride = randomOverride;
  }

  // ─────────────────────────────────────────
  // PUBLIC API — called by UI
  // ─────────────────────────────────────────

  /** Submit the player's chosen action to start a turn. */
  async submitAction(params: ActionParams): Promise<void> {
    if (this.state.currentTurn !== null && this.state.currentTurn.phase !== TurnPhase.AwaitingAction) return;
    this.initTurn(params.action);
    await this.runTurn(params);
  }

  /** Called after an interactive event (combat / dialogue) resolves. */
  async resolveInteractiveEvent(
    result: CombatResult,
    eventOutcomeOverride?: TurnRecord['eventOutcome'],
  ): Promise<void> {
    if (this.state.currentTurn?.phase !== TurnPhase.AwaitingPlayer) return;
    // Record boss fight results; mark location cleared on victory
    const activeEvent = this.state.currentTurn.activeInteractiveEvent;
    const eventId = activeEvent?.id ?? '';
    const bossLoc = Object.entries(BOSS_EVENT_MAP).find(([, id]) => id === eventId)?.[0];
    if (bossLoc) {
      const loc = Number(bossLoc);
      this.bossResults.set(loc, result);
      if (result.outcome === 'victory') {
        const newCleared = new Set(this.state.clearedCombatLocations);
        newCleared.add(loc);
        this.setState({ clearedCombatLocations: newCleared });
      }
    }
    // Mark location cleared after winning a location ambush
    if (activeEvent?.tags?.includes('location_ambush') && result.outcome === 'victory') {
      const newCleared = new Set(this.state.clearedCombatLocations);
      newCleared.add(this.state.currentLocationId);
      this.setState({ clearedCombatLocations: newCleared });
    }
    this.updateTurn({
      activeInteractiveEvent: null,
      eventOutcome: eventOutcomeOverride ?? {
        eventId,
        result: result.outcome,
        summary: this.buildCombatResultNarrative(result),
      },
    });
    this.applyEventResult(result);
    await this.continueFromPhase(TurnPhase.ResolvingEvents);
  }

  /** Called when player picks a level-up stat. */
  async submitLevelUpChoice(choiceId: string): Promise<void> {
    if (this.state.currentTurn?.phase !== TurnPhase.AwaitingLevelUp) return;
    this.applyLevelUpChoice(choiceId);
    await this.continueFromPhase(TurnPhase.CheckingWinLoss);
  }

  /** Read-only snapshot for the UI. */
  getState(): GameState { return this.state; }

  /** External UI mutations must merge into the engine without replacing turn-owned state. */
  syncExternalState(nextState: GameState): void {
    this.state = {
      ...this.state,
      player: nextState.player,
      resources: nextState.resources,
      morale: nextState.morale,
      reputation: nextState.reputation,
      companions: nextState.companions,
      firedEventIds: nextState.firedEventIds,
      storyFlags: nextState.storyFlags,
    };
  }

  /** Production runs advance persisted RNG state; tests may inject a deterministic override. */
  nextRandom(): number {
    if (this.randomOverride) {
      return this.randomOverride();
    }

    const next = nextMulberry32(this.state.rngState);
    this.state = { ...this.state, rngState: next.state };
    return next.value;
  }

  /** Add a companion to the party (called when dialogue recruits one). */
  addCompanion(companion: Companion): void {
    if (this.state.companions.some(c => c.id === companion.id)) return;
    this.setState({ companions: [...this.state.companions, companion] });
  }

  /** Mark a location_enter dialogue as seen at the given location. */
  markDialogueSeen(dialogueId: string, locationId: number): void {
    const newFired = new Set(this.state.firedEventIds);
    newFired.add(`${dialogueId}_loc${locationId}`);
    this.setState({ firedEventIds: newFired });
  }

  /**
   * Resolve combat that was initiated directly from a location (not via the
   * event system).  Applies the result, marks the location cleared, and saves.
   */
  async resolveLocationCombat(locationId: number, result: CombatResult): Promise<void> {
    const { player, resources, morale, reputation } = this.state;
    const existingEffects = new Set(player.statusEffects.map(effect => effect.id));
    const newPlayer = applyXP({
      ...player,
      health: clamp(player.health + this.getCombatHealthDelta(result), 0, player.stats.maxHealth),
      statusEffects: [
        ...player.statusEffects,
        ...result.injuriesGained
          .filter(effectId => !existingEffects.has(effectId))
          .map(effectId => ({ id: effectId, durationTurns: 3 })),
      ],
    }, result.xpGained);
    const newResources = this.applyConsumedItems({
      ...resources,
      gold: Math.max(0, resources.gold + result.goldGained),
      food: Math.max(0, resources.food + result.foodGained),
    }, result.itemsConsumed);
    const newCleared = new Set(this.state.clearedCombatLocations);
    newCleared.add(locationId);

    const bossEventId = BOSS_EVENT_MAP[locationId];
    const newFired = bossEventId
      ? new Set([...this.state.firedEventIds, bossEventId])
      : this.state.firedEventIds;

    this.setState({
      player:                 newPlayer,
      morale:                 applyMoraleDelta(morale, result.moraleDelta),
      reputation:             applyReputationDelta(reputation, result.reputationDelta),
      resources:              newResources,
      clearedCombatLocations: newCleared,
      firedEventIds:          newFired,
    });

    await saveEngine.saveRun(this.state);
  }

  // ─────────────────────────────────────────
  // MAIN LOOP
  // ─────────────────────────────────────────

  private async runTurn(params: ActionParams): Promise<void> {
    if (!this.validate()) return;

    this.setPhase(TurnPhase.ResolvingAction);
    this.resolveAction(params);

    this.setPhase(TurnPhase.SamplingEvents);
    this.sampleAndQueueEvents();
    this.maybeInjectDangerCombat(params);

    this.setPhase(TurnPhase.ResolvingEvents);
    await this.processEventQueue();
  }

  private async continueFromPhase(phase: TurnPhase): Promise<void> {
    switch (phase) {
      case TurnPhase.ResolvingEvents:
        await this.processEventQueue();
        break;
      case TurnPhase.UpdatingStats:
        this.setPhase(TurnPhase.UpdatingStats);
        this.updateStats();
        this.checkStarvation();
        this.setPhase(TurnPhase.CheckingLevelUp);
        this.checkLevelUp();
        if (this.state.currentTurn?.phase !== TurnPhase.AwaitingLevelUp) {
          await this.continueFromPhase(TurnPhase.CheckingWinLoss);
        }
        break;
      case TurnPhase.CheckingWinLoss:
        this.setPhase(TurnPhase.CheckingWinLoss);
        await this.checkWinLoss();
        if (!this.state.isComplete) await this.cleanup();
        break;
    }
  }

  // ─────────────────────────────────────────
  // PHASE 0 — Init
  // ─────────────────────────────────────────

  private initTurn(action: PlayerAction): void {
    const turn: TurnState = {
      phase:                  TurnPhase.AwaitingAction,
      action,
      locationBefore:         this.state.currentLocationId,
      eventsQueue:            [],
      triggeredEventIds:      [],
      activeInteractiveEvent: null,
      eventOutcome:           undefined,
      pendingDeltas:          [],
      levelUpOccurred:        false,
      log:                    [],
    };
    this.setState({ currentTurn: turn });
  }

  // ─────────────────────────────────────────
  // PHASE 1 — Validation
  // ─────────────────────────────────────────

  private validate(): boolean {
    const { player, morale, dayNumber } = this.state;

    if (player.health <= 0) {
      this.endRun('defeat', 'Your wounds were too great. The world falls to darkness.');
      return false;
    }

    if (dayNumber > 100) {
      this.endRun('timeout', 'The hundred days have passed. The darkness cannot be stopped now.');
      return false;
    }

    // Broken morale — 5% chance party refuses to move
    if (morale.tier === MoraleTier.Broken && this.nextRandom() < 0.05) {
      this.addDelta({
        source:    'broken_morale_refusal',
        narrative: 'The party refuses to budge. Everyone sits in silence, unable to face another step.',
      });
      this.skipToCleanup();
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────
  // PHASE 2 — Action resolution
  // ─────────────────────────────────────────

  private resolveAction(params: ActionParams): void {
    switch (params.action) {
      case PlayerAction.Move:  this.resolveMove(params.forcedMarch, params.shortcutTo); break;
      case PlayerAction.Hunt:  this.resolveHunt(params.method);      break;
      case PlayerAction.Rest:  this.resolveRest(params.atInn);       break;
      case PlayerAction.Rally: this.resolveRally(params.targetCompanionId); break;
      case PlayerAction.Camp:  this.resolveCamp();                   break;
      case PlayerAction.Trade: break; // Trade resolves in the shop UI, not the engine
      case PlayerAction.Steal: this.resolveSteal();                  break;
    }
  }

  private resolveMove(forcedMarch: boolean, shortcutTo?: number): void {
    const { morale, weather, resources, companions } = this.state;
    const currentLoc = this.state.currentLocationId;
    if (BOSS_EVENT_MAP[currentLoc] && !this.state.clearedCombatLocations.has(currentLoc)) {
      this.addLog('The road ahead is sealed by a powerful foe.');
      return;
    }

    let locations = 1;

    // ── Item passive bonuses ─────────────────────────────────
    const itemBonuses = computeEquippedBonuses(inventoryFromResources(resources));

    // Warm Cloak: downgrade Severe → Poor so luck rolls remain possible
    const effectiveWeather = itemBonuses.weatherProtection && weather === WeatherType.Severe
      ? WeatherType.Poor
      : weather;

    // Companion food costs
    const companionFoodPerTurn = companions.reduce(
      (sum, c) => sum + c.foodCostPerTurn, 0,
    );
    const companionFoodModifier = companions.reduce(
      (mult, c) => mult * (c.passiveBonus.foodCostModifier ?? 1.0), 1.0,
    );
    const moraleFoodMult   = getFoodCostMultiplier(morale);
    const itemFoodMult     = 1 - (itemBonuses.foodCostReduction ?? 0);  // e.g. Traveler's Pack -10%
    const marchCostAdjust  = itemBonuses.forcedMarchCostReduction ?? 0; // e.g. Chainmail +0.3

    let baseFoodCost = 1.0;
    let luckyThird = false;

    if (shortcutTo) {
      baseFoodCost = 2.0; // Shortcut costs 1 extra food (normal move is 1.0, so 1 extra is 2.0)
    } else {
      // Forced march
      if (forcedMarch && resources.food >= 1.5) {
        locations    = 2;
        baseFoodCost = 1.5 + marchCostAdjust;   // Chainmail makes marching more expensive
      } else if (forcedMarch) {
        this.addLog('Not enough food to force march. Moving at normal pace.');
      }

      // Severe weather override (using effective weather — Warm Cloak may have softened it)
      if (effectiveWeather === WeatherType.Severe) {
        locations    = 1;
        baseFoodCost = 1.0;
        if (forcedMarch) this.addLog('The storm forces you to a crawl.');
      } else if (weather === WeatherType.Severe && effectiveWeather === WeatherType.Poor) {
        this.addLog('Your cloak blunts the worst of the storm. The march continues.');
      }

      // Luck roll for 3rd location — item bonus stacks on top of morale luck
      const luckThreshold = getLuckThreshold(morale) + (itemBonuses.luckModifier ?? 0);
      const luckRoll      = this.nextRandom();

      if (
        locations === 2 &&
        effectiveWeather !== WeatherType.Severe &&
        effectiveWeather !== WeatherType.Poor &&
        luckRoll <= luckThreshold
      ) {
        locations  = 3;
        luckyThird = true;
      }

      locations = Math.min(locations, 3);
    }

    const totalFood = (baseFoodCost + companionFoodPerTurn)
      * companionFoodModifier
      * moraleFoodMult
      * itemFoodMult;

    if (resources.food < totalFood) {
      const turns = this.state.starvationTurns + 1;
      const { healthLost, moraleLost } = this.getStarvationPenalty(turns);

      this.setState({ starvationTurns: turns });
      this.addDelta({
        source: 'starving_move',
        health: -healthLost,
        morale: -moraleLost,
        narrative: turns === 1
          ? `You march on short rations. The strain costs ${healthLost} HP and ${moraleLost} morale.`
          : `Day ${turns} of marching hungry. The road extracts a harsher toll (−${healthLost} HP, −${moraleLost} morale).`,
      });
    }

    const rawNewLoc  = shortcutTo ?? Math.min(currentLoc + locations, 125);
    // Stop at the nearest uncleared boss location in the path
    const bossCheckpoint = Object.keys(BOSS_EVENT_MAP)
      .map(Number)
      .sort((a, b) => a - b)
      .find(b => b > currentLoc && b <= rawNewLoc && !this.state.clearedCombatLocations.has(b));
    const newLoc = bossCheckpoint ?? rawNewLoc;

    let narrative = '';
    if (shortcutTo) {
      const activeShortcut = this.state.runLayout?.activeShortcuts.find(s => s.from === currentLoc && s.to === shortcutTo);
      const suffix = newLoc < shortcutTo ? ` (stopped at Location ${newLoc} by a powerful boss)` : '';
      narrative = `You took a shortcut: "${activeShortcut?.label ?? 'The hidden path'}" directly to Location ${newLoc}${suffix}.`;
    } else {
      narrative = this.buildMoveNarrative(locations, effectiveWeather, luckyThird, forcedMarch);
    }

    this.addDelta({
      source:    'move',
      food:      -totalFood,
      morale:    forcedMarch && locations > 1 ? -1 : undefined,
      narrative,
    });

    this.setState({
      currentLocationId:  newLoc,
      visitedLocationIds: new Set([...this.state.visitedLocationIds, newLoc]),
    });
  }

  private resolveHunt(method: 'forage' | 'hunt'): void {
    const { morale, companions, resources } = this.state;

    // ── Item passive bonuses ─────────────────────────────────
    const itemBonuses = computeEquippedBonuses(inventoryFromResources(resources));

    // Location forage modifier (huntYield: 0.0 barren → 2.0 excellent)
    const location       = getLocation(this.state.currentLocationId);
    const forageModifier = location.actions.huntYield ?? 1.0;

    // Base yield — scaled by location modifier before any other bonuses
    let foodGained = Math.max(0, Math.round(
      (method === 'forage'
      ? 1 + Math.floor(this.nextRandom() * 3)   // 1–3 base
      : 2 + Math.floor(this.nextRandom() * 4))  // 2–5 base
      * forageModifier
    ));

    // Morale modifier
    if (morale.tier === MoraleTier.Inspired)              foodGained += 1;
    if (morale.tier === MoraleTier.Desperate ||
        morale.tier === MoraleTier.Broken)                foodGained = Math.max(0, foodGained - 1);

    // Companion + item foraging bonuses (Hunter's Bow, Forager's Satchel, Scout Kit)
    const foragingBonus = companions.reduce(
      (sum, c) => sum + (c.passiveBonus.foragingBonus ?? 0), 0,
    ) + (itemBonuses.foragingBonus ?? 0);

    foodGained += foragingBonus;

    const companionFoodCost = companions.reduce((sum, c) => sum + c.foodCostPerTurn, 0);
    const dayCost           = 0.5 + companionFoodCost;

    const yieldDesc = forageModifier >= 1.5 ? 'The land is generous here.'
                    : forageModifier >= 1.0 ? ''
                    : forageModifier >= 0.5 ? 'The pickings are slim.'
                    : 'There is almost nothing to find here.';

    this.addDelta({
      source:    'hunt',
      food:      foodGained - dayCost,
      xp:        3,
      narrative: `You spend the day ${method === 'forage' ? 'foraging' : 'hunting'}. `
               + (yieldDesc ? yieldDesc + ' ' : '')
               + `Net food gain: ${(foodGained - dayCost).toFixed(1)}.`,
    });

    this.maybeTriggerAmbush(PlayerAction.Hunt);
  }

  private resolveSteal(): void {
    const { resources, player } = this.state;
    const stealingSkill = player.stats.stealing ?? 5;

    // Success rate is 40% base + 3% per skill level, capped at 95%
    const successChance = Math.min(0.95, Math.max(0.10, 0.40 + stealingSkill * 0.03));
    const roll = this.nextRandom();
    const isSuccess = roll < successChance;

    if (isSuccess) {
      // 60% chance of gold, 40% chance of item
      const giveGold = this.nextRandom() < 0.60;
      let rewardNarrative = '';
      let goldGained = 0;

      if (giveGold) {
        goldGained = 5 + Math.floor(this.nextRandom() * 11); // 5 to 15 gold
        rewardNarrative = `stole ${goldGained} gold.`;
      } else {
        const pool = ['dried_rations', 'hunters_jerky', 'healing_potion', 'spirit_tonic'];
        const chosenItem = pool[Math.floor(this.nextRandom() * pool.length)];
        const addResult = addItem(resources, chosenItem);

        if (addResult.success && addResult.inventory) {
          const itemDef = getItemDef(chosenItem);
          rewardNarrative = `stole a ${itemDef?.name ?? chosenItem}.`;
          this.setState({ resources: resourcesToInventory(resources, addResult.inventory) });
        } else {
          // Fallback to gold if inventory is full
          goldGained = 5 + Math.floor(this.nextRandom() * 11);
          rewardNarrative = `tried to steal an item, but your pack was full, so you took ${goldGained} gold instead.`;
        }
      }

      // Train stealing skill
      const newSkill = stealingSkill + 1;
      this.setState({
        player: {
          ...player,
          stats: {
            ...player.stats,
            stealing: newSkill,
          }
        }
      });

      this.addDelta({
        source: 'steal_success',
        gold: goldGained || undefined,
        reputation: -5,
        xp: 4,
        narrative: `Success! You silently pickpocketed a passerby and ${rewardNarrative} Your Stealing skill increased to ${newSkill}!`,
      });
    } else {
      // Fail
      this.addDelta({
        source: 'steal_failure',
        reputation: -10, // caught, reputation hit is higher
        morale: -5,
        narrative: 'Caught! You tried to steal but were spotted and chased away. Your reputation suffers.',
      });
    }
  }

  private resolveRest(atInn: boolean): void {
    const healthGain = atInn ? 25 : 10;
    const moraleGain = atInn ? 15 : 5;
    const goldCost   = atInn ? 10 : 0;
    const foodCost   = atInn ? 0.5 : 1.0;

    if (atInn && this.state.resources.gold < goldCost) {
      this.addLog('Not enough gold for the inn. Camping instead.');
      this.resolveCamp();
      return;
    }

    this.addDelta({
      source:    'rest',
      health:    healthGain,
      morale:    moraleGain,
      gold:      atInn ? -goldCost : undefined,
      food:      -foodCost,
      narrative: atInn
        ? 'A warm bed and a hot meal. You feel almost human again.'
        : 'Camp is cold but rest is rest. You wake somewhat refreshed.',
    });

    this.maybeTriggerAmbush(PlayerAction.Rest);
  }

  private resolveRally(targetCompanionId?: string): void {
    const { player, companions } = this.state;
    const moraleGain = 10 + (player.stats.leadership * 2);

    const companionLoyalty: Record<string, number> = {};
    for (const c of companions) {
      companionLoyalty[c.id] = c.id === targetCompanionId
        ? c.loyaltyGains.onRally * 1.5
        : c.loyaltyGains.onRally;
    }

    const companionFoodCost = companions.reduce((s, c) => s + c.foodCostPerTurn, 0);

    this.addDelta({
      source:           'rally',
      morale:           moraleGain,
      food:             -(1.0 + companionFoodCost),
      xp:               5,
      companionLoyalty,
      narrative:        'You gather everyone and speak plainly about what lies ahead. '
                      + 'Something in your words lands. Shoulders straighten.',
    });
  }

  private resolveCamp(): void {
    const companionFoodCost = this.state.companions.reduce((s, c) => s + c.foodCostPerTurn, 0);
    this.addDelta({
      source:    'camp',
      health:    10,
      morale:    3,
      food:      -(1.0 + companionFoodCost),
      narrative: 'You make camp early and rest the full day. The party recovers.',
    });
  }

  // ─────────────────────────────────────────
  // PHASE 3 — Events
  // ─────────────────────────────────────────

  private sampleAndQueueEvents(): void {
    const current = this.state.currentTurn?.eventsQueue ?? [];
    // Reaching a boss checkpoint should end the travel turn so the player can
    // read the location and explicitly start the encounter on the next action.
    const currentLoc = this.state.currentLocationId;
    const bossEventId = BOSS_EVENT_MAP[currentLoc];
    if (bossEventId && !this.state.clearedCombatLocations.has(currentLoc)) {
      const arrivedThisTurn = this.state.currentTurn?.locationBefore !== currentLoc;
      if (arrivedThisTurn) {
        this.updateTurn({ eventsQueue: current });
        return;
      }

      const bossEvent = EVENT_DEFINITIONS.find(e => e.id === bossEventId);
      if (bossEvent) {
        this.updateTurn({ eventsQueue: [...current, bossEvent] });
        return;
      }
    }

    // Roaming Elite Mobs
    const eliteSpawn = this.state.runLayout?.eliteSpawns.find(s => s.locationId === currentLoc);
    if (eliteSpawn && !this.state.clearedCombatLocations.has(currentLoc)) {
      const arrivedThisTurn = this.state.currentTurn?.locationBefore !== currentLoc;
      if (arrivedThisTurn) {
        this.updateTurn({ eventsQueue: current });
        return;
      }

      const eliteEvent: GameEvent = {
        id: `elite_spawn_${currentLoc}`,
        type: EventType.Combat,
        resolutionType: ResolutionType.Interactive,
        name: `Elite: ${eliteSpawn.enemyType}`,
        description: `A formidable ${eliteSpawn.enemyType} blocks the path.`,
        conditions: { probability: 1.0 },
        interactiveHandlerId: 'combat_handler',
        repeatable: false,
        tags: ['combat', 'danger', 'location_ambush'],
      };
      this.updateTurn({ eventsQueue: [...current, eliteEvent] });
      return;
    }

    const events = sampleEventsForTurn(this.state, () => this.nextRandom());
    this.updateTurn({ eventsQueue: [...current, ...events] });
  }

  private maybeInjectDangerCombat(params: ActionParams): void {
    if (params.action !== PlayerAction.Hunt && params.action !== PlayerAction.Camp) return;

    const location = getLocation(this.state.currentLocationId);
    if (this.state.clearedCombatLocations.has(this.state.currentLocationId)) return;

    const aggressiveMobs = location.mobs.filter(m => m.aggroPct > 0 && !m.isCompanion);
    if (aggressiveMobs.length === 0) return;

    // Roll each mob's aggro probability — only ambush if at least one would spawn
    const anySpawn = aggressiveMobs.some(m => this.nextRandom() * 100 < m.aggroPct);
    if (!anySpawn) return;

    const verb = params.action === PlayerAction.Hunt ? 'foraging' : 'making camp';
    this.addLog(`You are ambushed while ${verb}.`);

    const ambush: GameEvent = {
      id:             `location_ambush_loc${this.state.currentLocationId}_day${this.state.dayNumber}`,
      type:           EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name:           'Ambushed',
      description:    'The danger at this location takes its chance.',
      conditions:     { probability: 1.0 },
      repeatable:     true,
      tags:           ['combat', 'location_ambush'],
    };

    const current = this.state.currentTurn?.eventsQueue ?? [];
    this.updateTurn({ eventsQueue: [ambush, ...current] });
  }

  private maybeTriggerAmbush(action: PlayerAction): void {
    const loc      = getLocation(this.state.currentLocationId);
    const region   = getRegion(this.state.currentLocationId);
    const danger   = region?.dangerLevel ?? 0;
    const isSafe   = loc.isTown || danger <= 1;
    const chance   = isSafe ? 0 : danger * 0.05; // 5% per danger tier (max 50%)
    if (this.nextRandom() > chance) return;

    this.addLog(action === PlayerAction.Rest
      ? 'Your sleep is interrupted by a sudden threat!'
      : 'While foraging, you are startled by a predator!'
    );

    const ambush: GameEvent = {
      id:             `ambush_${action}_day${this.state.dayNumber}`,
      type:           EventType.Combat,
      resolutionType: ResolutionType.Interactive,
      name:           action === PlayerAction.Rest
                        ? 'Disturbed Sleep'
                        : 'Predator in the Brush',
      description:    action === PlayerAction.Rest
                        ? 'Your camp is breached while you sleep.'
                        : 'Something was hunting you while you were hunting.',
      conditions:     { probability: 1.0 },
      repeatable:     true,
      tags:           ['combat', 'hazard_ambush'],
    };

    const current = this.state.currentTurn?.eventsQueue ?? [];
    this.updateTurn({ eventsQueue: [ambush, ...current] });
  }

  private async processEventQueue(): Promise<void> {
    const queue = [...(this.state.currentTurn?.eventsQueue ?? [])];

    for (let i = 0; i < queue.length; i++) {
      const event = queue[i];

      // Mark as fired
      const newFired = new Set(this.state.firedEventIds);
      newFired.add(event.id);
      const triggeredEventIds = this.state.currentTurn?.triggeredEventIds.includes(event.id)
        ? this.state.currentTurn.triggeredEventIds
        : [...(this.state.currentTurn?.triggeredEventIds ?? []), event.id];
      this.setState({ firedEventIds: newFired });
      this.updateTurn({ triggeredEventIds });

      if (event.resolutionType === ResolutionType.Passive && event.passiveOutcome) {
        this.addDelta(passiveOutcomeToDelta(event, event.passiveOutcome));
      } else if (event.resolutionType === ResolutionType.Interactive) {
        // Replace the queue with only the events that come AFTER this one so
        // the next processEventQueue call (after combat/dialogue resolves)
        // doesn't re-encounter this same event.
        const remaining = queue.slice(i + 1);
        this.updateTurn({ activeInteractiveEvent: event, eventsQueue: remaining });
        this.setPhase(TurnPhase.AwaitingPlayer);
        this.onAwaitInput(event);
        return; // Resume via resolveInteractiveEvent()
      }
    }

    // All events processed
    await this.continueFromPhase(TurnPhase.UpdatingStats);
  }

  private applyEventResult(result: CombatResult): void {
    this.addDelta({
      source:    'event_result',
      xp:        result.xpGained,
      gold:      result.goldGained,
      food:      result.foodGained,
      health:    this.getCombatHealthDelta(result),
      morale:    result.moraleDelta,
      reputation:result.reputationDelta,
      statusEffectsAdded: result.injuriesGained,
      narrative: this.buildCombatResultNarrative(result),
    });

    this.setState({ resources: this.applyConsumedItems(this.state.resources, result.itemsConsumed) });
  }

  // ─────────────────────────────────────────
  // PHASE 4 — Stat updates
  // ─────────────────────────────────────────

  private updateStats(): void {
    const { companions, morale, resources } = this.state;

    // ── Item passive bonuses ─────────────────────────────────
    const itemBonuses = computeEquippedBonuses(inventoryFromResources(resources));

    // ── Companion loyalty ticks ──────────────────────────
    const loyaltyDeltas: Record<string, number> = {};
    // Companionship Token: multiplies all loyalty gains
    const loyaltyMult = 1 + (itemBonuses.companionLoyaltyBonus ?? 0);

    for (const c of companions) {
      let delta = 0;

      if (morale.tier === MoraleTier.Inspired || morale.tier === MoraleTier.Steady) {
        delta += c.loyaltyGains.onMoraleHigh;
      } else if (morale.tier === MoraleTier.Desperate || morale.tier === MoraleTier.Broken) {
        delta -= c.loyaltyLosses.onMoraleLow;
      }

      const repInRange = this.isReputationInCompanionRange(c);
      delta += repInRange
        ? c.loyaltyGains.onReputationMatch
        : -c.loyaltyLosses.onReputationMismatch;

      // Apply Companionship Token multiplier to gains only (not losses)
      loyaltyDeltas[c.id] = delta > 0 ? delta * loyaltyMult : delta;
    }

    // ── Morale per turn ──────────────────────────────────
    // Companions (Bard, Elara) + item bonuses (Stone of Comfort, etc.)
    let moraleDelta = companions.reduce(
      (sum, c) => sum + (c.passiveBonus.moralePerTurn ?? 0), 0,
    ) + (itemBonuses.moralePerTurn ?? 0);

    // Dread
    const dreadNow = isDreadActive(this.state.dayNumber, this.state.currentLocationId);
    if (dreadNow) {
      moraleDelta -= 3;
      if (!this.state.morale.dreadActive) {
        this.addLog('A creeping dread settles in. Time is running short.');
      }
    }

    this.addDelta({ source: 'stat_tick', health: 2, morale: moraleDelta || undefined, companionLoyalty: loyaltyDeltas });

    this.setState({ morale: { ...this.state.morale, dreadActive: dreadNow } });

    // ── Weather consequences ─────────────────────────────
    if (this.state.weather === WeatherType.Severe && this.nextRandom() < 0.10) {
      this.addDelta({ source: 'weather', food: -1, narrative: 'Rations ruined by the storm.' });
    }
    if (this.state.weather === WeatherType.Ideal
        && this.state.currentTurn?.action === PlayerAction.Move) {
      this.addDelta({ source: 'weather', morale: 2, narrative: 'Morale lifts under clear skies.' });
    }

    // ── Check companion desertion ────────────────────────
    this.checkCompanionDesertion();
  }

  private checkCompanionDesertion(): void {
    const deserters = this.state.companions.filter(
      c => c.loyalty.value <= c.loyalty.desertsBelow,
    );
    const survivors = this.state.companions.filter(
      c => c.loyalty.value > c.loyalty.desertsBelow,
    );

    for (const d of deserters) {
      this.addDelta({
        source:    `desertion:${d.id}`,
        morale:    -15,
        food:      -(d.foodCostPerTurn * 2),
        narrative: d.departureNarrative,
      });
    }

    if (deserters.length > 0) {
      this.setState({ companions: survivors });
    }
  }

  // ─────────────────────────────────────────
  // PHASE 5 — Starvation
  // ─────────────────────────────────────────

  private checkStarvation(): void {
    if (this.state.resources.food > 0) {
      if (this.state.starvationTurns > 0) {
        this.setState({ starvationTurns: 0 });
      }
      return;
    }

    if (this.didApplyStarvingMovePenalty()) {
      return;
    }

    const turns      = this.state.starvationTurns + 1;
    const { healthLost, moraleLost } = this.getStarvationPenalty(turns);
    this.setState({ starvationTurns: turns });

    this.addDelta({
      source:    'starvation',
      health:    -healthLost,
      morale:    -moraleLost,
      narrative: turns === 1
        ? `There is nothing left to eat. The party suffers (−${healthLost} HP, −${moraleLost} morale).`
        : `Day ${turns} without food. The party is wasting away (−${healthLost} HP, −${moraleLost} morale).`,
    });
  }

  private getStarvationPenalty(turns: number): { healthLost: number; moraleLost: number } {
    return {
      healthLost: Math.min(10 + (turns - 1) * 5, 40),
      moraleLost: Math.min(8 + (turns - 1) * 2, 20),
    };
  }

  private didApplyStarvingMovePenalty(): boolean {
    return this.state.currentTurn?.pendingDeltas.some(d => d.source === 'starving_move') ?? false;
  }

  // ─────────────────────────────────────────
  // PHASE 6 — Level up
  // ─────────────────────────────────────────

  private checkLevelUp(): void {
    const { player } = this.state;
    const threshold  = XP_THRESHOLDS[player.level];

    if (!threshold || player.xp < threshold || player.level >= 10) return;

    // Auto-apply base gains
    const newPlayer = {
      ...player,
      level: player.level + 1,
      stats: {
        ...player.stats,
        maxHealth: player.stats.maxHealth + 8,
        attack:    player.stats.attack    + 1,
      },
    };
    this.setState({ player: newPlayer });

    // Also tick companion XP
    this.tickCompanionXP(5);

    // Present 3 random choices to player
    const rawChoices = getRandomLevelUpChoicesWithRng(3, () => this.nextRandom());
    const stats = this.state.player.stats;
    const statLabels: Record<keyof PlayerStats, string> = {
      maxHealth: 'Max HP',
      attack:    'Attack',
      defense:   'Defense',
      speed:     'Speed',
      endurance: 'Endurance',
      perception:'Perception',
      leadership:'Leadership',
      stealing:  'Stealing',
    };

    const choices = rawChoices.map(choice => {
      const cloned = { ...choice };
      const previews: string[] = [];

      (Object.keys(statLabels) as Array<keyof PlayerStats>).forEach(key => {
        const delta = choice.effect[key];
        if (delta !== undefined && delta !== 0) {
          const before = stats[key] ?? 0;
          const after = before + delta;
          previews.push(`${statLabels[key]}  ${before} → ${after}`);
        }
      });

      if (previews.length > 0) {
        cloned.statPreview = previews.join(', ');
      }
      return cloned;
    });

    this.updateTurn({ levelUpOccurred: true });
    this.setPhase(TurnPhase.AwaitingLevelUp);
    this.onLevelUp(choices);
  }

  private applyLevelUpChoice(choiceId: string): void {
    const choice = LEVEL_UP_CHOICES.find(c => c.id === choiceId);
    if (!choice) return;

    const newStats = applyLevelUpChoice(this.state.player.stats, choice);
    this.setState({
      player: { ...this.state.player, stats: newStats },
    });
    this.addLog(`Level ${this.state.player.level}! You chose: ${choice.label}.`);
  }

  private tickCompanionXP(amount: number): void {
    const XP_TO_NEXT = [0, 20, 50, 95, 160];
    const updated = this.state.companions.map(c => {
      const newXP      = c.level.xp + amount;
      const nextLevel  = c.level.current < 5 ? XP_TO_NEXT[c.level.current] : Infinity;
      const levelsUp   = newXP >= nextLevel && c.level.current < 5;
      return {
        ...c,
        level: {
          current:  levelsUp ? c.level.current + 1 : c.level.current,
          xp:       newXP,
          xpToNext: levelsUp
            ? XP_TO_NEXT[Math.min(c.level.current + 1, 4)]
            : c.level.xpToNext,
        },
      };
    });
    this.setState({ companions: updated });
  }

  // ─────────────────────────────────────────
  // PHASE 7 — Win / Loss
  // ─────────────────────────────────────────

  private async checkWinLoss(): Promise<void> {
    const { currentLocationId, dayNumber } = this.state;

    if (this.state.player.health <= 0) {
      this.endRun('defeat', 'Your wounds were too great. The world falls to darkness.');
      return;
    }

    // Check boss fight outcomes
    const bossDefeatMessages: Record<number, string> = {
      32:  'The Orc Warchief holds the bridge. The road ends here.',
      65:  'The Lich of Vorishy claims another soul. The world grows darker.',
      93:  'The White Horseman\'s chill finds every weakness. You will not rise.',
      125: 'Roachak was too powerful. The world falls into shadow.',
    };
    for (const [locStr, result] of this.bossResults) {
      if (result.outcome !== 'victory') {
        this.endRun('defeat', bossDefeatMessages[locStr] ?? 'The road ends here.');
        return;
      }
    }
    if (currentLocationId >= 125 && this.state.clearedCombatLocations.has(125)) {
      this.endRun('victory', 'Roachak falls. The shadow lifts. The world breathes again.');
      return;
    }
    if (currentLocationId >= 125 && !this.bossResults.has(125)) {
      // Boss fight hasn't happened yet — sampleAndQueueEvents will queue it.
      return;
    }

    if (dayNumber > 100) {
      this.endRun('timeout', 'The hundred days have passed. The darkness cannot be stopped now.');
    }
  }

  // ─────────────────────────────────────────
  // PHASE 8 — Cleanup
  // ─────────────────────────────────────────

  private async cleanup(): Promise<void> {
    this.applyAllDeltas();

    const record = this.buildTurnRecord();

    this.setState({
      dayNumber:   this.state.dayNumber + 1,
      turnHistory: [...this.state.turnHistory, record],
      currentTurn: null,
    });

    // Auto-save
    await saveEngine.saveRun(this.state);

    this.setPhase(TurnPhase.Complete);
    this.onStateChange(this.state);
    this.setPhase(TurnPhase.AwaitingAction);
  }

  private async skipToCleanup(): Promise<void> {
    this.applyAllDeltas();
    this.setState({
      dayNumber:   this.state.dayNumber + 1,
      currentTurn: null,
    });
    await saveEngine.saveRun(this.state);
    this.setPhase(TurnPhase.AwaitingAction);
  }

  // ─────────────────────────────────────────
  // Delta application — atomic at end of turn
  // ─────────────────────────────────────────

  private applyAllDeltas(): void {
    let { resources, morale, reputation, player, companions } = this.state;
    let weatherOverride: WeatherType | undefined;

    for (const d of this.state.currentTurn?.pendingDeltas ?? []) {

      if (d.food      !== undefined) resources = { ...resources, food:  Math.max(0, resources.food  + d.food)  };
      if (d.gold      !== undefined) resources = { ...resources, gold:  Math.max(0, resources.gold  + d.gold)  };
      if (d.health    !== undefined) player    = { ...player, health: clamp(player.health + d.health, 0, player.stats.maxHealth) };
      if (d.morale    !== undefined) morale    = applyMoraleDelta(morale, d.morale);
      if (d.reputation!== undefined) reputation= applyReputationDelta(reputation, d.reputation);
      if (d.xp        !== undefined) player    = applyXP(player, d.xp);
      if (d.weatherOverride)         weatherOverride = d.weatherOverride;

      if (d.statusEffectsAdded) {
        const existing = new Set(player.statusEffects.map(e => e.id));
        const toAdd: StatusEffect[] = d.statusEffectsAdded
          .filter(id => !existing.has(id))
          .map(id => ({ id, durationTurns: 3 }));
        player = { ...player, statusEffects: [...player.statusEffects, ...toAdd] };
      }

      if (d.statusEffectsRemoved) {
        player = {
          ...player,
          statusEffects: player.statusEffects.filter(
            e => !d.statusEffectsRemoved!.includes(e.id),
          ),
        };
      }

      if (d.companionLoyalty) {
        companions = companions.map(c => {
          const delta = d.companionLoyalty![c.id];
          if (delta === undefined) return c;
          return {
            ...c,
            loyalty: {
              ...c.loyalty,
              value: clamp(c.loyalty.value + delta, 0, 100),
            },
          };
        });
      }
    }

    // Tick status effect durations
    player = {
      ...player,
      statusEffects: player.statusEffects
        .map(e => ({ ...e, durationTurns: e.durationTurns - 1 }))
        .filter(e => e.durationTurns > 0),
    };

    this.setState({
      resources,
      morale,
      reputation,
      player,
      companions,
      ...(weatherOverride ? { weather: weatherOverride } : {}),
    });
  }

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────

  private endRun(outcome: GameState['outcome'], narrative: string): void {
    this.applyAllDeltas();
    this.addLog(narrative);
    this.setState({ isComplete: true, outcome, currentTurn: null });
    this.onStateChange(this.state);
    saveEngine.saveRun(this.state); // archive
  }

  private isReputationInCompanionRange(companion: Companion): boolean {
    const preferredReputation = companion.preferredReputation;
    if (!preferredReputation) return true;

    const repValue = this.state.reputation.value;
    if (preferredReputation.min !== undefined && repValue < preferredReputation.min) return false;
    if (preferredReputation.max !== undefined && repValue > preferredReputation.max) return false;
    return true;
  }

  private addDelta(delta: StatDelta): void {
    if (!this.state.currentTurn) return;
    const updated = [...this.state.currentTurn.pendingDeltas, delta];
    this.updateTurn({ pendingDeltas: updated });
    if (delta.narrative) this.addLog(delta.narrative);
  }

  private addLog(text: string): void {
    if (!this.state.currentTurn) return;
    const entry = { timestamp: Date.now(), text };
    this.updateTurn({ log: [...this.state.currentTurn.log, entry] });
  }

  private setPhase(phase: TurnPhase): void {
    if (!this.state.currentTurn) {
      // Outside a turn — notify UI anyway (e.g. AwaitingAction at turn start)
      this.onStateChange(this.state);
      return;
    }
    this.updateTurn({ phase });
  }

  private updateTurn(partial: Partial<TurnState>): void {
    if (!this.state.currentTurn) return;
    this.setState({ currentTurn: { ...this.state.currentTurn, ...partial } });
  }

  private setState(partial: Partial<GameState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  private buildTurnRecord(): TurnRecord {
    const turn   = this.state.currentTurn;
    const deltas = turn?.pendingDeltas ?? [];
    const allNarratives = (turn?.log ?? []).map(e => e.text).join(' ');

    return {
      dayNumber:       this.state.dayNumber,
      locationBefore:  turn?.locationBefore ?? this.state.currentLocationId,
      locationAfter:   this.state.currentLocationId,
      action:          (turn?.action ?? PlayerAction.Camp),
      weather:         this.state.weather,
      eventsTriggered: turn?.triggeredEventIds ?? [],
      eventOutcome:    turn?.eventOutcome,
      deltas,
      levelUpOccurred: turn?.levelUpOccurred ?? false,
      narrativeSummary:allNarratives.slice(0, 300),
    };
  }

  // ─────────────────────────────────────────
  // Narrative builders
  // ─────────────────────────────────────────

  private buildMoveNarrative(
    locations:   number,
    weather:     WeatherType,
    lucky:       boolean,
    forcedMarch: boolean,
  ): string {
    const weatherDesc: Record<WeatherType, string> = {
      [WeatherType.Severe]:  'The storm makes every step a struggle.',
      [WeatherType.Poor]:    'The grey skies press down on the road.',
      [WeatherType.Neutral]: 'The road stretches ahead.',
      [WeatherType.Good]:    'Good weather lifts the party\'s spirits.',
      [WeatherType.Ideal]:   'A rare perfect day for travelling.',
    };

    let text = weatherDesc[weather];

    if (locations === 3) {
      text += lucky
        ? ' A stroke of fortune — you cover more ground than expected.'
        : ' The forced march pays off. Three locations in a day.';
    } else if (locations === 2) {
      text += forcedMarch
        ? ' The hard push gets you to your second waypoint.'
        : ' You make good time.';
    } else if (weather === WeatherType.Severe && forcedMarch) {
      text += ' The storm cancelled your forced march.';
    }

    return text;
  }

  private buildCombatResultNarrative(result: CombatResult): string {
    switch (result.outcome) {
      case 'victory':    return `Victory! You gained ${result.xpGained} XP and ${result.goldGained} gold.`;
      case 'defeat':     return 'You were defeated. The party regroups, battered.';
      case 'fled':       return 'You escaped. Morale takes a small hit from the retreat.';
      case 'negotiated': return 'A peaceful resolution. Your reputation grows.';
    }
  }

  private getCombatHealthDelta(result: CombatResult): number {
    return result.healthDelta ?? -result.healthLost;
  }

  private applyConsumedItems(
    resources: GameState['resources'],
    itemsConsumed?: string[],
  ): GameState['resources'] {
    if (!itemsConsumed || itemsConsumed.length === 0) {
      return resources;
    }

    let nextResources = resources;
    for (const itemId of itemsConsumed) {
      const removeRes = removeItem(nextResources, itemId, 1);
      if (!removeRes.success || !removeRes.inventory) {
        continue;
      }

      nextResources = {
        ...nextResources,
        items: removeRes.inventory.items,
        equippedItems: removeRes.inventory.equippedItems,
        maxSlots: removeRes.inventory.maxSlots,
      };
    }

    return nextResources;
  }
}
