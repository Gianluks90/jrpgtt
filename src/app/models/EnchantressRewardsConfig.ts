export interface EnchantressRewardStatusEffect {
  key: string;
  durationTurns: number;
}

export interface EnchantressRewardDefinition {
  id: string;
  minTotal: number;
  maxTotal: number;
  label: string;
  previewLabel: string;
  pendingMagicReward?: boolean;
  statuses: EnchantressRewardStatusEffect[];
}

export interface EnchantressRewardsConfig {
  rewards: EnchantressRewardDefinition[];
}

export interface EnchantressRewardDialogRow {
  id: string;
  rangeLabel: string;
  effectLabel: string;
}
