import { Injectable } from "@angular/core";
import { MerchantStockEntry } from "../models/MerchantCatalog";

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
      acc[entry.itemId] = Math.max(0, Math.floor(Number(entry.stock ?? 0)));
      return acc;
    }, {});
  }

  public getStockEntry(stock: MerchantStockEntry[], itemId: string): MerchantStockEntry | null {
    return stock.find((entry) => entry.itemId === itemId) ?? null;
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
      itemId?: unknown;
      stock?: unknown;
      purchaseValue?: unknown;
    };

    if (typeof typed.itemId !== "string" || !typed.itemId.trim()) {
      throw new Error(`Invalid merchant stock configuration: stock entry at index ${index} has invalid itemId`);
    }

    const stockValue = Number(typed.stock);
    if (!Number.isFinite(stockValue) || stockValue < 0 || Math.floor(stockValue) !== stockValue) {
      throw new Error(`Invalid merchant stock configuration: stock '${typed.itemId}' has invalid stock`);
    }

    if (typeof typed.purchaseValue !== "undefined") {
      const purchaseValue = Number(typed.purchaseValue);
      if (!Number.isFinite(purchaseValue) || purchaseValue < 0 || Math.floor(purchaseValue) !== purchaseValue) {
        throw new Error(`Invalid merchant stock configuration: stock '${typed.itemId}' has invalid purchaseValue`);
      }
    }

    return {
      itemId: typed.itemId,
      stock: Math.floor(stockValue),
      purchaseValue: typeof typed.purchaseValue === "number" ? Math.floor(typed.purchaseValue) : undefined,
    };
  }
}
