/**
 * Persist the full RNG state instead of deriving a fresh seed per day.
 * A single turn can consume many ordered rolls across events, combat, and
 * level-up choice generation, so only the running state reproduces a run.
 */
export function normalizeRngState(seed: number): number {
  return seed >>> 0;
}

export function nextMulberry32(state: number): { value: number; state: number } {
  const nextState = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

  return {
    value: ((t ^ (t >>> 14)) >>> 0) / 4294967296,
    state: normalizeRngState(nextState),
  };
}
