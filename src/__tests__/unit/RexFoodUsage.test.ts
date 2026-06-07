import { TurnEngine } from '@engine/TurnEngine';
import { PlayerAction, GameState } from '@engine/types';
import { makeGameState } from '../__fixtures__/gameState';
import { getCompanionOrThrow } from '@data/companions';
import { calculateFoodCostForMove, applyCompanionFoodCosts } from '@engine/helpers/TravelCalculator';

// Mock SaveEngine to prevent errors/warnings during test runs
jest.mock('@engine/SaveEngine', () => ({
  saveEngine: { saveRun: jest.fn(() => Promise.resolve({ success: true })) },
}));

describe('Rex the Dog — Food Usage Verification', () => {
  const rex = getCompanionOrThrow('rex_the_dog');

  describe('TravelCalculator helper calculations', () => {
    it('verifies calculateFoodCostForMove includes companion food modifiers', () => {
      const stateNoCompanions = makeGameState({ companions: [] });
      const stateWithRex = makeGameState({ companions: [rex] });

      const costNoCompanions = calculateFoodCostForMove(stateNoCompanions, 1, false);
      const costWithRex = calculateFoodCostForMove(stateWithRex, 1, false);

      // Rex has no foodCostModifier (he has foragingBonus, luckModifier, moralePerTurn),
      // so companionFoodModifier defaults to 1.0. Therefore, the player's own food cost
      // for movement stays the same.
      expect(costWithRex).toBe(costNoCompanions);
    });

    it('verifies applyCompanionFoodCosts increases companion food cost when Rex is present', () => {
      const stateNoCompanions = makeGameState({ companions: [] });
      const stateWithRex = makeGameState({ companions: [rex] });

      const deltaNoCompanions = applyCompanionFoodCosts(stateNoCompanions, 1);
      const deltaWithRex = applyCompanionFoodCosts(stateWithRex, 1);

      // Rex's foodCostPerTurn is 0.5.
      expect(deltaNoCompanions.food).toBeCloseTo(0);
      expect(deltaWithRex.food).toBeCloseTo(-0.5);
    });
  });

  describe('TurnEngine Actions integration', () => {
    const makeEngine = (stateOverrides: Partial<GameState> = {}) => {
      const baseState = makeGameState();
      const state = {
        ...baseState,
        resources: {
          ...baseState.resources,
          food: 50,
          gold: 100,
        },
        ...stateOverrides,
      };
      const onStateChange = jest.fn();
      const onAwaitInput = jest.fn();
      const onLevelUp = jest.fn();
      const engine = new TurnEngine(
        state,
        onStateChange,
        onAwaitInput,
        onLevelUp,
        () => 0.5 // deterministic RNG
      );
      return { engine };
    };

    it('verifies Move action consumes more food with Rex', async () => {
      const { engine: engineNoComp } = makeEngine({ companions: [] });
      const { engine: engineWithRex } = makeEngine({ companions: [rex] });

      await engineNoComp.submitAction({ action: PlayerAction.Move, forcedMarch: false });
      await engineWithRex.submitAction({ action: PlayerAction.Move, forcedMarch: false });

      const foodNoComp = engineNoComp.getState().resources.food;
      const foodWithRex = engineWithRex.getState().resources.food;

      // Without Rex: player moves, costs player base cost.
      // With Rex: costs player base cost + 0.5 companion food cost.
      const diff = foodNoComp - foodWithRex;
      expect(diff).toBeCloseTo(0.5);
      expect(foodWithRex).toBeLessThan(foodNoComp);
    });

    it('verifies Camp action consumes more food with Rex', async () => {
      const { engine: engineNoComp } = makeEngine({ companions: [] });
      const { engine: engineWithRex } = makeEngine({ companions: [rex] });

      await engineNoComp.submitAction({ action: PlayerAction.Camp });
      await engineWithRex.submitAction({ action: PlayerAction.Camp });

      const foodNoComp = engineNoComp.getState().resources.food;
      const foodWithRex = engineWithRex.getState().resources.food;

      // Camp cost: 1.0 + companionFoodCost
      // Without Rex: 1.0
      // With Rex: 1.5
      const diff = foodNoComp - foodWithRex;
      expect(diff).toBeCloseTo(0.5);
      expect(foodWithRex).toBeLessThan(foodNoComp);
    });

    it('verifies Rally action consumes more food with Rex', async () => {
      const { engine: engineNoComp } = makeEngine({ companions: [] });
      const { engine: engineWithRex } = makeEngine({ companions: [rex] });

      await engineNoComp.submitAction({ action: PlayerAction.Rally, targetCompanionId: undefined });
      await engineWithRex.submitAction({ action: PlayerAction.Rally, targetCompanionId: rex.id });

      const foodNoComp = engineNoComp.getState().resources.food;
      const foodWithRex = engineWithRex.getState().resources.food;

      // Rally cost: 1.0 + companionFoodCost
      // Without Rex: 1.0
      // With Rex: 1.5
      const diff = foodNoComp - foodWithRex;
      expect(diff).toBeCloseTo(0.5);
      expect(foodWithRex).toBeLessThan(foodNoComp);
    });

    it('verifies Hunt action increases day cost but provides foraging bonus with Rex', async () => {
      // Hunt action consumes food (dayCost = 0.5 + companionFoodCost)
      // but generates food based on forage yields and foraging bonus (+1 for Rex).
      const { engine: engineNoComp } = makeEngine({ companions: [] });
      const { engine: engineWithRex } = makeEngine({ companions: [rex] });

      await engineNoComp.submitAction({ action: PlayerAction.Hunt, method: 'forage' });
      await engineWithRex.submitAction({ action: PlayerAction.Hunt, method: 'forage' });

      const foodNoComp = engineNoComp.getState().resources.food;
      const foodWithRex = engineWithRex.getState().resources.food;

      // Let's compute the mathematical expectation:
      // Without Rex:
      //   - dayCost = 0.5 + 0 = 0.5
      //   - foodGained = base forage (at location 1, yields etc) + 0 foragingBonus
      // With Rex:
      //   - dayCost = 0.5 + 0.5 = 1.0 (Food usage increased by 0.5)
      //   - foodGained = base forage + 1.0 (foragingBonus)
      //
      // Thus, net food difference: (foodGainedWithRex - 1.0) - (foodGainedNoComp - 0.5)
      // = (foodGainedNoComp + 1.0 - 1.0) - (foodGainedNoComp - 0.5) = 0.5.
      // So food is actually higher (more net gain) with Rex, but the daily food usage component
      // of that action (the cost subtracted) is still higher by 0.5.
      // Let's verify the net food value is 0.5 higher.
      expect(foodWithRex - foodNoComp).toBeCloseTo(0.5);
    });
  });
});
