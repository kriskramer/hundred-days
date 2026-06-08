import { GameState, PlayerAction, TurnRecord } from '@engine/types';

export function getShopEntryNarrative(shopName: string): string {
  return `You enter the ${shopName}.`;
}

const MERCHANT_GREETINGS = [
  'nods as you enter, hands folded on the counter',
  "looks up from their ledger with a merchant's eye",
  'greets you with a practiced smile',
  'sizes you up with a glance and waits',
  'is arranging stock but turns to face you',
];

export function getMerchantEntryNarrative(shopName: string): string {
  const greeting = MERCHANT_GREETINGS[Math.floor(Math.random() * MERCHANT_GREETINGS.length)];
  return `You enter ${shopName}. The merchant ${greeting}. "What can I do for you?"`;
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
