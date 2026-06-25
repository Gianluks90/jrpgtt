import { SanctuaryElement } from "@models/world/MapCell";
import { PlayerSpellSource } from "@models/player/Spellbook";

export type SpellCastTiming = "my-turn";

export type SpellEffectType =
  | "heal-self"
  | "teleport-explored-orthogonal"
  | "transform-current-cell-biome"
  | "apply-status-self"
  | "enable-diagonal-movement"
  | "apply-status-target"
  | "steal-follower"
  | "steal-coins"
  | "gain-coins"
  | "combat-strength-boost"
  | "apply-random-effect-target"
  | "remove-status-self"
  | "remove-all-negative-statuses-self"
  | "skip-turn-target"
  | "return-to-attuned-sanctuary"
  | "reveal-cell"
  | "ignore-next-cell-hazard"
  | "preview-next-events"
  | "transmute-resource"
  | "alchemize-item"
  | "drain-mp-target"
  | "remove-local-event"
  | "copy-random-spell"
  | "copy-chosen-spell"
  | "forget-random-spell-target"
  | "forget-chosen-spell-target"
  | "block-all-spells"
  | "copy-stat-gain"
  | "multi-move"
  | "shield-next-spell"
  | "counter-spell-reaction"
  | "mp-shield"
  | "change-element-temp"
  | "remove-negative-follower-self";

export interface SpellCatalogI18nKeys {
  nameKey?: string;
  descriptionKey?: string;
}

export interface SpellCatalogUiDefinition {
  name: string;
  descriptionTemplate: string;
  i18n?: SpellCatalogI18nKeys;
}

export interface SpellAcquisitionDefinition {
  source: PlayerSpellSource;
  merchantIds?: string[];
  enchantressRewardIds?: string[];
  sanctuaryElement?: SanctuaryElement;
}

export interface SpellEffectDefinition {
  type: SpellEffectType;
  baseAmount?: number;
  amountPerMagic?: number;
  baseRange?: number;
  rangePerMagic?: number;
  biome?: string;
  statusKey?: string;
  additionalStatusKeys?: string[];
  baseDurationTurns?: number;
  durationPerMagic?: number;
  luckThreshold?: number;
}

export interface SpellCatalogEntry {
  id: string;
  mpCost: number;
  cooldownTurns?: number;
  consumableOnCast?: boolean;
  occupiesSlot?: boolean;
  timing?: SpellCastTiming;
  ui: SpellCatalogUiDefinition;
  effect: SpellEffectDefinition;
  acquisition?: SpellAcquisitionDefinition[];
}

export interface SpellsCatalogConfig {
  spellbook: {
    defaultCapacity: number;
  };
  spells: SpellCatalogEntry[];
}
