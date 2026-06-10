import { Injectable } from "@angular/core";
import { Player } from "@models/player/Player";
import { WorldState } from "@models/world/WorldState";
import { WorldZonesService } from "@services/map/world-zones-service";

export interface RegionBoundaryWarningState {
  boundaryColumn: number;
  playerRow: number;
}

const REGION_I_TO_II_WORLD_EVENT_TITLE = "Region I -> II";

@Injectable({
  providedIn: "root",
})
export class WorldEventRegionTransitionService {
  constructor(private worldZonesService: WorldZonesService) {}

  public hasRegionIToIIEventBeenEmitted(worldState: WorldState | null | undefined): boolean {
    return worldState?.worldEvent?.emitted === true;
  }

  public ensureRegionIToIIEventState(worldState: WorldState): void {
    const previousWorldEvent = worldState.worldEvent;
    worldState.worldEvent = {
      ...previousWorldEvent,
      title: previousWorldEvent?.title?.trim() || REGION_I_TO_II_WORLD_EVENT_TITLE,
      emitted: previousWorldEvent?.emitted === true,
    };
  }

  public shouldShowRegionIToIIBoundaryWarning(input: {
    player: Player | null;
    worldState: WorldState | null;
    mapSize: number;
  }): RegionBoundaryWarningState | null {
    if (!input.player) return null;
    if (this.hasRegionIToIIEventBeenEmitted(input.worldState)) return null;

    const mapSize = Math.max(1, Math.floor(input.mapSize));
    const currentRegion = this.worldZonesService.getRegionLabelByColumn(input.player.location.x, mapSize);
    if (currentRegion !== "I") return null;

    const boundaryColumn = this.firstRegionBoundaryColumn(mapSize);
    const regionILimitColumn = Math.max(0, boundaryColumn - 1);
    if (input.player.location.x < regionILimitColumn) return null;

    return {
      boundaryColumn,
      playerRow: input.player.location.y,
    };
  }

  public shouldConfirmCrossingFromRegionIToII(input: {
    player: Player;
    targetX: number;
    mapSize: number;
    worldState: WorldState | null;
  }): boolean {
    if (this.hasRegionIToIIEventBeenEmitted(input.worldState)) return false;

    const mapSize = Math.max(1, Math.floor(input.mapSize));
    const sourceRegion = this.worldZonesService.getRegionLabelByColumn(input.player.location.x, mapSize);
    const targetRegion = this.worldZonesService.getRegionLabelByColumn(input.targetX, mapSize);

    return sourceRegion === "I" && targetRegion === "II";
  }

  public shouldEmitRegionIToIIEventOnMove(input: {
    worldState: WorldState;
    sourceX: number;
    targetX: number;
    mapSize: number;
  }): boolean {
    if (this.hasRegionIToIIEventBeenEmitted(input.worldState)) return false;

    const mapSize = Math.max(1, Math.floor(input.mapSize));
    const sourceRegion = this.worldZonesService.getRegionLabelByColumn(input.sourceX, mapSize);
    const targetRegion = this.worldZonesService.getRegionLabelByColumn(input.targetX, mapSize);

    return sourceRegion === "I" && targetRegion === "II";
  }

  private firstRegionBoundaryColumn(mapSize: number): number {
    return this.worldZonesService.getRegionColumns("first", mapSize).length;
  }
}
