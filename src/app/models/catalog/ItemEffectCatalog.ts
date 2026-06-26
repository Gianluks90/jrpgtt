import { BiomeType } from "@models/world/MapCell";

export type ItemEffectType =
  | "prevent-biome-condition-damage-by-charge"
  | "recharge-charges-in-biome"
  | "prevent-biome-condition-damage-passive"
  | "gain-coins-range-on-pickup"
  | "apply-status-on-pickup"
  | "reduce-combat-damage-on-fortune-check"
  | "combat-stat-bonus-vs-enemy-category"
  | "draw-spell-on-spellbook-empty"
  | "apply-status-on-lucky-roll"
  | "passive-self-silence-and-spell-immunity"
  | "region-iii-access"
  | "skip-spirit-for-exp"
  | "skip-exploration-card-once-per-turn";

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

export interface PreventBiomeConditionDamagePassiveEffectDefinition extends BaseItemEffectDefinition {
  type: "prevent-biome-condition-damage-passive";
  biome: BiomeType;
  conditionId: string;
}

export interface GainCoinsRangeOnPickupEffectDefinition extends BaseItemEffectDefinition {
  type: "gain-coins-range-on-pickup";
  minAmount: number;
  maxAmount: number;
}

export interface ApplyStatusOnPickupEffectDefinition extends BaseItemEffectDefinition {
  type: "apply-status-on-pickup";
  statusKey: string;
  durationTurns: number;
}

export interface ReduceCombatDamageOnFortuneCheckEffectDefinition extends BaseItemEffectDefinition {
  type: "reduce-combat-damage-on-fortune-check";
  luckThreshold: number;
  reduction: number;
  combatStatFilter?: "strength" | "magic";
}

export interface CombatStatBonusVsEnemyCategoryEffectDefinition extends BaseItemEffectDefinition {
  type: "combat-stat-bonus-vs-enemy-category";
  combatStat: "strength" | "magic";
  bonus: number;
  categoryFilter: string;
}

export interface DrawSpellOnSpellbookEmptyEffectDefinition extends BaseItemEffectDefinition {
  type: "draw-spell-on-spellbook-empty";
}

export interface ApplyStatusOnLuckyRollEffectDefinition extends BaseItemEffectDefinition {
  type: "apply-status-on-lucky-roll";
  statusKey: string;
  durationTurns: number;
}

export interface PassiveSelfSilenceAndSpellImmunityEffectDefinition extends BaseItemEffectDefinition {
  type: "passive-self-silence-and-spell-immunity";
}

export interface RegionIIIAccessEffectDefinition extends BaseItemEffectDefinition {
  type: "region-iii-access";
}

export interface SkipSpiritForExpEffectDefinition extends BaseItemEffectDefinition {
  type: "skip-spirit-for-exp";
  expReward: number;
}

export interface SkipExplorationCardOncePerTurnEffectDefinition extends BaseItemEffectDefinition {
  type: "skip-exploration-card-once-per-turn";
}

export type ItemEffectDefinition =
  | PreventBiomeConditionDamageByChargeEffectDefinition
  | RechargeChargesInBiomeEffectDefinition
  | PreventBiomeConditionDamagePassiveEffectDefinition
  | GainCoinsRangeOnPickupEffectDefinition
  | ApplyStatusOnPickupEffectDefinition
  | ReduceCombatDamageOnFortuneCheckEffectDefinition
  | CombatStatBonusVsEnemyCategoryEffectDefinition
  | DrawSpellOnSpellbookEmptyEffectDefinition
  | ApplyStatusOnLuckyRollEffectDefinition
  | PassiveSelfSilenceAndSpellImmunityEffectDefinition
  | RegionIIIAccessEffectDefinition
  | SkipSpiritForExpEffectDefinition
  | SkipExplorationCardOncePerTurnEffectDefinition;

export interface ItemEffectsCatalogConfig {
  effects: ItemEffectDefinition[];
}
