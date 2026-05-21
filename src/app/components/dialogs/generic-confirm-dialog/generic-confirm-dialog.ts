import { Component } from "@angular/core";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "../../../models/DialogResponse";
import { TextButton } from "../../ui/text-button/text-button";

@Component({
  selector: "app-generic-confirm-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./generic-confirm-dialog.html",
  styleUrl: "./generic-confirm-dialog.scss",
})
export class GenericConfirmDialog {

  constructor(private dialogRef: DialogRef<DialogResponse<never>>) { }

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
