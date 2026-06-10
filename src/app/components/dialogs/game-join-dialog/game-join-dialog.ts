import { Component } from "@angular/core";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { TextButton } from "../../ui/text-button/text-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";

export interface GameJoinDialogData {
  joinCode: string;
}

@Component({
  selector: "app-game-join-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./game-join-dialog.html",
  styleUrl: "./game-join-dialog.scss",
})
export class GameJoinDialog {

  public form: FormGroup;

  constructor(private dialogRef: DialogRef<DialogResponse<GameJoinDialogData>>, private fb: FormBuilder) {
    this.form = this.fb.group({
      joinCode: ["", Validators.required],
    });
  }

  public confirm(): void {
    const data = this.form.getRawValue();
    this.dialogRef.close({
      result: "confirm",
      data: {
        joinCode: String(data.joinCode ?? ""),
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel"
    });
  }
}
