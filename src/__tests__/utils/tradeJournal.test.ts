import { PlayerAction, WeatherType } from '@engine/types';
import { makeGameState } from '../__fixtures__/gameState';
import { createTradeJournalRecord, getShopEntryNarrative } from '@utils/tradeJournal';

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
});
