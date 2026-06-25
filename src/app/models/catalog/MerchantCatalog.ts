import { ItemCategory } from "@models/catalog/ItemCatalog";

export type MerchantTradableKind = "item" | "follower" | "spell";

export interface MerchantStockEntry {
  kind: MerchantTradableKind;
  tradableId: string;
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
  tradableKind: MerchantTradableKind;
  tradableId: string;
  name: string;
  description: string;
  category: string;
  identityKeywords: string[];
  purchaseValue: number;
  mpCost?: number;
  consumableOnCast?: boolean;
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
