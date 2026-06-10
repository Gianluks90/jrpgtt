import { Component, computed, inject, input } from "@angular/core";
import { isSpecialCellCoordinate } from "../../../consts/gameplay/special-cells";
import { MapCell, SanctuaryElement, BiomeType } from "@models/world/MapCell";
import { Player } from "@models/player/Player";
import { ResourceLabel } from "@models/world/Resource";
import { SanctuaryTilesConfigEntry, TilesConfig } from "@models/world/TilesConfig";
import { MapGridPanelCell } from "../../core/map-grid-panel/map-grid-panel";
import { LandmarksService } from "@services/map/landmarks-service";
import { ActionCatalogService } from "@services/catalog/action-catalog-service";
import { TranslationService } from "@services/shared/translation-service";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { WorldState } from "@models/world/WorldState";
import { ActionDescriptionParams } from "@models/catalog/ActionCatalog";
import { getDoctorCostPerUnit, isDoctorActionId } from "../../../consts/gameplay/safe-place-actions";
import { BiomeConditionCatalogService } from "@services/catalog/biome-condition-catalog-service";

@Component({
  selector: "app-map-cell-inspector-panel",
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: "./map-cell-inspector-panel.html",
  styleUrl: "./map-cell-inspector-panel.scss",
})
export class MapCellInspectorPanel {
  private landmarksService = inject(LandmarksService);
  private actionCatalogService = inject(ActionCatalogService);
  private translationService = inject(TranslationService);
  private biomeConditionCatalogService = inject(BiomeConditionCatalogService);
  public inspectedCell = input<MapGridPanelCell | null>(null);
  public activePlayer = input<Player | null>(null);
  public worldState = input<WorldState | null>(null);
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
        mapCell: liveMapCell ?? inspected.mapCell ?? null,
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
    return cell.worldEventBiomeOverride ?? cell.biome;
  });

  public currentCellTransformationLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (!cell || cell.isSpecial === true) {
      return "-";
    }

    const effectiveBiome = cell.worldEventBiomeOverride ?? cell.biome;
    const originalBiome = cell.worldEventOriginalBiome
      ?? ((cell.worldEventBiomeOverride && cell.worldEventBiomeOverride !== cell.biome) ? cell.biome : null);

    if (!originalBiome || originalBiome === effectiveBiome) {
      return this.translationService.tOrFallback("map.cellInspector.transformedNo", "No");
    }

    return this.translationService.tOrFallback("map.cellInspector.transformedFromTo", "Yes ({from} -> {to})", {
      from: this.biomeToLabel(originalBiome),
      to: this.biomeToLabel(effectiveBiome),
    });
  });

  public currentCellConditionsLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (!cell || cell.isSpecial === true) {
      return this.translationService.tOrFallback("map.cellInspector.none", "None");
    }

    const effectiveBiome = cell.worldEventBiomeOverride ?? cell.biome;
    const baseConditionIds = this.tilesConfig()?.biomes[effectiveBiome]?.conditions ?? [];
    const mergedConditionIds = Array.from(new Set([
      ...baseConditionIds,
      ...(Array.isArray(cell.worldEventConditionIds) ? cell.worldEventConditionIds : []),
    ])).filter((conditionId) => typeof conditionId === "string" && conditionId.trim().length > 0);

    if (mergedConditionIds.length === 0) {
      return this.translationService.tOrFallback("map.cellInspector.conditionNone", "None");
    }

    return mergedConditionIds
      .map((conditionId) => this.conditionIdToLabel(conditionId))
      .join(", ");
  });

  public currentCellConditions = computed<Array<{ id: string; label: string; description: string }>>(() => {
    const cell = this.currentCell();
    if (!cell || cell.isSpecial === true) {
      return [];
    }

    const effectiveBiome = cell.worldEventBiomeOverride ?? cell.biome;
    const baseConditionIds = this.tilesConfig()?.biomes[effectiveBiome]?.conditions ?? [];
    const mergedConditionIds = Array.from(new Set([
      ...baseConditionIds,
      ...(Array.isArray(cell.worldEventConditionIds) ? cell.worldEventConditionIds : []),
    ])).filter((conditionId) => typeof conditionId === "string" && conditionId.trim().length > 0);

    return mergedConditionIds.map((conditionId) => ({
      id: conditionId,
      label: this.conditionIdToLabel(conditionId),
      description: this.conditionIdToDescription(conditionId),
    }));
  });

  public currentCellBiomeLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return this.landmarksService.getLocalizedLandmarkNameFromCell(cell);
      }
      return this.sanctuaryElementToLabel(cell.sanctuaryElement);
    }

    const biome = this.currentCellBiome();
    if (!biome) return this.translationService.tOrFallback("map.cellInspector.unknownBiome", "? ? ?");
    return this.biomeToLabel(biome);
  });

  public currentCellResourcesLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      return this.translationService.tOrFallback("map.cellInspector.none", "None");
    }

    const biome = this.currentCellBiome();
    if (!biome) return "-";
    const resources = this.biomeResourcesByBiome()[biome] ?? [];
    if (resources.length === 0) {
      return this.translationService.tOrFallback("map.cellInspector.none", "None");
    }
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
      return this.translationService.tOrFallback("map.cellInspector.no", "No");
    }

    return this.translationService.tOrFallback("map.cellInspector.yesCells", "Yes ({count} cells)", {
      count: size,
    });
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

    const sanctuaryLabel = cell.isSpecial === true && cell.specialType === "sanctuary" && cell.sanctuaryElement
      ? this.sanctuaryElementToLabel(cell.sanctuaryElement)
      : undefined;

    const actionIds = this.getConfiguredCellActionIds(cell);
    return actionIds.map((actionId) => {
      const descriptionParams = this.buildActionDescriptionParams(actionId, cell);
      return {
        id: actionId,
        label: this.actionCatalogService.getLabel(actionId, this.humanizeActionId(actionId)),
        description: this.actionCatalogService.getDescription(
          actionId,
          this.translationService.tOrFallback("map.common.noDescription", "No description available."),
          descriptionParams,
        ),
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
      return this.translationService.tOrFallback(
        "map.cellInspector.landmarkDiscovered",
        "{category} discovered",
        {
          category: this.landmarksService.getCategoryLabel(currentCell.landmarkCategory),
        },
      );
    }

    const sanctuaryIsActive = currentCell?.active === true;
    return sanctuaryIsActive
      ? this.translationService.tOrFallback("map.cellInspector.sanctuaryActive", "Sanctuary active")
      : this.translationService.tOrFallback("map.cellInspector.sanctuaryInactive", "Sanctuary inactive");
  });

  public currentCellSpecialDescription = computed<string>(() => {
    if (!this.currentCellIsSpecial()) return "-";

    const currentCell = this.currentCell();
    if (currentCell?.specialType === "landmark") {
      const alignment = currentCell.landmarkAlignmentModifier ? ` (${currentCell.landmarkAlignmentModifier})` : "";
      return this.translationService.tOrFallback(
        "map.cellInspector.landmarkDescription",
        "A {category}{alignment} overlays this biome tile.",
        {
          category: this.landmarksService.getCategoryLabel(currentCell.landmarkCategory),
          alignment,
        },
      );
    }

    const sanctuaryElement = currentCell?.sanctuaryElement;
    if (!sanctuaryElement) {
      return this.translationService.tOrFallback(
        "map.cellInspector.dormantSanctuary",
        "The sanctuary is still dormant and hidden.",
      );
    }

    const config = this.sanctuaryStylesByElement()[sanctuaryElement];
    if (!config) return "-";

    const sanctuaryIsActive = currentCell?.active === true;
    const rawDescription = sanctuaryIsActive ? config.description.active : config.description.inactive;
    return this.resolveConfigText(rawDescription);
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
    if (resource === "timber") {
      return this.translationService.tOrFallback("resources.timber", "Timber");
    }

    if (resource === "food") {
      return this.translationService.tOrFallback("resources.food", "Food");
    }

    if (resource === "minerals") {
      return this.translationService.tOrFallback("resources.minerals", "Minerals");
    }

    return this.translationService.tOrFallback("resources.cloth", "Cloth");
  }

  private conditionIdToLabel(conditionId: string): string {
    const definition = this.biomeConditionCatalogService.getCachedCondition(conditionId);
    const fallbackLabel = definition?.label || this.humanizeActionId(conditionId);
    return this.translationService.tOrFallback(`map.cellInspector.conditionLabel.${conditionId}`, fallbackLabel);
  }

  private conditionIdToDescription(conditionId: string): string {
    const definition = this.biomeConditionCatalogService.getCachedCondition(conditionId);
    const fallbackDescription = definition?.description
      || this.translationService.tOrFallback("map.common.noDescription", "No description available.");
    return this.translationService.tOrFallback(`map.cellInspector.conditionDescription.${conditionId}`, fallbackDescription);
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return this.translationService.tOrFallback("map.biomes.plains", "Plains");
    if (biome === "forest") return this.translationService.tOrFallback("map.biomes.forest", "Forest");
    if (biome === "mountain") return this.translationService.tOrFallback("map.biomes.mountain", "Mountain");
    if (biome === "water") return this.translationService.tOrFallback("map.biomes.water", "Water");
    if (biome === "desert") return this.translationService.tOrFallback("map.biomes.desert", "Desert");
    return this.translationService.tOrFallback("map.biomes.ruins", "Ruins");
  }

  private sanctuaryElementToLabel(element?: SanctuaryElement): string {
    if (element === "water") return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
    if (element === "fire") return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
    if (element === "wind") return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
    if (element === "earth") return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
    return this.translationService.tOrFallback("map.cells.sanctuary.generic", "Elemental Shrine");
  }

  private resolveConfigText(value: string): string {
    const normalized = String(value ?? "").trim();
    if (!normalized) return "";

    // Accept dotted i18n-like keys from JSON configs while preserving raw text fallback.
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[.-][a-z0-9]+)*)+$/i.test(normalized)) {
      return normalized;
    }

    return this.translationService.tOrFallback(normalized, normalized);
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

    const landmarkActionIds = this.landmarksService.getLandmarkActionIdsForCell(cell);
    if (landmarkActionIds.length > 0) {
      return landmarkActionIds;
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

  private buildActionDescriptionParams(actionId: string, cell: MapCell): ActionDescriptionParams {
    const params: ActionDescriptionParams = {};
    const player = this.activePlayer();
    const timeOfDay = this.worldState()?.timeOfDay ?? "day";

    if (cell.isSpecial === true && cell.specialType === "sanctuary" && cell.sanctuaryElement) {
      params["sanctuaryLabel"] = this.sanctuaryElementToLabel(cell.sanctuaryElement);
    }

    if (actionId === "castle-trainer" || actionId === "academy-trainer") {
      const playerLevel = Math.max(1, Math.floor(Number(player?.level ?? 1)));
      params["trainingCost"] = playerLevel * 3;
    }

    if (isDoctorActionId(actionId)) {
      params["timeOfDay"] = timeOfDay;
      params["costPerUnit"] = getDoctorCostPerUnit(actionId, timeOfDay);
    }

    return params;
  }
}
