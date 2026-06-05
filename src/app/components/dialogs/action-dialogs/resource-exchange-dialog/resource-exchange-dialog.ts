import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { RESOURCE_CATALOG } from "../../../../consts/resources-catalog";
import { DialogResponse } from "../../../../models/DialogResponse";
import { ResourceLabel, ResourceStack } from "../../../../models/Resource";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "../../../../services/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface ResourceExchangeDialogData {
  resources: ResourceStack[];
}

export interface ResourceExchangeDialogResult {
  giveLabel: ResourceLabel;
  receiveLabel: ResourceLabel;
  amount: number;
}

@Component({
  selector: "app-resource-exchange-dialog",
  imports: [DialogWrapper, ReactiveFormsModule, TextButton, TranslationPipe],
  templateUrl: "./resource-exchange-dialog.html",
  styleUrl: "./resource-exchange-dialog.scss",
})
export class ResourceExchangeDialog {
  public readonly resourceCatalog = RESOURCE_CATALOG;
  public readonly form: FormGroup;
  public readonly receiveOptions: ResourceLabel[] = ["food", "timber", "minerals", "cloth"];
  public readonly giveOptions: Array<{ label: ResourceLabel; quantity: number }>;

  private readonly quantityByLabel: Record<ResourceLabel, number>;

  constructor(
    private dialogRef: DialogRef<DialogResponse<ResourceExchangeDialogResult>>,
    private fb: FormBuilder,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: ResourceExchangeDialogData,
  ) {
    this.quantityByLabel = this.normalizeResourceMap(data.resources);

    this.giveOptions = this.receiveOptions
      .map((label) => ({
        label,
        quantity: this.quantityByLabel[label],
      }))
      .filter((entry) => entry.quantity > 0);

    const initialGive = this.giveOptions[0]?.label ?? null;
    const initialReceive = this.receiveOptions.find((label) => label !== initialGive) ?? null;

    this.form = this.fb.group({
      giveLabel: [initialGive, [Validators.required]],
      receiveLabel: [initialReceive, [Validators.required]],
      amount: [initialGive ? 1 : 0, [Validators.required, Validators.min(1)]],
    });
  }

  public get selectedGiveLabel(): ResourceLabel | null {
    return this.asResourceLabel(this.form.getRawValue().giveLabel);
  }

  public get selectedReceiveLabel(): ResourceLabel | null {
    return this.asResourceLabel(this.form.getRawValue().receiveLabel);
  }

  public get selectedAmount(): number {
    return Math.max(0, Math.floor(Number(this.form.getRawValue().amount ?? 0)));
  }

  public get maxAmount(): number {
    const giveLabel = this.selectedGiveLabel;
    if (!giveLabel) return 0;
    return this.quantityByLabel[giveLabel] ?? 0;
  }

  public get canConfirm(): boolean {
    const giveLabel = this.selectedGiveLabel;
    const receiveLabel = this.selectedReceiveLabel;

    return !!giveLabel
      && !!receiveLabel
      && giveLabel !== receiveLabel
      && this.selectedAmount >= 1
      && this.selectedAmount <= this.maxAmount
      && this.form.valid;
  }

  public onGiveChanged(): void {
    const giveLabel = this.selectedGiveLabel;
    const receiveLabel = this.selectedReceiveLabel;

    if (!giveLabel) return;

    if (receiveLabel === giveLabel) {
      const nextReceive = this.receiveOptions.find((label) => label !== giveLabel) ?? null;
      this.form.patchValue({ receiveLabel: nextReceive }, { emitEvent: false });
    }

    if (this.selectedAmount > this.maxAmount) {
      this.form.patchValue({ amount: Math.max(1, this.maxAmount) }, { emitEvent: false });
    }
  }

  public onAmountBlur(): void {
    const max = this.maxAmount;
    if (max <= 0) {
      this.form.patchValue({ amount: 0 }, { emitEvent: false });
      return;
    }

    const nextAmount = Math.max(1, Math.min(max, this.selectedAmount));
    this.form.patchValue({ amount: nextAmount }, { emitEvent: false });
  }

  public confirm(): void {
    if (!this.canConfirm) return;

    const giveLabel = this.selectedGiveLabel;
    const receiveLabel = this.selectedReceiveLabel;
    if (!giveLabel || !receiveLabel) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        giveLabel,
        receiveLabel,
        amount: this.selectedAmount,
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  public toLabel(resource: ResourceLabel | null | undefined): string {
    if (resource === "food") return this.translationService.tOrFallback("resources.food", "Food");
    if (resource === "timber") return this.translationService.tOrFallback("resources.timber", "Timber");
    if (resource === "minerals") return this.translationService.tOrFallback("resources.minerals", "Minerals");
    if (resource === "cloth") return this.translationService.tOrFallback("resources.cloth", "Cloth");
    return this.translationService.tOrFallback("dialogs.resourceExchange.unknown", "Unknown");
  }

  private normalizeResourceMap(resources: ResourceStack[] | undefined): Record<ResourceLabel, number> {
    const normalized: Record<ResourceLabel, number> = {
      food: 0,
      timber: 0,
      minerals: 0,
      cloth: 0,
    };

    for (const resource of Array.isArray(resources) ? resources : []) {
      if (!this.isResourceLabel(resource?.label)) continue;

      normalized[resource.label] = normalized[resource.label]
        + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }

    return normalized;
  }

  private asResourceLabel(value: unknown): ResourceLabel | null {
    if (!this.isResourceLabel(value)) {
      return null;
    }

    return value;
  }

  private isResourceLabel(value: unknown): value is ResourceLabel {
    return value === "food" || value === "timber" || value === "minerals" || value === "cloth";
  }
}
