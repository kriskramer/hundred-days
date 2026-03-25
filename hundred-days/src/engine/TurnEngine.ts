import {
  GameState,
  GameEvent,
  PlayerAction,
  TurnPhase,
  TurnState,
  StatDelta,
  TurnRecord,
  ResolutionType,
  WeatherType,
  MoraleTier,
  CombatResult,
  LevelUpChoice,
  Companion,
  StatusEffect,
} from './types';

import {
  getMoraleTier,
  getReputationTier,
  getLuckThreshold,
  getFoodCostMultiplier,
  applyMoraleDelta,
  applyReputationDelta,
  applyXP,
  applyLevelUpChoice,
  getRandomLevelUpChoices,
  isDreadActive,
  calculateCombatPower,
  BOSS_POWER_THRESHOLD,
  XP_THRESHOLDS,
  clamp,
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
} from './ItemSystem';

import { COMPANION_REQUIREMENTS } from '@data/companions';
import { getLocation } from '@data/locations';

// ─────────────────────────────────────────
// Action param types
// ─────────────────────────────────────────

export type ActionParams =
  | { action: PlayerAction.Move;  forcedMarch: boolean }
  | { action: PlayerAction.Hunt;  method: 'forage' | 'hunt' }
  | { action: PlayerAction.Trade; purchases: { itemId: string; cost: number }[] }
  | { action: PlayerAction.Rest;  atInn: boolean }
  | { action: PlayerAction.Rally; targetCompanionId?: string }
  | { action: PlayerAction.Camp }

// ─────────────────────────────────────────
// TurnEngine
// ─────────────────────────────────────────

export class TurnEngine {
  private state:    GameState;
  private onStateChange:  (state: GameState) => void;
  private onAwaitInput:   (event: GameEvent)  => void;
  private onLevelUp:      (choices: LevelUpChoice[]) => void;
  private bossFightResult: CombatResult | null = null;

  constructor(
    initialState:   GameState,
    onStateChange:  (state: GameState) => void,
    onAwaitInput:   (event: GameEvent)  => void,
    onLevelUp:      (choices: LevelUpChoice[]) => void,
  ) {
    this.state          = initialState;
    this.onStateChange  = onStateChange;
    this.onAwaitInput   = onAwaitInput;
    this.onLevelUp      = onLevelUp;
  }

  // ─────────────────────────────────────────
  // PUBLIC API — called by UI
  // ─────────────────────────────────────────

  /** Submit the player's chosen action to start a turn. */
  async submitAction(params: ActionParams): Promise<void> {
    if (this.state.currentTurn !== null && this.state.currentTurn.phase !== TurnPhase.AwaitingAction) return;
    await this.runTurn(params);
  }

