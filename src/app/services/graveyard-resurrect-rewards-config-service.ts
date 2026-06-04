import { Injectable } from "@angular/core";
import {
  GraveyardResurrectRewardDefinition,
  GraveyardResurrectRewardDialogRow,
  GraveyardResurrectRewardsConfig,
} from "../models/GraveyardResurrectRewardsConfig";

@Injectable({
  providedIn: "root",
})
export class GraveyardResurrectRewardsConfigService {
  private readonly configUrl = "/configs/variable-rewards-action-configs/graveyard-resurrect.config.json";
  private configCache: GraveyardResurrectRewardsConfig | null = null;
  private loadingPromise: Promise<GraveyardResurrectRewardsConfig> | null = null;

  public async loadConfig(): Promise<GraveyardResurrectRewardsConfig> {
    if (this.configCache) return this.configCache;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load graveyard resurrect rewards configuration");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      return parsed;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public async resolveRewardByTotal(total: number): Promise<GraveyardResurrectRewardDefinition> {
    const config = await this.loadConfig();
    const normalizedTotal = this.normalizeTotal(total);
    const reward = config.rewards.find((entry) => {
      return normalizedTotal >= entry.minTotal && normalizedTotal <= entry.maxTotal;
    });

    if (!reward) {
      throw new Error(`Unable to resolve graveyard resurrection reward for total '${normalizedTotal}'`);
    }

    return reward;
  }

  public async buildDialogRows(): Promise<GraveyardResurrectRewardDialogRow[]> {
    const config = await this.loadConfig();
    return config.rewards.map((reward) => ({
      id: reward.id,
      rangeLabel: reward.minTotal === reward.maxTotal ? `${reward.minTotal}` : `${reward.minTotal}-${reward.maxTotal}`,
      effectLabel: reward.previewLabel,
    }));
  }

  private parseConfig(raw: unknown): GraveyardResurrectRewardsConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid graveyard resurrect rewards configuration: root object is missing");
    }

    const typed = raw as { rewards?: unknown };
    if (!Array.isArray(typed.rewards) || typed.rewards.length === 0) {
      throw new Error("Invalid graveyard resurrect rewards configuration: rewards array is missing");
    }

    const rewards = typed.rewards.map((entry, index) => this.parseReward(entry, index));
    this.validateRewardsCoverage(rewards);

    return { rewards };
  }

  private parseReward(raw: unknown, index: number): GraveyardResurrectRewardDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      minTotal?: unknown;
      maxTotal?: unknown;
      label?: unknown;
      previewLabel?: unknown;
      playerHpDamagePercent?: unknown;
      summonZombie?: unknown;
      reviveTarget?: unknown;
      markAsUndead?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward at index ${index} has invalid id`);
    }

    if (!this.isPositiveInteger(typed.minTotal) || !this.isPositiveInteger(typed.maxTotal)) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid range`);
    }

    const minTotal = Math.max(1, Math.floor(Number(typed.minTotal)));
    const maxTotal = Math.min(100, Math.floor(Number(typed.maxTotal)));
    if (minTotal > maxTotal) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' minTotal is greater than maxTotal`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid label`);
    }

    if (typeof typed.previewLabel !== "string" || !typed.previewLabel.trim()) {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid previewLabel`);
    }

    if (typeof typed.playerHpDamagePercent !== "undefined") {
      const value = Number(typed.playerHpDamagePercent);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid playerHpDamagePercent`);
      }
    }

    if (typeof typed.summonZombie !== "undefined" && typeof typed.summonZombie !== "boolean") {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid summonZombie`);
    }

    if (typeof typed.reviveTarget !== "undefined" && typed.reviveTarget !== "one-hp" && typed.reviveTarget !== "full") {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid reviveTarget`);
    }

    if (typeof typed.markAsUndead !== "undefined" && typeof typed.markAsUndead !== "boolean") {
      throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${typed.id}' has invalid markAsUndead`);
    }

    return {
      id: typed.id,
      minTotal,
      maxTotal,
      label: typed.label,
      previewLabel: typed.previewLabel,
      ...(typeof typed.playerHpDamagePercent === "number" ? { playerHpDamagePercent: typed.playerHpDamagePercent } : {}),
      ...(typed.summonZombie === true ? { summonZombie: true } : {}),
      ...(typed.reviveTarget === "one-hp" || typed.reviveTarget === "full" ? { reviveTarget: typed.reviveTarget } : {}),
      ...(typed.markAsUndead === true ? { markAsUndead: true } : {}),
    };
  }

  private validateRewardsCoverage(rewards: GraveyardResurrectRewardDefinition[]): void {
    const ids = new Set<string>();
    const coveredSlots = Array.from({ length: 101 }, () => false);

    for (const reward of rewards) {
      if (ids.has(reward.id)) {
        throw new Error(`Invalid graveyard resurrect rewards configuration: duplicate reward id '${reward.id}'`);
      }
      ids.add(reward.id);

      for (let slot = reward.minTotal; slot <= reward.maxTotal; slot += 1) {
        if (slot < 1 || slot > 100) {
          throw new Error(`Invalid graveyard resurrect rewards configuration: reward '${reward.id}' has out-of-range slot`);
        }

        if (coveredSlots[slot]) {
          throw new Error(`Invalid graveyard resurrect rewards configuration: slot ${slot} is covered by multiple rewards`);
        }

        coveredSlots[slot] = true;
      }
    }

    for (let slot = 1; slot <= 100; slot += 1) {
      if (!coveredSlots[slot]) {
        throw new Error(`Invalid graveyard resurrect rewards configuration: slot ${slot} is not covered by any reward`);
      }
    }
  }

  private normalizeTotal(total: number): number {
    if (!Number.isFinite(total)) return 1;
    return Math.max(1, Math.min(100, Math.floor(total)));
  }

  private isPositiveInteger(value: unknown): boolean {
    return this.isNonNegativeInteger(value) && Number(value) > 0;
  }

  private isNonNegativeInteger(value: unknown): boolean {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    return value >= 0 && Math.floor(value) === value;
  }
}
