import { Injectable } from "@angular/core";
import {
  EnchantressRewardDefinition,
  EnchantressRewardDialogRow,
  EnchantressRewardsConfig,
} from "../models/EnchantressRewardsConfig";

@Injectable({
  providedIn: "root",
})
export class EnchantressRewardsConfigService {
  private readonly configUrl = "/configs/variable-rewards-action-configs/enchantress-rewards.config.json";
  private configCache: EnchantressRewardsConfig | null = null;
  private loadingPromise: Promise<EnchantressRewardsConfig> | null = null;

  public async loadConfig(): Promise<EnchantressRewardsConfig> {
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
        throw new Error("Unable to load enchantress rewards configuration");
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

  public async resolveRewardByTotal(total: number): Promise<EnchantressRewardDefinition> {
    const config = await this.loadConfig();
    const clampedTotal = this.normalizeTotal(total);
    const reward = config.rewards.find((entry) => {
      return clampedTotal >= entry.minTotal && clampedTotal <= entry.maxTotal;
    });

    if (!reward) {
      throw new Error(`Unable to resolve enchantress reward for total '${clampedTotal}'`);
    }

    return reward;
  }

  public async buildDialogRows(): Promise<EnchantressRewardDialogRow[]> {
    const config = await this.loadConfig();
    return config.rewards.map((reward) => {
      return {
        id: reward.id,
        rangeLabel: `${reward.minTotal}-${reward.maxTotal}`,
        effectLabel: reward.previewLabel,
      };
    });
  }

  private parseConfig(raw: unknown): EnchantressRewardsConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid enchantress rewards configuration: root object is missing");
    }

    const typed = raw as {
      rewards?: unknown;
    };

    if (!Array.isArray(typed.rewards) || typed.rewards.length === 0) {
      throw new Error("Invalid enchantress rewards configuration: rewards array is missing");
    }

    const rewards = typed.rewards.map((entry, index) => this.parseReward(entry, index));
    this.validateRewardsCoverage(rewards);

    return { rewards };
  }

  private parseReward(raw: unknown, index: number): EnchantressRewardDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid enchantress rewards configuration: reward at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      minTotal?: unknown;
      maxTotal?: unknown;
      label?: unknown;
      previewLabel?: unknown;
      pendingMagicReward?: unknown;
      statuses?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid enchantress rewards configuration: reward at index ${index} has invalid id`);
    }

    if (!this.isPositiveInteger(typed.minTotal)) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid minTotal`);
    }

    if (!this.isPositiveInteger(typed.maxTotal)) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid maxTotal`);
    }

    const minTotal = Math.max(1, Math.floor(Number(typed.minTotal)));
    const maxTotal = Math.min(100, Math.floor(Number(typed.maxTotal)));
    if (minTotal > maxTotal) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' minTotal is greater than maxTotal`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid label`);
    }

    if (typeof typed.previewLabel !== "string" || !typed.previewLabel.trim()) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid previewLabel`);
    }

    if (typeof typed.pendingMagicReward !== "undefined" && typeof typed.pendingMagicReward !== "boolean") {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid pendingMagicReward`);
    }

    if (!Array.isArray(typed.statuses)) {
      throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' has invalid statuses array`);
    }

    const statuses = typed.statuses.map((entry, statusIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' status at index ${statusIndex} is invalid`);
      }

      const typedStatus = entry as {
        key?: unknown;
        durationTurns?: unknown;
      };

      if (typeof typedStatus.key !== "string" || !typedStatus.key.trim()) {
        throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' status at index ${statusIndex} has invalid key`);
      }

      if (!this.isPositiveInteger(typedStatus.durationTurns)) {
        throw new Error(`Invalid enchantress rewards configuration: reward '${typed.id}' status '${typedStatus.key}' has invalid durationTurns`);
      }

      return {
        key: typedStatus.key,
        durationTurns: Math.max(1, Math.floor(Number(typedStatus.durationTurns))),
      };
    });

    return {
      id: typed.id,
      minTotal,
      maxTotal,
      label: typed.label,
      previewLabel: typed.previewLabel,
      pendingMagicReward: typed.pendingMagicReward,
      statuses,
    };
  }

  private validateRewardsCoverage(rewards: EnchantressRewardDefinition[]): void {
    const ids = new Set<string>();
    const coveredSlots = Array.from({ length: 101 }, () => false);

    for (const reward of rewards) {
      if (ids.has(reward.id)) {
        throw new Error(`Invalid enchantress rewards configuration: duplicate reward id '${reward.id}'`);
      }
      ids.add(reward.id);

      for (let slot = reward.minTotal; slot <= reward.maxTotal; slot += 1) {
        if (slot < 1 || slot > 100) {
          throw new Error(`Invalid enchantress rewards configuration: reward '${reward.id}' has out-of-range slot`);
        }

        if (coveredSlots[slot]) {
          throw new Error(`Invalid enchantress rewards configuration: slot ${slot} is covered by multiple rewards`);
        }

        coveredSlots[slot] = true;
      }
    }

    for (let slot = 1; slot <= 100; slot += 1) {
      if (!coveredSlots[slot]) {
        throw new Error(`Invalid enchantress rewards configuration: slot ${slot} is not covered by any reward`);
      }
    }
  }

  private normalizeTotal(total: number): number {
    if (!Number.isFinite(total)) {
      return 1;
    }

    return Math.max(1, Math.min(100, Math.floor(total)));
  }

  private isPositiveInteger(value: unknown): boolean {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return false;
    }

    return value > 0 && Math.floor(value) === value;
  }
}