  /** Called after an interactive event (combat / dialogue) resolves. */
  async resolveInteractiveEvent(result: CombatResult): Promise<void> {
    if (this.state.currentTurn?.phase !== TurnPhase.AwaitingPlayer) return;
    // Record boss fight result so checkWinLoss can use it
    if (this.state.currentTurn.activeInteractiveEvent?.id === 'boss_dread_sovereign') {
      this.bossFightResult = result;
    }
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

  /** Add a companion to the party (called when dialogue recruits one). */
  addCompanion(companion: Companion): void {
    if (this.state.companions.some(c => c.id === companion.id)) return;
    this.setState({ companions: [...this.state.companions, companion] });
  }

  /**
   * Resolve combat that was initiated directly from a location (not via the
   * event system).  Applies the result, marks the location cleared, and saves.
   */
  async resolveLocationCombat(locationId: number, result: CombatResult): Promise<void> {
    const { player, resources } = this.state;
    const newPlayer = {
      ...player,
      health: clamp(player.health - result.healthLost, 0, player.stats.maxHealth),
    };
    const applyXPResult = applyXP(newPlayer, result.xpGained);
    const newResources  = {
      ...resources,
      gold: Math.max(0, resources.gold + result.goldGained),
      food: Math.max(0, resources.food + result.foodGained),
    };
    const newCleared = new Set(this.state.clearedCombatLocations);
    newCleared.add(locationId);

    this.setState({
      player:                 applyXPResult,
      resources:              newResources,
      clearedCombatLocations: newCleared,
    });

    await saveEngine.saveRun(this.state);
  }

  // ─────────────────────────────────────────
  // MAIN LOOP
  // ─────────────────────────────────────────

  private async runTurn(params: ActionParams): Promise<void> {
    this.initTurn();
    if (!this.validate()) return;

    this.setPhase(TurnPhase.ResolvingAction);
    this.resolveAction(params);

    this.setPhase(TurnPhase.SamplingEvents);
    this.sampleAndQueueEvents();

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

  private initTurn(): void {
    const turn: TurnState = {
      phase:                  TurnPhase.AwaitingAction,
      action:                 null,
      eventsQueue:            [],
      activeInteractiveEvent: null,
      pendingDeltas:          [],
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
    if (morale.tier === MoraleTier.Broken && Math.random() < 0.05) {
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
      case PlayerAction.Move:  this.resolveMove(params.forcedMarch); break;
      case PlayerAction.Hunt:  this.resolveHunt(params.method);      break;
      case PlayerAction.Rest:  this.resolveRest(params.atInn);       break;
      case PlayerAction.Rally: this.resolveRally(params.targetCompanionId); break;
      case PlayerAction.Camp:  this.resolveCamp();                   break;
      case PlayerAction.Trade: break; // Trade resolves in the shop UI, not the engine
    }
  }

  private resolveMove(forcedMarch: boolean): void {
    const { morale, weather, resources, companions } = this.state;
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
    const luckRoll      = Math.random();
    let luckyThird      = false;

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

    const totalFood = (baseFoodCost + companionFoodPerTurn)
      * companionFoodModifier
      * moraleFoodMult
      * itemFoodMult;

    const newLoc    = Math.min(this.state.currentLocationId + locations, 125);

    this.addDelta({
      source:    'move',
      food:      -totalFood,
      morale:    forcedMarch && locations > 1 ? -1 : undefined,
      narrative: this.buildMoveNarrative(locations, effectiveWeather, luckyThird, forcedMarch),
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
        ? 1 + Math.floor(Math.random() * 3)   // 1–3 base
        : 2 + Math.floor(Math.random() * 4))  // 2–5 base
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
    // At location 125, force the boss fight instead of normal events
    if (this.state.currentLocationId >= 125 && !this.bossFightResult) {
      const bossEvent = EVENT_DEFINITIONS.find(e => e.id === 'boss_dread_sovereign');
      if (bossEvent) {
        this.updateTurn({ eventsQueue: [bossEvent] });
        return;
      }
    }
    const events = sampleEventsForTurn(this.state);
    this.updateTurn({ eventsQueue: events });
  }

  private async processEventQueue(): Promise<void> {
    const queue = [...(this.state.currentTurn?.eventsQueue ?? [])];

    for (let i = 0; i < queue.length; i++) {
      const event = queue[i];

      // Mark as fired
      const newFired = new Set(this.state.firedEventIds);
      newFired.add(event.id);
      this.setState({ firedEventIds: newFired });

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
      health:    -result.healthLost,
      morale:    result.moraleDelta,
      reputation:result.reputationDelta,
      statusEffectsAdded: result.injuriesGained,
      narrative: this.buildCombatResultNarrative(result),
    });
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

    const turns      = this.state.starvationTurns + 1;
    const healthLost = Math.min(10 + (turns - 1) * 5, 40);
    this.setState({ starvationTurns: turns });

    this.addDelta({
      source:    'starvation',
      health:    -healthLost,
      morale:    -8,
      narrative: turns === 1
        ? 'There is nothing left to eat. The party suffers.'
        : `Day ${turns} without food. The party is wasting away (−${healthLost} HP).`,
    });
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
    const choices = getRandomLevelUpChoices(3);
    this.setPhase(TurnPhase.AwaitingLevelUp);
    this.onLevelUp(choices);
  }

  private applyLevelUpChoice(choiceId: string): void {
    const { LEVEL_UP_CHOICES } = require('./GameState');
    const choice = (LEVEL_UP_CHOICES as LevelUpChoice[]).find(c => c.id === choiceId);
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

    if (currentLocationId >= 125) {
      if (!this.bossFightResult) {
        // Boss fight hasn't happened yet — sampleAndQueueEvents will queue it
        // on the next turn. Nothing to do here.
        return;
      }
      if (this.bossFightResult.outcome === 'victory') {
        this.endRun('victory', 'The Dread Sovereign falls. The shadow lifts. The world breathes again.');
      } else {
        this.endRun('defeat', 'The Dread Sovereign was too powerful. The world falls into shadow.');
      }
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
    const req      = COMPANION_REQUIREMENTS[companion.id];
    if (!req) return true;
    const repValue = this.state.reputation.value;
    if (req.minReputation !== undefined && repValue < req.minReputation) return false;
    if (req.maxReputation !== undefined && repValue > req.maxReputation) return false;
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
      locationBefore:  this.state.currentLocationId,
      locationAfter:   this.state.currentLocationId,
      action:          (turn?.action ?? PlayerAction.Camp),
      weather:         this.state.weather,
      eventsTriggered: (turn?.eventsQueue ?? []).map(e => e.id),
      deltas,
      levelUpOccurred: false,
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
}
