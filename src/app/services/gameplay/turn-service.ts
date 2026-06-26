import { Injectable } from "@angular/core";
import { DAY_NIGHT_ROUNDS_PER_TOGGLE } from "../../consts/gameplay/day-night-cycle";
import { ActiveRegionEffect, PendingTeleportState, WorldState } from "@models/world/WorldState";
import { PlayerTurnEffectsService } from "@services/player/player-turn-effects-service";

export interface TurnAdvanceResult {
  skippedPlayerIds: string[];
  teleportArrivals: Array<{
    playerId: string;
    destination: PendingTeleportState;
  }>;
  firingRegionEffects: ActiveRegionEffect[];
}

@Injectable({
  providedIn: "root",
})
export class TurnService {
  constructor(private playerTurnEffectsService: PlayerTurnEffectsService) {}

  public advanceTurn(worldState: WorldState): TurnAdvanceResult {
    const result: TurnAdvanceResult = {
      skippedPlayerIds: [],
      teleportArrivals: [],
      firingRegionEffects: [],
    };

    const order = worldState.turnOrder ?? [];
    if (order.length === 0) {
      worldState.currentTurn += 1;
      return result;
    }

    let currentIndex = worldState.activePlayerId ? order.indexOf(worldState.activePlayerId) : -1;
    const maxIterations = Math.max(order.length + 1, order.length * 3);
    let iteration = 0;

    while (iteration < maxIterations) {
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;

      if (nextIndex === 0) {
        worldState.currentTurn += 1;
        this.toggleTimeOnRoundChange(worldState);
        this.processRegionEffectsOnRoundStart(worldState, result);
      }

      const candidatePlayerId = order[nextIndex];
      currentIndex = nextIndex;

      if (this.playerTurnEffectsService.consumeSkippedTurn(worldState, candidatePlayerId)) {
        result.skippedPlayerIds.push(candidatePlayerId);

        if (this.playerTurnEffectsService.getSkippedTurns(worldState, candidatePlayerId) <= 0) {
          const teleportAfterSkippedTurn = this.playerTurnEffectsService.consumeTeleport(worldState, candidatePlayerId);
          if (teleportAfterSkippedTurn) {
            result.teleportArrivals.push({
              playerId: candidatePlayerId,
              destination: teleportAfterSkippedTurn,
            });
          }
        }

        iteration += 1;
        continue;
      }

      const teleportAtTurnStart = this.playerTurnEffectsService.consumeTeleport(worldState, candidatePlayerId);
      if (teleportAtTurnStart) {
        result.teleportArrivals.push({
          playerId: candidatePlayerId,
          destination: teleportAtTurnStart,
        });
      }

      if (this.playerTurnEffectsService.consumeAutoMoveOnTurnStart(worldState, candidatePlayerId)) {
        worldState.movedThisTurnByPlayer = {
          ...(worldState.movedThisTurnByPlayer ?? {}),
          [candidatePlayerId]: worldState.currentTurn,
        };
      }

      worldState.activePlayerId = candidatePlayerId;
      return result;
    }

    // Fallback guard against malformed state loops.
    worldState.activePlayerId = order[currentIndex < 0 ? 0 : currentIndex];

    return result;
  }

  private toggleTimeOnRoundChange(worldState: WorldState): void {
    const roundsPerToggle = Math.max(1, Math.floor(DAY_NIGHT_ROUNDS_PER_TOGGLE));
    const transitionsSinceStart = Math.max(0, worldState.currentTurn - 1);
    const shouldToggle = transitionsSinceStart % roundsPerToggle === 0;
    if (!shouldToggle) return;

    const currentTime = worldState.timeOfDay ?? "day";
    worldState.timeOfDay = currentTime === "day" ? "night" : "day";
  }

  private processRegionEffectsOnRoundStart(worldState: WorldState, result: TurnAdvanceResult): void {
    const active = worldState.activeRegionEffects;
    if (!active || active.length === 0) return;

    const surviving: typeof active = [];
    for (const effect of active) {
      if (effect.remainingRounds <= 0) continue;
      result.firingRegionEffects.push(effect);
      const remaining = effect.remainingRounds - 1;
      if (remaining > 0) {
        surviving.push({ ...effect, remainingRounds: remaining });
      }
    }
    worldState.activeRegionEffects = surviving;
  }
}
