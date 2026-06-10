import { Injectable } from "@angular/core";
import { MapCell } from "@models/world/MapCell";
import { GridCoordinate, PlayerTurnEffectsService } from "@services/player/player-turn-effects-service";
import { LandmarksService } from "@services/map/landmarks-service";
import { TranslationService } from "@services/shared/translation-service";

export interface FastTravelRouteOption {
  cellId: string;
  destinationName: string;
  landmarkId: string;
  x: number;
  y: number;
  cost: number;
}

@Injectable({
  providedIn: "root",
})
export class SafePlaceFastTravelService {
  private readonly maxTravelCost = 15;

  constructor(
    private playerTurnEffectsService: PlayerTurnEffectsService,
    private landmarksService: LandmarksService,
    private translationService: TranslationService,
  ) {}

  public isSafePlaceCell(cell: MapCell | null | undefined): cell is MapCell {
    return !!cell
      && cell.isSpecial === true
      && cell.specialType === "landmark"
      && cell.landmarkCategory === "safe"
      && typeof cell.landmarkId === "string"
      && cell.landmarkId.trim().length > 0;
  }

  public buildRoutes(originCell: MapCell, mapCellsById: Record<string, MapCell>): FastTravelRouteOption[] {
    const originCellId = this.cellId(originCell.x, originCell.y);
    const originCoordinate = this.toCoordinate(originCell);

    const routes = Object.entries(mapCellsById)
      .map(([cellId, cell]) => ({ cellId, cell }))
      .filter((entry) => this.isSafePlaceCell(entry.cell))
      .filter((entry) => entry.cellId !== originCellId)
      .map((entry) => ({
        cellId: entry.cellId,
        destinationName: this.getSafePlaceName(entry.cell),
        landmarkId: entry.cell.landmarkId ?? "unknown",
        x: entry.cell.x,
        y: entry.cell.y,
        cost: this.playerTurnEffectsService.calculateCappedOrthogonalDistance(
          originCoordinate,
          this.toCoordinate(entry.cell),
          this.maxTravelCost,
        ),
      } satisfies FastTravelRouteOption));

    routes.sort((left, right) => {
      if (left.cost !== right.cost) return left.cost - right.cost;
      const byName = left.destinationName.localeCompare(right.destinationName);
      if (byName !== 0) return byName;
      return left.cellId.localeCompare(right.cellId);
    });

    return routes;
  }

  public calculateTravelCost(from: GridCoordinate, to: GridCoordinate): number {
    return this.playerTurnEffectsService.calculateCappedOrthogonalDistance(from, to, this.maxTravelCost);
  }

  public getSafePlaceName(cell: MapCell): string {
    if (cell.specialType === "landmark") {
      return this.landmarksService.getLocalizedLandmarkNameFromCell(cell);
    }

    return this.translationService.tOrFallback("map.landmarks.categories.safe", "Safe place");
  }

  private toCoordinate(cell: MapCell): GridCoordinate {
    return {
      x: cell.x,
      y: cell.y,
    };
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}