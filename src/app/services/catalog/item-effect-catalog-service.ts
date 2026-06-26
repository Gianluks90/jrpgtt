import { Injectable } from "@angular/core";
import {
  ItemEffectDefinition,
  ItemEffectsCatalogConfig,
  ItemEffectType,
} from "@models/catalog/ItemEffectCatalog";
import { BiomeType } from "@models/world/MapCell";

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

    const r = raw as Record<string, unknown>;

    if (typeof r["id"] !== "string" || !r["id"].trim()) {
      throw new Error(`Invalid item effects catalog: effect at index ${index} has invalid id`);
    }
    const id = r["id"];

    if (typeof r["label"] !== "string" || !r["label"].trim()) {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid label`);
    }
    const label = r["label"];

    if (typeof r["description"] !== "undefined" && typeof r["description"] !== "string") {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid description`);
    }
    const description = typeof r["description"] === "string" ? r["description"] : undefined;

    if (!this.isEffectType(r["type"])) {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid type '${String(r["type"])}'`);
    }
    const type = r["type"];
    const base = { id, label, description };

    if (type === "prevent-biome-condition-damage-by-charge") {
      const biome = this.requireBiome(r, id);
      const conditionId = this.requireString(r, "conditionId", id);
      const consumeCharges = this.requirePositiveInt(r, "consumeCharges", id, 1);
      return { ...base, type, biome, conditionId, consumeCharges };
    }

    if (type === "recharge-charges-in-biome") {
      const biome = this.requireBiome(r, id);
      const rechargeCharges = this.requirePositiveInt(r, "rechargeCharges", id, 1);
      return { ...base, type, biome, rechargeCharges };
    }

    if (type === "prevent-biome-condition-damage-passive") {
      const biome = this.requireBiome(r, id);
      const conditionId = this.requireString(r, "conditionId", id);
      return { ...base, type, biome, conditionId };
    }

    if (type === "gain-coins-range-on-pickup") {
      const minAmount = this.requirePositiveInt(r, "minAmount", id, 1);
      const maxAmount = this.requirePositiveInt(r, "maxAmount", id, 1);
      return { ...base, type, minAmount, maxAmount };
    }

    if (type === "apply-status-on-pickup") {
      const statusKey = this.requireString(r, "statusKey", id);
      const durationTurns = this.requirePositiveInt(r, "durationTurns", id, 1);
      return { ...base, type, statusKey, durationTurns };
    }

    if (type === "reduce-combat-damage-on-fortune-check") {
      const luckThreshold = this.requirePositiveInt(r, "luckThreshold", id, 1);
      const reduction = this.requirePositiveInt(r, "reduction", id, 1);
      const rawFilter = r["combatStatFilter"];
      const combatStatFilter =
        rawFilter === "strength" || rawFilter === "magic" ? rawFilter : undefined;
      return { ...base, type, luckThreshold, reduction, combatStatFilter };
    }

    if (type === "combat-stat-bonus-vs-enemy-category") {
      const rawStat = r["combatStat"];
      if (rawStat !== "strength" && rawStat !== "magic") {
        throw new Error(`Invalid item effects catalog: effect '${id}' has invalid combatStat`);
      }
      const bonus = this.requirePositiveInt(r, "bonus", id, 1);
      const categoryFilter = this.requireString(r, "categoryFilter", id);
      return { ...base, type, combatStat: rawStat, bonus, categoryFilter };
    }

    if (type === "draw-spell-on-spellbook-empty") {
      return { ...base, type };
    }

    if (type === "apply-status-on-lucky-roll") {
      const statusKey = this.requireString(r, "statusKey", id);
      const durationTurns = this.requirePositiveInt(r, "durationTurns", id, 1);
      return { ...base, type, statusKey, durationTurns };
    }

    if (type === "passive-self-silence-and-spell-immunity") {
      return { ...base, type };
    }

    if (type === "region-iii-access") {
      return { ...base, type };
    }

    if (type === "skip-spirit-for-exp") {
      const expReward = this.requirePositiveInt(r, "expReward", id, 1);
      return { ...base, type, expReward };
    }

    // skip-exploration-card-once-per-turn
    return { ...base, type };
  }

  private requireBiome(r: Record<string, unknown>, id: string): BiomeType {
    if (!this.isBiomeType(r["biome"])) {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid biome`);
    }
    return r["biome"];
  }

  private requireString(r: Record<string, unknown>, field: string, id: string): string {
    if (typeof r[field] !== "string" || !(r[field] as string).trim()) {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid ${field}`);
    }
    return r[field] as string;
  }

  private requirePositiveInt(r: Record<string, unknown>, field: string, id: string, fallback?: number): number {
    const value = Math.floor(Number(r[field] ?? fallback));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid item effects catalog: effect '${id}' has invalid ${field}`);
    }
    return value;
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
      || value === "recharge-charges-in-biome"
      || value === "prevent-biome-condition-damage-passive"
      || value === "gain-coins-range-on-pickup"
      || value === "apply-status-on-pickup"
      || value === "reduce-combat-damage-on-fortune-check"
      || value === "combat-stat-bonus-vs-enemy-category"
      || value === "draw-spell-on-spellbook-empty"
      || value === "apply-status-on-lucky-roll"
      || value === "passive-self-silence-and-spell-immunity"
      || value === "region-iii-access"
      || value === "skip-spirit-for-exp"
      || value === "skip-exploration-card-once-per-turn";
  }

  private isBiomeType(value: unknown): value is BiomeType {
    return value === "plains"
      || value === "forest"
      || value === "mountain"
      || value === "water"
      || value === "desert"
      || value === "ruins";
  }
}
