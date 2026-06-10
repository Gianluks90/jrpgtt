import { Injectable } from "@angular/core";
import { MP_RECOVERY_PERCENT } from "../../consts/player/mp-config";
import { PendingFastTravelState, PendingTeleportState, WorldState } from "@models/world/WorldState";

export interface GridCoordinate {
  x: number;
  y: number;
}

@Injectable({
  providedIn: "root",
})
export class PlayerTurnEffectsService {

  public calculateRecoveredMpCurrentOnTurnStart(mp: { current: number; max?: number; base: number }): number {
    const base = this.normalizePoints(mp.base);
    const max = typeof mp.max === "number" ? this.normalizePoints(mp.max) : base;
    const current = Math.min(max, this.normalizePoints(mp.current));

    if (max <= 0 || current >= max) {
      return current;
    }

    const recoveryAmount = Math.max(1, Math.floor((max * MP_RECOVERY_PERCENT) / 100));
    return Math.min(max, current + recoveryAmount);
  }
  
  public scheduleAutoMoveOnTurnStart(worldState: WorldState, playerId: string): void {
    if (!playerId) return;

    const pendingMoves = { ...(worldState.pendingAutoMoveOnTurnStartByPlayer ?? {}) };
    pendingMoves[playerId] = true;
    worldState.pendingAutoMoveOnTurnStartByPlayer = pendingMoves;
  }

  public consumeAutoMoveOnTurnStart(worldState: WorldState, playerId: string): boolean {
    if (!playerId) return false;

    const pendingMoves = { ...(worldState.pendingAutoMoveOnTurnStartByPlayer ?? {}) };
    if (pendingMoves[playerId] !== true) {
      return false;
    }

    delete pendingMoves[playerId];
    if (Object.keys(pendingMoves).length === 0) {
      delete worldState.pendingAutoMoveOnTurnStartByPlayer;
    } else {
      worldState.pendingAutoMoveOnTurnStartByPlayer = pendingMoves;
    }

    return true;
  }

  public scheduleStagedFastTravel(
    worldState: WorldState,
    playerId: string,
    origin: GridCoordinate,
    destination: GridCoordinate,
  ): void {
    if (!playerId) return;

    const pendingFastTravelByPlayer = { ...(worldState.pendingFastTravelByPlayer ?? {}) };
    pendingFastTravelByPlayer[playerId] = {
      origin: this.normalizeCoordinate(origin),
      destination: this.normalizeCoordinate(destination),
      stage: "booked",
    };

    worldState.pendingFastTravelByPlayer = pendingFastTravelByPlayer;
  }

  public getPendingFastTravel(worldState: WorldState, playerId: string): PendingFastTravelState | null {
    if (!playerId) return null;

    const pending = worldState.pendingFastTravelByPlayer?.[playerId];
    if (!pending) {
      return null;
    }

    return {
      origin: this.normalizeCoordinate(pending.origin),
      destination: this.normalizeCoordinate(pending.destination),
      stage: pending.stage === "midpoint" ? "midpoint" : "booked",
    };
  }

  public moveFastTravelToMidpoint(worldState: WorldState, playerId: string): PendingFastTravelState | null {
    const pending = this.getPendingFastTravel(worldState, playerId);
    if (!pending || pending.stage !== "booked") {
      return null;
    }

    const pendingFastTravelByPlayer = { ...(worldState.pendingFastTravelByPlayer ?? {}) };
    pendingFastTravelByPlayer[playerId] = {
      ...pending,
      stage: "midpoint",
    };

    worldState.pendingFastTravelByPlayer = pendingFastTravelByPlayer;

    return pendingFastTravelByPlayer[playerId];
  }

  public consumeFastTravelArrival(worldState: WorldState, playerId: string): PendingFastTravelState | null {
    const pending = this.getPendingFastTravel(worldState, playerId);
    if (!pending || pending.stage !== "midpoint") {
      return null;
    }

    const pendingFastTravelByPlayer = { ...(worldState.pendingFastTravelByPlayer ?? {}) };
    delete pendingFastTravelByPlayer[playerId];

    if (Object.keys(pendingFastTravelByPlayer).length === 0) {
      delete worldState.pendingFastTravelByPlayer;
    } else {
      worldState.pendingFastTravelByPlayer = pendingFastTravelByPlayer;
    }

    return pending;
  }

