import { Component, Injector, OnDestroy, computed, effect, inject, input, signal } from "@angular/core";
import { DAY_NIGHT_ROUNDS_PER_TOGGLE } from "../../../consts/gameplay/day-night-cycle";
import { TimeOfDay, WorldState } from "@models/world/WorldState";
import { TranslationService } from "@services/shared/translation-service";

@Component({
  selector: "app-day-night-cycle-panel",
  templateUrl: "./day-night-cycle-panel.html",
  styleUrl: "./day-night-cycle-panel.scss",
  standalone: true,
})
export class DayNightCyclePanel implements OnDestroy {
  private injector = inject(Injector);
  private translationService = inject(TranslationService);

  public worldState = input<WorldState | null>(null);
  public isTransitioning = signal(false);

  private displayedTimeOfDay = signal<TimeOfDay>("day");
  private hasInitializedTime = false;
  private transitioningTo: TimeOfDay | null = null;

  private iconSwapTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private transitionEndTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly transitionDurationMs = 1100;
  private readonly iconSwapDelayMs = Math.floor(this.transitionDurationMs * 0.5);

  constructor() {
    effect(() => {
      this.handleIncomingTimeOfDay(this.incomingTimeOfDay());
    }, { injector: this.injector });
  }

  public ngOnDestroy(): void {
    this.clearTransitionTimers();
  }

  public title = computed<string>(() => {
    const rounds = Math.max(1, Math.floor(DAY_NIGHT_ROUNDS_PER_TOGGLE));
    if (rounds === 1) {
      return this.translationService.tOrFallback("map.timeOfDay.title", "Time");
    }

    return this.translationService.tOrFallback(
      "map.timeOfDay.titleWithRounds",
      "Time ({rounds} rounds)",
      { rounds },
    );
  });

  public transitionDuration = computed<string>(() => `${this.transitionDurationMs}ms`);

  private incomingTimeOfDay = computed<TimeOfDay>(() => {
    return this.worldState()?.timeOfDay ?? "day";
  });

  public timeOfDay = computed<TimeOfDay>(() => {
    return this.displayedTimeOfDay();
  });

  public label = computed<string>(() => {
    return this.timeOfDay() === "night"
      ? this.translationService.tOrFallback("map.timeOfDay.night", "Night")
      : this.translationService.tOrFallback("map.timeOfDay.day", "Day");
  });

  private handleIncomingTimeOfDay(nextTimeOfDay: TimeOfDay): void {
    if (!this.hasInitializedTime) {
      this.hasInitializedTime = true;
      this.transitioningTo = null;
      this.displayedTimeOfDay.set(nextTimeOfDay);
      return;
    }

    if (this.isTransitioning() && this.transitioningTo === nextTimeOfDay) {
      return;
    }

    if (!this.isTransitioning() && this.displayedTimeOfDay() === nextTimeOfDay) {
      return;
    }

    this.startTransition(nextTimeOfDay);
  }

  private startTransition(nextTimeOfDay: TimeOfDay): void {
    this.clearTransitionTimers();
    this.transitioningTo = nextTimeOfDay;
    this.isTransitioning.set(true);

    this.iconSwapTimeoutId = setTimeout(() => {
      this.displayedTimeOfDay.set(nextTimeOfDay);
    }, this.iconSwapDelayMs);

    this.transitionEndTimeoutId = setTimeout(() => {
      this.clearTransitionTimers();
      this.transitioningTo = null;
      this.isTransitioning.set(false);
    }, this.transitionDurationMs);
  }

  private clearTransitionTimers(): void {
    if (this.iconSwapTimeoutId !== null) {
      clearTimeout(this.iconSwapTimeoutId);
      this.iconSwapTimeoutId = null;
    }

    if (this.transitionEndTimeoutId !== null) {
      clearTimeout(this.transitionEndTimeoutId);
      this.transitionEndTimeoutId = null;
    }
  }
}
