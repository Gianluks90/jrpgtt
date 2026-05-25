import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { DialogResponse } from "../../../models/DialogResponse";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

export type LevelUpCharacteristic = "strength" | "magic" | "luck";

export interface PlayerLevelUpDialogData {
  level: number;
  experience: number;
}

export interface PlayerLevelUpDialogResult {
  characteristic: LevelUpCharacteristic;
}

@Component({
  selector: "app-player-level-up-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton],
  templateUrl: "./player-level-up-dialog.html",
  styleUrl: "./player-level-up-dialog.scss",
})
export class PlayerLevelUpDialog {
  public readonly form: FormGroup;
  public readonly level: number;
  public readonly experience: number;

  public readonly options: Array<{ value: LevelUpCharacteristic; label: string; description: string }> = [
    {
      value: "strength",
      label: "Strength",
      description: "Increase physical power. If base strength is above 3, HP increases by 5%.",
    },
    {
      value: "magic",
      label: "Magic",
      description: "Improve magical aptitude.",
    },
    {
      value: "luck",
      label: "Luck",
      description: "Improve chance-based outcomes.",
    },
  ];

  constructor(
    private dialogRef: DialogRef<DialogResponse<PlayerLevelUpDialogResult>>,
    private fb: FormBuilder,
    @Inject(DIALOG_DATA) data: PlayerLevelUpDialogData,
  ) {
    this.level = Math.max(1, Math.floor(data.level));
    this.experience = Math.max(0, Math.floor(data.experience));

    this.form = this.fb.group({
      characteristic: [null, Validators.required],
    });
  }

  public isSelected(value: LevelUpCharacteristic): boolean {
    return this.form.get("characteristic")?.value === value;
  }

  public confirm(): void {
    if (!this.form.valid) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        characteristic: this.form.get("characteristic")?.value as LevelUpCharacteristic,
      },
    });
  }
}
