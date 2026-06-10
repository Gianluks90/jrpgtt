import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from "@angular/forms";
import { GAME_DEFAULT_CONFIG } from "../../../consts/gameplay/game-default-config";
import { DialogResponse } from "@models/ui/DialogResponse";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";
import { GameNewDialogData } from "../game-new-dialog/game-new-dialog";
import { TranslationPipe } from "../../../pipes/translation-pipe";

export interface GameSettingsDialogData {
  name: string;
  maxPlayers: number;
}

@Component({
  selector: "app-game-settings-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./game-settings-dialog.html",
  styleUrl: "./game-settings-dialog.scss",
})
export class GameSettingsDialog {
  public form: FormGroup;
  public maxPlayers = GAME_DEFAULT_CONFIG.maxPlayers;

  constructor(private dialogRef: DialogRef<DialogResponse<GameSettingsDialogData>>, private fb: FormBuilder, @Inject(DIALOG_DATA) data: GameSettingsDialogData) {
    this.form = this.fb.group({
      name: [data.name, Validators.required],
      maxPlayers: [data.maxPlayers, [Validators.required, Validators.min(1), Validators.max(this.maxPlayers)]],
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
