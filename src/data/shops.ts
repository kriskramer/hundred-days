import shopsJson from './shops.json';

export interface ShopStockEntry {
  itemId:      string;
  maxQuantity: number;
}

export interface ShopDefinition {
  id:                 string;
  locationId:         number;
  merchantName:       string;
  stock:              ShopStockEntry[];
  goldFindMultiplier: number;
}

const SHOPS: ShopDefinition[] = shopsJson as ShopDefinition[];

export function getShopDef(locationId: number): ShopDefinition | undefined {
  return SHOPS.find(s => s.locationId === locationId);
}

export function getAllShops(): ShopDefinition[] {
  return SHOPS;
}
