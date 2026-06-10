import { Injectable, computed, signal } from "@angular/core";

export type FastTravelAnimationPhase = "booked" | "to-midpoint" | "midpoint" | "to-destination";

export interface FastTravelAnimationPath {
  playerId: string;
  playerColor: string;
  origin: {
    x: number;
    y: number;
  };
  destination: {
    x: number;
    y: number;
  };
}

export interface FastTravelAnimationState extends FastTravelAnimationPath {
  midpoint: {
    x: number;
    y: number;
  };
  phase: FastTravelAnimationPhase;
  progress: number;
}

@Injectable({
  providedIn: "root",
})
export class FastTravelVisualService {
  private readonly segmentDurationMs = 2000;

  private readonly animationState = signal<FastTravelAnimationState | null>(null);
  private runToken = 0;

  public readonly state = this.animationState.asReadonly();
  public readonly isAnimating = computed(() => this.animationState() !== null);
  public readonly isTransitionRunning = computed(() => {
    const phase = this.animationState()?.phase;
    return phase === "to-midpoint" || phase === "to-destination";
  });

  public showStage(path: FastTravelAnimationPath, stage: "booked" | "midpoint"): void {
    const normalizedPath = this.normalizePath(path);
    this.runToken += 1;

    this.animationState.set({
      ...normalizedPath,
      phase: stage,
      progress: 1,
    });
  }

  public async playToMidpoint(path: FastTravelAnimationPath): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const token = ++this.runToken;

    await this.animatePhase(token, normalizedPath, "to-midpoint", this.segmentDurationMs);

    if (this.runToken !== token) {
      return;
    }

    this.animationState.set({
      ...normalizedPath,
      phase: "midpoint",
      progress: 1,
    });
  }

  public async playToDestination(path: FastTravelAnimationPath): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const token = ++this.runToken;

    await this.animatePhase(token, normalizedPath, "to-destination", this.segmentDurationMs);

    if (this.runToken !== token) {
      return;
    }

    this.animationState.set(null);
  }

  public cancel(): void {
    this.runToken += 1;
    this.animationState.set(null);
  }

  private animatePhase(
    token: number,
    path: Omit<FastTravelAnimationState, "phase" | "progress">,
    phase: "to-midpoint" | "to-destination",
    durationMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (this.runToken !== token) {
        resolve();
        return;
      }

      const startedAt = performance.now();
      const duration = Math.max(1, Math.floor(durationMs));

      const tick = (now: number) => {
        if (this.runToken !== token) {
          resolve();
          return;
        }

        const elapsed = now - startedAt;
        const rawProgress = elapsed / duration;
        const progress = Math.max(0, Math.min(1, rawProgress));

        this.animationState.set({
          ...path,
          phase,
          progress,
        });

        if (progress >= 1) {
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  private normalizePath(path: FastTravelAnimationPath): Omit<FastTravelAnimationState, "phase" | "progress"> {
    return {
      ...path,
      midpoint: {
        x: (path.origin.x + path.destination.x) / 2,
        y: (path.origin.y + path.destination.y) / 2,
      },
    };
  }
}
