import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { GraveyardResurrectRewardDialogRow } from "@models/catalog/GraveyardResurrectRewardsConfig";
import { LuckCheckResult } from "@models/ui/LuckCheckResult";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface GraveyardResurrectResultDialogData {
  selectedFollowerLabel: string;
  rewardId: string;
  rewardLabel: string;
  displayTotal: number;
  rolledTotal: number;
  rewardsTable: GraveyardResurrectRewardDialogRow[];
}

@Component({
  selector: "app-graveyard-resurrect-result-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./graveyard-resurrect-result-dialog.html",
  styleUrl: "./graveyard-resurrect-result-dialog.scss",
})
export class GraveyardResurrectResultDialog {
  public readonly title: string;
  public readonly selectedFollowerLabel: string;
  public readonly rewardId: string;
  public readonly rewardLabel: string;
  public readonly rewardsTable: GraveyardResurrectRewardDialogRow[];
  public readonly luckMeterResult: LuckCheckResult;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: GraveyardResurrectResultDialogData,
  ) {
    this.title = this.translationService.tOrFallback("dialogs.graveyardResult.title", "Graveyard Resurrection");
    this.selectedFollowerLabel = typeof data?.selectedFollowerLabel === "string" && data.selectedFollowerLabel.trim().length > 0
      ? data.selectedFollowerLabel
      : this.translationService.tOrFallback("dialogs.graveyardResult.selectedFollower", "Selected follower");
    this.rewardId = typeof data?.rewardId === "string" ? data.rewardId : "unknown";
    this.rewardLabel = typeof data?.rewardLabel === "string"
      ? data.rewardLabel
      : this.translationService.tOrFallback("dialogs.graveyardResult.unknownOutcome", "Unknown outcome");
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
