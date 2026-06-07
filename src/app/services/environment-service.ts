import { Injectable } from "@angular/core";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";

export type EdgeDirection = "top" | "right" | "bottom" | "left";

export interface BiomeEnvironment {
  biome: BiomeType;
  cellIds: string[];
}

@Injectable({
  providedIn: "root",
})
export class EnvironmentService {
  public getBiomeEnvironments(mapCellsById: Record<string, MapCell>): BiomeEnvironment[] {
    const visited = new Set<string>();
    const environments: BiomeEnvironment[] = [];

    for (const cellId of Object.keys(mapCellsById)) {
      if (visited.has(cellId)) continue;
      const root = mapCellsById[cellId];
      if (!root) continue;
      if (root.isSpecial === true) continue;
      const rootBiome = this.getEffectiveBiome(root);

      const queue: string[] = [cellId];
      const component: string[] = [];
      visited.add(cellId);

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) continue;
        const currentCell = mapCellsById[currentId];
        if (!currentCell) continue;

        component.push(currentId);
        const neighbors = this.getNeighborCoords(currentCell.x, currentCell.y);

        for (const neighbor of neighbors) {
          const neighborId = this.cellId(neighbor.x, neighbor.y);
          if (visited.has(neighborId)) continue;

          const neighborCell = mapCellsById[neighborId];
          if (!neighborCell) continue;
          if (neighborCell.isSpecial === true) continue;
          if (this.getEffectiveBiome(neighborCell) !== rootBiome) continue;

          visited.add(neighborId);
          queue.push(neighborId);
        }
      }

      if (component.length >= 2) {
        environments.push({
          biome: rootBiome,
          cellIds: component,
        });
      }
    }

    return environments;
  }

  public getEnvironmentByCellId(environments: BiomeEnvironment[]): Record<string, string[]> {
    const byCell: Record<string, string[]> = {};
    environments.forEach((environment) => {
      environment.cellIds.forEach((cellId) => {
        byCell[cellId] = environment.cellIds;
      });
    });

    return byCell;
  }

  public getMovableCellIdsForPlayer(
    player: Player,
    mapCellsById: Record<string, MapCell>,
    mapSize: number,
    environmentByCellId: Record<string, string[]>,
    allowDiagonalFromCurrent = false,
  ): Set<string> {
    const currentCellId = this.cellId(player.location.x, player.location.y);
    const environment = environmentByCellId[currentCellId];

    if (!environment || environment.length < 2) {
      return this.buildAdjacentTargetIds(player.location.x, player.location.y, mapSize, allowDiagonalFromCurrent);
    }

    const targets = this.buildMovementTargetIdsFromEnvironmentIds(environment, mapCellsById, mapSize);
    if (allowDiagonalFromCurrent) {
      this.buildAdjacentTargetIds(player.location.x, player.location.y, mapSize, true).forEach((targetId) => {
        targets.add(targetId);
      });
    }

    return targets;
  }

  public buildOrthogonalRangeTargetIds(x: number, y: number, maxDistance: number, mapSize: number): Set<string> {
    const normalizedDistance = Math.max(1, Math.floor(Number(maxDistance ?? 1)));
    const ids = new Set<string>();

    for (let offsetX = -normalizedDistance; offsetX <= normalizedDistance; offsetX += 1) {
      for (let offsetY = -normalizedDistance; offsetY <= normalizedDistance; offsetY += 1) {
        const distance = Math.abs(offsetX) + Math.abs(offsetY);
        if (distance === 0 || distance > normalizedDistance) {
          continue;
        }

        const targetX = x + offsetX;
        const targetY = y + offsetY;
        if (!this.isInsideBounds(targetX, targetY, mapSize)) {
          continue;
        }

        ids.add(this.cellId(targetX, targetY));
      }
    }

    return ids;
  }

  public buildMovementTargetIdsFromEnvironmentCells(environmentCells: MapCell[], mapSize: number): Set<string> {
    const targets = new Set<string>(environmentCells.map((cell) => this.cellId(cell.x, cell.y)));

    environmentCells.forEach((cell) => {
      this.getNeighborCoords(cell.x, cell.y)
        .filter((neighbor) => this.isInsideBounds(neighbor.x, neighbor.y, mapSize))
        .forEach((neighbor) => {
          targets.add(this.cellId(neighbor.x, neighbor.y));
        });
    });

    return targets;
  }

  public getEnvironmentBorderWidth(
    cellId: string,
    direction: EdgeDirection,
    hoveredEnvironmentCellIds: Set<string>,
  ): string {
    if (!hoveredEnvironmentCellIds.has(cellId)) return "0px";

    const coords = this.parseCellId(cellId);
    const neighbor = this.getNeighborByDirection(coords.x, coords.y, direction);
    if (!neighbor) return "2px";

    const neighborId = this.cellId(neighbor.x, neighbor.y);
    if (hoveredEnvironmentCellIds.has(neighborId)) return "0px";

    return "2px";
  }

  public isAdjacentCellId(fromX: number, fromY: number, targetCellId: string, includeDiagonals = false): boolean {
    return this.getNeighborCoords(fromX, fromY, includeDiagonals)
      .some((neighbor) => this.cellId(neighbor.x, neighbor.y) === targetCellId);
  }

  public getNeighborCoords(x: number, y: number, includeDiagonals = false): Array<{ x: number; y: number }> {
    const orthogonalNeighbors = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];

    if (!includeDiagonals) {
      return orthogonalNeighbors;
    }

    return [
      ...orthogonalNeighbors,
      { x: x + 1, y: y + 1 },
      { x: x + 1, y: y - 1 },
      { x: x - 1, y: y + 1 },
      { x: x - 1, y: y - 1 },
    ];
  }

  private buildMovementTargetIdsFromEnvironmentIds(
    environmentCellIds: string[],
    mapCellsById: Record<string, MapCell>,
    mapSize: number,
  ): Set<string> {
    const targets = new Set<string>(environmentCellIds);

    environmentCellIds.forEach((environmentCellId) => {
      const mapCell = mapCellsById[environmentCellId];
      if (!mapCell) return;
      if (mapCell.isSpecial === true) return;

      this.buildAdjacentTargetIds(mapCell.x, mapCell.y, mapSize).forEach((targetId) => {
        targets.add(targetId);
      });
    });

    return targets;
  }

  private buildAdjacentTargetIds(x: number, y: number, mapSize: number, includeDiagonals = false): Set<string> {
    const ids = new Set<string>();
    this.getNeighborCoords(x, y, includeDiagonals)
      .filter((candidate) => this.isInsideBounds(candidate.x, candidate.y, mapSize))
      .forEach((candidate) => {
        ids.add(this.cellId(candidate.x, candidate.y));
      });

    return ids;
  }

  private getNeighborByDirection(x: number, y: number, direction: EdgeDirection): { x: number; y: number } | null {
    if (direction === "top") return { x, y: y - 1 };
    if (direction === "right") return { x: x + 1, y };
    if (direction === "bottom") return { x, y: y + 1 };
    if (direction === "left") return { x: x - 1, y };
    return null;
  }

  private parseCellId(cellId: string): { x: number; y: number } {
    const [xRaw, yRaw] = cellId.split("_");
    return {
      x: Number(xRaw),
      y: Number(yRaw),
    };
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private isInsideBounds(x: number, y: number, size: number): boolean {
    return x >= 0 && x < size && y >= 0 && y < size;
  }

  private getEffectiveBiome(cell: MapCell): BiomeType {
    return cell.worldEventBiomeOverride ?? cell.biome;
  }
}
