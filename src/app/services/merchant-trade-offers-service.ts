import { Injectable } from "@angular/core";
import { InventoryItemEntry } from "../models/Inventory";
import { MerchantDefinition, MerchantDialogOfferRow, MerchantDialogSellRow, MerchantStockEntry } from "../models/MerchantCatalog";
import { Player } from "../models/Player";
import { ItemCatalogService } from "./item-catalog-service";
import { MerchantStockConfigService } from "./merchant-stock-config-service";

@Injectable({
  providedIn: "root",
})
export class MerchantTradeOffersService {
  constructor(
    private itemCatalogService: ItemCatalogService,
    private merchantStockConfigService: MerchantStockConfigService,
  ) {}

  public async resolveStockEntries(input: {
    merchant: MerchantDefinition;
    stockConfigUrl?: string;
  }): Promise<MerchantStockEntry[]> {
    const stockConfigUrl = String(input.stockConfigUrl ?? "").trim();
    if (!stockConfigUrl) {
      return input.merchant.stock;
    }

    const stockConfig = await this.merchantStockConfigService.loadConfig(stockConfigUrl);
    if (stockConfig.merchantId && stockConfig.merchantId !== input.merchant.id) {
      throw new Error("Merchant stock config does not match current merchant");
    }

    return stockConfig.stock;
  }

  public buildStockMap(input: {
    stockEntries: MerchantStockEntry[];
    persistedStockByItemId?: Record<string, number>;
  }): Record<string, number> {
    return {
      ...this.merchantStockConfigService.asStockMap(input.stockEntries),
      ...(input.persistedStockByItemId ?? {}),
    };
  }

  public getStockEntry(stockEntries: MerchantStockEntry[], itemId: string): MerchantStockEntry | null {
    return this.merchantStockConfigService.getStockEntry(stockEntries, itemId);
  }

  public buildBuyOffers(input: {
    stockEntries: MerchantStockEntry[];
    stockMap: Record<string, number>;
    playerAlignment?: Player["alignment"];
  }): MerchantDialogOfferRow[] {
    const offers = input.stockEntries
      .map((entry): MerchantDialogOfferRow | null => {
        const item = this.itemCatalogService.getCachedItemById(entry.itemId);
        if (!item) return null;

        const effectiveAlignment: Player["alignment"] = input.playerAlignment ?? "neutral";
        const allowedAlignments = item.constraints?.allowedAlignments;
        const isAlignmentAllowed = !Array.isArray(allowedAlignments)
          || allowedAlignments.length === 0
          || allowedAlignments.includes(effectiveAlignment);

        return {
          itemId: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          identityKeywords: this.buildIdentityKeywords(item),
          purchaseValue: typeof entry.purchaseValue === "number"
            ? Math.max(0, Math.floor(entry.purchaseValue))
            : Math.max(0, Math.floor(item.purchaseValue)),
          stock: Math.max(0, Math.floor(Number(input.stockMap[entry.itemId] ?? 0))),
          canBuy: isAlignmentAllowed,
        };
      });

    return offers.filter((entry): entry is MerchantDialogOfferRow => entry !== null);
  }

  public buildSellOffers(input: {
    merchant: MerchantDefinition;
    inventoryItems: InventoryItemEntry[];
  }): MerchantDialogSellRow[] {
    const ownedQuantityByItemId = input.inventoryItems.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.itemId] = (acc[entry.itemId] ?? 0) + 1;
      return acc;
    }, {});

    return Object.keys(ownedQuantityByItemId)
      .map((itemId) => {
        const item = this.itemCatalogService.getCachedItemById(itemId);
        if (!item) return null;

        return {
          item,
          ownedQuantity: Math.max(0, Math.floor(Number(ownedQuantityByItemId[itemId] ?? 0))),
        };
      })
      .filter((entry) => !!entry)
      .filter((entry) => {
        if (!entry) return false;
        if (!Array.isArray(input.merchant.acceptedCategories) || input.merchant.acceptedCategories.length === 0) {
          return true;
        }

        return input.merchant.acceptedCategories.includes(entry.item.category);
      })
      .map((entry) => ({
        itemId: entry.item.id,
        name: entry.item.name,
        description: entry.item.description,
        category: entry.item.category,
        identityKeywords: this.buildIdentityKeywords(entry.item),
        sellValue: this.itemCatalogService.getSellValue(entry.item),
        ownedQuantity: entry.ownedQuantity,
      }));
  }

  private buildIdentityKeywords(item: {
    occupiesSpace: boolean;
    constraints?: {
      allowedAlignments?: Array<"good" | "neutral" | "evil">;
    };
  }): string[] {
    const keywords: string[] = [];

    if (!item.occupiesSpace) {
      keywords.push("little");
    }

    const allowedAlignments = item.constraints?.allowedAlignments;
    const evilOnly = Array.isArray(allowedAlignments)
      && allowedAlignments.length === 1
      && allowedAlignments[0] === "evil";
    if (evilOnly) {
      keywords.push("evil only");
    }

    return keywords;
  }
}
