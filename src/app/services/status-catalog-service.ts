import { Injectable } from "@angular/core";
import {
  StatusDefinition,
  StatusEffectsDefinition,
  StatusI18nKeys,
  StatusesCatalogConfig,
  StatusStatModifiers,
} from "../models/StatusCatalog";
import { TranslationService } from "./translation-service";

@Injectable({
  providedIn: "root",
})
export class StatusCatalogService {
  private readonly configUrl = "/configs/statuses.config.json";
  private configCache: StatusesCatalogConfig | null = null;
  private loadingPromise: Promise<StatusesCatalogConfig> | null = null;
  private statusesByKey: Record<string, StatusDefinition> = {};

  constructor(private translationService: TranslationService) {}

  public async loadConfig(): Promise<StatusesCatalogConfig> {
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
        throw new Error("Unable to load statuses catalog");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseConfig(raw);
      this.configCache = parsed;
      this.statusesByKey = this.toMap(parsed.statuses);
      return parsed;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public getStatus(key: string): StatusDefinition | null {
    return this.statusesByKey[key] ?? null;
  }

  public getCachedStatus(key: string): StatusDefinition | null {
    if (!this.configCache) {
      return null;
    }

    return this.statusesByKey[key] ?? null;
  }

  public getLocalizedLabel(statusKey: string, fallback: string): string {
    const status = this.statusesByKey[statusKey];
    const configuredFallback = typeof status?.label === "string" && status.label.trim().length > 0
      ? status.label
      : fallback;
    return this.translationService.tOrFallback(status?.i18n?.labelKey, configuredFallback);
  }

  public getLocalizedDescription(statusKey: string, fallback: string): string {
    const status = this.statusesByKey[statusKey];
    const configuredFallback = typeof status?.description === "string" && status.description.trim().length > 0
      ? status.description
      : fallback;
    return this.translationService.tOrFallback(status?.i18n?.descriptionKey, configuredFallback);
  }

  private parseConfig(raw: unknown): StatusesCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid statuses catalog: root object is missing");
    }

    const typed = raw as { statuses?: unknown };
    if (!Array.isArray(typed.statuses) || typed.statuses.length === 0) {
      throw new Error("Invalid statuses catalog: statuses array is missing");
    }

