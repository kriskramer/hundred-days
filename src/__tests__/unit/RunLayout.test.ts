import { generateRunLayout } from '@engine/RunLayout';
import { LOCATIONS } from '@data/locations';

describe('RunLayout', () => {
  it('produces identical layouts for the same seed', () => {
    const first = generateRunLayout(42);
    const second = generateRunLayout(42);

    expect(second).toEqual(first);
  });

  it('produces different layouts for different seeds', () => {
    const a = generateRunLayout(1);
    const b = generateRunLayout(2);

    const sameLayout =
      JSON.stringify(a.npcSlots) === JSON.stringify(b.npcSlots)
      && JSON.stringify(a.activeShortcuts) === JSON.stringify(b.activeShortcuts);

    expect(sameLayout).toBe(false);
  });

  it('generates slot counts within documented ranges', () => {
    const layout = generateRunLayout(20260610);

    expect(layout.npcSlots.length).toBeGreaterThanOrEqual(5);
    expect(layout.npcSlots.length).toBeLessThanOrEqual(7);
    expect(layout.roamingMerchants.length).toBeGreaterThanOrEqual(3);
    expect(layout.roamingMerchants.length).toBeLessThanOrEqual(4);
    expect(layout.activeShortcuts.length).toBe(3);
    expect(layout.activeDetours.length).toBeGreaterThanOrEqual(2);
    expect(layout.activeDetours.length).toBeLessThanOrEqual(3);
    expect(layout.sagaThreads.length).toBe(2);
    expect(layout.eliteSpawns.length).toBeGreaterThanOrEqual(6);
    expect(layout.eliteSpawns.length).toBeLessThanOrEqual(8);
  });

  it('uses only valid location IDs across all layout fields', () => {
    const layout = generateRunLayout(555);
    const validIds = new Set(LOCATIONS.map(l => l.id));

    for (const slot of layout.npcSlots) {
      expect(validIds.has(slot.locationId)).toBe(true);
    }
    for (const merchant of layout.roamingMerchants) {
      expect(validIds.has(merchant.locationId)).toBe(true);
      expect(merchant.locationId).toBeGreaterThanOrEqual(10);
      expect(merchant.locationId).toBeLessThanOrEqual(120);
    }
    for (const spawn of layout.eliteSpawns) {
      expect(validIds.has(spawn.locationId)).toBe(true);
    }
    for (const shortcut of layout.activeShortcuts) {
      expect(validIds.has(shortcut.from)).toBe(true);
      expect(validIds.has(shortcut.to)).toBe(true);
    }
    for (const detour of layout.activeDetours) {
      expect(validIds.has(detour.forkAt)).toBe(true);
      expect(validIds.has(detour.rejoinAt)).toBe(true);
    }
  });
});
