import { GameState, PlayerAction, TurnRecord } from '@engine/types';

export function getShopEntryNarrative(shopName: string): string {
  return `You enter ${shopName}.`;
}

export function getTradePurchaseNarrative(
  itemName: string,
  goldSpent: number,
  autoEquipped = false,
): string {
  return autoEquipped
    ? `You purchased ${itemName} for ${goldSpent} gold and equipped it.`
    : `You purchased ${itemName} for ${goldSpent} gold.`;
}

export function appendTradeJournalLine(record: TurnRecord, line: string): TurnRecord {
  return {
    ...record,
    narrativeSummary: record.narrativeSummary
      ? `${record.narrativeSummary}\n${line}`
      : line,
  };
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

const MERCHANT_BUY_REACTIONS = [
  'The merchant: "A fine choice."',
  'The merchant: "You won\'t regret it."',
  'The merchant: "Excellent taste."',
  'The merchant: "A wise investment."',
  'The merchant: "My best stock."',
  'The merchant: "Good eye, that one."',
];

const MERCHANT_SELL_REACTIONS = [
  'The merchant: "Fair enough."',
  'The merchant: "I can use this."',
  'The merchant: "Good doing business with you."',
  'The merchant: "That will do nicely."',
  'The merchant: "Always happy to buy."',
];

export function getMerchantBuyReaction(_itemName: string): string {
  return MERCHANT_BUY_REACTIONS[Math.floor(Math.random() * MERCHANT_BUY_REACTIONS.length)];
}

export function getMerchantSellReaction(_goldGained: number): string {
  return MERCHANT_SELL_REACTIONS[Math.floor(Math.random() * MERCHANT_SELL_REACTIONS.length)];
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
