export type BiomeConditionEffectType = "hp-damage-percent-per-connected-cell" | "hp-heal-percent-per-connected-cell";

export interface BiomeConditionEffectDefinition {
  type: BiomeConditionEffectType;
  basePercentPerConnectedCell: number;
  maxPercent?: number;
  minDeltaHp?: number;
  blockedByStatusKey?: string;
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
