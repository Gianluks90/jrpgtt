import { Component, Inject } from "@angular/core";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "../../../models/DialogResponse";
import { TextButton } from "../../ui/text-button/text-button";

export interface GenericConfirmDialogData {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

@Component({
  selector: "app-generic-confirm-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./generic-confirm-dialog.html",
  styleUrl: "./generic-confirm-dialog.scss",
})
export class GenericConfirmDialog {
  public readonly title: string;
  public readonly message: string;
  public readonly confirmText: string;
  public readonly cancelText: string;

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    @Inject(DIALOG_DATA) data: GenericConfirmDialogData | null,
  ) {
    this.title = data?.title ?? "Confirm?";
    this.message = data?.message ?? "Are you sure you want to proceed? This action cannot be undone.";
    this.confirmText = data?.confirmText ?? "Confirm";
    this.cancelText = data?.cancelText ?? "Cancel";
  }

  public confirm(): void {
    this.dialogRef.close({
      result: "confirm"
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel"
    });
  }
}
