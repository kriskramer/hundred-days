import { BOSS_EVENT_MAP, BOSS_LOCATION_IDS, isBossLocation } from '@engine/bosses';

describe('boss checkpoints', () => {
  it('exposes only the canonical boss locations used by the engine', () => {
    expect(BOSS_LOCATION_IDS).toEqual([32, 65, 93, 125]);
    expect(BOSS_EVENT_MAP[32]).toBe('boss_orc_warchief');
    expect(BOSS_EVENT_MAP[125]).toBe('boss_dread_sovereign');
  });

  it('does not treat content-only boss flags as real boss encounters', () => {
    expect(isBossLocation(15)).toBe(false);
    expect(isBossLocation(32)).toBe(true);
  });
});
