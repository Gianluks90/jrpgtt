export interface LuckCheckResult {
  roll: number;
  luckBonus: number;
  total: number;
  threshold: number;
  success: boolean;
  nearSuccess: boolean;
}
