import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { EnchantressRewardDialogRow } from "@models/catalog/EnchantressRewardsConfig";
import { LuckCheckResult } from "@models/ui/LuckCheckResult";
import { CapitalEnchantressOutcome } from "@services/gameplay/action-executor-service";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { LuckIndicator } from "../../../ui/luck-indicator/luck-indicator";
import { TextButton } from "../../../ui/text-button/text-button";

export interface EnchantressDialogData {
  playerMoney: number;
  requiredCost: number;
  rewardsTable: EnchantressRewardDialogRow[];
  onPay: () => Promise<CapitalEnchantressOutcome>;
}

@Component({
  selector: "app-enchantress-dialog",
  imports: [DialogWrapper, LuckIndicator, TextButton, TranslationPipe],
  templateUrl: "./enchantress-dialog.html",
  styleUrl: "./enchantress-dialog.scss",
})
export class EnchantressDialog {
  public readonly title: string;
  public readonly playerMoney: number;
  public readonly requiredCost: number;
  public readonly rewardsTable: EnchantressRewardDialogRow[];

  public paying = false;
  public paid = false;
  public errorMessage = "";
  public outcome: CapitalEnchantressOutcome | null = null;
  public luckMeterResult: LuckCheckResult | null = null;
  public revealedRewardId: string | null = null;
  public triggerHighlightPulse = false;
  private payInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: EnchantressDialogData,
  ) {
    this.title = this.translationService.tOrFallback("dialogs.enchantress.title", "Capital Enchantress");
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.requiredCost = Math.max(1, Math.floor(Number(data.requiredCost ?? 5)));
    this.rewardsTable = data.rewardsTable;
    this.onPay = data.onPay;
  }

  private readonly onPay: () => Promise<CapitalEnchantressOutcome>;

  public get canPay(): boolean {
    return !this.paid
      && !this.paying
      && this.playerMoney >= this.requiredCost;
  }

  public get canContinue(): boolean {
    return this.paid && !this.paying;
  }

  public get canCancel(): boolean {
    return !this.paid && !this.paying;
  }

  public isHighlighted(row: EnchantressRewardDialogRow): boolean {
    return this.revealedRewardId === row.id;
  }

  public isPulsing(row: EnchantressRewardDialogRow): boolean {
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
      this.luckMeterResult = this.buildLuckMeterResult(outcome.clampedLuckTotal, outcome.rolledTotal);
      this.revealedRewardId = outcome.rewardId;
      this.triggerHighlightPulse = true;
      this.paid = true;
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("dialogs.enchantress.errors.consult", "Error while consulting the enchantress.");
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
      checkId: `enchantress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roll: Math.max(0, Math.floor(Number(rolledTotal ?? total))),
      luckBonus: 0,
      total,
      threshold: 100,
      success: total >= 100,
      nearSuccess: total >= 90 && total < 100,
    };
  }
}
