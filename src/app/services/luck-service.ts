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
      checkId: this.generateCheckId(),
      roll,
      luckBonus,
      total,
      threshold: config.successThreshold,
      success,
      nearSuccess,
    };
  }

  private generateCheckId(): string {
    const now = Date.now().toString(36);
    const randomPart = Math.floor(Math.random() * 1_000_000).toString(36).padStart(4, "0");
    return `${now}-${randomPart}`;
  }

  private randomIntInclusive(min: number, max: number): number {
    const normalizedMin = Math.ceil(min);
    const normalizedMax = Math.floor(max);
    return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
  }
}
