import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { GraveyardResurrectRewardDialogRow } from "../../../../models/GraveyardResurrectRewardsConfig";
import { LuckCheckResult } from "../../../../models/LuckCheckResult";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface GraveyardResurrectResultDialogData {
  selectedAllyLabel: string;
  rewardId: string;
  rewardLabel: string;
  displayTotal: number;
  rolledTotal: number;
  rewardsTable: GraveyardResurrectRewardDialogRow[];
}

@Component({
  selector: "app-graveyard-resurrect-result-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./graveyard-resurrect-result-dialog.html",
  styleUrl: "./graveyard-resurrect-result-dialog.scss",
})
export class GraveyardResurrectResultDialog {
  public readonly title = "Graveyard Resurrection";
  public readonly selectedAllyLabel: string;
  public readonly rewardId: string;
  public readonly rewardLabel: string;
  public readonly rewardsTable: GraveyardResurrectRewardDialogRow[];
  public readonly luckMeterResult: LuckCheckResult;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    @Inject(DIALOG_DATA) data: GraveyardResurrectResultDialogData,
  ) {
    this.selectedAllyLabel = typeof data?.selectedAllyLabel === "string" && data.selectedAllyLabel.trim().length > 0
      ? data.selectedAllyLabel
      : "Selected ally";
    this.rewardId = typeof data?.rewardId === "string" ? data.rewardId : "unknown";
    this.rewardLabel = typeof data?.rewardLabel === "string" ? data.rewardLabel : "Unknown outcome";
    this.rewardsTable = Array.isArray(data?.rewardsTable) ? data.rewardsTable : [];

    const displayTotal = Math.max(1, Math.min(100, Math.floor(Number(data?.displayTotal ?? 0))));
    const rolledTotal = Math.max(0, Math.floor(Number(data?.rolledTotal ?? displayTotal)));
    this.luckMeterResult = {
      checkId: `graveyard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roll: rolledTotal,
      luckBonus: 0,
      total: displayTotal,
      threshold: 100,
      success: displayTotal >= 100,
      nearSuccess: displayTotal >= 90 && displayTotal < 100,
    };
  }

  public isHighlighted(row: GraveyardResurrectRewardDialogRow): boolean {
    return row.id === this.rewardId;
  }

  public continue(): void {
    this.dialogRef.close({
      result: "confirm",
    });
  }
}
