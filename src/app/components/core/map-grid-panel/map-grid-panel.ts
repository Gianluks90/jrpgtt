import { Component, computed, inject, input, OnDestroy, output, signal } from "@angular/core";
import { Player } from "../../../models/Player";
import { MapCell, SanctuaryElement } from "../../../models/MapCell";
import { MapCellComponent } from "../../ui/map-cell/map-cell";
import { EnvironmentService, type EdgeDirection } from "../../../services/environment-service";
import { SanctuaryTilesConfigEntry, TilesConfig } from "../../../models/TilesConfig";
import { isSpecialCellCoordinate } from "../../../consts/special-cells";
import { MAP_CELL_INSPECTION_HOVER_DELAY_MS } from "../../../consts/map-inspector";
import { LandmarksService } from "../../../services/landmarks-service";
import { WorldZonesService } from "../../../services/world-zones-service";
import { QuadrantId } from "../../../models/WorldZone";
import {
  FastTravelAnimationState,
  FastTravelVisualService,
} from "../../../services/fast-travel-visual-service";
import { RegionBoundaryWarningState } from "../../../services/world-event-region-transition-service";

interface QuadrantInfluenceOverlay {
  id: QuadrantId;
  startX: number;
  startY: number;
  size: number;
  borderColor: string;
  glowColor: string;
}

interface FastTravelLineOverlay {
  left: number;
  top: number;
  width: number;
  angleDeg: number;
  color: string;
}

interface FastTravelMarkerOverlay {
  left: number;
  top: number;
  color: string;
}

interface PercentPoint {
  x: number;
  y: number;
}

interface RegionBoundaryWarningOverlay {
  leftPercent: number;
  topPercent: number;
  cellHeightPercent: number;
}

export interface MapGridPanelCell {
  x: number;
  y: number;
  id: string;
  mapCell: MapCell | null;
  players: Player[];
  isSpecial: boolean;
}

@Component({
  selector: "app-map-grid-panel",
  imports: [MapCellComponent],
  templateUrl: "./map-grid-panel.html",
  styleUrl: "./map-grid-panel.scss",
})
export class MapGridPanel {
  private environmentService = inject(EnvironmentService);
  private landmarksService = inject(LandmarksService);
  private worldZonesService = inject(WorldZonesService);
  private fastTravelVisualService = inject(FastTravelVisualService);
  private hoverActivationTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverProgressTimer: ReturnType<typeof setInterval> | null = null;
  private pendingHoverActivationCellId: string | null = null;
  private inspectedCellId: string | null = null;
  private hoverProgressCellId = signal<string | null>(null);
  private hoverProgressPercent = signal(0);

  public mapSize = input.required<number>();
  public mapCellsById = input.required<Record<string, MapCell>>();
  public players = input.required<Player[]>();
  public activePlayerId = input<string | null>(null);
  public movableCellIds = input.required<Set<string>>();
  public regionIToIIWarning = input<RegionBoundaryWarningState | null>(null);
  public tilesConfig = input<TilesConfig | null>(null);
  public environmentByCellId = input.required<Record<string, string[]>>();
  public sanctuaryStylesByElement = input.required<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>();

  public cellClicked = output<MapGridPanelCell>();
  public inspectedCellChanged = output<MapGridPanelCell | null>();

  private hoveredCellId = signal<string | null>(null);
  public fastTravelAnimationState = this.fastTravelVisualService.state;

  public playersByCellId = computed<Record<string, Player[]>>(() => {
    const grouped: Record<string, Player[]> = {};
    const hiddenPlayerId = this.fastTravelAnimationState()?.playerId ?? null;

    for (const player of this.players()) {
      if (hiddenPlayerId && player.id === hiddenPlayerId) {
        continue;
      }

      const id = this.cellId(player.location.x, player.location.y);
      const bucket = grouped[id] ?? [];
      bucket.push(player);
      grouped[id] = bucket;
    }
    return grouped;
  });

