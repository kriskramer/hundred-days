import { GameBalance } from '@engine/GameBalance';
import {
  getEncounterProgressMultipliers,
  scaleEncounterProbability,
} from '@engine/EncounterBalance';

describe('EncounterBalance', () => {
  it('boosts NPC chances and lowers combat chances early on the road', () => {
    const early = getEncounterProgressMultipliers(1);

    expect(early.npc).toBeCloseTo(GameBalance.ENCOUNTER_NPC_CHANCE_EARLY);
    expect(early.combat).toBeCloseTo(GameBalance.ENCOUNTER_COMBAT_CHANCE_EARLY);
    expect(early.npc).toBeGreaterThan(1);
    expect(early.combat).toBeLessThan(1);
  });

  it('lowers NPC chances and raises combat chances late on the road', () => {
    const late = getEncounterProgressMultipliers(125);

    expect(late.npc).toBeLessThan(GameBalance.ENCOUNTER_NPC_CHANCE_LATE);
    expect(late.combat).toBeGreaterThan(GameBalance.ENCOUNTER_COMBAT_CHANCE_LATE);
    expect(late.npc).toBeLessThan(1);
    expect(late.combat).toBeGreaterThan(1);
  });

  it('applies an extra late-road penalty/bonus in the final 30 locations', () => {
    const beforeLateRoad = getEncounterProgressMultipliers(95);
    const lateRoadStart = getEncounterProgressMultipliers(96);
    const finalStretch = getEncounterProgressMultipliers(125);

    expect(lateRoadStart.npc).toBeLessThan(beforeLateRoad.npc);
    expect(finalStretch.npc).toBeLessThan(lateRoadStart.npc);
    expect(lateRoadStart.combat).toBeGreaterThan(beforeLateRoad.combat);
    expect(finalStretch.combat).toBeGreaterThan(lateRoadStart.combat);
  });

  it('caps scaled encounter probabilities at 1', () => {
    expect(scaleEncounterProbability(0.95, 125, 'combat')).toBe(1);
  });
});
