import { Injectable } from "@angular/core";
import { ItemCatalogConfig, ItemDefinition } from "../models/ItemCatalog";
import { TranslationService } from "./translation-service";

@Injectable({
  providedIn: "root",
})
export class ItemCatalogService {
  constructor(private translationService: TranslationService) {}

  private readonly configUrl = "/configs/items.config.json";
  private configCache: ItemCatalogConfig | null = null;
  private configLoadPromise: Promise<ItemCatalogConfig> | null = null;

  public async loadConfig(): Promise<ItemCatalogConfig> {
    if (this.configCache) return this.configCache;
    if (this.configLoadPromise) return this.configLoadPromise;

    this.configLoadPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load items configuration");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      return parsed;
    })();

    try {
      return await this.configLoadPromise;
    } finally {
      this.configLoadPromise = null;
    }
  }

  public async getItemById(itemId: string): Promise<ItemDefinition | null> {
    const normalized = String(itemId ?? "").trim();
    if (!normalized) return null;

    const config = await this.loadConfig();
    return config.items.find((item) => item.id === normalized) ?? null;
  }

  public getCachedItemById(itemId: string): ItemDefinition | null {
    const normalized = String(itemId ?? "").trim();
    if (!normalized || !this.configCache) return null;

    return this.configCache.items.find((item) => item.id === normalized) ?? null;
  }

  public getSellValue(item: Pick<ItemDefinition, "purchaseValue">): number {
    const purchaseValue = Math.max(0, Math.floor(Number(item.purchaseValue ?? 0)));
    if (purchaseValue <= 0) return 0;
    return Math.floor(purchaseValue / 2);
  }

  public getLocalizedName(item: Pick<ItemDefinition, "id" | "name" | "nameKey">): string {
    if (typeof item.nameKey === "string" && item.nameKey.trim()) {
      return this.translationService.tOrFallback(item.nameKey, item.name);
    }

    return item.name;
  }

  public getLocalizedDescription(item: Pick<ItemDefinition, "id" | "description" | "descriptionKey">): string {
    if (typeof item.descriptionKey === "string" && item.descriptionKey.trim()) {
      return this.translationService.tOrFallback(item.descriptionKey, item.description);
    }

    return item.description;
  }

  private parseConfig(raw: unknown): ItemCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid items configuration: root object is missing");
    }

    const typed = raw as { items?: unknown };
    if (!Array.isArray(typed.items)) {
      throw new Error("Invalid items configuration: items array is missing");
    }

    const ids = new Set<string>();
    const parsedItems = typed.items.map((entry, index) => this.parseItem(entry, index));
    for (const item of parsedItems) {
      if (ids.has(item.id)) {
        throw new Error(`Invalid items configuration: duplicate item id '${item.id}'`);
      }
      ids.add(item.id);
    }

    return {
      items: parsedItems,
    };
  }

  private parseItem(raw: unknown, index: number): ItemDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid items configuration: item at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      nameKey?: unknown;
      descriptionKey?: unknown;
      category?: unknown;
      occupiesSpace?: unknown;
      consumable?: unknown;
      actions?: unknown;
      purchaseValue?: unknown;
      maxCharges?: unknown;
      effects?: unknown;
      constraints?: unknown;
      parameterModifiers?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid items configuration: item at index ${index} has invalid id`);
    }

    if (typeof typed.name !== "string" || !typed.name.trim()) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid name`);
    }

    if (typeof typed.description !== "string") {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid description`);
    }

    if (typeof typed.nameKey !== "undefined" && (typeof typed.nameKey !== "string" || !typed.nameKey.trim())) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid nameKey`);
    }

    if (typeof typed.descriptionKey !== "undefined"
      && (typeof typed.descriptionKey !== "string" || !typed.descriptionKey.trim())) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid descriptionKey`);
    }

    if (typeof typed.category !== "string" || !typed.category.trim()) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid category`);
    }

    if (typeof typed.occupiesSpace !== "boolean") {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid occupiesSpace`);
    }

    if (typeof typed.consumable !== "boolean") {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid consumable`);
    }

    if (!Array.isArray(typed.actions) || typed.actions.some((action) => typeof action !== "string")) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid actions`);
    }

    if (typeof typed.effects !== "undefined") {
      if (!Array.isArray(typed.effects) || typed.effects.some((effect) => typeof effect !== "string" || !effect.trim())) {
        throw new Error(`Invalid items configuration: item '${typed.id}' has invalid effects`);
      }
    }

    const purchaseValue = Math.max(0, Math.floor(Number(typed.purchaseValue ?? 0)));
    if (!Number.isFinite(purchaseValue)) {
      throw new Error(`Invalid items configuration: item '${typed.id}' has invalid purchaseValue`);
    }

    let maxCharges: number | undefined;
    if (typeof typed.maxCharges !== "undefined") {
      const parsedMaxCharges = Number(typed.maxCharges);
      if (!Number.isFinite(parsedMaxCharges) || Math.floor(parsedMaxCharges) !== parsedMaxCharges || parsedMaxCharges <= 0) {
        throw new Error(`Invalid items configuration: item '${typed.id}' has invalid maxCharges`);
      }

      maxCharges = parsedMaxCharges;
    }

    return {
      id: typed.id,
      name: typed.name,
      description: typed.description,
      ...(typeof typed.nameKey === "string" ? { nameKey: typed.nameKey } : {}),
      ...(typeof typed.descriptionKey === "string" ? { descriptionKey: typed.descriptionKey } : {}),
      category: typed.category,
      occupiesSpace: typed.occupiesSpace,
      consumable: typed.consumable,
      actions: typed.actions,
      purchaseValue,
      ...(typeof maxCharges === "number" ? { maxCharges } : {}),
      ...(Array.isArray(typed.effects) ? { effects: typed.effects } : {}),
      constraints: this.parseConstraints(typed.constraints, typed.id),
      parameterModifiers: this.parseParameterModifiers(typed.parameterModifiers, typed.id),
    };
  }

  private parseConstraints(raw: unknown, itemId: string): ItemDefinition["constraints"] {
    if (typeof raw === "undefined") return undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid items configuration: item '${itemId}' has invalid constraints`);
    }

    const typed = raw as {
      allowedAlignments?: unknown;
      minLevel?: unknown;
      allowedBiomes?: unknown;
    };

    if (typeof typed.allowedAlignments !== "undefined") {
      if (!Array.isArray(typed.allowedAlignments) || typed.allowedAlignments.some((value) => value !== "good" && value !== "neutral" && value !== "evil")) {
        throw new Error(`Invalid items configuration: item '${itemId}' has invalid constraints.allowedAlignments`);
      }
    }

    if (typeof typed.minLevel !== "undefined") {
      const minLevel = Number(typed.minLevel);
      if (!Number.isFinite(minLevel) || minLevel < 1 || Math.floor(minLevel) !== minLevel) {
        throw new Error(`Invalid items configuration: item '${itemId}' has invalid constraints.minLevel`);
      }
    }

    if (typeof typed.allowedBiomes !== "undefined") {
      const allowedBiomes = ["plains", "forest", "mountain", "water", "desert", "ruins"];
      if (!Array.isArray(typed.allowedBiomes) || typed.allowedBiomes.some((value) => !allowedBiomes.includes(String(value)))) {
        throw new Error(`Invalid items configuration: item '${itemId}' has invalid constraints.allowedBiomes`);
      }
    }

    return {
      allowedAlignments: Array.isArray(typed.allowedAlignments) ? typed.allowedAlignments : undefined,
      minLevel: typeof typed.minLevel === "number" ? typed.minLevel : undefined,
      allowedBiomes: Array.isArray(typed.allowedBiomes) ? typed.allowedBiomes : undefined,
    };
  }

  private parseParameterModifiers(raw: unknown, itemId: string): ItemDefinition["parameterModifiers"] {
    if (typeof raw === "undefined") return undefined;
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid items configuration: item '${itemId}' has invalid parameterModifiers`);
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} is invalid`);
      }

      const typed = entry as {
        parameter?: unknown;
        amount?: unknown;
        scope?: unknown;
        scopes?: unknown;
      };

      if (typed.parameter !== "strength" && typed.parameter !== "magic" && typed.parameter !== "luck") {
        throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} has invalid parameter`);
      }

      const amount = Number(typed.amount);
      if (!Number.isFinite(amount) || Math.floor(amount) !== amount) {
        throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} has invalid amount`);
      }

      const parsedScopes = this.parseModifierScopes(typed.scope, typed.scopes, itemId, index);

      return {
        parameter: typed.parameter,
        amount,
        scopes: parsedScopes,
      };
    });
  }

  private parseModifierScopes(
    rawScope: unknown,
    rawScopes: unknown,
    itemId: string,
    index: number,
  ): Array<"always" | "fight-only" | "day-only" | "night-only"> {
    if (typeof rawScopes !== "undefined") {
      if (!Array.isArray(rawScopes) || rawScopes.length === 0) {
        throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} has invalid scopes`);
      }

      const normalizedScopes = rawScopes.map((value) => {
        if (!this.isValidModifierScope(value)) {
          throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} has invalid scope value`);
        }

        return value;
      });

      return Array.from(new Set(normalizedScopes));
    }

    if (this.isValidModifierScope(rawScope)) {
      return [rawScope];
    }

    throw new Error(`Invalid items configuration: item '${itemId}' modifier at index ${index} has invalid scope`);
  }

  private isValidModifierScope(value: unknown): value is "always" | "fight-only" | "day-only" | "night-only" {
    return value === "always"
      || value === "fight-only"
      || value === "day-only"
      || value === "night-only";
  }
}
