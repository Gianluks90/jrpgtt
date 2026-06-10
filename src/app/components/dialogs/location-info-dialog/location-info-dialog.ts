import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { MapGridPanelCell } from "../../core/map-grid-panel/map-grid-panel";
import { Player } from "@models/player/Player";
import { MapCell, BiomeType, SanctuaryElement } from "@models/world/MapCell";
import { ResourceLabel } from "@models/world/Resource";
import { SanctuaryTilesConfigEntry, TilesConfig } from "@models/world/TilesConfig";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";
import { MapCellInspectorPanel } from "../../ui/map-cell-inspector-panel/map-cell-inspector-panel";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { WorldState } from "@models/world/WorldState";

export interface LocationInfoDialogData {
  title: string;
  inspectedCell: MapGridPanelCell | null;
  activePlayer: Player | null;
  worldState: WorldState | null;
  players: Player[];
  mapCellsById: Record<string, MapCell>;
  mapSize: number;
  tilesConfig: TilesConfig | null;
  environmentByCellId: Record<string, string[]>;
  biomeResourcesByBiome: Partial<Record<BiomeType, ResourceLabel[]>>;
  sanctuaryStylesByElement: Partial<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>;
}

@Component({
  selector: "app-location-info-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton, MapCellInspectorPanel, TranslationPipe],
  templateUrl: "./location-info-dialog.html",
  styleUrl: "./location-info-dialog.scss",
})
export class LocationInfoDialog {
  public readonly title: string;
  public readonly inspectedCell: MapGridPanelCell | null;
  public readonly activePlayer: Player | null;
  public readonly worldState: WorldState | null;
  public readonly players: Player[];
  public readonly mapCellsById: Record<string, MapCell>;
  public readonly mapSize: number;
  public readonly tilesConfig: TilesConfig | null;
  public readonly environmentByCellId: Record<string, string[]>;
  public readonly biomeResourcesByBiome: Partial<Record<BiomeType, ResourceLabel[]>>;
  public readonly sanctuaryStylesByElement: Partial<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>;

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: LocationInfoDialogData,
  ) {
    this.title = typeof data?.title === "string" && data.title.trim()
      ? data.title
      : this.translationService.tOrFallback("map.cells.unknownCell", "Unknown cell");
    this.inspectedCell = data?.inspectedCell ?? null;
    this.activePlayer = data?.activePlayer ?? null;
    this.worldState = data?.worldState ?? null;
    this.players = Array.isArray(data?.players) ? data.players : [];
    this.mapCellsById = data?.mapCellsById ?? {};
    this.mapSize = Math.max(1, Math.floor(Number(data?.mapSize ?? 10)));
    this.tilesConfig = data?.tilesConfig ?? null;
    this.environmentByCellId = data?.environmentByCellId ?? {};
    this.biomeResourcesByBiome = data?.biomeResourcesByBiome ?? {};
    this.sanctuaryStylesByElement = data?.sanctuaryStylesByElement ?? {};
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }
}
