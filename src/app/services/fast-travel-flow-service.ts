import { Injectable } from "@angular/core";
import { Player } from "../models/Player";
import { PendingFastTravelState, WorldState } from "../models/WorldState";
import { ActionExecutorService } from "./action-executor-service";
import { FastTravelAnimationPath, FastTravelVisualService } from "./fast-travel-visual-service";

interface FastTravelFlowSyncInput {
  gameId: string;
  worldState: WorldState | null;
  players: Player[];
  currentUserId: string | null;
}

@Injectable({
  providedIn: "root",
})
export class FastTravelFlowService {
  private readonly processedStageKeys = new Set<string>();
  private pendingSync: Promise<void> = Promise.resolve();

  constructor(
    private fastTravelVisualService: FastTravelVisualService,
    private actionExecutorService: ActionExecutorService,
  ) {}

  public sync(input: FastTravelFlowSyncInput): void {
    this.pendingSync = this.pendingSync
      .then(async () => {
        await this.syncInternal(input);
      })
      .catch((error: unknown) => {
        console.error("Unable to synchronize fast travel flow", error);
      });
  }

  public reset(): void {
    this.processedStageKeys.clear();
    this.fastTravelVisualService.cancel();
  }

  private async syncInternal(input: FastTravelFlowSyncInput): Promise<void> {
    if (!input.gameId || !input.worldState) {
      this.reset();
      return;
    }

    const playersById = new Map(input.players.map((player) => [player.id, player]));
    const pendingByPlayer = this.clonePendingByPlayer(input.worldState.pendingFastTravelByPlayer ?? {});
    const activePlayerId = input.worldState.activePlayerId ?? null;
    const activePending = activePlayerId ? pendingByPlayer[activePlayerId] ?? null : null;
    const worldTurn = Math.max(0, Math.floor(Number(input.worldState.currentTurn ?? 0)));

    if (activePlayerId && activePending) {
      const activePath = this.toAnimationPath(activePlayerId, activePending, playersById);
      if (activePath) {
        const stageKey = this.buildStageKey(input.gameId, activePlayerId, worldTurn, activePending.stage);
        if (!this.processedStageKeys.has(stageKey)) {
          this.processedStageKeys.add(stageKey);
          await this.runActiveStage(input, {
            playerId: activePlayerId,
            pending: activePending,
            path: activePath,
            playersById,
            stageKey,
          });
        } else if (!this.fastTravelVisualService.isTransitionRunning()) {
          this.fastTravelVisualService.showStage(activePath, activePending.stage);
        }
      }
    } else {
      const fallback = this.pickFallbackPending(pendingByPlayer, playersById, input.currentUserId);
      if (fallback && !this.fastTravelVisualService.isTransitionRunning()) {
        this.fastTravelVisualService.showStage(fallback.path, fallback.pending.stage);
      }
    }

    if (Object.keys(pendingByPlayer).length === 0 && !this.fastTravelVisualService.isTransitionRunning()) {
      this.processedStageKeys.clear();
      this.fastTravelVisualService.cancel();
    }
  }

  private async runActiveStage(input: FastTravelFlowSyncInput, context: {
    playerId: string;
    pending: PendingFastTravelState;
    path: FastTravelAnimationPath;
    playersById: Map<string, Player>;
    stageKey: string;
  }): Promise<void> {
    if (context.pending.stage === "booked") {
      this.fastTravelVisualService.showStage(context.path, "booked");
      await this.fastTravelVisualService.playToMidpoint(context.path);
      await this.tryCompleteMidpointTurn(
        input,
        context.playerId,
        context.playersById,
        context.stageKey,
      );
      return;
    }

    this.fastTravelVisualService.showStage(context.path, "midpoint");
    await this.fastTravelVisualService.playToDestination(context.path);
    await this.tryCompleteArrival(
      input,
      context.playerId,
      context.playersById,
      context.stageKey,
    );
  }

  private async tryCompleteMidpointTurn(
    input: FastTravelFlowSyncInput,
    playerId: string,
    playersById: Map<string, Player>,
    stageKey: string,
  ): Promise<void> {
    if (!input.currentUserId || input.currentUserId !== playerId) return;
    if ((input.worldState?.activePlayerId ?? null) !== playerId) return;

    const player = playersById.get(playerId);
    if (!player) return;

    try {
      await this.actionExecutorService.completeFastTravelMidpointTurn(input.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error("Unable to complete fast travel midpoint turn", error);
      this.processedStageKeys.delete(stageKey);
    }
  }

  private async tryCompleteArrival(
    input: FastTravelFlowSyncInput,
    playerId: string,
    playersById: Map<string, Player>,
    stageKey: string,
  ): Promise<void> {
    if (!input.currentUserId || input.currentUserId !== playerId) return;
    if ((input.worldState?.activePlayerId ?? null) !== playerId) return;

    const player = playersById.get(playerId);
    if (!player) return;

    try {
      await this.actionExecutorService.completeFastTravelArrival(input.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error("Unable to complete fast travel arrival", error);
      this.processedStageKeys.delete(stageKey);
    }
  }

  private pickFallbackPending(
    pendingByPlayer: Record<string, PendingFastTravelState>,
    playersById: Map<string, Player>,
    currentUserId: string | null,
  ): { playerId: string; pending: PendingFastTravelState; path: FastTravelAnimationPath } | null {
    if (currentUserId) {
      const mine = pendingByPlayer[currentUserId];
      if (mine) {
        const path = this.toAnimationPath(currentUserId, mine, playersById);
        if (path) {
          return {
            playerId: currentUserId,
            pending: mine,
            path,
          };
        }
      }
    }

    const firstEntry = Object.entries(pendingByPlayer)[0] ?? null;
    if (!firstEntry) return null;

    const [playerId, pending] = firstEntry;
    const path = this.toAnimationPath(playerId, pending, playersById);
    if (!path) return null;

    return {
      playerId,
      pending,
      path,
    };
  }

  private buildStageKey(gameId: string, playerId: string, worldTurn: number, stage: PendingFastTravelState["stage"]): string {
    return `${gameId}:${playerId}:${worldTurn}:${stage}`;
  }

  private toAnimationPath(
    playerId: string,
    state: PendingFastTravelState,
    playersById: Map<string, Player>,
  ): FastTravelAnimationPath | null {
    const player = playersById.get(playerId);
    if (!player) return null;

    return {
      playerId,
      playerColor: player.color,
      origin: {
        x: Math.max(0, Math.floor(Number(state.origin.x ?? 0))),
        y: Math.max(0, Math.floor(Number(state.origin.y ?? 0))),
      },
      destination: {
        x: Math.max(0, Math.floor(Number(state.destination.x ?? 0))),
        y: Math.max(0, Math.floor(Number(state.destination.y ?? 0))),
      },
    };
  }

  private clonePendingByPlayer(
    pendingByPlayer: Record<string, PendingFastTravelState>,
  ): Record<string, PendingFastTravelState> {
    const cloned: Record<string, PendingFastTravelState> = {};

    for (const [playerId, state] of Object.entries(pendingByPlayer)) {
      if (!state || typeof state !== "object") continue;

      cloned[playerId] = {
        stage: state.stage === "midpoint" ? "midpoint" : "booked",
        origin: {
          x: Math.max(0, Math.floor(Number(state.origin?.x ?? 0))),
          y: Math.max(0, Math.floor(Number(state.origin?.y ?? 0))),
        },
        destination: {
          x: Math.max(0, Math.floor(Number(state.destination?.x ?? 0))),
          y: Math.max(0, Math.floor(Number(state.destination?.y ?? 0))),
        },
      };
    }

    return cloned;
  }
}
