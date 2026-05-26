import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from "@angular/forms";
import { DialogResponse } from "../../../models/DialogResponse";
import { PlayerAlignment } from "../../../models/Player";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

export interface GamePlayerSetupDialogData {
  name: string;
  alignment: PlayerAlignment;
  parameters: {
    strength: number;
    magic: number;
    luck: number;
  },
  experience: number;
}

const DEFAULT_PLAYER_NAME = "? ? ?";

function notDefaultPlayerNameValidator(defaultName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? "").trim();
    if (!value) return null;
    return value === defaultName ? { defaultPlayerName: true } : null;
  };
}

@Component({
  selector: "app-game-player-setup-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton],
  templateUrl: "./game-player-setup-dialog.html",
  styleUrl: "./game-player-setup-dialog.scss",
})
export class GamePlayerSetupDialog {

  public readonly alignments: PlayerAlignment[] = ["good", "neutral", "evil"];

  public form: FormGroup;
  public readonly minParameterValue: Record<"strength" | "magic" | "luck", number>;

  public strength: number;
  public magic: number;
  public luck: number;
  public experience: number;

  constructor(private dialogRef: DialogRef<DialogResponse<GamePlayerSetupDialogData>>, private fb: FormBuilder, @Inject(DIALOG_DATA) data: GamePlayerSetupDialogData) {
    this.minParameterValue = {
      strength: data.parameters.strength,
      magic: data.parameters.magic,
      luck: data.parameters.luck,
    };

    this.strength = data.parameters.strength;
    this.magic = data.parameters.magic;
    this.luck = data.parameters.luck;
    this.experience = data.experience;

    this.form = this.fb.group({
      name: [
        data.name,
        [
          Validators.required,
          Validators.maxLength(8),
          notDefaultPlayerNameValidator(DEFAULT_PLAYER_NAME),
        ],
      ],
      alignment: [data.alignment, [Validators.required]],
    });
  }

  public canIncrease(): boolean {
    return this.experience > 0;
  }

  public canDecrease(parameter: "strength" | "magic" | "luck"): boolean {
    const currentValue = this.getParameterValue(parameter);
    return currentValue > this.minParameterValue[parameter];
  }

  public increaseParameter(parameter: "strength" | "magic" | "luck"): void {
    if (!this.canIncrease()) return;

    this.setParameterValue(parameter, this.getParameterValue(parameter) + 1);
    this.experience -= 1;
  }

  public decreaseParameter(parameter: "strength" | "magic" | "luck"): void {
    if (!this.canDecrease(parameter)) return;

    this.setParameterValue(parameter, this.getParameterValue(parameter) - 1);
    this.experience += 1;
  }

  public canConfirm(): boolean {
    return this.form.valid && this.experience === 0;
  }

  public confirm(): void {
    if (!this.canConfirm()) return;

    const data = this.form.getRawValue();
    this.dialogRef.close({
      result: "confirm",
      data: {
        name: String(data.name ?? "").trim().toUpperCase(),
        alignment: data.alignment as PlayerAlignment,
        parameters: {
          strength: this.strength,
          magic: this.magic,
          luck: this.luck,
        },
        experience: this.experience,
      }
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel"
    });
  }

  private getParameterValue(parameter: "strength" | "magic" | "luck"): number {
    if (parameter === "strength") return this.strength;
    if (parameter === "magic") return this.magic;
    return this.luck;
  }

  private setParameterValue(parameter: "strength" | "magic" | "luck", value: number): void {
    if (parameter === "strength") {
      this.strength = value;
      return;
    }

    if (parameter === "magic") {
      this.magic = value;
      return;
    }

    this.luck = value;
  }
}
