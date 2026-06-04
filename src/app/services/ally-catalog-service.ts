import { Injectable } from "@angular/core";
import { AlliesCatalogConfig, AllyDefinition } from "../models/AllyCatalog";

@Injectable({
  providedIn: "root",
})
export class AllyCatalogService {
  private readonly configUrl = "/configs/allies.config.json";
  private configCache: AlliesCatalogConfig | null = null;
  private configLoadPromise: Promise<AlliesCatalogConfig> | null = null;

  public async loadConfig(): Promise<AlliesCatalogConfig> {
    if (this.configCache) return this.configCache;
    if (this.configLoadPromise) return this.configLoadPromise;

    this.configLoadPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load allies configuration");
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

  public getCachedAllyById(allyId: string): AllyDefinition | null {
    const normalized = String(allyId ?? "").trim();
    if (!normalized || !this.configCache) return null;

    return this.configCache.allies.find((ally) => ally.id === normalized) ?? null;
  }

  private parseConfig(raw: unknown): AlliesCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid allies configuration: root object is missing");
    }

    const typedRoot = raw as { allies?: unknown };
    if (!Array.isArray(typedRoot.allies)) {
      throw new Error("Invalid allies configuration: allies array is missing");
    }

    const allyIds = new Set<string>();
    const allies = typedRoot.allies.map((entry, index) => this.parseAlly(entry, index));
    allies.forEach((ally) => {
      if (allyIds.has(ally.id)) {
        throw new Error(`Invalid allies configuration: duplicate ally id '${ally.id}'`);
      }
      allyIds.add(ally.id);
    });

    return { allies };
  }

  private parseAlly(raw: unknown, index: number): AllyDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid allies configuration: ally at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      category?: unknown;
      maxHp?: unknown;
      itemCapacityBonus?: unknown;
      actions?: unknown;
      allowedBiomes?: unknown;
      parameterModifiers?: unknown;
      statusKeysWhileActive?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid allies configuration: ally at index ${index} has invalid id`);
    }

    if (typeof typed.name !== "string" || !typed.name.trim()) {
      throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid name`);
    }

    if (typeof typed.description !== "string") {
      throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid description`);
    }

    if (typeof typed.category !== "string" || !typed.category.trim()) {
      throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid category`);
    }

    const maxHp = Number(typed.maxHp);
    if (!Number.isFinite(maxHp) || Math.floor(maxHp) !== maxHp || maxHp <= 0) {
      throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid maxHp`);
    }

    let itemCapacityBonus: number | undefined;
    if (typeof typed.itemCapacityBonus !== "undefined") {
      const parsedItemCapacityBonus = Number(typed.itemCapacityBonus);
      if (!Number.isFinite(parsedItemCapacityBonus) || Math.floor(parsedItemCapacityBonus) !== parsedItemCapacityBonus) {
        throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid itemCapacityBonus`);
      }

      itemCapacityBonus = parsedItemCapacityBonus;
    }

    if (!Array.isArray(typed.actions) || typed.actions.some((actionId) => typeof actionId !== "string" || !actionId.trim())) {
      throw new Error(`Invalid allies configuration: ally '${typed.id}' has invalid actions`);
    }

    return {
      id: typed.id,
      name: typed.name,
      description: typed.description,
      category: typed.category,
      maxHp,
      ...(typeof itemCapacityBonus === "number" ? { itemCapacityBonus } : {}),
      actions: typed.actions,
      allowedBiomes: this.parseAllowedBiomes(typed.allowedBiomes, typed.id),
      parameterModifiers: this.parseParameterModifiers(typed.parameterModifiers, typed.id),
      statusKeysWhileActive: this.parseStatusKeys(typed.statusKeysWhileActive, typed.id),
    };
  }

  private parseAllowedBiomes(raw: unknown, allyId: string): AllyDefinition["allowedBiomes"] {
    if (typeof raw === "undefined") return undefined;
    const knownBiomes = ["plains", "forest", "mountain", "water", "desert", "ruins"];
    if (!Array.isArray(raw) || raw.some((value) => !knownBiomes.includes(String(value)))) {
      throw new Error(`Invalid allies configuration: ally '${allyId}' has invalid allowedBiomes`);
    }

    return raw as AllyDefinition["allowedBiomes"];
  }

  private parseStatusKeys(raw: unknown, allyId: string): AllyDefinition["statusKeysWhileActive"] {
    if (typeof raw === "undefined") return undefined;
    if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string" || !value.trim())) {
      throw new Error(`Invalid allies configuration: ally '${allyId}' has invalid statusKeysWhileActive`);
    }

    return raw.map((value) => value.trim());
  }

  private parseParameterModifiers(raw: unknown, allyId: string): AllyDefinition["parameterModifiers"] {
    if (typeof raw === "undefined") return undefined;
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid allies configuration: ally '${allyId}' has invalid parameterModifiers`);
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} is invalid`);
      }

      const typed = entry as {
        parameter?: unknown;
        amount?: unknown;
        scope?: unknown;
        scopes?: unknown;
      };

      if (typed.parameter !== "strength" && typed.parameter !== "magic" && typed.parameter !== "luck") {
        throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} has invalid parameter`);
      }

      const amount = Number(typed.amount);
      if (!Number.isFinite(amount) || Math.floor(amount) !== amount) {
        throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} has invalid amount`);
      }

      const scopes = this.parseModifierScopes(typed.scope, typed.scopes, allyId, index);

      return {
        parameter: typed.parameter,
        amount,
        scopes,
      };
    });
  }

  private parseModifierScopes(
    rawScope: unknown,
    rawScopes: unknown,
    allyId: string,
    index: number,
  ): Array<"always" | "fight-only" | "day-only" | "night-only"> {
    if (typeof rawScopes !== "undefined") {
      if (!Array.isArray(rawScopes) || rawScopes.length === 0) {
        throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} has invalid scopes`);
      }

      const normalizedScopes = rawScopes.map((value) => {
        if (!this.isValidModifierScope(value)) {
          throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} has invalid scope value`);
        }

        return value;
      });

      return Array.from(new Set(normalizedScopes));
    }

    if (this.isValidModifierScope(rawScope)) {
      return [rawScope];
    }

    throw new Error(`Invalid allies configuration: ally '${allyId}' modifier at index ${index} has invalid scope`);
  }

  private isValidModifierScope(value: unknown): value is "always" | "fight-only" | "day-only" | "night-only" {
    return value === "always"
      || value === "fight-only"
      || value === "day-only"
      || value === "night-only";
  }
}
