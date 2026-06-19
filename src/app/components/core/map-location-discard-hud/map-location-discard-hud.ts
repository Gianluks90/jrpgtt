import { Component, computed, input, output } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { LandmarksService } from "@services/map/landmarks-service";
import { TranslationService } from "@services/shared/translation-service";
import { MapGridPanelCell } from "../map-grid-panel/map-grid-panel";
import { IconButton } from "../../ui/icon-button/icon-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";

@Component({
  selector: "app-map-location-discard-hud",
  standalone: true,
  imports: [IconButton, TranslationPipe],
  templateUrl: "./map-location-discard-hud.html",
  styleUrl: "./map-location-discard-hud.scss",
})
export class MapLocationDiscardHud {
  constructor(
    private translationService: TranslationService,
    private landmarksService: LandmarksService,
  ) {}

  public inspectedCell = input<MapGridPanelCell | null>(null);
  public activePlayer = input<Player | null>(null);
  public mapCellsById = input<Record<string, MapCell>>({});

  public locationInfoRequested = output<string>();

  public locationInfoCellName = computed<string>(() => {
    const hoveredCell = this.inspectedCell();
    if (hoveredCell) {
      return this.resolveCellNameFromCoordinates(hoveredCell.x, hoveredCell.y);
    }

    const activePlayer = this.activePlayer();
    if (!activePlayer) return "-";
    return this.resolveCellNameFromCoordinates(activePlayer.location.x, activePlayer.location.y);
  });

  public locationInfoContextLabel = computed<string>(() => {
    if (this.inspectedCell()) {
      return this.translationService.tOrFallback("map.locationInfo.contextObserving", "Observing cell");
    }

    return this.translationService.tOrFallback("map.locationInfo.contextActivePlayer", "Active player in");
  });

  public onLocationInfoClicked(): void {
    this.locationInfoRequested.emit(this.locationInfoCellName());
  }

  private resolveCellNameFromCoordinates(x: number, y: number): string {
    const cellId = `${x}_${y}`;
    const cell = this.mapCellsById()[cellId] ?? null;
    if (!cell) return this.translationService.tOrFallback("map.cells.unknownCell", "Unknown cell");

    if (cell.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return this.landmarksService.getLocalizedLandmarkNameFromCell(cell);
      }

      if (cell.specialType === "sanctuary") {
        if (cell.sanctuaryElement === "water") {
          return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
        }
        if (cell.sanctuaryElement === "fire") {
          return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
        }
        if (cell.sanctuaryElement === "wind") {
          return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
        }
        if (cell.sanctuaryElement === "earth") {
          return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
        }
        return this.translationService.tOrFallback("map.cells.sanctuary.generic", "Elemental Shrine");
      }
    }

    return this.biomeToLabel(cell.worldEventBiomeOverride ?? cell.biome);
  }

  private biomeToLabel(biome: MapCell["biome"]): string {
    if (biome === "plains") return this.translationService.tOrFallback("map.biomes.plains", "Plains");
    if (biome === "forest") return this.translationService.tOrFallback("map.biomes.forest", "Forest");
    if (biome === "mountain") return this.translationService.tOrFallback("map.biomes.mountain", "Mountain");
    if (biome === "water") return this.translationService.tOrFallback("map.biomes.water", "Water");
    if (biome === "desert") return this.translationService.tOrFallback("map.biomes.desert", "Desert");
    return this.translationService.tOrFallback("map.biomes.ruins", "Ruins");
  }
}
