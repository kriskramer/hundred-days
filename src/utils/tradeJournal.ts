import { GameState, PlayerAction, TurnRecord } from '@engine/types';

export function getShopEntryNarrative(shopName: string): string {
  return `You enter the ${shopName}.`;
}

export function createTradeJournalRecord(gameState: GameState, shopName: string): TurnRecord {
  return {
    dayNumber: gameState.dayNumber,
    locationBefore: gameState.currentLocationId,
    locationAfter: gameState.currentLocationId,
    action: PlayerAction.Trade,
    weather: gameState.weather,
    eventsTriggered: [],
    deltas: [],
    levelUpOccurred: false,
    narrativeSummary: getShopEntryNarrative(shopName),
  };
}
