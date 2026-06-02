import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { MysticRewardDialogRow } from "../../../../models/MysticRewardsConfig";
import { CityMysticOutcome } from "../../../../services/action-executor-service";
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
  imports: [DialogWrapper, TextButton],
  templateUrl: "./mystic-dialog.html",
  styleUrl: "./mystic-dialog.scss",
})
export class MysticDialog {
  private static readonly rollDurationMs = 700;
  private static readonly rollStepMs = 55;

  public readonly title = "City Mystic";
  public readonly playerMoney: number;
  public readonly requiredCost: number;
  public readonly rewardsTable: MysticRewardDialogRow[];

  public paying = false;
  public paid = false;
  public errorMessage = "";
  public outcome: CityMysticOutcome | null = null;
  public isRolling = false;
  public revealedRewardId: string | null = null;
  public displayLuckTotal: number | null = null;
  public triggerHighlightPulse = false;
  private payInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    @Inject(DIALOG_DATA) data: MysticDialogData,
  ) {
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
      this.displayLuckTotal = outcome.displayTotal;
      this.revealedRewardId = outcome.rewardId;
      this.triggerHighlightPulse = true;
      this.paid = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "Error while consulting the mystic.";
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
    while ((Date.now() - startedAt) < MysticDialog.rollDurationMs) {
      this.displayLuckTotal = this.randomInt(1, 100);
      await this.delay(MysticDialog.rollStepMs);
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