  public cells = computed<MapGridPanelCell[]>(() => {
    const size = this.mapSize();
    const mapCells = this.mapCellsById();
    const playersByCell = this.playersByCellId();
    const cells: MapGridPanelCell[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const id = this.cellId(x, y);
        cells.push({
          x,
          y,
          id,
          mapCell: mapCells[id] ?? null,
          players: playersByCell[id] ?? [],
          isSpecial: this.isSpecialCell(x, y, mapCells[id] ?? null),
        });
      }
    }

    return cells;
  });

  public hoveredEnvironmentCellIds = computed<Set<string>>(() => {
    const hoveredCellId = this.hoveredCellId();
    if (!hoveredCellId) return new Set<string>();

    const environment = this.environmentByCellId()[hoveredCellId];
    if (environment) return new Set<string>(environment);

    return new Set<string>([hoveredCellId]);
  });

  public quadrantInfluenceOverlays = computed<QuadrantInfluenceOverlay[]>(() => {
    const size = this.mapSize();
    if (size <= 0) return [];
    const specialActiveCells = Object.values(this.mapCellsById()).filter((cell) => {
      return cell.isSpecial === true && cell.specialType === "sanctuary" && cell.active === true && !!cell.sanctuaryElement;
    });

    const overlays = new Map<QuadrantId, QuadrantInfluenceOverlay>();
    for (const cell of specialActiveCells) {
      const quadrantId = this.worldZonesService.getQuadrantIdByCoordinate(cell.x, cell.y, size);
      const bounds = this.worldZonesService.getQuadrantBounds(quadrantId, size);
      const colors = this.colorsForElement(cell.sanctuaryElement as SanctuaryElement);

      overlays.set(quadrantId, {
        id: quadrantId,
        startX: bounds.startX,
        startY: bounds.startY,
        size: bounds.size,
        borderColor: colors.border,
        glowColor: colors.glow,
      });
    }

    return Array.from(overlays.values());
  });

  public fastTravelLineOverlay = computed<FastTravelLineOverlay | null>(() => {
    const state = this.fastTravelAnimationState();
    if (!state) return null;

    const start = this.cellCenterToPercentPoint(state.origin.x, state.origin.y);
    const end = this.cellCenterToPercentPoint(state.destination.x, state.destination.y);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const width = Math.hypot(dx, dy);
    if (width <= 0) return null;

    return {
      left: start.x,
      top: start.y,
      width,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      color: state.playerColor,
    };
  });

  public fastTravelMarkerOverlay = computed<FastTravelMarkerOverlay | null>(() => {
    const state = this.fastTravelAnimationState();
    if (!state) return null;

    const segment = this.segmentForPhase(state);
    const point = this.interpolatePoint(segment.from, segment.to, state.progress);

    return {
      left: point.x,
      top: point.y,
      color: state.playerColor,
    };
  });

  public regionBoundaryWarningOverlay = computed<RegionBoundaryWarningOverlay | null>(() => {
    const warning = this.regionIToIIWarning();
    if (!warning) return null;

    const size = Math.max(1, Math.floor(this.mapSize()));
    const clampedRow = Math.min(Math.max(0, warning.playerRow), size - 1);
    const boundaryColumn = Math.min(Math.max(0, warning.boundaryColumn), size);
    const cellPercent = 100 / size;

    return {
      leftPercent: boundaryColumn * cellPercent,
      topPercent: clampedRow * cellPercent,
      cellHeightPercent: cellPercent,
    };
  });

  public isMovableCell(cell: MapGridPanelCell): boolean {
    return this.movableCellIds().has(cell.id);
  }

  public isHoveredEnvironmentCell(cell: MapGridPanelCell): boolean {
    return this.hoveredEnvironmentCellIds().has(cell.id);
  }

  public isRevealedCell(cell: MapGridPanelCell): boolean {
    const mapCell = cell.mapCell;
    return !!mapCell?.biome && !!mapCell?.discoveredBy;
  }

  public isInactiveRevealedSanctuaryCell(cell: MapGridPanelCell): boolean {
    if (!this.isRevealedCell(cell)) return false;
    return cell.mapCell?.specialType === "sanctuary" && cell.mapCell.active !== true;
  }

  public isImpassableCell(cell: MapGridPanelCell): boolean {
    if (!this.isRevealedCell(cell)) return false;
    if (cell.isSpecial || !cell.mapCell) return false;

    const config = this.tilesConfig();
    if (!config) return false;

    const conditionIds = config.biomes[cell.mapCell.biome]?.conditions ?? [];
    return conditionIds.includes("impassable");
  }

  public dangerOverlayLevel(cell: MapGridPanelCell): 0 | 1 | 2 {
    if (!this.isRevealedCell(cell)) return 0;
    if (cell.x >= 8) return 2;
    if (cell.x >= 5) return 1;
    return 0;
  }

  public onCellEnter(cell: MapGridPanelCell): void {
    this.hoveredCellId.set(cell.id);
    this.pendingHoverActivationCellId = cell.id;
    this.clearHoverActivationTimer();
    this.startHoverProgress(cell.id);

    this.hoverActivationTimer = setTimeout(() => {
      if (this.hoveredCellId() !== cell.id) return;
      if (this.pendingHoverActivationCellId !== cell.id) return;

      this.inspectedCellId = cell.id;
      this.inspectedCellChanged.emit(cell);
    }, MAP_CELL_INSPECTION_HOVER_DELAY_MS);
  }

  public onCellLeave(cell: MapGridPanelCell): void {
    if (this.hoveredCellId() === cell.id) {
      this.hoveredCellId.set(null);
    }

    if (this.pendingHoverActivationCellId === cell.id) {
      this.pendingHoverActivationCellId = null;
      this.clearHoverActivationTimer();
    }

    if (this.hoverProgressCellId() === cell.id) {
      this.clearHoverProgressTimer();
      this.hoverProgressCellId.set(null);
      this.hoverProgressPercent.set(0);
    }

    if (this.inspectedCellId === cell.id) {
      this.inspectedCellId = null;
      this.inspectedCellChanged.emit(null);
    }
  }

  public ngOnDestroy(): void {
    this.clearHoverActivationTimer();
    this.clearHoverProgressTimer();
  }

  public hoverIntentProgressForCell(cell: MapGridPanelCell): number {
    if (this.hoverProgressCellId() !== cell.id) return 0;
    return this.hoverProgressPercent();
  }

  public sanctuaryStyleForCell(cell: MapGridPanelCell): SanctuaryTilesConfigEntry | null {
    const element = cell.mapCell?.sanctuaryElement;
    if (!element) return null;
    return this.sanctuaryStylesByElement()[element] ?? null;
  }

  public specialTypeForCell(cell: MapGridPanelCell): "sanctuary" | "landmark" | null {
    if (cell.mapCell?.specialType === "sanctuary") return "sanctuary";
    if (cell.mapCell?.specialType === "landmark") return "landmark";
    if (isSpecialCellCoordinate(cell.x, cell.y)) return "sanctuary";
    return null;
  }

  public landmarkIconUrlForCell(cell: MapGridPanelCell): string | null {
    if (cell.mapCell?.specialType !== "landmark") return null;
    return this.landmarksService.getCategoryIconUrl(cell.mapCell.landmarkCategory);
  }

  public environmentBorderWidth(cell: MapGridPanelCell, direction: EdgeDirection): string {
    return this.environmentService.getEnvironmentBorderWidth(cell.id, direction, this.hoveredEnvironmentCellIds());
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private isSpecialCell(x: number, y: number, mapCell: MapCell | null): boolean {
    return mapCell?.isSpecial === true || isSpecialCellCoordinate(x, y);
  }

  private colorsForElement(element: SanctuaryElement): { border: string; glow: string } {
    if (element === "water") {
      return {
        border: "rgba(108, 184, 255, 0.72)",
        glow: "rgba(108, 184, 255, 0.42)",
      };
    }

    if (element === "fire") {
      return {
        border: "rgba(255, 138, 95, 0.72)",
        glow: "rgba(255, 138, 95, 0.4)",
      };
    }

    if (element === "wind") {
      return {
        border: "rgba(201, 171, 255, 0.72)",
        glow: "rgba(201, 171, 255, 0.38)",
      };
    }

    return {
      border: "rgba(232, 210, 121, 0.72)",
      glow: "rgba(232, 210, 121, 0.38)",
    };
  }

  private clearHoverActivationTimer(): void {
    if (!this.hoverActivationTimer) return;
    clearTimeout(this.hoverActivationTimer);
    this.hoverActivationTimer = null;
  }

  private startHoverProgress(cellId: string): void {
    this.clearHoverProgressTimer();
    this.hoverProgressCellId.set(cellId);
    this.hoverProgressPercent.set(0);

    const startedAt = Date.now();
    const totalMs = MAP_CELL_INSPECTION_HOVER_DELAY_MS;

    this.hoverProgressTimer = setInterval(() => {
      if (this.pendingHoverActivationCellId !== cellId) {
        this.clearHoverProgressTimer();
        return;
      }

      const elapsed = Date.now() - startedAt;
      const ratio = Math.max(0, Math.min(1, elapsed / totalMs));
      this.hoverProgressPercent.set(Math.round(ratio * 100));

      if (ratio >= 1) {
        this.clearHoverProgressTimer();
      }
    }, 50);
  }

  private clearHoverProgressTimer(): void {
    if (!this.hoverProgressTimer) return;
    clearInterval(this.hoverProgressTimer);
    this.hoverProgressTimer = null;
  }

  private segmentForPhase(state: FastTravelAnimationState): { from: PercentPoint; to: PercentPoint } {
    const originCenter = this.cellCenterToPercentPoint(state.origin.x, state.origin.y);
    const midpoint = this.cellCenterToPercentPoint(state.midpoint.x, state.midpoint.y);
    const destinationCenter = this.cellCenterToPercentPoint(state.destination.x, state.destination.y);

    if (state.phase === "booked") {
      return {
        from: originCenter,
        to: originCenter,
      };
    }

    if (state.phase === "to-midpoint") {
      return {
        from: originCenter,
        to: midpoint,
      };
    }

    if (state.phase === "midpoint") {
      return {
        from: midpoint,
        to: midpoint,
      };
    }

    return {
      from: midpoint,
      to: destinationCenter,
    };
  }

  private cellCenterToPercentPoint(x: number, y: number): PercentPoint {
    const size = Math.max(1, this.mapSize());
    return {
      x: ((x + 0.5) / size) * 100,
      y: ((y + 0.5) / size) * 100,
    };
  }

  private interpolatePoint(from: PercentPoint, to: PercentPoint, progress: number): PercentPoint {
    const normalizedProgress = Math.max(0, Math.min(1, progress));
    return {
      x: from.x + (to.x - from.x) * normalizedProgress,
      y: from.y + (to.y - from.y) * normalizedProgress,
    };
  }
}
