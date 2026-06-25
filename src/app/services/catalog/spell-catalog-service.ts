import { Injectable } from "@angular/core";
import {
  SpellCatalogEntry,
  SpellCastTiming,
  SpellCatalogUiDefinition,
  SpellAcquisitionDefinition,
  SpellEffectDefinition,
  SpellEffectType,
  SpellsCatalogConfig,
} from "@models/catalog/SpellCatalog";
import { SanctuaryElement } from "@models/world/MapCell";
import { DEFAULT_SPELLS_CATALOG_CONFIG } from "../../consts/catalog/spells-catalog-default";
import { DEFAULT_SPELLBOOK_CAPACITY } from "../../consts/player/spellbook-config";
import { TranslationService } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class SpellCatalogService {
  private readonly spellsConfigUrl = "/configs/spells.config.json";
  private hasLoadedRemoteConfig = false;
  private spellsById = this.toMap(DEFAULT_SPELLS_CATALOG_CONFIG.spells);
  private defaultSpellbookCapacity = DEFAULT_SPELLS_CATALOG_CONFIG.spellbook.defaultCapacity;

  constructor(private translationService: TranslationService) {}

  public getSpell(spellId: string): SpellCatalogEntry | null {
    return this.spellsById[spellId] ?? null;
  }

  public getAllSpells(): SpellCatalogEntry[] {
    return Object.values(this.spellsById);
  }

  public getDefaultSpellbookCapacity(): number {
    return Math.max(1, Math.floor(Number(this.defaultSpellbookCapacity ?? DEFAULT_SPELLBOOK_CAPACITY)));
  }

  public getLocalizedName(spell: SpellCatalogEntry): string {
    const key = spell.ui.i18n?.nameKey;
    if (typeof key === "string" && key.trim().length > 0) {
      return this.translationService.tOrFallback(key, spell.ui.name);
    }

    return spell.ui.name;
  }

  public getLocalizedDescription(spell: SpellCatalogEntry): string {
    const key = spell.ui.i18n?.descriptionKey;
    if (typeof key === "string" && key.trim().length > 0) {
      return this.translationService.tOrFallback(key, spell.ui.descriptionTemplate);
    }

    return spell.ui.descriptionTemplate;
  }

  public getSanctuaryRewardSpell(element: SanctuaryElement): SpellCatalogEntry | null {
    return this.getAllSpells().find((spell) => {
      const acquisition = Array.isArray(spell.acquisition) ? spell.acquisition : [];
      return acquisition.some((source) => source.source === "sanctuary" && source.sanctuaryElement === element);
    }) ?? null;
  }

  public computeEffectScalar(spell: SpellCatalogEntry, magicValue: number): number {
    const safeMagic = Math.max(0, Math.floor(Number(magicValue ?? 0)));
    const effect = spell.effect;

    if (effect.type === "heal-self") {
      return Math.max(1, Math.floor(Number(effect.baseAmount ?? 0) + safeMagic * Number(effect.amountPerMagic ?? 0)));
    }

    if (effect.type === "teleport-explored-orthogonal") {
      return Math.max(1, Math.floor(Number(effect.baseRange ?? 1) + safeMagic * Number(effect.rangePerMagic ?? 0)));
    }

    if (effect.type === "apply-status-self" || effect.type === "apply-status-target") {
      return Math.max(1, Math.floor(Number(effect.baseDurationTurns ?? 1) + safeMagic * Number(effect.durationPerMagic ?? 0)));
    }

    return 0;
  }

  public needsPlayerTarget(spell: SpellCatalogEntry): boolean {
    return (
      spell.effect.type === "apply-status-target" ||
      spell.effect.type === "skip-turn-target" ||
      spell.effect.type === "steal-coins" ||
      spell.effect.type === "drain-mp-target" ||
      spell.effect.type === "steal-follower" ||
      spell.effect.type === "copy-random-spell" ||
      spell.effect.type === "forget-random-spell-target" ||
      spell.effect.type === "copy-chosen-spell" ||
      spell.effect.type === "forget-chosen-spell-target" ||
      spell.effect.type === "apply-random-effect-target"
    );
  }

  public needsChaosEffectPreview(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "apply-random-effect-target";
  }

  public needsSpellSelectionFromTarget(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "copy-chosen-spell" || spell.effect.type === "forget-chosen-spell-target";
  }

  public needsSelfItemSelection(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "alchemize-item";
  }

  public needsSelfResourceSelection(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "transmute-resource";
  }

  public needsElementSelection(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "change-element-temp";
  }

  public needsCellSelection(spell: SpellCatalogEntry): boolean {
    return spell.effect.type === "reveal-cell" || spell.effect.type === "remove-local-event";
  }

  public async loadConfig(): Promise<void> {
    if (this.hasLoadedRemoteConfig) {
      return;
    }

    const response = await fetch(this.spellsConfigUrl, {
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load spell catalog configuration");
    }

    const raw = await response.json() as unknown;
    const parsed = this.parseConfig(raw);
    this.spellsById = this.toMap(parsed.spells);
    this.defaultSpellbookCapacity = parsed.spellbook.defaultCapacity;
    this.hasLoadedRemoteConfig = true;
  }

  private parseConfig(raw: unknown): SpellsCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid spell catalog configuration: root object is missing");
    }

    const typedRoot = raw as {
      spellbook?: unknown;
      spells?: unknown;
    };

    const defaultCapacity = this.parseSpellbookDefaultCapacity(typedRoot.spellbook);

    if (!Array.isArray(typedRoot.spells) || typedRoot.spells.length === 0) {
      throw new Error("Invalid spell catalog configuration: spells array is missing");
    }

    const spells = typedRoot.spells.map((rawSpell, index) => this.parseSpell(rawSpell, index));

    return {
      spellbook: {
        defaultCapacity,
      },
      spells,
    };
  }

  private parseSpellbookDefaultCapacity(raw: unknown): number {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return DEFAULT_SPELLBOOK_CAPACITY;
    }

    const typed = raw as {
      defaultCapacity?: unknown;
    };

    if (typeof typed.defaultCapacity !== "number" || !Number.isFinite(typed.defaultCapacity)) {
      return DEFAULT_SPELLBOOK_CAPACITY;
    }

    return Math.max(1, Math.floor(typed.defaultCapacity));
  }

  private parseSpell(raw: unknown, index: number): SpellCatalogEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell catalog configuration: spell at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      mpCost?: unknown;
      cooldownTurns?: unknown;
      consumableOnCast?: unknown;
      occupiesSlot?: unknown;
      timing?: unknown;
      ui?: unknown;
      effect?: unknown;
      acquisition?: unknown;
    };

    if (typeof typed.id !== "string" || typed.id.trim().length === 0) {
      throw new Error(`Invalid spell catalog configuration: spell at index ${index} has invalid id`);
    }

    if (typeof typed.mpCost !== "number" || !Number.isFinite(typed.mpCost)) {
      throw new Error(`Invalid spell catalog configuration: spell '${typed.id}' has invalid mpCost`);
    }

    if (typeof typed.cooldownTurns !== "undefined" && (typeof typed.cooldownTurns !== "number" || !Number.isFinite(typed.cooldownTurns))) {
      throw new Error(`Invalid spell catalog configuration: spell '${typed.id}' has invalid cooldownTurns`);
    }

    if (typeof typed.consumableOnCast !== "undefined" && typeof typed.consumableOnCast !== "boolean") {
      throw new Error(`Invalid spell catalog configuration: spell '${typed.id}' has invalid consumableOnCast`);
    }

    if (typeof typed.occupiesSlot !== "undefined" && typeof typed.occupiesSlot !== "boolean") {
      throw new Error(`Invalid spell catalog configuration: spell '${typed.id}' has invalid occupiesSlot`);
    }

    if (typeof typed.timing !== "undefined" && typed.timing !== "my-turn") {
      throw new Error(`Invalid spell catalog configuration: spell '${typed.id}' has invalid timing`);
    }

    return {
      id: typed.id,
      mpCost: Math.max(0, Math.floor(typed.mpCost)),
      cooldownTurns: Math.max(0, Math.floor(Number(typed.cooldownTurns ?? 0))),
      consumableOnCast: typed.consumableOnCast === true,
      occupiesSlot: typed.occupiesSlot !== false,
      timing: (typed.timing ?? "my-turn") as SpellCastTiming,
      ui: this.parseUi(typed.ui, typed.id),
      effect: this.parseEffect(typed.effect, typed.id),
      acquisition: this.parseAcquisition(typed.acquisition, typed.id),
    };
  }

  private parseUi(raw: unknown, spellId: string): SpellCatalogUiDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui section`);
    }

    const typed = raw as {
      name?: unknown;
      descriptionTemplate?: unknown;
      i18n?: unknown;
    };

    if (typeof typed.name !== "string" || typed.name.trim().length === 0) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui.name`);
    }

    if (typeof typed.descriptionTemplate !== "string" || typed.descriptionTemplate.trim().length === 0) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui.descriptionTemplate`);
    }

    const i18n = this.parseUiI18n(typed.i18n, spellId);

    return {
      name: typed.name,
      descriptionTemplate: typed.descriptionTemplate,
      ...(i18n ? { i18n } : {}),
    };
  }

  private parseUiI18n(raw: unknown, spellId: string): SpellCatalogUiDefinition["i18n"] | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui.i18n section`);
    }

    const typed = raw as {
      nameKey?: unknown;
      descriptionKey?: unknown;
    };

    if (typeof typed.nameKey !== "undefined" && typeof typed.nameKey !== "string") {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui.i18n.nameKey`);
    }

    if (typeof typed.descriptionKey !== "undefined" && typeof typed.descriptionKey !== "string") {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid ui.i18n.descriptionKey`);
    }

    return {
      nameKey: typed.nameKey,
      descriptionKey: typed.descriptionKey,
    };
  }

  private parseEffect(raw: unknown, spellId: string): SpellEffectDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid effect section`);
    }

    const typed = raw as SpellEffectDefinition;
    const validEffectTypes: SpellEffectType[] = [
      "heal-self", "teleport-explored-orthogonal", "transform-current-cell-biome",
      "apply-status-self", "enable-diagonal-movement", "apply-status-target",
      "steal-follower", "steal-coins", "gain-coins", "combat-strength-boost",
      "apply-random-effect-target", "remove-status-self", "remove-all-negative-statuses-self",
      "skip-turn-target", "return-to-attuned-sanctuary", "reveal-cell", "ignore-next-cell-hazard",
      "preview-next-events", "transmute-resource", "alchemize-item", "drain-mp-target",
      "remove-local-event", "copy-random-spell", "copy-chosen-spell",
      "forget-random-spell-target", "forget-chosen-spell-target", "block-all-spells",
      "copy-stat-gain", "multi-move", "shield-next-spell", "counter-spell-reaction",
      "mp-shield", "change-element-temp", "remove-negative-follower-self",
    ];
    if (!validEffectTypes.includes(typed.type)) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid effect.type`);
    }

    return {
      type: typed.type,
      baseAmount: this.toFiniteNumber(typed.baseAmount),
      amountPerMagic: this.toFiniteNumber(typed.amountPerMagic),
      baseRange: this.toFiniteNumber(typed.baseRange),
      rangePerMagic: this.toFiniteNumber(typed.rangePerMagic),
      biome: typeof typed.biome === "string" ? typed.biome : undefined,
      statusKey: typeof typed.statusKey === "string" ? typed.statusKey : undefined,
      additionalStatusKeys: Array.isArray(typed.additionalStatusKeys)
        ? typed.additionalStatusKeys.filter((k): k is string => typeof k === "string")
        : undefined,
      baseDurationTurns: this.toFiniteNumber(typed.baseDurationTurns),
      durationPerMagic: this.toFiniteNumber(typed.durationPerMagic),
      luckThreshold: this.toFiniteNumber(typed.luckThreshold),
    };
  }

  private parseAcquisition(raw: unknown, spellId: string): SpellAcquisitionDefinition[] | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!Array.isArray(raw)) {
      throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid acquisition section`);
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid acquisition at index ${index}`);
      }

      const typed = entry as SpellAcquisitionDefinition;
      if (
        typed.source !== "sanctuary"
        && typed.source !== "merchant"
        && typed.source !== "enchantress"
        && typed.source !== "memory"
      ) {
        throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid acquisition.source`);
      }

      return {
        source: typed.source,
        merchantIds: Array.isArray(typed.merchantIds) ? typed.merchantIds.filter((id) => typeof id === "string") : undefined,
        enchantressRewardIds: Array.isArray(typed.enchantressRewardIds)
          ? typed.enchantressRewardIds.filter((id) => typeof id === "string")
          : undefined,
        sanctuaryElement: this.parseSanctuaryElement(typed.sanctuaryElement, spellId),
      };
    });
  }

  private parseSanctuaryElement(value: unknown, spellId: string): SanctuaryElement | undefined {
    if (typeof value === "undefined") {
      return undefined;
    }

    if (value === "water" || value === "fire" || value === "wind" || value === "earth") {
      return value;
    }

    throw new Error(`Invalid spell catalog configuration: spell '${spellId}' has invalid acquisition.sanctuaryElement`);
  }

  private toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }

    return value;
  }

  private toMap(spells: SpellCatalogEntry[]): Record<string, SpellCatalogEntry> {
    const mapped: Record<string, SpellCatalogEntry> = {};

    spells.forEach((spell) => {
      if (mapped[spell.id]) {
        throw new Error(`Invalid spell catalog configuration: duplicate spell id '${spell.id}'`);
      }
      mapped[spell.id] = spell;
    });

    return mapped;
  }
}
