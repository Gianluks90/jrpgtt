import { Component, computed, inject, input } from "@angular/core";
import { isSpecialCellCoordinate } from "../../../consts/special-cells";
import { MapCell, SanctuaryElement, BiomeType } from "../../../models/MapCell";
import { Player } from "../../../models/Player";
import { ResourceLabel } from "../../../models/Resource";
import { SanctuaryTilesConfigEntry, TilesConfig } from "../../../models/TilesConfig";
import { MapGridPanelCell } from "../../core/map-grid-panel/map-grid-panel";
import { LandmarksService } from "../../../services/landmarks-service";
import { ActionCatalogService } from "../../../services/action-catalog-service";

@Component({
  selector: "app-map-cell-inspector-panel",
  standalone: true,
  templateUrl: "./map-cell-inspector-panel.html",
  styleUrl: "./map-cell-inspector-panel.scss",
})
export class MapCellInspectorPanel {
  private landmarksService = inject(LandmarksService);
  private actionCatalogService = inject(ActionCatalogService);
  public inspectedCell = input<MapGridPanelCell | null>(null);
  public activePlayer = input<Player | null>(null);
  public players = input<Player[]>([]);
  public mapCellsById = input<Record<string, MapCell>>({});
  public mapSize = input(10);
  public tilesConfig = input<TilesConfig | null>(null);
  public environmentByCellId = input<Record<string, string[]>>({});
  public biomeResourcesByBiome = input<Partial<Record<BiomeType, ResourceLabel[]>>>({});
  public sanctuaryStylesByElement = input<Partial<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>>({});

  public locationInfoCell = computed<MapGridPanelCell | null>(() => {
    const inspected = this.inspectedCell();
    if (inspected) {
      const liveMapCell = this.mapCellsById()[inspected.id] ?? null;
      return {
        ...inspected,
        mapCell: liveMapCell,
      };
    }

    const active = this.activePlayer();
    if (!active) return null;

    const x = active.location.x;
    const y = active.location.y;
    const id = this.cellId(x, y);
    const mapCell = this.mapCellsById()[id] ?? null;
    const playersOnCell = this.players().filter((player) => player.location.x === x && player.location.y === y);

    return {
      x,
      y,
      id,
      mapCell,
      players: playersOnCell,
      isSpecial: isSpecialCellCoordinate(x, y) || mapCell?.isSpecial === true,
    };
  });

