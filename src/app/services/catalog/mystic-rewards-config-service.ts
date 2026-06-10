import { Injectable } from "@angular/core";
import { PlayerAlignment } from "@models/player/Player";
import { MysticRewardDefinition, MysticRewardDialogRow, MysticRewardsConfig } from "@models/catalog/MysticRewardsConfig";
import { TranslationService } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class MysticRewardsConfigService {
  constructor(private translationService: TranslationService) {}

  private readonly configUrl = "/configs/variable-rewards-action-configs/mystic-rewards.config.json";
  private configCache: MysticRewardsConfig | null = null;
  private loadingPromise: Promise<MysticRewardsConfig> | null = null;

  public async loadConfig(): Promise<MysticRewardsConfig> {
    if (this.configCache) return this.configCache;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load mystic rewards configuration");
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

  public async resolveRewardByTotal(total: number): Promise<MysticRewardDefinition> {
    const config = await this.loadConfig();
    const normalizedTotal = this.normalizeTotal(total);
    const reward = config.rewards.find((entry) => {
      return normalizedTotal >= entry.minTotal && normalizedTotal <= entry.maxTotal;
    });

    if (!reward) {
      throw new Error(`Unable to resolve mystic reward for total '${normalizedTotal}'`);
    }

    return reward;
  }

  public async buildDialogRows(): Promise<MysticRewardDialogRow[]> {
    const config = await this.loadConfig();
    return config.rewards.map((reward) => ({
      id: reward.id,
      rangeLabel: reward.minTotal === reward.maxTotal ? `${reward.minTotal}` : `${reward.minTotal}-${reward.maxTotal}`,
      effectLabel: this.getLocalizedPreviewLabel(reward),
    }));
  }

  public getLocalizedLabel(reward: MysticRewardDefinition): string {
    if (typeof reward.labelKey === "string" && reward.labelKey.trim()) {
      return this.translationService.tOrFallback(reward.labelKey, reward.label);
    }

    return reward.label;
  }

  public getLocalizedPreviewLabel(reward: MysticRewardDefinition): string {
    if (typeof reward.previewLabelKey === "string" && reward.previewLabelKey.trim()) {
      return this.translationService.tOrFallback(reward.previewLabelKey, reward.previewLabel);
    }

    return reward.previewLabel;
  }

  private parseConfig(raw: unknown): MysticRewardsConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid mystic rewards configuration: root object is missing");
    }

    const typed = raw as { rewards?: unknown };
    if (!Array.isArray(typed.rewards) || typed.rewards.length === 0) {
      throw new Error("Invalid mystic rewards configuration: rewards array is missing");
    }

    const rewards = typed.rewards.map((entry, index) => this.parseReward(entry, index));
    this.validateRewardsCoverage(rewards);

    return { rewards };
  }

  private parseReward(raw: unknown, index: number): MysticRewardDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid mystic rewards configuration: reward at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      minTotal?: unknown;
      maxTotal?: unknown;
      label?: unknown;
      previewLabel?: unknown;
      labelKey?: unknown;
      previewLabelKey?: unknown;
      alignment?: unknown;
      experienceGain?: unknown;
      grantLevelUp?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid mystic rewards configuration: reward at index ${index} has invalid id`);
    }

    if (!this.isPositiveInteger(typed.minTotal) || !this.isPositiveInteger(typed.maxTotal)) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid range`);
    }

    const minTotal = Math.max(1, Math.floor(Number(typed.minTotal)));
    const maxTotal = Math.min(100, Math.floor(Number(typed.maxTotal)));
    if (minTotal > maxTotal) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' minTotal is greater than maxTotal`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid label`);
    }

    if (typeof typed.previewLabel !== "string" || !typed.previewLabel.trim()) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid previewLabel`);
    }

    if (typeof typed.labelKey !== "undefined" && (typeof typed.labelKey !== "string" || !typed.labelKey.trim())) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid labelKey`);
    }

    if (typeof typed.previewLabelKey !== "undefined"
      && (typeof typed.previewLabelKey !== "string" || !typed.previewLabelKey.trim())) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid previewLabelKey`);
    }

    if (typeof typed.alignment !== "undefined" && typed.alignment !== null && !this.isAlignment(typed.alignment)) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid alignment`);
    }

    if (typeof typed.experienceGain !== "undefined" && !this.isNonNegativeInteger(typed.experienceGain)) {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid experienceGain`);
    }

    if (typeof typed.grantLevelUp !== "undefined" && typeof typed.grantLevelUp !== "boolean") {
      throw new Error(`Invalid mystic rewards configuration: reward '${typed.id}' has invalid grantLevelUp`);
    }

    return {
      id: typed.id,
      minTotal,
      maxTotal,
      label: typed.label,
      previewLabel: typed.previewLabel,
      ...(typeof typed.labelKey === "string" ? { labelKey: typed.labelKey } : {}),
      ...(typeof typed.previewLabelKey === "string" ? { previewLabelKey: typed.previewLabelKey } : {}),
      alignment: (typeof typed.alignment === "undefined" ? undefined : typed.alignment) as PlayerAlignment | null | undefined,
      experienceGain: typeof typed.experienceGain === "number" ? Math.max(0, Math.floor(typed.experienceGain)) : undefined,
      grantLevelUp: typed.grantLevelUp === true,
    };
  }

  private validateRewardsCoverage(rewards: MysticRewardDefinition[]): void {
    const ids = new Set<string>();
    const coveredSlots = Array.from({ length: 101 }, () => false);

    for (const reward of rewards) {
      if (ids.has(reward.id)) {
        throw new Error(`Invalid mystic rewards configuration: duplicate reward id '${reward.id}'`);
      }
      ids.add(reward.id);

      for (let slot = reward.minTotal; slot <= reward.maxTotal; slot += 1) {
        if (slot < 1 || slot > 100) {
          throw new Error(`Invalid mystic rewards configuration: reward '${reward.id}' has out-of-range slot`);
        }

        if (coveredSlots[slot]) {
          throw new Error(`Invalid mystic rewards configuration: slot ${slot} is covered by multiple rewards`);
        }

        coveredSlots[slot] = true;
      }
    }

    for (let slot = 1; slot <= 100; slot += 1) {
      if (!coveredSlots[slot]) {
        throw new Error(`Invalid mystic rewards configuration: slot ${slot} is not covered by any reward`);
      }
    }
  }

  private normalizeTotal(total: number): number {
    if (!Number.isFinite(total)) return 1;
    return Math.max(1, Math.min(100, Math.floor(total)));
  }

  private isAlignment(value: unknown): value is PlayerAlignment {
    return value === "good" || value === "neutral" || value === "evil";
  }

  private isPositiveInteger(value: unknown): boolean {
    return this.isNonNegativeInteger(value) && Number(value) > 0;
  }

  private isNonNegativeInteger(value: unknown): boolean {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    return value >= 0 && Math.floor(value) === value;
  }
}
