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
import { FollowerCatalogService } from "./follower-catalog-service";
import { TranslationService } from "./translation-service";

@Injectable({
  providedIn: "root",
})
export class MerchantTradeOffersService {
  constructor(
    private itemCatalogService: ItemCatalogService,
    private merchantStockConfigService: MerchantStockConfigService,
    private followerCatalogService: FollowerCatalogService,
    private translationService: TranslationService,
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
    playerFollowers?: Player["followers"];
  }): MerchantDialogOfferRow[] {
    const ownedActiveFollowerIds = this.getActiveFollowerIds(input.playerFollowers);
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
            name: this.itemCatalogService.getLocalizedName(item),
            description: this.itemCatalogService.getLocalizedDescription(item),
            category: item.category,
            identityKeywords: this.buildIdentityKeywords(item),
            purchaseValue: typeof entry.purchaseValue === "number"
              ? Math.max(0, Math.floor(entry.purchaseValue))
              : Math.max(0, Math.floor(item.purchaseValue)),
            stock: Math.max(0, Math.floor(Number(input.stockMap[stockKey] ?? 0))),
            canBuy: isAlignmentAllowed,
          };
        }

        const follower = this.followerCatalogService.getCachedFollowerById(entry.tradableId);
        if (!follower) return null;

        return {
          tradableKind: "follower",
          tradableId: follower.id,
          name: this.followerCatalogService.getLocalizedName(follower),
          description: this.followerCatalogService.getLocalizedDescription(follower),
          category: follower.category,
          identityKeywords: this.buildFollowerIdentityKeywords(follower),
          purchaseValue: typeof entry.purchaseValue === "number"
            ? Math.max(0, Math.floor(entry.purchaseValue))
            : 0,
          stock: Math.max(0, Math.floor(Number(input.stockMap[stockKey] ?? 0))),
          canBuy: !ownedActiveFollowerIds.has(follower.id),
          blockedReason: ownedActiveFollowerIds.has(follower.id)
            ? this.translationService.tOrFallback("dialogs.merchant.errors.alreadyInParty", "Already in your party")
            : undefined,
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
        name: this.itemCatalogService.getLocalizedName(entry.item),
        description: this.itemCatalogService.getLocalizedDescription(entry.item),
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
      keywords.push(this.translationService.tOrFallback("map.labels.little", "little"));
    }

    const allowedAlignments = item.constraints?.allowedAlignments;
    const evilOnly = Array.isArray(allowedAlignments)
      && allowedAlignments.length === 1
      && allowedAlignments[0] === "evil";
    if (evilOnly) {
      keywords.push(this.translationService.tOrFallback("dialogs.merchant.keywords.evilOnly", "evil only"));
    }

    return keywords;
  }

  private buildFollowerIdentityKeywords(follower: {
    maxHp: number;
    itemCapacityBonus?: number;
  }): string[] {
    const keywords: string[] = [];
    keywords.push(this.translationService.tOrFallback(
      "dialogs.merchant.keywords.hpValue",
      "HP {value}",
      { value: Math.max(1, Math.floor(Number(follower.maxHp ?? 1))) },
    ));

    const itemCapacityBonus = Number(follower.itemCapacityBonus ?? 0);
    if (Number.isFinite(itemCapacityBonus) && Math.floor(itemCapacityBonus) > 0) {
      keywords.push(this.translationService.tOrFallback(
        "dialogs.merchant.keywords.itemSlotsPlus",
        "+{value} item slots",
        { value: Math.floor(itemCapacityBonus) },
      ));
    }

    return keywords;
  }

  private buildStockKey(kind: MerchantTradableKind, tradableId: string): string {
    return `${kind}:${tradableId}`;
  }

  private getActiveFollowerIds(rawFollowers: unknown): Set<string> {
    if (!Array.isArray(rawFollowers)) {
      return new Set<string>();
    }

    return new Set(
      rawFollowers
        .filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const followerId = (entry as { followerId?: unknown }).followerId;
          if (typeof followerId !== "string" || !followerId.trim()) return false;
          const state = (entry as { state?: unknown }).state;
          if (state === "discarded") return false;
          const hpCurrent = Number((entry as { hpCurrent?: unknown }).hpCurrent);
          return Number.isFinite(hpCurrent) && Math.floor(hpCurrent) > 0;
        })
        .map((entry) => String((entry as { followerId?: unknown }).followerId).trim()),
    );
  }
}
