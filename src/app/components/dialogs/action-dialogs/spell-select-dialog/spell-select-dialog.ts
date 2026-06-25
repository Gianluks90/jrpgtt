import { Component, Inject } from "@angular/core";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface SpellSelectDialogOption {
  spellId: string;
  name: string;
  mpCost: number;
}

export interface SpellSelectDialogData {
  title: string;
  confirmText: string;
  options: SpellSelectDialogOption[];
}

export interface SpellSelectDialogResult {
  spellId: string;
}

@Component({
  selector: "app-spell-select-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./spell-select-dialog.html",
  styleUrl: "./spell-select-dialog.scss",
})
export class SpellSelectDialog {
  public selectedId: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<SpellSelectDialogResult>>,
    @Inject(DIALOG_DATA) public data: SpellSelectDialogData,
  ) {
    this.selectedId = data.options[0]?.spellId ?? null;
  }

  public select(spellId: string): void {
    this.selectedId = spellId;
  }

  public get canConfirm(): boolean {
    return !!this.selectedId && this.data.options.some((o) => o.spellId === this.selectedId);
  }

  public confirm(): void {
    if (!this.canConfirm || !this.selectedId) return;
    this.dialogRef.close({ result: "confirm", data: { spellId: this.selectedId } });
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }
}
