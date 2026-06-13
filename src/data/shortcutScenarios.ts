import scenariosJson from './shortcutScenarios.json';

export interface ShortcutScenario {
  id: string;
  narrative: string;
  moraleDelta?: number;
  foodDelta?: number;
  goldDelta?: number;
  healthDelta?: number;
}

const SCENARIOS: ShortcutScenario[] = scenariosJson as ShortcutScenario[];

export function getShortcutScenario(id: string): ShortcutScenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}

export function getAllShortcutScenarios(): ShortcutScenario[] {
  return SCENARIOS;
}
