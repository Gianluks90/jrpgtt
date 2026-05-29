import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { FastTravelRouteOption } from "../../../../services/safe-place-fast-travel-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface FastTravelDialogData {
  originName: string;
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
  imports: [DialogWrapper, TextButton],
  templateUrl: "./fast-travel-dialog.html",
  styleUrl: "./fast-travel-dialog.scss",
})
export class FastTravelDialog {
  public readonly originName: string;
  public readonly playerMoney: number;
  public readonly routes: FastTravelRouteOption[];
  public selectedRouteCellId: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<FastTravelDialogResult>>,
    @Inject(DIALOG_DATA) data: FastTravelDialogData,
  ) {
    this.originName = typeof data.originName === "string" && data.originName.trim().length > 0
      ? data.originName
      : "Safe place";

    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.routes = this.normalizeRoutes(data.routes);
    this.selectedRouteCellId = this.routes[0]?.cellId ?? null;
  }

  public get selectedRoute(): FastTravelRouteOption | null {
    const selected = this.selectedRouteCellId;
    if (!selected) return null;
    return this.routes.find((route) => route.cellId === selected) ?? null;
  }

  public get canConfirm(): boolean {
    const selected = this.selectedRoute;
    return !!selected && selected.cost <= this.playerMoney;
  }

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
    this.dialogRef.close({
      result: "cancel",
    });
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
          : "Safe place",
        landmarkId: typeof route.landmarkId === "string" ? route.landmarkId : "unknown",
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        cost: Math.max(0, Math.floor(cost)),
      });
      seen.add(route.cellId);
    }

    normalized.sort((left, right) => {
      if (left.cost !== right.cost) return left.cost - right.cost;
      const byName = left.destinationName.localeCompare(right.destinationName);
      if (byName !== 0) return byName;
      return left.cellId.localeCompare(right.cellId);
    });

    return normalized;
  }
}
