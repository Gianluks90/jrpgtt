import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../models/DialogResponse";
import { MapGridPanelCell } from "../../core/map-grid-panel/map-grid-panel";
import { Player } from "../../../models/Player";
import { MapCell, BiomeType, SanctuaryElement } from "../../../models/MapCell";
import { ResourceLabel } from "../../../models/Resource";
import { SanctuaryTilesConfigEntry, TilesConfig } from "../../../models/TilesConfig";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";
import { MapCellInspectorPanel } from "../../ui/map-cell-inspector-panel/map-cell-inspector-panel";

export interface LocationInfoDialogData {
  title: string;
  inspectedCell: MapGridPanelCell | null;
  activePlayer: Player | null;
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
  imports: [DialogWrapper, TextButton, MapCellInspectorPanel],
  templateUrl: "./location-info-dialog.html",
  styleUrl: "./location-info-dialog.scss",
})
export class LocationInfoDialog {
  public readonly title: string;
  public readonly inspectedCell: MapGridPanelCell | null;
  public readonly activePlayer: Player | null;
  public readonly players: Player[];
  public readonly mapCellsById: Record<string, MapCell>;
  public readonly mapSize: number;
  public readonly tilesConfig: TilesConfig | null;
  public readonly environmentByCellId: Record<string, string[]>;
  public readonly biomeResourcesByBiome: Partial<Record<BiomeType, ResourceLabel[]>>;
  public readonly sanctuaryStylesByElement: Partial<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>;

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    @Inject(DIALOG_DATA) data: LocationInfoDialogData,
  ) {
    this.title = typeof data?.title === "string" && data.title.trim() ? data.title : "Unknown cell";
    this.inspectedCell = data?.inspectedCell ?? null;
    this.activePlayer = data?.activePlayer ?? null;
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
