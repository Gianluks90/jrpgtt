import { BiomeType } from "@models/world/MapCell";

export type FollowerCategory = "companion" | (string & {});
export type FollowerEffectScope = "always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only";
export type FollowerParameterKey = "strength" | "magic" | "luck";

export interface FollowerParameterModifier {
  parameter: FollowerParameterKey;
  amount: number;
  scopes: FollowerEffectScope[];
}

export interface FollowerDefinition {
  id: string;
  name: string;
  description: string;
  nameKey?: string;
  descriptionKey?: string;
  category: FollowerCategory;
  maxHp: number;
  isNegative?: boolean;
  itemCapacityBonus?: number;
  actions: string[];
  allowedBiomes?: BiomeType[];
  combatSkipBiomes?: BiomeType[];
  leavesOnCombatLoss?: boolean;
  removesOtherFollowersOnPickup?: boolean;
  dismissLandmarkId?: string;
  oneTimeActions?: string[];
  damagesOnXpGain?: boolean;
  parameterModifiers?: FollowerParameterModifier[];
  statusKeysWhileActive?: string[];
}

export interface FollowersCatalogConfig {
  followers: FollowerDefinition[];
}
