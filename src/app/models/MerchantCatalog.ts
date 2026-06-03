import { ItemCategory } from "./ItemCatalog";

export interface MerchantStockEntry {
  itemId: string;
  stock: number;
  purchaseValue?: number;
}

export interface MerchantDefinition {
  id: string;
  landmarkId: string;
  label: string;
  acceptedCategories?: ItemCategory[];
  stock: MerchantStockEntry[];
}

export interface MerchantCatalogConfig {
  merchants: MerchantDefinition[];
}

export interface MerchantDialogOfferRow {
  itemId: string;
  name: string;
  description: string;
  category: string;
  identityKeywords: string[];
  purchaseValue: number;
  stock: number;
  canBuy: boolean;
  blockedReason?: string;
}

export interface MerchantDialogSellRow {
  itemId: string;
  name: string;
  description: string;
  category: string;
  identityKeywords: string[];
  sellValue: number;
  ownedQuantity: number;
}
