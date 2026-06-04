export type GraveyardReviveTargetMode = "one-hp" | "full";

export interface GraveyardResurrectRewardDefinition {
  id: string;
  minTotal: number;
  maxTotal: number;
  label: string;
  previewLabel: string;
  playerHpDamagePercent?: number;
  summonZombie?: boolean;
  reviveTarget?: GraveyardReviveTargetMode;
  markAsUndead?: boolean;
}

export interface GraveyardResurrectRewardsConfig {
  rewards: GraveyardResurrectRewardDefinition[];
}

export interface GraveyardResurrectRewardDialogRow {
  id: string;
  rangeLabel: string;
  effectLabel: string;
}
