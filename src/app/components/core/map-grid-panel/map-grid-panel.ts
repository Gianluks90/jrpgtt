import { Component, computed, inject, input, output, signal } from "@angular/core";
import { Player } from "../../../models/Player";
import { MapCell } from "../../../models/MapCell";
import { MapCellComponent } from "../../ui/map-cell/map-cell";
import { EnvironmentService, type EdgeDirection } from "../../../services/environment-service";

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

  public mapSize = input.required<number>();
  public mapCellsById = input.required<Record<string, MapCell>>();
  public players = input.required<Player[]>();
  public activePlayerId = input<string | null>(null);
  public movableCellIds = input.required<Set<string>>();
  public environmentByCellId = input.required<Record<string, string[]>>();

  public cellClicked = output<MapGridPanelCell>();

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
          isSpecial: this.isSpecialCell(x, y),
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
  }

  public onCellLeave(): void {
    this.hoveredCellId.set(null);
  }

  public environmentBorderWidth(cell: MapGridPanelCell, direction: EdgeDirection): string {
    return this.environmentService.getEnvironmentBorderWidth(cell.id, direction, this.hoveredEnvironmentCellIds());
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private isSpecialCell(x: number, y: number): boolean {
    return (
      (x === 3 && y === 3) ||
      (x === 6 && y === 3) ||
      (x === 3 && y === 6) ||
      (x === 6 && y === 6)
    );
  }
}
