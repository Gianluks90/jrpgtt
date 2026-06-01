import { Component, Injector, OnDestroy, computed, effect, inject, input, signal } from "@angular/core";
import { LuckCheckResult } from "../../../models/LuckCheckResult";
import { SoundService } from "../../../services/sound-service";

@Component({
  selector: "app-luck-indicator",
  templateUrl: "./luck-indicator.html",
  styleUrl: "./luck-indicator.scss",
  standalone: true,
})
export class LuckIndicator implements OnDestroy {
  private injector = inject(Injector);
  private soundService = inject(SoundService);

  public result = input<LuckCheckResult | null>(null);
  public isRolling = signal(false);

  private displayedResult = signal<LuckCheckResult | null>(null);
  private rollingTotal = signal(0);
  private rollingThreshold = signal(0);

  private rollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private revealTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastHandledCheckId: string | null = null;
  private lastHandledValueKey: string | null = null;
  private hasSeenFirstNonNullResult = false;

  private readonly minRollingDurationMs = 500;
  private readonly maxRollingDurationMs = 1000;
  private readonly rollingTickMs = 55;

  constructor() {
    effect(() => {
      this.handleIncomingResult(this.result());
    }, { injector: this.injector });
  }

  public ngOnDestroy(): void {
    this.clearTimers();
  }

  public statusLabel = computed(() => {
    if (this.isRolling()) return "...";
    const result = this.displayedResult();
    if (!result) return "-";
    if (result.success) return "Yes!";
    if (result.nearSuccess) return "Near";
    return "Nope";
  });

  public statusClass = computed(() => {
    if (this.isRolling()) return "neutral";
    const result = this.displayedResult();
    if (!result) return "neutral";
    if (result.success) return "success";
    if (result.nearSuccess) return "near";
    return "fail";
  });

  public shownTotal = computed(() => {
    if (this.isRolling()) return this.rollingTotal();
    return this.displayedResult()?.total ?? 0;
  });

  public shownThreshold = computed(() => {
    if (this.isRolling()) return this.rollingThreshold();
    return this.displayedResult()?.threshold ?? 0;
  });

  private handleIncomingResult(nextResult: LuckCheckResult | null): void {
    if (!nextResult) {
      this.clearTimers();
      this.isRolling.set(false);
      this.displayedResult.set(null);
      return;
    }

    const incomingCheckId = typeof nextResult.checkId === "string" ? nextResult.checkId : null;
    const incomingValueKey = this.buildValueKey(nextResult);

    if (!this.hasSeenFirstNonNullResult) {
      this.hasSeenFirstNonNullResult = true;
      this.lastHandledCheckId = incomingCheckId;
      this.lastHandledValueKey = incomingValueKey;
      this.displayedResult.set(nextResult);
      return;
    }

    const alreadyHandled = incomingCheckId
      ? incomingCheckId === this.lastHandledCheckId
      : incomingValueKey === this.lastHandledValueKey;

    if (alreadyHandled) {
      if (!this.isRolling()) {
        this.displayedResult.set(nextResult);
      }
      return;
    }

    this.lastHandledCheckId = incomingCheckId;
    this.lastHandledValueKey = incomingValueKey;
    this.startRollingAnimation(nextResult);
  }

  private startRollingAnimation(finalResult: LuckCheckResult): void {
    this.clearTimers();
    this.isRolling.set(true);

    const normalizedThreshold = Math.max(1, Math.floor(finalResult.threshold));
    const fakeTotalMax = normalizedThreshold + Math.max(8, Math.floor(finalResult.luckBonus) + 6);
    this.rollingThreshold.set(normalizedThreshold);

    const spin = () => {
      this.rollingTotal.set(this.randomIntInclusive(0, fakeTotalMax));
    };

    spin();
    this.rollingIntervalId = setInterval(spin, this.rollingTickMs);

    const revealDelay = this.randomIntInclusive(this.minRollingDurationMs, this.maxRollingDurationMs);
    this.revealTimeoutId = setTimeout(() => {
      this.clearTimers();
      this.displayedResult.set(finalResult);
      this.isRolling.set(false);
      if (finalResult.success) {
        this.soundService.play("luck-success");
      }
    }, revealDelay);
  }

  private clearTimers(): void {
    if (this.rollingIntervalId !== null) {
      clearInterval(this.rollingIntervalId);
      this.rollingIntervalId = null;
    }

    if (this.revealTimeoutId !== null) {
      clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = null;
    }
  }

  private buildValueKey(result: LuckCheckResult): string {
    return [
      result.roll,
      result.luckBonus,
      result.total,
      result.threshold,
      result.success,
      result.nearSuccess,
    ].join("|");
  }

  private randomIntInclusive(min: number, max: number): number {
    const normalizedMin = Math.ceil(min);
    const normalizedMax = Math.floor(max);
    return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
  }
}
