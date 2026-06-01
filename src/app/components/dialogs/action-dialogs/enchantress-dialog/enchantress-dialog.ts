import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { CapitalEnchantressOutcome } from "../../../../services/action-executor-service";
import { DialogResponse } from "../../../../models/DialogResponse";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface EnchantressDialogData {
  playerMoney: number;
  requiredCost: number;
  onPay: () => Promise<CapitalEnchantressOutcome>;
}

interface EnchantressRewardRow {
  id: CapitalEnchantressOutcome["rewardId"];
  rangeLabel: string;
  effectLabel: string;
}

@Component({
  selector: "app-enchantress-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./enchantress-dialog.html",
  styleUrl: "./enchantress-dialog.scss",
})
export class EnchantressDialog {
  private static readonly rollDurationMs = 700;
  private static readonly rollStepMs = 55;

  public readonly title = "Capital Enchantress";
  public readonly playerMoney: number;
  public readonly requiredCost: number;
  public readonly rewardsTable: EnchantressRewardRow[] = [
    { id: "minified", rangeLabel: "1-16", effectLabel: "Minified for 1 turn" },
    { id: "weakened", rangeLabel: "17-32", effectLabel: "Weakened for 3 turns" },
    { id: "hexed", rangeLabel: "33-48", effectLabel: "Hexed for 3 turns" },
    { id: "bravery", rangeLabel: "49-64", effectLabel: "Bravery for 3 turns" },
    { id: "focus", rangeLabel: "65-80", effectLabel: "Focus for 3 turns" },
    {
      id: "jackpot",
      rangeLabel: "81-100",
      effectLabel: "Magic placeholder: Bravery + Focus for 3 turns",
    },
  ];

  public paying = false;
  public paid = false;
  public errorMessage = "";
  public outcome: CapitalEnchantressOutcome | null = null;
  public isRolling = false;
  public revealedRewardId: EnchantressRewardRow["id"] | null = null;
  public displayLuckTotal: number | null = null;
  public triggerHighlightPulse = false;
  private payInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    @Inject(DIALOG_DATA) data: EnchantressDialogData,
  ) {
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.requiredCost = Math.max(1, Math.floor(Number(data.requiredCost ?? 5)));
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

  public isHighlighted(row: EnchantressRewardRow): boolean {
    return this.revealedRewardId === row.id;
  }

  public isPulsing(row: EnchantressRewardRow): boolean {
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
    this.isRolling = true;
    this.triggerHighlightPulse = false;
    this.revealedRewardId = null;
    this.displayLuckTotal = null;
    try {
      const [outcome] = await Promise.all([
        this.onPay(),
        this.runRollAnimation(),
      ]);
      this.outcome = outcome;
      this.displayLuckTotal = outcome.clampedLuckTotal;
      this.revealedRewardId = outcome.rewardId;
      this.triggerHighlightPulse = true;
      this.paid = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "Error while consulting the enchantress.";
      this.displayLuckTotal = null;
      this.revealedRewardId = null;
      this.triggerHighlightPulse = false;
    } finally {
      this.isRolling = false;
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

  private async runRollAnimation(): Promise<void> {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < EnchantressDialog.rollDurationMs) {
      this.displayLuckTotal = this.randomInt(1, 100);
      await this.delay(EnchantressDialog.rollStepMs);
    }
  }

  private randomInt(min: number, max: number): number {
    const normalizedMin = Math.ceil(min);
    const normalizedMax = Math.floor(max);
    return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
