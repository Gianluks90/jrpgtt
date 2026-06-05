import { Component } from "@angular/core";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "../../../models/DialogResponse";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { GAME_DEFAULT_CONFIG } from "../../../consts/game-default-config";
import { TextButton } from "../../ui/text-button/text-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";

export interface GameNewDialogData {
  name: string;
  maxPlayers: number;
}

@Component({
  selector: "app-game-new-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./game-new-dialog.html",
  styleUrl: "./game-new-dialog.scss",
})
export class GameNewDialog {
  public form: FormGroup;
  public maxPlayers = GAME_DEFAULT_CONFIG.maxPlayers;

  constructor(private dialogRef: DialogRef<DialogResponse<GameNewDialogData>>, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ["", Validators.required],
      maxPlayers: ["", [Validators.required, Validators.min(1), Validators.max(this.maxPlayers)]],
    });
  }

  public confirm(): void {
    const data = this.form.getRawValue();
    this.dialogRef.close({
      result: "confirm",
      data: {
        name: String(data.name ?? ""),
        maxPlayers: Number(data.maxPlayers),
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel"
    });
  }
}
