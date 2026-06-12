import { SanctuaryElement } from "@models/world/MapCell";
import { PlayerSpellSource } from "@models/player/Spellbook";

export type SpellCastTiming = "my-turn";

export type SpellEffectType =
  | "heal-self"
  | "teleport-explored-orthogonal"
  | "transform-current-cell-biome"
  | "apply-status-self";

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
  baseDurationTurns?: number;
  durationPerMagic?: number;
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
