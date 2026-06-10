import { Injectable } from "@angular/core";
import { QuadrantId, RegionLabel, RegionSelector } from "@models/world/WorldZone";

export interface QuadrantBounds {
  startX: number;
  startY: number;
  size: number;
}

@Injectable({
  providedIn: "root",
})
export class WorldZonesService {
  public getRegionLabelByColumn(x: number, mapSize: number): RegionLabel {
    const size = Math.max(1, Math.floor(mapSize));
    const firstBoundary = Math.max(1, Math.floor(size * 0.5));
    const secondBoundary = Math.max(firstBoundary + 1, Math.floor(size * 0.8));

    if (x < firstBoundary) return "I";
    if (x < secondBoundary) return "II";
    return "III";
  }

  public getRegionColumns(selector: RegionSelector, mapSize: number): number[] {
    const size = Math.max(1, Math.floor(mapSize));
    const allColumns = Array.from({ length: size }, (_, index) => index);

    if (selector === "first") {
      return allColumns.filter((column) => this.getRegionLabelByColumn(column, size) === "I");
    }

    if (selector === "second") {
      return allColumns.filter((column) => this.getRegionLabelByColumn(column, size) === "II");
    }

    if (selector === "third") {
      return allColumns.filter((column) => this.getRegionLabelByColumn(column, size) === "III");
    }

    return allColumns;
  }

  public getQuadrantIdByCoordinate(x: number, y: number, mapSize: number): QuadrantId {
    const split = this.getQuadrantSplit(mapSize);
    const isRight = x >= split;
    const isBottom = y >= split;

    if (!isRight && !isBottom) return "Q1";
    if (isRight && !isBottom) return "Q2";
    if (!isRight && isBottom) return "Q3";
    return "Q4";
  }

  public getQuadrantBounds(quadrantId: QuadrantId, mapSize: number): QuadrantBounds {
    const size = this.getQuadrantSplit(mapSize);
    const startX = quadrantId === "Q2" || quadrantId === "Q4" ? size : 0;
    const startY = quadrantId === "Q3" || quadrantId === "Q4" ? size : 0;
    return {
      startX,
      startY,
      size,
    };
  }

  private getQuadrantSplit(mapSize: number): number {
    return Math.max(1, Math.floor(Math.max(1, Math.floor(mapSize)) / 2));
  }
}
