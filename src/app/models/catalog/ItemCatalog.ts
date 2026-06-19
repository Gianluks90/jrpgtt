import { BiomeType } from "@models/world/MapCell";
import { PlayerAlignment } from "@models/player/Player";

export type ItemCategory = "magic" | "weapon" | "armor" | (string & {});
export type ItemEffectScope = "always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only";
export type ItemParameterKey = "strength" | "magic" | "luck";

export interface ItemParameterModifier {
  parameter: ItemParameterKey;
  amount: number;
  scopes: ItemEffectScope[];
}

export interface ItemConstraints {
  allowedAlignments?: PlayerAlignment[];
  minLevel?: number;
  allowedBiomes?: BiomeType[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  nameKey?: string;
  descriptionKey?: string;
  category: ItemCategory;
  occupiesSpace: boolean;
  consumable: boolean;
  actions: string[];
  purchaseValue: number;
  maxCharges?: number;
  effects?: string[];
  constraints?: ItemConstraints;
  parameterModifiers?: ItemParameterModifier[];
}

export interface ItemCatalogConfig {
  items: ItemDefinition[];
}
