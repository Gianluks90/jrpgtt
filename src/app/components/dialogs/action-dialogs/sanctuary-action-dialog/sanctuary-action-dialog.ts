import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { SanctuaryElement } from "../../../../models/MapCell";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "../../../../services/translation-service";
import { CommandPanelAction, CommandsPanel } from "../../../ui/commands-panel/commands-panel";
import { SanctuaryCrystal } from "../../../ui/sanctuary-crystal/sanctuary-crystal";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export type SanctuaryActionMode = "activate" | "donate" | "actions";

export interface SanctuaryActionDialogData {
  mode: SanctuaryActionMode;
  sanctuaryElement?: SanctuaryElement;
  sanctuaryActive: boolean;
  playerMoney: number;
  playerMpCurrent: number;
  playerMpMax: number;
  sanctuaryActions?: CommandPanelAction[];
}

@Component({
  selector: "app-sanctuary-action-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe, SanctuaryCrystal, CommandsPanel],
  templateUrl: "./sanctuary-action-dialog.html",
  styleUrl: "./sanctuary-action-dialog.scss",
})
export class SanctuaryActionDialog {
  public readonly sanctuaryActivationMpCost = 3;
  public readonly mode: SanctuaryActionMode;
  public readonly sanctuaryElement?: SanctuaryElement;
  public readonly sanctuaryActive: boolean;
  public readonly playerMoney: number;
  public readonly playerMpCurrent: number;
  public readonly playerMpMax: number;
  public readonly sanctuaryActions: CommandPanelAction[];

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: SanctuaryActionDialogData,
  ) {
    this.mode = data.mode;
    this.sanctuaryElement = data.sanctuaryElement;
    this.sanctuaryActive = data.sanctuaryActive;
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.playerMpCurrent = Math.max(0, Math.floor(Number(data.playerMpCurrent ?? 0)));
    this.playerMpMax = Math.max(1, Math.floor(Number(data.playerMpMax ?? 1)));
    this.sanctuaryActions = Array.isArray(data.sanctuaryActions) ? data.sanctuaryActions : [];
  }

  public get title(): string {
    if (this.mode === "actions") {
      return this.sanctuaryTitle;
    }

    return this.mode === "activate"
      ? this.translationService.tOrFallback("dialogs.sanctuary.title.activate", "Activate sanctuary")
      : this.translationService.tOrFallback("dialogs.sanctuary.title.donate", "Donate to sanctuary");
  }

  public get confirmLabel(): string {
    return this.mode === "activate"
      ? this.translationService.tOrFallback("dialogs.sanctuary.actions.activate", "Activate")
      : this.translationService.tOrFallback("dialogs.sanctuary.actions.donate", "Donate");
  }

  public get sanctuaryLabel(): string {
    if (this.sanctuaryElement === "water") {
      return this.translationService.tOrFallback("map.elements.water", "Water");
    }

    if (this.sanctuaryElement === "fire") {
      return this.translationService.tOrFallback("map.elements.fire", "Fire");
    }

    if (this.sanctuaryElement === "wind") {
      return this.translationService.tOrFallback("map.elements.wind", "Wind");
    }

    if (this.sanctuaryElement === "earth") {
      return this.translationService.tOrFallback("map.elements.earth", "Earth");
    }

    return this.translationService.tOrFallback("dialogs.resourceExchange.unknown", "Unknown");
  }

  public get sanctuaryTitle(): string {
    if (this.sanctuaryElement === "water") {
      return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
    }

    if (this.sanctuaryElement === "fire") {
      return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
    }

    if (this.sanctuaryElement === "wind") {
      return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
    }

    if (this.sanctuaryElement === "earth") {
      return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
    }

    return this.translationService.tOrFallback("map.cells.sanctuary.generic", "Elemental Shrine");
  }

  public get sanctuaryStatusDescription(): string {
    if (this.sanctuaryElement === "water") {
      return this.translationService.tOrFallback(
        this.sanctuaryActive
          ? "map.cellInspector.sanctuaryDescriptions.water.active"
          : "map.cellInspector.sanctuaryDescriptions.water.inactive",
        this.sanctuaryActive ? "The sanctuary is active." : "The sanctuary is dormant.",
      );
    }

    if (this.sanctuaryElement === "fire") {
      return this.translationService.tOrFallback(
        this.sanctuaryActive
          ? "map.cellInspector.sanctuaryDescriptions.fire.active"
          : "map.cellInspector.sanctuaryDescriptions.fire.inactive",
        this.sanctuaryActive ? "The sanctuary is active." : "The sanctuary is dormant.",
      );
    }

    if (this.sanctuaryElement === "wind") {
      return this.translationService.tOrFallback(
        this.sanctuaryActive
          ? "map.cellInspector.sanctuaryDescriptions.wind.active"
          : "map.cellInspector.sanctuaryDescriptions.wind.inactive",
        this.sanctuaryActive ? "The sanctuary is active." : "The sanctuary is dormant.",
      );
    }

    return this.translationService.tOrFallback(
      this.sanctuaryActive
        ? "map.cellInspector.sanctuaryDescriptions.earth.active"
        : "map.cellInspector.sanctuaryDescriptions.earth.inactive",
      this.sanctuaryActive ? "The sanctuary is active." : "The sanctuary is dormant.",
    );
  }

  public get activationDisabled(): boolean {
    return this.mode === "activate" && this.playerMpCurrent < this.sanctuaryActivationMpCost;
  }

  public confirm(): void {
    if (this.activationDisabled) return;

    this.dialogRef.close({
      result: "confirm",
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  public onSanctuaryActionRequested(actionId: string): void {
    if (!actionId || !actionId.trim()) {
      return;
    }

    this.dialogRef.close({
      result: "confirm",
      data: {
        actionId,
      },
    });
  }
}
