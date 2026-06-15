import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { FastTravelRouteOption } from "@services/map/safe-place-fast-travel-service";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface FastTravelDialogData {
  originName: string;
  originX: number;
  originY: number;
  playerMoney: number;
  routes: FastTravelRouteOption[];
}

export interface FastTravelDialogResult {
  destinationX: number;
  destinationY: number;
  destinationName: string;
  cost: number;
}

@Component({
  selector: "app-fast-travel-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./fast-travel-dialog.html",
  styleUrl: "./fast-travel-dialog.scss",
})
export class FastTravelDialog {
  public readonly originName: string;
  public readonly originX: number;
  public readonly originY: number;
  public readonly playerMoney: number;
  public readonly routes: FastTravelRouteOption[];

  // Grid constants — 10×10 cells matching the actual map
  public readonly CELL = 13;
  public readonly PAD = 5;       // left / right / bottom padding
  public readonly PAD_TOP = 14;  // top padding — includes region label area
  public readonly GRID = 10;
  public readonly SVG_WIDTH: number;   // = PAD*2 + GRID*CELL
  public readonly SVG_HEIGHT: number;  // = PAD_TOP + PAD + GRID*CELL
  public readonly gridIndices: ReadonlyArray<number>;
  // Region boundaries — same formula as WorldZonesService.getRegionLabelByColumn
  public readonly regionBoundary1: number;
  public readonly regionBoundary2: number;
  // Region label positions
  public readonly regionLabelY: number;
  public readonly regionLabel1X: number;
  public readonly regionLabel2X: number;
  public readonly regionLabel3X: number;

  public selectedRouteCellId: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<FastTravelDialogResult>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: FastTravelDialogData,
  ) {
    this.originName = typeof data.originName === "string" && data.originName.trim().length > 0
      ? data.originName
      : this.translationService.tOrFallback("dialogs.fastTravel.safePlace", "Safe place");

    this.originX = Math.max(0, Math.floor(Number(data.originX ?? 0)));
    this.originY = Math.max(0, Math.floor(Number(data.originY ?? 0)));
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.routes = this.normalizeRoutes(data.routes);
    this.selectedRouteCellId = this.routes[0]?.cellId ?? null;

    this.SVG_WIDTH = this.PAD * 2 + this.GRID * this.CELL;
    this.SVG_HEIGHT = this.PAD_TOP + this.PAD + this.GRID * this.CELL;
    this.gridIndices = Array.from({ length: this.GRID + 1 }, (_, i) => i);
    this.regionBoundary1 = Math.floor(this.GRID * 0.5);
    this.regionBoundary2 = Math.floor(this.GRID * 0.8);
    this.regionLabelY = this.PAD_TOP - 4;
    this.regionLabel1X = this.PAD + 2.5 * this.CELL;
    this.regionLabel2X = this.PAD + 6.5 * this.CELL;
    this.regionLabel3X = this.PAD + 9 * this.CELL;
  }

  public get selectedRoute(): FastTravelRouteOption | null {
    const selected = this.selectedRouteCellId;
    if (!selected) return null;
    return this.routes.find((r) => r.cellId === selected) ?? null;
  }

  public get canConfirm(): boolean {
    const selected = this.selectedRoute;
    return !!selected && selected.cost <= this.playerMoney;
  }

  // Center coordinates for the travel line
  public get originCx(): number { return this.PAD + this.originX * this.CELL + this.CELL / 2; }
  public get originCy(): number { return this.PAD_TOP + this.originY * this.CELL + this.CELL / 2; }
  public get selectedCx(): number | null {
    const r = this.selectedRoute;
    return r ? this.PAD + r.x * this.CELL + this.CELL / 2 : null;
  }
  public get selectedCy(): number | null {
    const r = this.selectedRoute;
    return r ? this.PAD_TOP + r.y * this.CELL + this.CELL / 2 : null;
  }

  // Top-left pixel of a cell (with 1px inset for the marker rect)
  public cx(col: number): number { return this.PAD + col * this.CELL + 1; }
  public cy(row: number): number { return this.PAD_TOP + row * this.CELL + 1; }
  public get cellInner(): number { return this.CELL - 2; }

  public selectRoute(cellId: string): void {
    this.selectedRouteCellId = cellId;
  }

  public isTooExpensive(route: FastTravelRouteOption): boolean {
    return route.cost > this.playerMoney;
  }

  public confirm(): void {
    const selected = this.selectedRoute;
    if (!selected || !this.canConfirm) return;
    this.dialogRef.close({
      result: "confirm",
      data: {
        destinationX: selected.x,
        destinationY: selected.y,
        destinationName: selected.destinationName,
        cost: selected.cost,
      },
    });
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }

  private normalizeRoutes(routes: FastTravelRouteOption[] | undefined): FastTravelRouteOption[] {
    const normalized: FastTravelRouteOption[] = [];
    const seen = new Set<string>();

    for (const route of Array.isArray(routes) ? routes : []) {
      if (!route || typeof route !== "object") continue;
      if (typeof route.cellId !== "string" || !route.cellId.trim()) continue;
      if (seen.has(route.cellId)) continue;

      const x = Number(route.x);
      const y = Number(route.y);
      const cost = Number(route.cost);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(cost)) continue;

      normalized.push({
        cellId: route.cellId,
        destinationName: typeof route.destinationName === "string" && route.destinationName.trim().length > 0
          ? route.destinationName
          : this.translationService.tOrFallback("dialogs.fastTravel.safePlace", "Safe place"),
        landmarkId: typeof route.landmarkId === "string" ? route.landmarkId : "unknown",
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        cost: Math.max(0, Math.floor(cost)),
      });
      seen.add(route.cellId);
    }

    normalized.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      const byName = a.destinationName.localeCompare(b.destinationName);
      if (byName !== 0) return byName;
      return a.cellId.localeCompare(b.cellId);
    });

    return normalized;
  }
}