  public scheduleSkippedTurns(worldState: WorldState, playerId: string, turns: number): void {
    if (!playerId) return;

    const normalizedTurns = this.normalizeTurns(turns);
    if (normalizedTurns <= 0) return;

    const current = this.getSkippedTurns(worldState, playerId);
    this.setSkippedTurns(worldState, playerId, current + normalizedTurns);
  }

  public scheduleSkippedTurnsMax(worldState: WorldState, playerId: string, turns: number): void {
    if (!playerId) return;

    const normalizedTurns = this.normalizeTurns(turns);
    if (normalizedTurns <= 0) return;

    const current = this.getSkippedTurns(worldState, playerId);
    this.setSkippedTurns(worldState, playerId, Math.max(current, normalizedTurns));
  }

  public getSkippedTurns(worldState: WorldState, playerId: string): number {
    if (!playerId) return 0;

    const raw = worldState.skippedTurnsByPlayer?.[playerId];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return 0;
    }

    return Math.max(0, Math.floor(raw));
  }

  public consumeSkippedTurn(worldState: WorldState, playerId: string): boolean {
    const current = this.getSkippedTurns(worldState, playerId);
    if (current <= 0) {
      return false;
    }

    this.setSkippedTurns(worldState, playerId, current - 1);
    return true;
  }

  public scheduleTeleport(worldState: WorldState, playerId: string, destination: GridCoordinate): void {
    if (!playerId) return;

    const teleports = { ...(worldState.pendingTeleportsByPlayer ?? {}) };
    teleports[playerId] = {
      x: Math.max(0, Math.floor(Number(destination.x ?? 0))),
      y: Math.max(0, Math.floor(Number(destination.y ?? 0))),
    };

    worldState.pendingTeleportsByPlayer = teleports;
  }

  public consumeTeleport(worldState: WorldState, playerId: string): PendingTeleportState | null {
    if (!playerId) return null;

    const teleports = { ...(worldState.pendingTeleportsByPlayer ?? {}) };
    const pending = teleports[playerId];
    if (!pending) {
      return null;
    }

    delete teleports[playerId];
    if (Object.keys(teleports).length === 0) {
      delete worldState.pendingTeleportsByPlayer;
    } else {
      worldState.pendingTeleportsByPlayer = teleports;
    }

    return {
      x: Math.max(0, Math.floor(Number(pending.x ?? 0))),
      y: Math.max(0, Math.floor(Number(pending.y ?? 0))),
    };
  }

  public calculateOrthogonalDistance(from: GridCoordinate, to: GridCoordinate): number {
    const fromX = Math.floor(Number(from.x ?? 0));
    const fromY = Math.floor(Number(from.y ?? 0));
    const toX = Math.floor(Number(to.x ?? 0));
    const toY = Math.floor(Number(to.y ?? 0));

    return Math.abs(fromX - toX) + Math.abs(fromY - toY);
  }

  public calculateCappedOrthogonalDistance(from: GridCoordinate, to: GridCoordinate, maxDistance: number): number {
    const normalizedCap = Math.max(1, Math.floor(Number(maxDistance ?? 1)));
    return Math.min(normalizedCap, this.calculateOrthogonalDistance(from, to));
  }

  private setSkippedTurns(worldState: WorldState, playerId: string, turns: number): void {
    const nextTurns = this.normalizeTurns(turns);
    const skips = { ...(worldState.skippedTurnsByPlayer ?? {}) };

    if (nextTurns <= 0) {
      delete skips[playerId];
    } else {
      skips[playerId] = nextTurns;
    }

    if (Object.keys(skips).length === 0) {
      delete worldState.skippedTurnsByPlayer;
      return;
    }

    worldState.skippedTurnsByPlayer = skips;
  }

  private normalizeTurns(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.floor(value));
  }

  private normalizeCoordinate(value: GridCoordinate): PendingTeleportState {
    return {
      x: Math.max(0, Math.floor(Number(value?.x ?? 0))),
      y: Math.max(0, Math.floor(Number(value?.y ?? 0))),
    };
  }

  private normalizePoints(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.floor(value));
  }
}