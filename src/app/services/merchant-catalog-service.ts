import { Injectable } from "@angular/core";
import {
  MerchantCatalogConfig,
  MerchantDefinition,
  MerchantStockEntry,
  MerchantTradableKind,
} from "../models/MerchantCatalog";

@Injectable({
  providedIn: "root",
})
export class MerchantCatalogService {
  private readonly configUrl = "/configs/merchants.config.json";
  private configCache: MerchantCatalogConfig | null = null;
  private loadingPromise: Promise<MerchantCatalogConfig> | null = null;

  public async loadConfig(): Promise<MerchantCatalogConfig> {
    if (this.configCache) return this.configCache;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load merchants configuration");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      return parsed;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public async getMerchantByLandmarkId(landmarkId: string): Promise<MerchantDefinition | null> {
    const config = await this.loadConfig();
    return config.merchants.find((merchant) => merchant.landmarkId === landmarkId) ?? null;
  }

  public getCachedMerchantById(merchantId: string): MerchantDefinition | null {
    if (!this.configCache) return null;
    return this.configCache.merchants.find((merchant) => merchant.id === merchantId) ?? null;
  }

  public asDefaultStockMap(merchant: MerchantDefinition): Record<string, number> {
    return merchant.stock.reduce<Record<string, number>>((acc, entry) => {
      acc[this.buildStockKey(entry.kind, entry.tradableId)] = Math.max(0, Math.floor(entry.stock));
      return acc;
    }, {});
  }

  public getStockEntry(merchant: MerchantDefinition, kind: MerchantTradableKind, tradableId: string): MerchantStockEntry | null {
    return merchant.stock.find((entry) => entry.kind === kind && entry.tradableId === tradableId) ?? null;
  }

  private parseConfig(raw: unknown): MerchantCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid merchants configuration: root object is missing");
    }

    const typed = raw as { merchants?: unknown };
    if (!Array.isArray(typed.merchants)) {
      throw new Error("Invalid merchants configuration: merchants array is missing");
    }

    const ids = new Set<string>();
    const landmarkIds = new Set<string>();
    const merchants = typed.merchants.map((entry, index) => this.parseMerchant(entry, index));

    merchants.forEach((merchant) => {
      if (ids.has(merchant.id)) {
        throw new Error(`Invalid merchants configuration: duplicate merchant id '${merchant.id}'`);
      }
      ids.add(merchant.id);

      if (landmarkIds.has(merchant.landmarkId)) {
        throw new Error(`Invalid merchants configuration: duplicate landmark merchant '${merchant.landmarkId}'`);
      }
      landmarkIds.add(merchant.landmarkId);
    });

    return { merchants };
  }

  private parseMerchant(raw: unknown, index: number): MerchantDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid merchants configuration: merchant at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      landmarkId?: unknown;
      label?: unknown;
      acceptedCategories?: unknown;
      stock?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid merchants configuration: merchant at index ${index} has invalid id`);
    }

    const merchantId = typed.id;

    if (typeof typed.landmarkId !== "string" || !typed.landmarkId.trim()) {
      throw new Error(`Invalid merchants configuration: merchant '${typed.id}' has invalid landmarkId`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid merchants configuration: merchant '${typed.id}' has invalid label`);
    }

    if (typeof typed.acceptedCategories !== "undefined") {
      if (!Array.isArray(typed.acceptedCategories) || typed.acceptedCategories.some((entry) => typeof entry !== "string" || !entry.trim())) {
        throw new Error(`Invalid merchants configuration: merchant '${typed.id}' has invalid acceptedCategories`);
      }
    }

    if (!Array.isArray(typed.stock)) {
      throw new Error(`Invalid merchants configuration: merchant '${typed.id}' has invalid stock`);
    }

    const stock = typed.stock.map((entry, stockIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid merchants configuration: merchant '${typed.id}' stock at index ${stockIndex} is invalid`);
      }

      const typedEntry = entry as {
        kind?: unknown;
        tradableId?: unknown;
        itemId?: unknown;
        stock?: unknown;
        purchaseValue?: unknown;
      };

      const resolvedKind = this.parseKind(typedEntry.kind, typedEntry.itemId, merchantId, stockIndex);
      const resolvedTradableId = this.parseTradableId(typedEntry.tradableId, typedEntry.itemId, merchantId, stockIndex);

      const stockValue = Number(typedEntry.stock);
      if (!Number.isFinite(stockValue) || stockValue < 0 || Math.floor(stockValue) !== stockValue) {
        throw new Error(`Invalid merchants configuration: merchant '${typed.id}' stock '${resolvedTradableId}' has invalid stock`);
      }

      if (typeof typedEntry.purchaseValue !== "undefined") {
        const purchaseValue = Number(typedEntry.purchaseValue);
        if (!Number.isFinite(purchaseValue) || purchaseValue < 0 || Math.floor(purchaseValue) !== purchaseValue) {
          throw new Error(`Invalid merchants configuration: merchant '${typed.id}' stock '${resolvedTradableId}' has invalid purchaseValue`);
        }
      }

      return {
        kind: resolvedKind,
        tradableId: resolvedTradableId,
        stock: Math.floor(stockValue),
        purchaseValue: typeof typedEntry.purchaseValue === "number" ? Math.floor(typedEntry.purchaseValue) : undefined,
      };
    });

    return {
      id: typed.id,
      landmarkId: typed.landmarkId,
      label: typed.label,
      acceptedCategories: Array.isArray(typed.acceptedCategories) ? typed.acceptedCategories.map((entry) => String(entry)) : undefined,
      stock,
    };
  }

  private parseKind(rawKind: unknown, legacyItemId: unknown, merchantId: string, stockIndex: number): MerchantTradableKind {
    if (typeof rawKind === "undefined") {
      if (typeof legacyItemId === "string" && legacyItemId.trim()) {
        return "item";
      }

      throw new Error(`Invalid merchants configuration: merchant '${merchantId}' stock at index ${stockIndex} has invalid kind`);
    }

    if (rawKind === "item" || rawKind === "ally") {
      return rawKind;
    }

    throw new Error(`Invalid merchants configuration: merchant '${merchantId}' stock at index ${stockIndex} has invalid kind`);
  }

  private parseTradableId(rawTradableId: unknown, legacyItemId: unknown, merchantId: string, stockIndex: number): string {
    if (typeof rawTradableId === "string" && rawTradableId.trim()) {
      return rawTradableId.trim();
    }

    if (typeof legacyItemId === "string" && legacyItemId.trim()) {
      return legacyItemId.trim();
    }

    throw new Error(`Invalid merchants configuration: merchant '${merchantId}' stock at index ${stockIndex} has invalid tradableId`);
  }

  private buildStockKey(kind: MerchantTradableKind, tradableId: string): string {
    return `${kind}:${tradableId}`;
  }
}
