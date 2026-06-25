import { Component, Inject } from "@angular/core";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface SelfSelectDialogOption {
  key: string;
  label: string;
  sublabel?: string;
}

export interface SelfSelectDialogData {
  title: string;
  message?: string;
  confirmText: string;
  options: SelfSelectDialogOption[];
}

export interface SelfSelectDialogResult {
  key: string;
}

@Component({
  selector: "app-self-select-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./self-select-dialog.html",
  styleUrl: "./self-select-dialog.scss",
})
export class SelfSelectDialog {
  public selectedKey: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<SelfSelectDialogResult>>,
    @Inject(DIALOG_DATA) public data: SelfSelectDialogData,
  ) {
    this.selectedKey = data.options[0]?.key ?? null;
  }

  public select(key: string): void {
    this.selectedKey = key;
  }

  public get canConfirm(): boolean {
    return !!this.selectedKey && this.data.options.some((o) => o.key === this.selectedKey);
  }

  public confirm(): void {
    if (!this.canConfirm || !this.selectedKey) return;
    this.dialogRef.close({ result: "confirm", data: { key: this.selectedKey } });
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }
}
