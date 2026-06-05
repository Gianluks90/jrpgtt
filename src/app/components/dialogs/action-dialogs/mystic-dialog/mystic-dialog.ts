import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { LuckCheckResult } from "../../../../models/LuckCheckResult";
import { MysticRewardDialogRow } from "../../../../models/MysticRewardsConfig";
import { CityMysticOutcome } from "../../../../services/action-executor-service";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "../../../../services/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface MysticDialogData {
  playerMoney: number;
  requiredCost: number;
  rewardsTable: MysticRewardDialogRow[];
  onPay: () => Promise<CityMysticOutcome>;
}

@Component({
  selector: "app-mystic-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./mystic-dialog.html",
  styleUrl: "./mystic-dialog.scss",
})
export class MysticDialog {
  public readonly title: string;
  public readonly playerMoney: number;
  public readonly requiredCost: number;
  public readonly rewardsTable: MysticRewardDialogRow[];

  public paying = false;
  public paid = false;
  public errorMessage = "";
  public outcome: CityMysticOutcome | null = null;
  public luckMeterResult: LuckCheckResult | null = null;
  public revealedRewardId: string | null = null;
  public triggerHighlightPulse = false;
  private payInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: MysticDialogData,
  ) {
    this.title = this.translationService.tOrFallback("dialogs.mystic.title", "City Mystic");
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.requiredCost = Math.max(1, Math.floor(Number(data.requiredCost ?? 5)));
    this.rewardsTable = data.rewardsTable;
    this.onPay = data.onPay;
  }

  private readonly onPay: () => Promise<CityMysticOutcome>;

  public get canPay(): boolean {
    return !this.paid && !this.paying && this.playerMoney >= this.requiredCost;
  }

  public get canContinue(): boolean {
    return this.paid && !this.paying;
  }

  public get canCancel(): boolean {
    return !this.paid && !this.paying;
  }

  public isHighlighted(row: MysticRewardDialogRow): boolean {
    return this.revealedRewardId === row.id;
  }

  public isPulsing(row: MysticRewardDialogRow): boolean {
    return this.triggerHighlightPulse && this.revealedRewardId === row.id;
  }

  public pay(): void {
    if (!this.canPay) return;
    if (this.payInFlight) return;

    this.payInFlight = true;
    setTimeout(() => {
      void this.executePayFlow();
    }, 0);
  }

  private async executePayFlow(): Promise<void> {
    this.errorMessage = "";
    this.paying = true;
    this.triggerHighlightPulse = false;
    this.revealedRewardId = null;
    this.luckMeterResult = null;
    try {
      const outcome = await this.onPay();
      this.outcome = outcome;
      this.luckMeterResult = this.buildLuckMeterResult(outcome.displayTotal, outcome.rolledTotal);
      this.revealedRewardId = outcome.rewardId;
      this.triggerHighlightPulse = true;
      this.paid = true;
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("dialogs.mystic.errors.consult", "Error while consulting the mystic.");
      this.luckMeterResult = null;
      this.revealedRewardId = null;
      this.triggerHighlightPulse = false;
    } finally {
      this.paying = false;
      this.payInFlight = false;
      this.cdr.detectChanges();
    }
  }

  public continue(): void {
    if (!this.canContinue) return;

    this.dialogRef.close({
      result: "confirm",
    });
  }

  public close(): void {
    if (!this.canCancel) return;

    this.dialogRef.close({
      result: "cancel",
    });
  }

  private buildLuckMeterResult(displayTotal: number, rolledTotal: number): LuckCheckResult {
    const total = Math.max(1, Math.min(100, Math.floor(Number(displayTotal ?? 0))));
    return {
      checkId: `mystic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roll: Math.max(0, Math.floor(Number(rolledTotal ?? total))),
      luckBonus: 0,
      total,
      threshold: 100,
      success: total >= 100,
      nearSuccess: total >= 90 && total < 100,
    };
  }
}
