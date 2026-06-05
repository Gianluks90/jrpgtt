import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { DialogResponse } from "../../../../models/DialogResponse";
import { SanctuaryElement } from "../../../../models/MapCell";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "../../../../services/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export type SanctuaryActionMode = "activate" | "donate";

export interface SanctuaryActionDialogData {
  mode: SanctuaryActionMode;
  sanctuaryElement?: SanctuaryElement;
  playerMoney: number;
}

export interface SanctuaryActionDialogResult {
  donatedCoins: number;
}

@Component({
  selector: "app-sanctuary-action-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./sanctuary-action-dialog.html",
  styleUrl: "./sanctuary-action-dialog.scss",
})
export class SanctuaryActionDialog {
  public readonly donationCost = 5;
  public readonly mode: SanctuaryActionMode;
  public readonly sanctuaryElement?: SanctuaryElement;
  public readonly playerMoney: number;
  public form: FormGroup;

  constructor(
    private dialogRef: DialogRef<DialogResponse<SanctuaryActionDialogResult>>,
    private fb: FormBuilder,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: SanctuaryActionDialogData,
  ) {
    this.mode = data.mode;
    this.sanctuaryElement = data.sanctuaryElement;
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));

    this.form = this.fb.group({
      donatedCoins: [null, [Validators.required, Validators.min(this.donationCost), Validators.max(this.donationCost)]],
    });
  }

  public get title(): string {
    return this.mode === "activate"
      ? this.translationService.tOrFallback("dialogs.sanctuary.title.activate", "Activate sanctuary")
      : this.translationService.tOrFallback("dialogs.sanctuary.title.donate", "Donate to sanctuary");
  }

  public get confirmLabel(): string {
    return this.mode === "activate"
      ? this.translationService.tOrFallback("dialogs.sanctuary.actions.activate", "Activate")
      : this.translationService.tOrFallback("dialogs.sanctuary.actions.donate", "Donate");
  }

  public get description(): string {
    if (this.mode === "activate") {
      return this.translationService.tOrFallback(
        "dialogs.sanctuary.description.activate",
        "Activating the sanctuary grants 2 XP, binds your character to the sanctuary element and marks the sanctuary quadrant under that elemental influence.",
      );
    }

    return this.translationService.tOrFallback(
      "dialogs.sanctuary.description.donate",
      "Donating 5 coins to an active sanctuary shifts your attunement to its element if you are currently attuned to a different one.",
    );
  }

  public get donationDisabled(): boolean {
    return this.playerMoney < this.donationCost;
  }

  public get sanctuaryLabel(): string {
    if (this.sanctuaryElement === "water") return this.translationService.tOrFallback("map.elements.water", "Water");
    if (this.sanctuaryElement === "fire") return this.translationService.tOrFallback("map.elements.fire", "Fire");
    if (this.sanctuaryElement === "wind") return this.translationService.tOrFallback("map.elements.wind", "Wind");
    if (this.sanctuaryElement === "earth") return this.translationService.tOrFallback("map.elements.earth", "Earth");
    return this.translationService.tOrFallback("dialogs.resourceExchange.unknown", "Unknown");
  }

  public confirm(): void {
    if (this.form.invalid || this.donationDisabled) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        donatedCoins: Number(this.form.getRawValue().donatedCoins),
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }
}
