export interface LuckCheckResult {
  checkId?: string;
  roll: number;
  luckBonus: number;
  total: number;
  threshold: number;
  success: boolean;
  nearSuccess: boolean;
}
