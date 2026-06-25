import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { AcademySpellUpgradeOutcome } from "@services/gameplay/action-executor-service";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface AcademySpellUpgradeOption {
  fromSpellId: string;
  fromSpellName: string;
  toSpellId: string;
  toSpellName: string;
  cost: number;
  canAfford: boolean;
}

export interface AcademySpellUpgraderDialogData {
  options: AcademySpellUpgradeOption[];
  onUpgrade: (fromSpellId: string) => Promise<AcademySpellUpgradeOutcome>;
}

@Component({
  selector: "app-academy-spell-upgrader-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./academy-spell-upgrader-dialog.html",
  styleUrl: "./academy-spell-upgrader-dialog.scss",
})
export class AcademySpellUpgraderDialog {
  public readonly title: string;
  public readonly options: AcademySpellUpgradeOption[];

  public selectedId: string | null = null;
  public upgrading = false;
  public done = false;
  public outcome: AcademySpellUpgradeOutcome | null = null;
  public errorMessage = "";
  private upgradeInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: AcademySpellUpgraderDialogData,
  ) {
    this.title = this.translationService.tOrFallback("dialogs.academySpellUpgrader.title", "Spell Master");
    this.options = data.options;
    this.selectedId = data.options[0]?.fromSpellId ?? null;
    this.onUpgrade = data.onUpgrade;
  }

  private readonly onUpgrade: (fromSpellId: string) => Promise<AcademySpellUpgradeOutcome>;

  public get selectedOption(): AcademySpellUpgradeOption | null {
    return this.options.find((o) => o.fromSpellId === this.selectedId) ?? null;
  }

  public get canConfirm(): boolean {
    return !this.done && !this.upgrading && this.selectedOption?.canAfford === true;
  }

  public get canClose(): boolean {
    return !this.upgrading;
  }

  public select(id: string): void {
    if (this.done || this.upgrading) return;
    this.selectedId = id;
  }

  public confirm(): void {
    if (!this.canConfirm) return;
    if (this.upgradeInFlight) return;
    const fromSpellId = this.selectedId;
    if (!fromSpellId) return;

    this.upgradeInFlight = true;
    setTimeout(() => void this.executeUpgrade(fromSpellId), 0);
  }

  private async executeUpgrade(fromSpellId: string): Promise<void> {
    this.errorMessage = "";
    this.upgrading = true;
    try {
      this.outcome = await this.onUpgrade(fromSpellId);
      this.done = true;
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("dialogs.academySpellUpgrader.errors.upgrade", "Error while upgrading the spell.");
    } finally {
      this.upgrading = false;
      this.upgradeInFlight = false;
      this.cdr.detectChanges();
    }
  }

  public close(): void {
    if (!this.canClose) return;
    this.dialogRef.close({ result: this.done ? "confirm" : "cancel" });
  }
}
