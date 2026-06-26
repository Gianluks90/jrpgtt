import { Injectable } from "@angular/core";
import { EnemyCatalogEntry, EnemiesCatalogConfig } from "@models/catalog/EnemyCatalog";
import { EnemyCombatStat, EnemyLevelUpMode, EnemyLoot, LootToken, PlacedEnemyCard } from "@models/exploration/ExplorationCard";
import { TranslationService } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class EnemyCatalogService {
  constructor(private translationService: TranslationService) {}

  private readonly configUrl = "/configs/cards/base/enemies.config.json";
  private configCache: EnemiesCatalogConfig | null = null;
  private configLoadPromise: Promise<EnemiesCatalogConfig> | null = null;

  public async loadConfig(): Promise<EnemiesCatalogConfig> {
    if (this.configCache) return this.configCache;
    if (this.configLoadPromise) return this.configLoadPromise;

    this.configLoadPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: { "content-type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Unable to load enemies configuration");
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

  public getCachedEnemyById(enemyId: string): EnemyCatalogEntry | null {
    const normalized = String(enemyId ?? "").trim();
    if (!normalized || !this.configCache) return null;

    return this.configCache.enemies.find((e) => e.id === normalized) ?? null;
  }

  public async getEnemyById(enemyId: string): Promise<EnemyCatalogEntry | null> {
    const normalized = String(enemyId ?? "").trim();
    if (!normalized) return null;

    const config = await this.loadConfig();
    return config.enemies.find((e) => e.id === normalized) ?? null;
  }

  public getLocalizedName(enemy: Pick<EnemyCatalogEntry, "id" | "name" | "nameKey">): string {
    if (typeof enemy.nameKey === "string" && enemy.nameKey.trim()) {
      return this.translationService.tOrFallback(enemy.nameKey, enemy.name);
    }

    return enemy.name;
  }

  /**
   * Computes the actual spawn level for an enemy placed on a cell.
   * Level = cellX ± 1 (random), minimum 1, plus any world event bonus.
   */
  public computeSpawnLevel(cellX: number, worldEventBonus?: number): number {
    const base = Math.max(1, Math.floor(Number(cellX ?? 0)) + 1);
    const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
    const bonus = Math.max(0, Math.floor(Number(worldEventBonus ?? 0)));
    return Math.max(1, Math.min(10, base + jitter + bonus));
  }

  /**
   * Resolves a catalog entry into a placed enemy card with stats scaled to the given level.
   */
  public resolveSpawnedEnemy(entry: EnemyCatalogEntry, level: number): Omit<PlacedEnemyCard, 'expansion'> {
    const safeLevel = Math.max(1, Math.floor(Number(level)));
    const { str, mag, lck } = this.scaleStats(entry, safeLevel);

    return {
      type: "enemy",
      cardId: entry.id,
      instanceId: this.generateInstanceId(),
      order: 1,
      name: this.getLocalizedName(entry),
      level: safeLevel,
      time: entry.time,
      combatStat: entry.combatStat,
      strength: str,
      magic: mag,
      luck: lck,
      ...(entry.element ? { element: entry.element } : {}),
      ...(entry.loot ? { loot: entry.loot } : {}),
      ...(entry.effect ? { effect: entry.effect } : {}),
      ...(entry.categories ? { categories: entry.categories } : {}),
    };
  }

  private scaleStats(
    entry: EnemyCatalogEntry,
    level: number,
  ): { str: number; mag: number; lck: number } {
    let str = Math.max(1, Math.floor(Number(entry.baseStrength)));
    let mag = Math.max(1, Math.floor(Number(entry.baseMagic)));
    let lck = Math.max(1, Math.floor(Number(entry.baseLuck)));

    const bonusPoints = level - 1;
    if (bonusPoints <= 0) return { str, mag, lck };

    switch (entry.levelUpMode) {
      case "BestFirst":
        str += entry.combatStat === "strength" ? bonusPoints : 0;
        mag += entry.combatStat === "magic" ? bonusPoints : 0;
        break;

      case "Equal":
        str += this.equalBonus(bonusPoints, entry.combatStat, "strength");
        mag += this.equalBonus(bonusPoints, entry.combatStat, "magic");
        lck += this.equalBonus(bonusPoints, entry.combatStat, "luck");
        break;

      case "Lucky":
        lck += bonusPoints;
        break;
    }

    return { str, mag, lck };
  }

  /**
   * Computes how many bonus points go to `target` in a round-robin starting from `combatStat`.
   * Order: combatStat → next → next → repeat (STR → MAG → LCK → STR...)
   */
  private equalBonus(
    bonusPoints: number,
    combatStat: EnemyCombatStat,
    target: "strength" | "magic" | "luck",
  ): number {
    const order: Array<"strength" | "magic" | "luck"> = ["strength", "magic", "luck"];
    const startIndex = order.indexOf(combatStat);
    let count = 0;

    for (let i = 0; i < bonusPoints; i++) {
      const slot = order[(startIndex + i) % order.length];
      if (slot === target) count++;
    }

    return count;
  }

  private generateInstanceId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `enemy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private parseConfig(raw: unknown): EnemiesCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid enemies configuration: root object is missing");
    }

    const typed = raw as { enemies?: unknown };
    if (!Array.isArray(typed.enemies)) {
      throw new Error("Invalid enemies configuration: enemies array is missing");
    }

    const ids = new Set<string>();
    const enemies = typed.enemies.map((entry, index) => this.parseEnemy(entry, index));
    for (const enemy of enemies) {
      if (ids.has(enemy.id)) {
        throw new Error(`Invalid enemies configuration: duplicate enemy id '${enemy.id}'`);
      }
      ids.add(enemy.id);
    }

    return { enemies };
  }

  private parseEnemy(raw: unknown, index: number): EnemyCatalogEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid enemies configuration: enemy at index ${index} is not an object`);
    }

    const typed = raw as {
      id?: unknown;
      name?: unknown;
      nameKey?: unknown;
      combatStat?: unknown;
      levelUpMode?: unknown;
      time?: unknown;
      element?: unknown;
      baseStrength?: unknown;
      baseMagic?: unknown;
      baseLuck?: unknown;
      loot?: unknown;
      effect?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid enemies configuration: enemy at index ${index} has invalid id`);
    }

    if (typeof typed.name !== "string" || !typed.name.trim()) {
      throw new Error(`Invalid enemies configuration: enemy '${typed.id}' has invalid name`);
    }

    if (typed.combatStat !== "strength" && typed.combatStat !== "magic") {
      throw new Error(`Invalid enemies configuration: enemy '${typed.id}' has invalid combatStat`);
    }

    if (!this.isValidLevelUpMode(typed.levelUpMode)) {
      throw new Error(`Invalid enemies configuration: enemy '${typed.id}' has invalid levelUpMode`);
    }

    if (typed.time !== "day" && typed.time !== "night" && typed.time !== "both") {
      throw new Error(`Invalid enemies configuration: enemy '${typed.id}' has invalid time`);
    }

    if (typeof typed.element !== "undefined" && !this.isValidElement(typed.element)) {
      throw new Error(`Invalid enemies configuration: enemy '${typed.id}' has invalid element`);
    }

    const baseStrength = this.parseBaseStat(typed.baseStrength, typed.id, "baseStrength");
    const baseMagic = this.parseBaseStat(typed.baseMagic, typed.id, "baseMagic");
    const baseLuck = this.parseBaseStat(typed.baseLuck, typed.id, "baseLuck");

    return {
      id: typed.id,
      name: typed.name,
      ...(typeof typed.nameKey === "string" && typed.nameKey.trim() ? { nameKey: typed.nameKey } : {}),
      combatStat: typed.combatStat,
      levelUpMode: typed.levelUpMode,
      time: typed.time,
      ...(this.isValidElement(typed.element) ? { element: typed.element } : {}),
      baseStrength,
      baseMagic,
      baseLuck,
      ...(typed.loot ? { loot: this.parseLoot(typed.loot, typed.id) } : {}),
      ...(typeof typed.effect === "string" && typed.effect.trim() ? { effect: typed.effect.trim() } : {}),
    };
  }

  private parseBaseStat(raw: unknown, enemyId: string, field: string): number {
    const value = Math.floor(Number(raw ?? 0));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has invalid ${field}`);
    }

    return value;
  }

  private parseLoot(raw: unknown, enemyId: string): EnemyLoot | undefined {
    if (!Array.isArray(raw)) {
      throw new Error(`Invalid enemies configuration: enemy '${enemyId}' loot must be an array`);
    }

    if (raw.length === 0) return undefined;

    const validResources = new Set(["food", "timber", "minerals", "cloth"]);
    const tokens: LootToken[] = [];

    for (const item of raw) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const obj = item as { type?: unknown; dropRate?: unknown };
        if (typeof obj.type !== "string" || !obj.type.trim()) {
          throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has loot object with invalid type`);
        }
        const dropRate = Number(obj.dropRate);
        if (!Number.isFinite(dropRate) || dropRate < 0 || dropRate > 1) {
          throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has loot object with invalid dropRate`);
        }
        const type = obj.type.trim();
        this.validateLootType(type, enemyId, validResources);
        tokens.push({ type, dropRate });
        continue;
      }

      if (typeof item !== "string" || !item.trim()) {
        throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has invalid loot token`);
      }
      const token = item.trim();
      this.validateLootType(token, enemyId, validResources);
      tokens.push(token);
    }

    return tokens.length > 0 ? tokens : undefined;
  }

  private validateLootType(type: string, enemyId: string, validResources: Set<string>): void {
    if (type === "exp" || type === "gold" || type === "stolen-gold") return;

    if (type.startsWith("resource:")) {
      const resourceId = type.slice("resource:".length);
      if (!validResources.has(resourceId)) {
        throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has unknown resource '${resourceId}'`);
      }
      return;
    }

    if (type.startsWith("item:") || type.startsWith("magic:")) {
      const id = type.split(":")[1] ?? "";
      if (!id) {
        throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has malformed loot token '${type}'`);
      }
      return;
    }

    throw new Error(`Invalid enemies configuration: enemy '${enemyId}' has unknown loot token '${type}'`);
  }

  private isValidLevelUpMode(value: unknown): value is EnemyLevelUpMode {
    return value === "BestFirst" || value === "Equal" || value === "Lucky";
  }

  private isValidElement(value: unknown): value is "fire" | "earth" | "wind" | "water" {
    return value === "fire" || value === "earth" || value === "wind" || value === "water";
  }
}
