import { ResourceLabel } from "@models/world/Resource";

export type BiomeConditionEffectType =
  | "hp-damage-percent-per-connected-cell"
  | "hp-heal-percent-per-connected-cell"
  | "resource-gain-multiplier"
  | "movement-enable-diagonal-adjacency"
  | "movement-block-entry"
  | "experience-flat-on-turn-end"
  | "luck-check-multiplier"
  | "enemy-level-bonus-by-region-value";

export interface BiomeConditionEffectDefinition {
  type: BiomeConditionEffectType;
  basePercentPerConnectedCell?: number;
  maxPercent?: number;
  minDeltaHp?: number;
  blockedByStatusKey?: string;
  multiplier?: number;
  luckDelta?: number;
  flatAmount?: number;
  maxLevel?: number;
  resourceLabels?: ResourceLabel[];
}

export interface BiomeConditionDefinition {
  id: string;
  label: string;
  description?: string;
  logCode?: string;
  effect?: BiomeConditionEffectDefinition;
}

export interface BiomeConditionsCatalogConfig {
  conditions: BiomeConditionDefinition[];
}
