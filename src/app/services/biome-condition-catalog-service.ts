import { Injectable } from "@angular/core";
import { BiomeConditionDefinition, BiomeConditionsCatalogConfig, BiomeConditionEffectDefinition } from "../models/BiomeConditionCatalog";

@Injectable({
  providedIn: "root",
})
export class BiomeConditionCatalogService {
  private readonly configUrl = "/configs/biome-conditions.config.json";
  private configCache: BiomeConditionsCatalogConfig | null = null;
  private loadingPromise: Promise<BiomeConditionsCatalogConfig> | null = null;
  private conditionsById: Record<string, BiomeConditionDefinition> = {};

  public async loadConfig(): Promise<BiomeConditionsCatalogConfig> {
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
        throw new Error("Unable to load biome conditions catalog");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      this.conditionsById = this.toMap(parsed.conditions);
      return parsed;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public getCondition(id: string): BiomeConditionDefinition | null {
    return this.conditionsById[id] ?? null;
  }

  public getCachedCondition(id: string): BiomeConditionDefinition | null {
    if (!this.configCache) {
      return null;
    }

    return this.conditionsById[id] ?? null;
  }

  private parseConfig(raw: unknown): BiomeConditionsCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid biome conditions catalog: root object is missing");
    }

    const typed = raw as { conditions?: unknown };
    if (!Array.isArray(typed.conditions) || typed.conditions.length === 0) {
      throw new Error("Invalid biome conditions catalog: conditions array is missing");
    }

    return {
      conditions: typed.conditions.map((entry, index) => this.parseCondition(entry, index)),
    };
  }

  private parseCondition(raw: unknown, index: number): BiomeConditionDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid biome conditions catalog: condition at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      label?: unknown;
      description?: unknown;
      logCode?: unknown;
      effect?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid biome conditions catalog: condition at index ${index} has invalid id`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid biome conditions catalog: condition '${typed.id}' has invalid label`);
    }

    if (typeof typed.description !== "undefined" && typeof typed.description !== "string") {
      throw new Error(`Invalid biome conditions catalog: condition '${typed.id}' has invalid description`);
    }

    if (typeof typed.logCode !== "undefined" && typeof typed.logCode !== "string") {
      throw new Error(`Invalid biome conditions catalog: condition '${typed.id}' has invalid logCode`);
    }

    return {
      id: typed.id,
      label: typed.label,
      description: typed.description,
      logCode: typed.logCode,
      effect: this.parseEffect(typed.effect, typed.id),
    };
  }

  private parseEffect(raw: unknown, conditionId: string): BiomeConditionEffectDefinition | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect section`);
    }

    const typed = raw as {
      type?: unknown;
      basePercentPerConnectedCell?: unknown;
      maxPercent?: unknown;
      minDeltaHp?: unknown;
      blockedByStatusKey?: unknown;
    };

    if (!this.isEffectType(typed.type)) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect.type`);
    }

    if (typeof typed.basePercentPerConnectedCell !== "number" || !Number.isFinite(typed.basePercentPerConnectedCell) || typed.basePercentPerConnectedCell <= 0) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect.basePercentPerConnectedCell`);
    }

    if (typeof typed.maxPercent !== "undefined" && (typeof typed.maxPercent !== "number" || !Number.isFinite(typed.maxPercent) || typed.maxPercent <= 0)) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect.maxPercent`);
    }

    if (typeof typed.minDeltaHp !== "undefined" && (typeof typed.minDeltaHp !== "number" || !Number.isFinite(typed.minDeltaHp) || typed.minDeltaHp <= 0)) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect.minDeltaHp`);
    }

    if (typeof typed.blockedByStatusKey !== "undefined" && (typeof typed.blockedByStatusKey !== "string" || !typed.blockedByStatusKey.trim())) {
      throw new Error(`Invalid biome conditions catalog: condition '${conditionId}' has invalid effect.blockedByStatusKey`);
    }

    return {
      type: typed.type,
      basePercentPerConnectedCell: typed.basePercentPerConnectedCell,
      maxPercent: typed.maxPercent,
      minDeltaHp: typed.minDeltaHp,
      blockedByStatusKey: typed.blockedByStatusKey,
    };
  }

  private toMap(conditions: BiomeConditionDefinition[]): Record<string, BiomeConditionDefinition> {
    const mapped: Record<string, BiomeConditionDefinition> = {};

    for (const condition of conditions) {
      if (mapped[condition.id]) {
        throw new Error(`Invalid biome conditions catalog: duplicate condition id '${condition.id}'`);
      }

      mapped[condition.id] = condition;
    }

    return mapped;
  }

  private isEffectType(value: unknown): value is BiomeConditionEffectDefinition["type"] {
    return value === "hp-damage-percent-per-connected-cell"
      || value === "hp-heal-percent-per-connected-cell";
  }
}
