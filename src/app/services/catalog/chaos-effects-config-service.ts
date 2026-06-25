import { Injectable } from "@angular/core";
import {
  ChaosEffectDefinition,
  ChaosEffectDialogRow,
  ChaosEffectsConfig,
} from "@models/catalog/ChaosEffectsConfig";
import { TranslationService } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class ChaosEffectsConfigService {
  constructor(private translationService: TranslationService) {}

  private readonly configUrl = "/configs/variable-rewards-action-configs/chaos-effects.config.json";
  private configCache: ChaosEffectsConfig | null = null;
  private loadingPromise: Promise<ChaosEffectsConfig> | null = null;

  public async loadConfig(): Promise<ChaosEffectsConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: { "content-type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Unable to load chaos effects configuration");
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

  public async buildDialogRows(): Promise<ChaosEffectDialogRow[]> {
    const config = await this.loadConfig();
    const totalWeight = config.effects.reduce((sum, e) => sum + e.weight, 0);
    return config.effects.map((effect) => ({
      id: effect.id,
      weightLabel: totalWeight > 0 ? `${Math.round((effect.weight / totalWeight) * 100)}%` : "-",
      effectLabel: this.getLocalizedLabel(effect),
    }));
  }

  public getLocalizedLabel(effect: ChaosEffectDefinition): string {
    if (typeof effect.labelKey === "string" && effect.labelKey.trim()) {
      return this.translationService.tOrFallback(effect.labelKey, effect.label);
    }
    return effect.label;
  }

  private parseConfig(raw: unknown): ChaosEffectsConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid chaos effects configuration: root object is missing");
    }

    const typed = raw as { effects?: unknown };
    if (!Array.isArray(typed.effects) || typed.effects.length === 0) {
      throw new Error("Invalid chaos effects configuration: effects array is missing");
    }

    const effects = typed.effects.map((entry, index) => this.parseEffect(entry, index));
    return { effects };
  }

  private parseEffect(raw: unknown, index: number): ChaosEffectDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid chaos effects config: entry at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      weight?: unknown;
      label?: unknown;
      labelKey?: unknown;
      effectType?: unknown;
      statusKey?: unknown;
      durationTurns?: unknown;
      amount?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid chaos effects config: entry at index ${index} has invalid id`);
    }

    if (typeof typed.weight !== "number" || !Number.isFinite(typed.weight) || typed.weight < 0) {
      throw new Error(`Invalid chaos effects config: effect '${typed.id}' has invalid weight`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid chaos effects config: effect '${typed.id}' has invalid label`);
    }

    const validTypes = ["apply-status", "steal-coins", "drain-mp"];
    if (!validTypes.includes(typed.effectType as string)) {
      throw new Error(`Invalid chaos effects config: effect '${typed.id}' has invalid effectType`);
    }

    return {
      id: typed.id,
      weight: typed.weight,
      label: typed.label,
      ...(typeof typed.labelKey === "string" ? { labelKey: typed.labelKey } : {}),
      effectType: typed.effectType as ChaosEffectDefinition["effectType"],
      ...(typeof typed.statusKey === "string" ? { statusKey: typed.statusKey } : {}),
      ...(typeof typed.durationTurns === "number" ? { durationTurns: Math.max(1, Math.floor(typed.durationTurns)) } : {}),
      ...(typeof typed.amount === "number" ? { amount: Math.max(1, Math.floor(typed.amount)) } : {}),
    };
  }
}
