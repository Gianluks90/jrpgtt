import { Injectable } from "@angular/core";
import { InventoryItemEntry } from "../models/Inventory";
import {
  MerchantDefinition,
  MerchantDialogOfferRow,
  MerchantDialogSellRow,
  MerchantStockEntry,
  MerchantTradableKind,
} from "../models/MerchantCatalog";
import { Player } from "../models/Player";
import { ItemCatalogService } from "./item-catalog-service";
import { MerchantStockConfigService } from "./merchant-stock-config-service";
import { AllyCatalogService } from "./ally-catalog-service";

@Injectable({
  providedIn: "root",
})
export class MerchantTradeOffersService {
  constructor(
    private itemCatalogService: ItemCatalogService,
    private merchantStockConfigService: MerchantStockConfigService,
    private allyCatalogService: AllyCatalogService,
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
    const defaultStockMap = this.merchantStockConfigService.asStockMap(input.stockEntries);
    const persisted = input.persistedStockByItemId ?? {};

    const merged: Record<string, number> = {
      ...defaultStockMap,
      ...persisted,
    };

    // Backward compatibility: legacy persisted stock used plain itemId keys.
    input.stockEntries.forEach((entry) => {
      if (entry.kind !== "item") {
        return;
      }

      const canonicalKey = this.buildStockKey(entry.kind, entry.tradableId);
      const canonicalPersistedValue = persisted[canonicalKey];
      if (typeof canonicalPersistedValue === "number" && Number.isFinite(canonicalPersistedValue)) {
        merged[canonicalKey] = Math.max(0, Math.floor(canonicalPersistedValue));
        return;
      }

      const legacyValue = persisted[entry.tradableId];
      if (typeof legacyValue !== "number" || !Number.isFinite(legacyValue)) {
        return;
      }

      merged[canonicalKey] = Math.max(0, Math.floor(legacyValue));
    });

    return merged;
  }

  public getStockEntry(stockEntries: MerchantStockEntry[], kind: MerchantTradableKind, tradableId: string): MerchantStockEntry | null {
    return this.merchantStockConfigService.getStockEntry(stockEntries, kind, tradableId);
  }

  public buildBuyOffers(input: {
    stockEntries: MerchantStockEntry[];
    stockMap: Record<string, number>;
    playerAlignment?: Player["alignment"];
    playerAllies?: Player["allies"];
  }): MerchantDialogOfferRow[] {
    const ownedActiveAllyIds = this.getActiveAllyIds(input.playerAllies);
    const offers = input.stockEntries
      .map((entry): MerchantDialogOfferRow | null => {
        const stockKey = this.buildStockKey(entry.kind, entry.tradableId);

        if (entry.kind === "item") {
          const item = this.itemCatalogService.getCachedItemById(entry.tradableId);
          if (!item) return null;

          const effectiveAlignment: Player["alignment"] = input.playerAlignment ?? "neutral";
          const allowedAlignments = item.constraints?.allowedAlignments;
          const isAlignmentAllowed = !Array.isArray(allowedAlignments)
            || allowedAlignments.length === 0
            || allowedAlignments.includes(effectiveAlignment);

          return {
            tradableKind: "item",
            tradableId: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            identityKeywords: this.buildIdentityKeywords(item),
            purchaseValue: typeof entry.purchaseValue === "number"
              ? Math.max(0, Math.floor(entry.purchaseValue))
              : Math.max(0, Math.floor(item.purchaseValue)),
            stock: Math.max(0, Math.floor(Number(input.stockMap[stockKey] ?? 0))),
            canBuy: isAlignmentAllowed,
          };
        }

        const ally = this.allyCatalogService.getCachedAllyById(entry.tradableId);
        if (!ally) return null;

        return {
          tradableKind: "ally",
          tradableId: ally.id,
          name: ally.name,
          description: ally.description,
          category: ally.category,
          identityKeywords: this.buildAllyIdentityKeywords(ally),
          purchaseValue: typeof entry.purchaseValue === "number"
            ? Math.max(0, Math.floor(entry.purchaseValue))
            : 0,
          stock: Math.max(0, Math.floor(Number(input.stockMap[stockKey] ?? 0))),
          canBuy: !ownedActiveAllyIds.has(ally.id),
          blockedReason: ownedActiveAllyIds.has(ally.id) ? "Already in your party" : undefined,
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

  private buildAllyIdentityKeywords(ally: {
    maxHp: number;
    itemCapacityBonus?: number;
  }): string[] {
    const keywords: string[] = [];
    keywords.push(`hp ${Math.max(1, Math.floor(Number(ally.maxHp ?? 1)))}`);

    const itemCapacityBonus = Number(ally.itemCapacityBonus ?? 0);
    if (Number.isFinite(itemCapacityBonus) && Math.floor(itemCapacityBonus) > 0) {
      keywords.push(`+${Math.floor(itemCapacityBonus)} item slots`);
    }

    return keywords;
  }

  private buildStockKey(kind: MerchantTradableKind, tradableId: string): string {
    return `${kind}:${tradableId}`;
  }

  private getActiveAllyIds(rawAllies: unknown): Set<string> {
    if (!Array.isArray(rawAllies)) {
      return new Set<string>();
    }

    return new Set(
      rawAllies
        .filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const allyId = (entry as { allyId?: unknown }).allyId;
          if (typeof allyId !== "string" || !allyId.trim()) return false;
          const state = (entry as { state?: unknown }).state;
          if (state === "discarded") return false;
          const hpCurrent = Number((entry as { hpCurrent?: unknown }).hpCurrent);
          return Number.isFinite(hpCurrent) && Math.floor(hpCurrent) > 0;
        })
        .map((entry) => String((entry as { allyId?: unknown }).allyId).trim()),
    );
  }
}
