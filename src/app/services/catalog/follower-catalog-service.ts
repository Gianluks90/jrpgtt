import { Injectable } from "@angular/core";
import { FollowersCatalogConfig, FollowerDefinition } from "@models/player/FollowerCatalog";
import { TranslationService } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class FollowerCatalogService {
  constructor(private translationService: TranslationService) {}

  private readonly configUrl = "/configs/followers.config.json";
  private configCache: FollowersCatalogConfig | null = null;
  private configLoadPromise: Promise<FollowersCatalogConfig> | null = null;

  public async loadConfig(): Promise<FollowersCatalogConfig> {
    if (this.configCache) return this.configCache;
    if (this.configLoadPromise) return this.configLoadPromise;

    this.configLoadPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load followers configuration");
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

  public getCachedFollowerById(followerId: string): FollowerDefinition | null {
    const normalized = String(followerId ?? "").trim();
    if (!normalized || !this.configCache) return null;

    return this.configCache.followers.find((follower) => follower.id === normalized) ?? null;
  }

  public getLocalizedName(follower: Pick<FollowerDefinition, "id" | "name" | "nameKey">): string {
    if (typeof follower.nameKey === "string" && follower.nameKey.trim()) {
      return this.translationService.tOrFallback(follower.nameKey, follower.name);
    }

    return follower.name;
  }

  public getLocalizedDescription(follower: Pick<FollowerDefinition, "id" | "description" | "descriptionKey">): string {
    if (typeof follower.descriptionKey === "string" && follower.descriptionKey.trim()) {
      return this.translationService.tOrFallback(follower.descriptionKey, follower.description);
    }

    return follower.description;
  }

  private parseConfig(raw: unknown): FollowersCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid followers configuration: root object is missing");
    }

    const typedRoot = raw as { followers?: unknown };
    if (!Array.isArray(typedRoot.followers)) {
      throw new Error("Invalid followers configuration: followers array is missing");
    }

    const followerIds = new Set<string>();
    const followers = typedRoot.followers.map((entry, index) => this.parseFollower(entry, index));
    followers.forEach((follower) => {
      if (followerIds.has(follower.id)) {
        throw new Error(`Invalid followers configuration: duplicate follower id '${follower.id}'`);
      }
      followerIds.add(follower.id);
    });

    return { followers };
  }

  private parseFollower(raw: unknown, index: number): FollowerDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid followers configuration: follower at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      nameKey?: unknown;
      descriptionKey?: unknown;
      category?: unknown;
      maxHp?: unknown;
      itemCapacityBonus?: unknown;
      actions?: unknown;
      allowedBiomes?: unknown;
      parameterModifiers?: unknown;
      statusKeysWhileActive?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid followers configuration: follower at index ${index} has invalid id`);
    }

    if (typeof typed.name !== "string" || !typed.name.trim()) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid name`);
    }

    if (typeof typed.description !== "string") {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid description`);
    }

    if (typeof typed.nameKey !== "undefined" && (typeof typed.nameKey !== "string" || !typed.nameKey.trim())) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid nameKey`);
    }

    if (typeof typed.descriptionKey !== "undefined"
      && (typeof typed.descriptionKey !== "string" || !typed.descriptionKey.trim())) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid descriptionKey`);
    }

    if (typeof typed.category !== "string" || !typed.category.trim()) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid category`);
    }

    const maxHp = Number(typed.maxHp);
    if (!Number.isFinite(maxHp) || Math.floor(maxHp) !== maxHp || maxHp <= 0) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid maxHp`);
    }

    let itemCapacityBonus: number | undefined;
    if (typeof typed.itemCapacityBonus !== "undefined") {
      const parsedItemCapacityBonus = Number(typed.itemCapacityBonus);
      if (!Number.isFinite(parsedItemCapacityBonus) || Math.floor(parsedItemCapacityBonus) !== parsedItemCapacityBonus) {
        throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid itemCapacityBonus`);
      }

      itemCapacityBonus = parsedItemCapacityBonus;
    }

    if (!Array.isArray(typed.actions) || typed.actions.some((actionId) => typeof actionId !== "string" || !actionId.trim())) {
      throw new Error(`Invalid followers configuration: follower '${typed.id}' has invalid actions`);
    }

    return {
      id: typed.id,
      name: typed.name,
      description: typed.description,
      ...(typeof typed.nameKey === "string" ? { nameKey: typed.nameKey } : {}),
      ...(typeof typed.descriptionKey === "string" ? { descriptionKey: typed.descriptionKey } : {}),
      category: typed.category,
      maxHp,
      ...(typeof itemCapacityBonus === "number" ? { itemCapacityBonus } : {}),
      actions: typed.actions,
      allowedBiomes: this.parseAllowedBiomes(typed.allowedBiomes, typed.id),
      parameterModifiers: this.parseParameterModifiers(typed.parameterModifiers, typed.id),
      statusKeysWhileActive: this.parseStatusKeys(typed.statusKeysWhileActive, typed.id),
    };
  }

  private parseAllowedBiomes(raw: unknown, followerId: string): FollowerDefinition["allowedBiomes"] {
    if (typeof raw === "undefined") return undefined;
    const knownBiomes = ["plains", "forest", "mountain", "water", "desert", "ruins"];
    if (!Array.isArray(raw) || raw.some((value) => !knownBiomes.includes(String(value)))) {
      throw new Error(`Invalid followers configuration: follower '${followerId}' has invalid allowedBiomes`);
    }

    return raw as FollowerDefinition["allowedBiomes"];
  }

  private parseStatusKeys(raw: unknown, followerId: string): FollowerDefinition["statusKeysWhileActive"] {
    if (typeof raw === "undefined") return undefined;
    if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string" || !value.trim())) {
      throw new Error(`Invalid followers configuration: follower '${followerId}' has invalid statusKeysWhileActive`);
    }

    return raw.map((value) => value.trim());
  }

  private parseParameterModifiers(raw: unknown, followerId: string): FollowerDefinition["parameterModifiers"] {
    if (typeof raw === "undefined") return undefined;
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid followers configuration: follower '${followerId}' has invalid parameterModifiers`);
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} is invalid`);
      }

      const typed = entry as {
        parameter?: unknown;
        amount?: unknown;
        scope?: unknown;
        scopes?: unknown;
      };

      if (typed.parameter !== "strength" && typed.parameter !== "magic" && typed.parameter !== "luck") {
        throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} has invalid parameter`);
      }

      const amount = Number(typed.amount);
      if (!Number.isFinite(amount) || Math.floor(amount) !== amount) {
        throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} has invalid amount`);
      }

      const scopes = this.parseModifierScopes(typed.scope, typed.scopes, followerId, index);

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
    followerId: string,
    index: number,
  ): Array<"always" | "fight-only" | "day-only" | "night-only"> {
    if (typeof rawScopes !== "undefined") {
      if (!Array.isArray(rawScopes) || rawScopes.length === 0) {
        throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} has invalid scopes`);
      }

      const normalizedScopes = rawScopes.map((value) => {
        if (!this.isValidModifierScope(value)) {
          throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} has invalid scope value`);
        }

        return value;
      });

      return Array.from(new Set(normalizedScopes));
    }

    if (this.isValidModifierScope(rawScope)) {
      return [rawScope];
    }

    throw new Error(`Invalid followers configuration: follower '${followerId}' modifier at index ${index} has invalid scope`);
  }

  private isValidModifierScope(value: unknown): value is "always" | "fight-only" | "day-only" | "night-only" {
    return value === "always"
      || value === "fight-only"
      || value === "day-only"
      || value === "night-only";
  }
}
