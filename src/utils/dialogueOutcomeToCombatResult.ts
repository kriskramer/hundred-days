import type { CombatResult } from '@engine/types';
import type { DialogueSessionOutcome } from '@engine/DialogueEngine';

export function dialogueOutcomeToCombatResult(outcome: DialogueSessionOutcome): CombatResult {
  return {
    outcome:           'negotiated',
    roundsFought:      0,
    xpGained:          outcome.xpGained,
    goldGained:        outcome.resourceDeltas.gold,
    foodGained:        outcome.resourceDeltas.food,
    healthLost:        -(outcome.resourceDeltas.health ?? 0),
    healthDelta:       outcome.resourceDeltas.health ?? 0,
    moraleDelta:       outcome.moraleDelta,
    reputationDelta:   outcome.reputationDelta,
    injuriesGained:    [],
    companionInjuries: {},
    daysSpent:         outcome.resourceDeltas.daysSpent ?? 0,
  };
}
