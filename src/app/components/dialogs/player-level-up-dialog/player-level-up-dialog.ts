import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
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
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./player-level-up-dialog.html",
  styleUrl: "./player-level-up-dialog.scss",
})
export class PlayerLevelUpDialog {
  public readonly form: FormGroup;
  public readonly level: number;
  public readonly experience: number;

  public readonly options: Array<{ value: LevelUpCharacteristic; label: string; description: string }>;

  constructor(
    private dialogRef: DialogRef<DialogResponse<PlayerLevelUpDialogResult>>,
    private fb: FormBuilder,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: PlayerLevelUpDialogData,
  ) {
    this.level = Math.max(1, Math.floor(data.level));
    this.experience = Math.max(0, Math.floor(data.experience));

    this.form = this.fb.group({
      characteristic: [null, Validators.required],
    });

    this.options = [
      {
        value: "strength",
        label: this.translationService.tOrFallback("dialogs.levelUp.strength.label", "Strength"),
        description: this.translationService.tOrFallback(
          "dialogs.levelUp.strength.description",
          "Increase physical power and HP. HP increases by 5% for each point assigned.",
        ),
      },
      {
        value: "magic",
        label: this.translationService.tOrFallback("dialogs.levelUp.magic.label", "Magic"),
        description: this.translationService.tOrFallback(
          "dialogs.levelUp.magic.description",
          "Improve magical aptitude and MP. MP increases by 1 for each point assigned.",
        ),
      },
      {
        value: "luck",
        label: this.translationService.tOrFallback("dialogs.levelUp.luck.label", "Luck"),
        description: this.translationService.tOrFallback(
          "dialogs.levelUp.luck.description",
          "Improve chance-based outcomes.",
        ),
      },
    ];
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
