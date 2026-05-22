import { Injectable } from "@angular/core";
import { DEFAULT_LUCK_CHECK_CONFIG, LuckCheckConfig } from "../consts/luck-config";
import { LuckCheckResult } from "../models/LuckCheckResult";

@Injectable({
  providedIn: "root",
})
export class LuckService {
  public checkLuck(luckValue: number, override?: Partial<LuckCheckConfig>): LuckCheckResult {
    const config: LuckCheckConfig = {
      ...DEFAULT_LUCK_CHECK_CONFIG,
      ...override,
    };

    const roll = this.randomIntInclusive(config.minRoll, config.maxRoll);
    const luckBonus = Math.max(0, Math.floor(luckValue)) * config.luckMultiplier;
    const total = roll + luckBonus;
    const success = total >= config.successThreshold;
    const nearSuccess = !success && total >= (config.successThreshold - config.nearSuccessMargin);

    return {
      roll,
      luckBonus,
      total,
      threshold: config.successThreshold,
      success,
      nearSuccess,
    };
  }

  private randomIntInclusive(min: number, max: number): number {
    const normalizedMin = Math.ceil(min);
    const normalizedMax = Math.floor(max);
    return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
  }
}
