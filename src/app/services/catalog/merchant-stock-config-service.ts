import { Injectable } from "@angular/core";
import { MerchantStockEntry, MerchantTradableKind } from "@models/catalog/MerchantCatalog";

interface MerchantStockConfig {
  merchantId?: string;
  stock: MerchantStockEntry[];
}

@Injectable({
  providedIn: "root",
})
export class MerchantStockConfigService {
  private readonly cache = new Map<string, MerchantStockConfig>();
  private readonly pendingByUrl = new Map<string, Promise<MerchantStockConfig>>();

  public async loadConfig(url: string): Promise<MerchantStockConfig> {
    const normalizedUrl = String(url ?? "").trim();
    if (!normalizedUrl) {
      throw new Error("Invalid merchant stock configuration url");
    }

    const cached = this.cache.get(normalizedUrl);
    if (cached) {
      return cached;
    }

    const pending = this.pendingByUrl.get(normalizedUrl);
    if (pending) {
      return pending;
    }

    const nextPending = (async () => {
      const response = await fetch(normalizedUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load merchant stock configuration");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.cache.set(normalizedUrl, parsed);
      return parsed;
    })();

    this.pendingByUrl.set(normalizedUrl, nextPending);

    try {
      return await nextPending;
    } finally {
      this.pendingByUrl.delete(normalizedUrl);
    }
  }

  public asStockMap(stock: MerchantStockEntry[]): Record<string, number> {
    return stock.reduce<Record<string, number>>((acc, entry) => {
      acc[this.buildStockKey(entry.kind, entry.tradableId)] = Math.max(0, Math.floor(Number(entry.stock ?? 0)));
      return acc;
    }, {});
  }

  public getStockEntry(stock: MerchantStockEntry[], kind: MerchantTradableKind, tradableId: string): MerchantStockEntry | null {
    return stock.find((entry) => entry.kind === kind && entry.tradableId === tradableId) ?? null;
  }

  private parseConfig(raw: unknown): MerchantStockConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid merchant stock configuration: root object is missing");
    }

    const typed = raw as {
      merchantId?: unknown;
      stock?: unknown;
    };

    if (typeof typed.merchantId !== "undefined" && (typeof typed.merchantId !== "string" || !typed.merchantId.trim())) {
      throw new Error("Invalid merchant stock configuration: merchantId is invalid");
    }

    if (!Array.isArray(typed.stock)) {
      throw new Error("Invalid merchant stock configuration: stock array is missing");
    }

    const stock = typed.stock.map((entry, index) => this.parseStockEntry(entry, index));
    return {
      merchantId: typeof typed.merchantId === "string" ? typed.merchantId : undefined,
      stock,
    };
  }

  private parseStockEntry(raw: unknown, index: number): MerchantStockEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid merchant stock configuration: stock entry at index ${index} is invalid`);
    }

    const typed = raw as {
      kind?: unknown;
      tradableId?: unknown;
      itemId?: unknown;
      stock?: unknown;
      purchaseValue?: unknown;
    };

    const resolvedKind = this.parseKind(typed.kind, typed.itemId);
    const resolvedTradableId = this.parseTradableId(typed.tradableId, typed.itemId);

    const stockValue = Number(typed.stock);
    if (!Number.isFinite(stockValue) || stockValue < 0 || Math.floor(stockValue) !== stockValue) {
      throw new Error(`Invalid merchant stock configuration: stock '${resolvedTradableId}' has invalid stock`);
    }

    if (typeof typed.purchaseValue !== "undefined") {
      const purchaseValue = Number(typed.purchaseValue);
      if (!Number.isFinite(purchaseValue) || purchaseValue < 0 || Math.floor(purchaseValue) !== purchaseValue) {
        throw new Error(`Invalid merchant stock configuration: stock '${resolvedTradableId}' has invalid purchaseValue`);
      }
    }

    return {
      kind: resolvedKind,
      tradableId: resolvedTradableId,
      stock: Math.floor(stockValue),
      purchaseValue: typeof typed.purchaseValue === "number" ? Math.floor(typed.purchaseValue) : undefined,
    };
  }

  private parseKind(rawKind: unknown, legacyItemId: unknown): MerchantTradableKind {
    if (typeof rawKind === "undefined") {
      if (typeof legacyItemId === "string" && legacyItemId.trim()) {
        return "item";
      }

      throw new Error("Invalid merchant stock configuration: stock entry has invalid kind");
    }

    if (rawKind === "item" || rawKind === "follower") {
      return rawKind;
    }

    throw new Error("Invalid merchant stock configuration: stock entry has invalid kind");
  }

  private parseTradableId(rawTradableId: unknown, legacyItemId: unknown): string {
    if (typeof rawTradableId === "string" && rawTradableId.trim()) {
      return rawTradableId.trim();
    }

    if (typeof legacyItemId === "string" && legacyItemId.trim()) {
      return legacyItemId.trim();
    }

    throw new Error("Invalid merchant stock configuration: stock entry has invalid tradable id");
  }

  private buildStockKey(kind: MerchantTradableKind, tradableId: string): string {
    return `${kind}:${tradableId}`;
  }
}
