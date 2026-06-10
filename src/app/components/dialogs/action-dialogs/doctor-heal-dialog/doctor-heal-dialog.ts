import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { getDoctorCostPerUnit, SafePlaceDoctorActionId } from "../../../../consts/gameplay/safe-place-actions";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TimeOfDay } from "@models/world/WorldState";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface DoctorHealDialogData {
  actionId: SafePlaceDoctorActionId;
  timeOfDay: TimeOfDay;
  playerMoney: number;
  hpCurrent: number;
  hpMax: number;
}

export interface DoctorHealDialogResult {
  units: number;
}

@Component({
  selector: "app-doctor-heal-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./doctor-heal-dialog.html",
  styleUrl: "./doctor-heal-dialog.scss",
})
export class DoctorHealDialog {
  public readonly actionId: SafePlaceDoctorActionId;
  public readonly timeOfDay: TimeOfDay;
  public readonly playerMoney: number;
  public readonly hpCurrent: number;
  public readonly hpMax: number;
  public readonly hpMissing: number;
  public readonly healPerUnit: number;
  public readonly costPerUnit: number;
  public readonly maxUnitsByHp: number;
  public readonly maxUnitsByMoney: number;
  public readonly maxUnits: number;
  public readonly form: FormGroup;

  constructor(
    private dialogRef: DialogRef<DialogResponse<DoctorHealDialogResult>>,
    private fb: FormBuilder,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: DoctorHealDialogData,
  ) {
    this.actionId = data.actionId;
    this.timeOfDay = data.timeOfDay ?? "day";
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.hpCurrent = Math.max(0, Math.floor(Number(data.hpCurrent ?? 0)));
    this.hpMax = Math.max(1, Math.floor(Number(data.hpMax ?? 1)));
    this.hpMissing = Math.max(0, this.hpMax - this.hpCurrent);

    this.healPerUnit = Math.max(1, Math.floor(this.hpMax * 0.05));
    this.costPerUnit = getDoctorCostPerUnit(this.actionId, this.timeOfDay);

    this.maxUnitsByHp = this.hpMissing <= 0 ? 0 : Math.ceil(this.hpMissing / this.healPerUnit);
    this.maxUnitsByMoney = Math.floor(this.playerMoney / this.costPerUnit);
    this.maxUnits = Math.max(0, Math.min(this.maxUnitsByHp, this.maxUnitsByMoney));

    const initialUnits = this.maxUnits > 0 ? 1 : 0;
    this.form = this.fb.group({
      units: [initialUnits, [Validators.required, Validators.min(1), Validators.max(Math.max(1, this.maxUnitsByHp))]],
    });
  }

  public get title(): string {
    return this.actionId === "capital-doctor"
      ? this.translationService.tOrFallback("dialogs.doctor.title.capitalDoctor", "Capital Doctor")
      : this.translationService.tOrFallback("dialogs.doctor.title.cityHealer", "City Healer");
  }

  public get providerLabel(): string {
    return this.actionId === "capital-doctor"
      ? this.translationService.tOrFallback("dialogs.doctor.provider.doctor", "Doctor")
      : this.translationService.tOrFallback("dialogs.doctor.provider.healer", "Healer");
  }

  public get selectedUnits(): number {
    return Math.max(0, Math.floor(Number(this.form.getRawValue().units ?? 0)));
  }

  public get totalCost(): number {
    return this.selectedUnits * this.costPerUnit;
  }

  public get expectedHeal(): number {
    return Math.min(this.hpMissing, this.selectedUnits * this.healPerUnit);
  }

  public get hasEnoughMoneyForSelection(): boolean {
    return this.totalCost <= this.playerMoney;
  }

  public get canConfirm(): boolean {
    return this.maxUnits > 0
      && this.form.valid
      && this.selectedUnits >= 1
      && this.selectedUnits <= this.maxUnitsByHp
      && this.hasEnoughMoneyForSelection;
  }

  public confirm(): void {
    if (!this.canConfirm) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        units: this.selectedUnits,
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }
}
