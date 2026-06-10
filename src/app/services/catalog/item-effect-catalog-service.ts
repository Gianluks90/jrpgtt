import { Injectable } from "@angular/core";
import {
  ItemEffectDefinition,
  ItemEffectsCatalogConfig,
  ItemEffectType,
} from "@models/catalog/ItemEffectCatalog";

@Injectable({
  providedIn: "root",
})
export class ItemEffectCatalogService {
  private readonly configUrl = "/configs/item-effects.config.json";
  private configCache: ItemEffectsCatalogConfig | null = null;
  private loadingPromise: Promise<ItemEffectsCatalogConfig> | null = null;
  private effectsById: Record<string, ItemEffectDefinition> = {};

  public async loadConfig(): Promise<ItemEffectsCatalogConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load item effects catalog");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      this.effectsById = this.toMap(parsed.effects);
      return parsed;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public getEffect(id: string): ItemEffectDefinition | null {
    return this.effectsById[id] ?? null;
  }

  public getCachedEffect(id: string): ItemEffectDefinition | null {
    if (!this.configCache) {
      return null;
    }

    return this.effectsById[id] ?? null;
  }

  private parseConfig(raw: unknown): ItemEffectsCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid item effects catalog: root object is missing");
    }

    const typed = raw as { effects?: unknown };
    if (!Array.isArray(typed.effects)) {
      throw new Error("Invalid item effects catalog: effects array is missing");
    }

    return {
      effects: typed.effects.map((entry, index) => this.parseEffect(entry, index)),
    };
  }

  private parseEffect(raw: unknown, index: number): ItemEffectDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid item effects catalog: effect at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      label?: unknown;
      description?: unknown;
      type?: unknown;
      biome?: unknown;
      conditionId?: unknown;
      consumeCharges?: unknown;
      rechargeCharges?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid item effects catalog: effect at index ${index} has invalid id`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid label`);
    }

    if (typeof typed.description !== "undefined" && typeof typed.description !== "string") {
      throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid description`);
    }

    if (!this.isEffectType(typed.type)) {
      throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid type`);
    }

    if (!this.isBiomeType(typed.biome)) {
      throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid biome`);
    }

    if (typed.type === "prevent-biome-condition-damage-by-charge") {
      if (typeof typed.conditionId !== "string" || !typed.conditionId.trim()) {
        throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid conditionId`);
      }

      const consumeCharges = Math.floor(Number(typed.consumeCharges ?? 1));
      if (!Number.isFinite(consumeCharges) || consumeCharges <= 0) {
        throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid consumeCharges`);
      }

      return {
        id: typed.id,
        label: typed.label,
        description: typeof typed.description === "string" ? typed.description : undefined,
        type: typed.type,
        biome: typed.biome,
        conditionId: typed.conditionId,
        consumeCharges,
      };
    }

    const rechargeCharges = Math.floor(Number(typed.rechargeCharges ?? 1));
    if (!Number.isFinite(rechargeCharges) || rechargeCharges <= 0) {
      throw new Error(`Invalid item effects catalog: effect '${typed.id}' has invalid rechargeCharges`);
    }

    return {
      id: typed.id,
      label: typed.label,
      description: typeof typed.description === "string" ? typed.description : undefined,
      type: typed.type,
      biome: typed.biome,
      rechargeCharges,
    };
  }

  private toMap(effects: ItemEffectDefinition[]): Record<string, ItemEffectDefinition> {
    const mapped: Record<string, ItemEffectDefinition> = {};

    for (const effect of effects) {
      if (mapped[effect.id]) {
        throw new Error(`Invalid item effects catalog: duplicate effect id '${effect.id}'`);
      }

      mapped[effect.id] = effect;
    }

    return mapped;
  }

  private isEffectType(value: unknown): value is ItemEffectType {
    return value === "prevent-biome-condition-damage-by-charge"
      || value === "recharge-charges-in-biome";
  }

  private isBiomeType(value: unknown): value is "plains" | "forest" | "mountain" | "water" | "desert" | "ruins" {
    return value === "plains"
      || value === "forest"
      || value === "mountain"
      || value === "water"
      || value === "desert"
      || value === "ruins";
  }
}
