import { PlayerAlignment } from "./Player";

export interface MysticRewardDefinition {
  id: string;
  minTotal: number;
  maxTotal: number;
  label: string;
  previewLabel: string;
  labelKey?: string;
  previewLabelKey?: string;
  alignment?: PlayerAlignment | null;
  experienceGain?: number;
  grantLevelUp?: boolean;
}

export interface MysticRewardsConfig {
  rewards: MysticRewardDefinition[];
}

export interface MysticRewardDialogRow {
  id: string;
  rangeLabel: string;
  effectLabel: string;
}
