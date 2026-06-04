import { BiomeType } from "./MapCell";

export type AllyCategory = "companion" | (string & {});
export type AllyEffectScope = "always" | "fight-only" | "day-only" | "night-only";
export type AllyParameterKey = "strength" | "magic" | "luck";

export interface AllyParameterModifier {
  parameter: AllyParameterKey;
  amount: number;
  scopes: AllyEffectScope[];
}

export interface AllyDefinition {
  id: string;
  name: string;
  description: string;
  category: AllyCategory;
  maxHp: number;
  itemCapacityBonus?: number;
  actions: string[];
  allowedBiomes?: BiomeType[];
  parameterModifiers?: AllyParameterModifier[];
  statusKeysWhileActive?: string[];
}

export interface AlliesCatalogConfig {
  allies: AllyDefinition[];
}
