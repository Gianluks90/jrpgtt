export interface LuckCheckConfig {
  minRoll: number;
  maxRoll: number;
  luckMultiplier: number;
  successThreshold: number;
  nearSuccessMargin: number;
}

export const DEFAULT_LUCK_CHECK_CONFIG: LuckCheckConfig = {
  minRoll: 0,
  maxRoll: 100,
  luckMultiplier: 2,
  successThreshold: 100,
  nearSuccessMargin: 10,
};

export const EXPLORATION_LUCK_EXTRA_RESOURCE_ROLLS = 1;