  public currentCellCoordinatesLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const displayX = cell.x + 1;
    const displayY = cell.y + 1;
    return `${displayX}, ${displayY}`;
  });

  public currentCellId = computed<string | null>(() => {
    return this.locationInfoCell()?.id ?? null;
  });

  public currentCell = computed<MapCell | null>(() => {
    return this.locationInfoCell()?.mapCell ?? null;
  });

  public currentCellBiome = computed<BiomeType | null>(() => {
    const cell = this.currentCell();
    if (!cell) return null;
    if (cell.isSpecial === true && cell.specialType === "sanctuary") return null;
    return cell.biome;
  });

  public currentCellBiomeLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return cell.landmarkDisplayName ?? "Unknown Landmark";
      }
      return this.sanctuaryElementToLabel(cell.sanctuaryElement);
    }

    const biome = this.currentCellBiome();
    if (!biome) return "? ? ?";
    return this.biomeToLabel(biome);
  });

  public currentCellResourcesLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) return "None";

    const biome = this.currentCellBiome();
    if (!biome) return "-";
    const resources = this.biomeResourcesByBiome()[biome] ?? [];
    if (resources.length === 0) return "None";
    return resources.map((resource) => this.resourceToLabel(resource)).join(", ");
  });

  public currentCellIsEnvironment = computed<boolean>(() => {
    if (this.currentCell()?.isSpecial === true) return false;

    const cellId = this.currentCellId();
    if (!cellId) return false;
    return (this.environmentByCellId()[cellId]?.length ?? 0) >= 2;
  });

  public currentCellEnvironmentSize = computed<number>(() => {
    if (this.currentCell()?.isSpecial === true) return 0;

    const cellId = this.currentCellId();
    if (!cellId) return 0;
    return this.environmentByCellId()[cellId]?.length ?? 0;
  });

  public currentCellEnvironmentLabel = computed<string>(() => {
    const size = this.currentCellEnvironmentSize();
    if (size < 2) {
      return "No";
    }

    return `Yes (${size} cells)`;
  });

  public currentCellSectorLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const size = this.mapSize();
    if (size <= 0) return "-";

    const firstBoundary = Math.max(1, Math.floor(size * 0.5));
    const secondBoundary = Math.max(firstBoundary + 1, Math.floor(size * 0.8));

    if (cell.x < firstBoundary) return "I";
    if (cell.x < secondBoundary) return "II";
    return "III";
  });

  public currentCellEnemiesLevelLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const centerLevel = cell.x + 1;
    const minLevel = Math.max(1, centerLevel - 1);
    const maxLevel = Math.min(10, centerLevel + 1);
    return `${minLevel}-${maxLevel}`;
  });

  public currentCellActions = computed<Array<{ id: string; label: string; description: string }>>(() => {
    const cell = this.currentCell();
    if (!cell) {
      return [];
    }

    const actionIds = this.getConfiguredCellActionIds(cell);
    return actionIds.map((actionId) => {
      return {
        id: actionId,
        label: this.actionCatalogService.getLabel(actionId, this.humanizeActionId(actionId)),
        description: this.actionCatalogService.getDescription(actionId, "No description available."),
      };
    });
  });

  public currentCellIsSpecial = computed<boolean>(() => {
    const infoCell = this.locationInfoCell();
    if (!infoCell) return false;
    if (infoCell.isSpecial) return true;
    return this.currentCell()?.isSpecial === true;
  });

  public currentCellSpecialStatusLabel = computed<string>(() => {
    if (!this.currentCellIsSpecial()) return "-";
    const currentCell = this.currentCell();
    if (currentCell?.specialType === "landmark") {
      return `${this.landmarksService.getCategoryLabel(currentCell.landmarkCategory)} discovered`;
    }

    const sanctuaryIsActive = currentCell?.active === true;
    return sanctuaryIsActive ? "Sanctuary active" : "Sanctuary inactive";
  });

  public currentCellSpecialDescription = computed<string>(() => {
    if (!this.currentCellIsSpecial()) return "-";

    const currentCell = this.currentCell();
    if (currentCell?.specialType === "landmark") {
      const alignment = currentCell.landmarkAlignmentModifier ? ` (${currentCell.landmarkAlignmentModifier})` : "";
      return `A ${this.landmarksService.getCategoryLabel(currentCell.landmarkCategory)}${alignment} overlays this biome tile.`;
    }

    const sanctuaryElement = currentCell?.sanctuaryElement;
    if (!sanctuaryElement) {
      return "The sanctuary is still dormant and hidden.";
    }

    const config = this.sanctuaryStylesByElement()[sanctuaryElement];
    if (!config) return "-";

    const sanctuaryIsActive = currentCell?.active === true;
    return sanctuaryIsActive ? config.description.active : config.description.inactive;
  });

  public currentCellPreviewBackground = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true && cell.specialType === "sanctuary") {
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.backgroundColor ?? "#5f5a47";
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "#788b69";
    if (biome === "forest") return "#496149";
    if (biome === "mountain") return "#7a7977";
    if (biome === "water") return "#4b658d";
    if (biome === "desert") return "#9f8a64";
    if (biome === "ruins") return "#665953";
    return "#050505";
  });

  public currentCellPreviewIconUrl = computed<string | null>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return this.landmarksService.getCategoryIconUrl(cell.landmarkCategory);
      }
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.iconUrl ?? null;
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "/map-icons/plains-tile-icon.svg";
    if (biome === "forest") return "/map-icons/forest-tile-icon.svg";
    if (biome === "mountain") return "/map-icons/mountain-tile-icon.svg";
    if (biome === "water") return "/map-icons/water-tile-icon.svg";
    if (biome === "ruins") return "/map-icons/ruins-tile-icon.svg";
    return null;
  });

  public currentCellPreviewIconColor = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return "rgba(255, 255, 255, 0.95)";
      }
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.iconColor ?? "rgba(0, 0, 0, 0.35)";
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "#5f7250";
    if (biome === "forest") return "#314131";
    if (biome === "mountain") return "#5f5e5c";
    if (biome === "water") return "#374b69";
    if (biome === "ruins") return "#52463f";
    return "transparent";
  });

  private resourceToLabel(resource: ResourceLabel): string {
    if (resource === "timber") return "Timber";
    if (resource === "food") return "Food";
    if (resource === "minerals") return "Minerals";
    return "Cloth";
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private sanctuaryElementToLabel(element?: SanctuaryElement): string {
    if (element === "water") return "Water Shrine";
    if (element === "fire") return "Fire Shrine";
    if (element === "wind") return "Wind Shrine";
    if (element === "earth") return "Earth Shrine";
    return "Elemental Shrine";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private getConfiguredCellActionIds(cell: MapCell): string[] {
    const tilesConfig = this.tilesConfig();

    if (cell.isSpecial === true && cell.specialType === "sanctuary" && cell.sanctuaryElement) {
      const fallbackActionIds = cell.active === true
        ? ["donate-sanctuary", "pray-sanctuary"]
        : ["activate-sanctuary"];

      if (!tilesConfig) {
        return fallbackActionIds;
      }

      const sanctuaryConfig = tilesConfig.specialTiles.sanctuaries[cell.sanctuaryElement];
      if (!sanctuaryConfig?.actions) {
        return fallbackActionIds;
      }

      return cell.active === true ? sanctuaryConfig.actions.active : sanctuaryConfig.actions.inactive;
    }

    if (cell.isSpecial === true && cell.specialType === "landmark" && cell.landmarkCategory && cell.landmarkId) {
      return this.landmarksService.getLandmarkActionIds(cell.landmarkId, cell.landmarkCategory);
    }

    if (cell.isSpecial === true || !cell.biome || !tilesConfig) {
      return [];
    }

    return tilesConfig.biomes[cell.biome]?.actions ?? [];
  }

  private humanizeActionId(actionId: string): string {
    return actionId
      .split("-")
      .filter((part) => part.trim().length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}
