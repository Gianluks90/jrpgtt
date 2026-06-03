import { BiomeType } from "./MapCell";

export type ItemEffectType = "prevent-biome-condition-damage-by-charge" | "recharge-charges-in-biome";

export interface BaseItemEffectDefinition {
  id: string;
  label: string;
  description?: string;
  type: ItemEffectType;
}

export interface PreventBiomeConditionDamageByChargeEffectDefinition extends BaseItemEffectDefinition {
  type: "prevent-biome-condition-damage-by-charge";
  biome: BiomeType;
  conditionId: string;
  consumeCharges: number;
}

export interface RechargeChargesInBiomeEffectDefinition extends BaseItemEffectDefinition {
  type: "recharge-charges-in-biome";
  biome: BiomeType;
  rechargeCharges: number;
}

export type ItemEffectDefinition =
  | PreventBiomeConditionDamageByChargeEffectDefinition
  | RechargeChargesInBiomeEffectDefinition;

export interface ItemEffectsCatalogConfig {
  effects: ItemEffectDefinition[];
}