    return {
      statuses: typed.statuses.map((entry, index) => this.parseStatus(entry, index)),
    };
  }

  private parseStatus(raw: unknown, index: number): StatusDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid statuses catalog: status at index ${index} is invalid`);
    }

    const typed = raw as {
      key?: unknown;
      label?: unknown;
      description?: unknown;
      defaultDurationTurns?: unknown;
      iconUrl?: unknown;
      i18n?: unknown;
      effects?: unknown;
      effectKey?: unknown;
    };

    if (typeof typed.key !== "string" || !typed.key.trim()) {
      throw new Error(`Invalid statuses catalog: status at index ${index} has invalid key`);
    }

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid statuses catalog: status '${typed.key}' has invalid label`);
    }

    if (typeof typed.description !== "string" || !typed.description.trim()) {
      throw new Error(`Invalid statuses catalog: status '${typed.key}' has invalid description`);
    }

    if (typeof typed.defaultDurationTurns !== "number" || !Number.isFinite(typed.defaultDurationTurns) || typed.defaultDurationTurns <= 0) {
      throw new Error(`Invalid statuses catalog: status '${typed.key}' has invalid defaultDurationTurns`);
    }

    if (typeof typed.iconUrl !== "undefined" && (typeof typed.iconUrl !== "string" || !typed.iconUrl.trim())) {
      throw new Error(`Invalid statuses catalog: status '${typed.key}' has invalid iconUrl`);
    }

    if (typeof typed.effectKey !== "undefined" && (typeof typed.effectKey !== "string" || !typed.effectKey.trim())) {
      throw new Error(`Invalid statuses catalog: status '${typed.key}' has invalid effectKey`);
    }

    return {
      key: typed.key,
      label: typed.label,
      description: typed.description,
      defaultDurationTurns: Math.max(1, Math.floor(typed.defaultDurationTurns)),
      iconUrl: typed.iconUrl,
      i18n: this.parseI18n(typed.i18n, typed.key),
      effects: this.parseEffects(typed.effects, typed.key),
      effectKey: typed.effectKey,
    };
  }

  private parseI18n(raw: unknown, statusKey: string): StatusI18nKeys | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid i18n section`);
    }

    const typed = raw as {
      labelKey?: unknown;
      descriptionKey?: unknown;
    };

    if (typeof typed.labelKey !== "undefined" && (typeof typed.labelKey !== "string" || !typed.labelKey.trim())) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid i18n.labelKey`);
    }

    if (typeof typed.descriptionKey !== "undefined" && (typeof typed.descriptionKey !== "string" || !typed.descriptionKey.trim())) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid i18n.descriptionKey`);
    }

    return {
      labelKey: typed.labelKey,
      descriptionKey: typed.descriptionKey,
    };
  }

  private parseEffects(raw: unknown, statusKey: string): StatusEffectsDefinition | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects section`);
    }

    const typed = raw as {
      turnEndHpPercentDelta?: unknown;
      skipTurns?: unknown;
      disableMpNaturalRegen?: unknown;
      disableSpellCasting?: unknown;
      luckBonusMultiplier?: unknown;
      setPrimaryStatsTo?: unknown;
      disableHpRecovery?: unknown;
      disableMpRecovery?: unknown;
      disableItemUse?: unknown;
      statModifiers?: unknown;
    };

    if (typeof typed.turnEndHpPercentDelta !== "undefined" && !this.isFiniteNumber(typed.turnEndHpPercentDelta)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.turnEndHpPercentDelta`);
    }

    if (typeof typed.skipTurns !== "undefined" && !this.isPositiveInteger(typed.skipTurns)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.skipTurns`);
    }

    if (typeof typed.disableMpNaturalRegen !== "undefined" && typeof typed.disableMpNaturalRegen !== "boolean") {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.disableMpNaturalRegen`);
    }

    if (typeof typed.disableSpellCasting !== "undefined" && typeof typed.disableSpellCasting !== "boolean") {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.disableSpellCasting`);
    }

    if (typeof typed.luckBonusMultiplier !== "undefined" && (!this.isFiniteNumber(typed.luckBonusMultiplier) || typed.luckBonusMultiplier <= 0)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.luckBonusMultiplier`);
    }

    if (typeof typed.setPrimaryStatsTo !== "undefined" && !this.isNonNegativeInteger(typed.setPrimaryStatsTo)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.setPrimaryStatsTo`);
    }

    if (typeof typed.disableHpRecovery !== "undefined" && typeof typed.disableHpRecovery !== "boolean") {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.disableHpRecovery`);
    }

    if (typeof typed.disableMpRecovery !== "undefined" && typeof typed.disableMpRecovery !== "boolean") {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.disableMpRecovery`);
    }

    if (typeof typed.disableItemUse !== "undefined" && typeof typed.disableItemUse !== "boolean") {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.disableItemUse`);
    }

    return {
      turnEndHpPercentDelta: typed.turnEndHpPercentDelta,
      skipTurns: typed.skipTurns,
      disableMpNaturalRegen: typed.disableMpNaturalRegen,
      disableSpellCasting: typed.disableSpellCasting,
      luckBonusMultiplier: typed.luckBonusMultiplier,
      setPrimaryStatsTo: typed.setPrimaryStatsTo,
      disableHpRecovery: typed.disableHpRecovery,
      disableMpRecovery: typed.disableMpRecovery,
      disableItemUse: typed.disableItemUse,
      statModifiers: this.parseStatModifiers(typed.statModifiers, statusKey),
    };
  }

  private parseStatModifiers(raw: unknown, statusKey: string): StatusStatModifiers | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.statModifiers`);
    }

    const typed = raw as {
      strength?: unknown;
      magic?: unknown;
      luck?: unknown;
    };

    if (typeof typed.strength !== "undefined" && !this.isFiniteNumber(typed.strength)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.statModifiers.strength`);
    }

    if (typeof typed.magic !== "undefined" && !this.isFiniteNumber(typed.magic)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.statModifiers.magic`);
    }

    if (typeof typed.luck !== "undefined" && !this.isFiniteNumber(typed.luck)) {
      throw new Error(`Invalid statuses catalog: status '${statusKey}' has invalid effects.statModifiers.luck`);
    }

    return {
      strength: typed.strength,
      magic: typed.magic,
      luck: typed.luck,
    };
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return this.isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
  }

  private isPositiveInteger(value: unknown): value is number {
    return this.isFiniteNumber(value) && Number.isInteger(value) && value > 0;
  }

  private toMap(statuses: StatusDefinition[]): Record<string, StatusDefinition> {
    const mapped: Record<string, StatusDefinition> = {};

    for (const status of statuses) {
      if (mapped[status.key]) {
        throw new Error(`Invalid statuses catalog: duplicate status key '${status.key}'`);
      }

      mapped[status.key] = status;
    }

    return mapped;
  }
}
