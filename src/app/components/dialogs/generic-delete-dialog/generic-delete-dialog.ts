import { Component } from "@angular/core";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "../../../models/DialogResponse";
import { TextButton } from "../../ui/text-button/text-button";

@Component({
  selector: "app-generic-delete-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./generic-delete-dialog.html",
  styleUrl: "./generic-delete-dialog.scss",
})
export class GenericDeleteDialog {

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
