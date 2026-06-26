import { Component, Inject } from "@angular/core";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";

export interface SpellCastConfirmDialogData {
  spellId: string;
  spellName: string;
  description: string;
  longDescription?: string;
  mpCost: number;
  mpCurrent: number;
  mpMax: number;
  consumableOnCast: boolean;
}

@Component({
  selector: "app-spell-cast-confirm-dialog",
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: "./spell-cast-confirm-dialog.html",
  styleUrl: "./spell-cast-confirm-dialog.scss",
})
export class SpellCastConfirmDialog {
  constructor(
    private dialogRef: DialogRef<DialogResponse<void>>,
    @Inject(DIALOG_DATA) public data: SpellCastConfirmDialogData,
  ) {}

  public cast(): void {
    this.dialogRef.close({ result: "confirm" });
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }
}
