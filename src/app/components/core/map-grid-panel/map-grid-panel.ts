import { Component, computed, inject, input, OnDestroy, output, signal } from "@angular/core";
import { Player } from "../../../models/Player";
import { MapCell, SanctuaryElement } from "../../../models/MapCell";
import { MapCellComponent } from "../../ui/map-cell/map-cell";
import { EnvironmentService, type EdgeDirection } from "../../../services/environment-service";
import { SanctuaryTilesConfigEntry } from "../../../models/TilesConfig";
import { isSpecialCellCoordinate } from "../../../consts/special-cells";
import { MAP_CELL_INSPECTION_HOVER_DELAY_MS } from "../../../consts/map-inspector";
import { LandmarksService } from "../../../services/landmarks-service";
import { WorldZonesService } from "../../../services/world-zones-service";
import { QuadrantId } from "../../../models/WorldZone";

interface QuadrantInfluenceOverlay {
  id: QuadrantId;
  startX: number;
  startY: number;
  size: number;
  borderColor: string;
  glowColor: string;
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
  public environmentByCellId = input.required<Record<string, string[]>>();
  public sanctuaryStylesByElement = input.required<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>();

  public cellClicked = output<MapGridPanelCell>();
  public inspectedCellChanged = output<MapGridPanelCell | null>();

  private hoveredCellId = signal<string | null>(null);

  public playersByCellId = computed<Record<string, Player[]>>(() => {
    const grouped: Record<string, Player[]> = {};
    for (const player of this.players()) {
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
}
