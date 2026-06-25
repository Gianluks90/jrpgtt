import { Injectable } from "@angular/core";
import { SanctuaryElement } from "@models/world/MapCell";
import { FollowerUpgradeDefinition, FollowerUpgradesConfig } from "@models/player/FollowerUpgrade";
import { FollowerParameterModifier, FollowerEffectScope } from "@models/player/FollowerCatalog";
import { TranslationService } from "@services/shared/translation-service";

const ELEMENTAL_UPGRADE_PREFIX = "elemental-";

@Injectable({ providedIn: "root" })
export class FollowerUpgradeService {
  private readonly configUrl = "/configs/follower-upgrades.config.json";
  private configCache: FollowerUpgradesConfig | null = null;
  private configLoadPromise: Promise<FollowerUpgradesConfig> | null = null;

  constructor(private translationService: TranslationService) {}

  public async loadConfig(): Promise<FollowerUpgradesConfig> {
    if (this.configCache) return this.configCache;
    if (this.configLoadPromise) return this.configLoadPromise;

    this.configLoadPromise = (async () => {
      const response = await fetch(this.configUrl, { headers: { "content-type": "application/json" } });
      if (!response.ok) throw new Error("Unable to load follower upgrades configuration");
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

  public getCachedUpgradeById(upgradeId: string): FollowerUpgradeDefinition | null {
    const normalized = String(upgradeId ?? "").trim();
    if (!normalized || !this.configCache) return null;
    return this.configCache.upgrades.find((u) => u.id === normalized) ?? null;
  }

  public getElementalUpgradeIdForElement(element: SanctuaryElement): string {
    return `${ELEMENTAL_UPGRADE_PREFIX}${element}`;
  }

  public hasElementalUpgrade(upgrades: string[] | undefined): boolean {
    return (upgrades ?? []).some((id) => id.startsWith(ELEMENTAL_UPGRADE_PREFIX));
  }

  public getLocalizedNameSuffix(upgradeId: string): string {
    const upgrade = this.getCachedUpgradeById(upgradeId);
    if (!upgrade) return "";
    return this.translationService.tOrFallback(upgrade.nameSuffixKey, upgrade.id);
  }

  public resolveParameterModifiers(upgrades: string[] | undefined): FollowerParameterModifier[] {
    if (!upgrades || upgrades.length === 0) return [];
    const result: FollowerParameterModifier[] = [];
    for (const upgradeId of upgrades) {
      const upgrade = this.getCachedUpgradeById(upgradeId);
      if (upgrade?.parameterModifiers) {
        result.push(...upgrade.parameterModifiers);
      }
    }
    return result;
  }

  public resolveHpFloor(upgrades: string[] | undefined): number {
    if (!upgrades || upgrades.length === 0) return 0;
    let floor = 0;
    for (const upgradeId of upgrades) {
      const upgrade = this.getCachedUpgradeById(upgradeId);
      if (upgrade?.hpFloor && upgrade.hpFloor > floor) {
        floor = upgrade.hpFloor;
      }
    }
    return floor;
  }

  private parseConfig(raw: unknown): FollowerUpgradesConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid follower upgrades configuration");
    }
    const root = raw as { upgrades?: unknown };
    if (!Array.isArray(root.upgrades)) {
      throw new Error("Invalid follower upgrades configuration: upgrades array is missing");
    }

    const upgradeIds = new Set<string>();
    const upgrades = root.upgrades.map((entry, index) => this.parseUpgrade(entry, index));
    upgrades.forEach((u) => {
      if (upgradeIds.has(u.id)) throw new Error(`Duplicate follower upgrade id '${u.id}'`);
      upgradeIds.add(u.id);
    });
    return { upgrades };
  }

  private parseUpgrade(raw: unknown, index: number): FollowerUpgradeDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid follower upgrade at index ${index}`);
    }
    const typed = raw as { id?: unknown; element?: unknown; nameSuffixKey?: unknown; hpFloor?: unknown; parameterModifiers?: unknown };

    if (typeof typed.id !== "string" || !typed.id.trim()) throw new Error(`Follower upgrade at index ${index} has invalid id`);
    if (typed.element !== "fire" && typed.element !== "water" && typed.element !== "wind" && typed.element !== "earth") {
      throw new Error(`Follower upgrade '${typed.id}' has invalid element`);
    }
    if (typeof typed.nameSuffixKey !== "string" || !typed.nameSuffixKey.trim()) {
      throw new Error(`Follower upgrade '${typed.id}' has invalid nameSuffixKey`);
    }
    const hpFloor = Math.max(0, Math.floor(Number(typed.hpFloor ?? 0)));

    const parameterModifiers = this.parseModifiers(typed.parameterModifiers, typed.id);
    return { id: typed.id, element: typed.element, nameSuffixKey: typed.nameSuffixKey, hpFloor, parameterModifiers };
  }

  private parseModifiers(raw: unknown, upgradeId: string): FollowerParameterModifier[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, index) => {
      const typed = entry as { parameter?: unknown; amount?: unknown; scope?: unknown };
      if (typed.parameter !== "strength" && typed.parameter !== "magic" && typed.parameter !== "luck") {
        throw new Error(`Upgrade '${upgradeId}' modifier at index ${index} has invalid parameter`);
      }
      const amount = Number(typed.amount);
      if (!Number.isFinite(amount) || Math.floor(amount) !== amount) {
        throw new Error(`Upgrade '${upgradeId}' modifier at index ${index} has invalid amount`);
      }
      const scope = typed.scope as FollowerEffectScope;
      if (!["always", "fight-only", "magic-fight-only", "day-only", "night-only"].includes(scope)) {
        throw new Error(`Upgrade '${upgradeId}' modifier at index ${index} has invalid scope`);
      }
      return { parameter: typed.parameter, amount, scopes: [scope] };
    });
  }
}
