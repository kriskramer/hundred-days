export const BOSS_EVENT_MAP: Readonly<Record<number, string>> = Object.freeze({
  32:  'boss_orc_warchief',
  65:  'boss_lich_of_vorishy',
  93:  'boss_white_horseman',
  125: 'boss_dread_sovereign',
});

export const BOSS_LOCATION_IDS: readonly number[] = Object.freeze(
  Object.keys(BOSS_EVENT_MAP)
    .map(Number)
    .sort((a, b) => a - b),
);

const BOSS_LOCATION_ID_SET = new Set(BOSS_LOCATION_IDS);

export function isBossLocation(locationId: number): boolean {
  return BOSS_LOCATION_ID_SET.has(locationId);
}
