import { PlayerAction, WeatherType } from '@engine/types';
import { makeGameState } from '../__fixtures__/gameState';
import {
  appendTradeJournalLine,
  createTradeJournalRecord,
  getMerchantBuyReaction,
  getMerchantEntryNarrative,
  getMerchantSellReaction,
  getShopEntryNarrative,
  getTradePurchaseNarrative,
} from '@utils/tradeJournal';

describe('tradeJournal', () => {
  it('builds a trade journal record for the current location and day', () => {
    const gameState = makeGameState({
      dayNumber: 12,
      currentLocationId: 27,
      weather: WeatherType.Poor,
    });

    expect(createTradeJournalRecord(gameState, 'The Sdrakam Armory')).toEqual({
      dayNumber: 12,
      locationBefore: 27,
      locationAfter: 27,
      action: PlayerAction.Trade,
      weather: WeatherType.Poor,
      eventsTriggered: [],
      deltas: [],
      levelUpOccurred: false,
      narrativeSummary: 'You enter the The Sdrakam Armory.',
    });
  });

  it('formats the shop entry narrative', () => {
    expect(getShopEntryNarrative('Kanlin\'s Supplies')).toBe('You enter the Kanlin\'s Supplies.');
  });

  it('formats purchase narrative and includes auto-equip when applicable', () => {
    expect(getTradePurchaseNarrative('Traveler\'s Blade', 25)).toBe(
      'You purchased Traveler\'s Blade for 25 gold.'
    );
    expect(getTradePurchaseNarrative('Traveler\'s Blade', 25, true)).toBe(
      'You purchased Traveler\'s Blade for 25 gold and equipped it.'
    );
  });

  it('appends purchase lines to the existing trade journal entry', () => {
    const record = createTradeJournalRecord(
      makeGameState({ currentLocationId: 27 }),
      'The Sdrakam Armory'
    );

    expect(
      appendTradeJournalLine(record, 'You purchased Traveler\'s Blade for 25 gold.')
    ).toMatchObject({
      narrativeSummary: 'You enter the The Sdrakam Armory.\nYou purchased Traveler\'s Blade for 25 gold.',
    });
  });

  it('getMerchantEntryNarrative returns a string containing the shop name', () => {
    const result = getMerchantEntryNarrative("Kanlin's Supplies");
    expect(typeof result).toBe('string');
    expect(result).toContain("Kanlin's Supplies");
  });

  it('getMerchantBuyReaction returns a non-empty merchant quote', () => {
    const result = getMerchantBuyReaction('Iron Sword');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('The merchant:');
  });

  it('getMerchantSellReaction returns a non-empty merchant quote', () => {
    const result = getMerchantSellReaction(15);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('The merchant:');
  });
});
