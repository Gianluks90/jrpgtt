import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface FollowerSelectDialogOption {
  key: string;
  label: string;
  description: string;
  hpCurrent?: number;
  hpMax?: number;
  labels?: Array<{
    text: string;
    tone: "neutral" | "positive" | "negative";
  }>;
}

export interface FollowerSelectDialogOutcomeRow {
  id: string;
  rangeLabel: string;
  effectLabel: string;
}

export interface FollowerSelectDialogData {
  title: string;
  message: string;
  confirmText: string;
  options: FollowerSelectDialogOption[];
  outcomePreviewTitle?: string;
  outcomePreviewRows?: FollowerSelectDialogOutcomeRow[];
}

export interface FollowerSelectDialogResult {
  selectedKey: string;
}

@Component({
  selector: "app-follower-select-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./follower-select-dialog.html",
  styleUrl: "./follower-select-dialog.scss",
})
export class FollowerSelectDialog {
  public readonly title: string;
  public readonly message: string;
  public readonly confirmText: string;
  public readonly options: FollowerSelectDialogOption[];
  public readonly outcomePreviewTitle: string;
  public readonly outcomePreviewRows: FollowerSelectDialogOutcomeRow[];
  public selectedKey: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<FollowerSelectDialogResult>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: FollowerSelectDialogData,
  ) {
    this.title = typeof data?.title === "string" && data.title.trim().length > 0
      ? data.title
      : this.translationService.tOrFallback("dialogs.followerSelect.title", "Select follower");
    this.message = typeof data?.message === "string"
      ? data.message
      : this.translationService.tOrFallback("dialogs.followerSelect.message", "Choose a follower.");
    this.confirmText = typeof data?.confirmText === "string" && data.confirmText.trim().length > 0
      ? data.confirmText
      : this.translationService.tOrFallback("dialogs.common.confirm", "Confirm");
    this.options = this.normalizeOptions(data?.options);
    this.outcomePreviewTitle = typeof data?.outcomePreviewTitle === "string" && data.outcomePreviewTitle.trim().length > 0
      ? data.outcomePreviewTitle
      : this.translationService.tOrFallback("dialogs.followerSelect.possibleOutcomes", "Possible outcomes");
    this.outcomePreviewRows = this.normalizeOutcomeRows(data?.outcomePreviewRows);
    this.selectedKey = this.options[0]?.key ?? null;
  }

  public select(key: string): void {
    this.selectedKey = key;
  }

  public get canConfirm(): boolean {
    if (!this.selectedKey) return false;
    return this.options.some((option) => option.key === this.selectedKey);
  }

  public confirm(): void {
    if (!this.canConfirm || !this.selectedKey) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        selectedKey: this.selectedKey,
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  private normalizeOptions(rawOptions: FollowerSelectDialogOption[] | undefined): FollowerSelectDialogOption[] {
    const normalized: FollowerSelectDialogOption[] = [];
    const seen = new Set<string>();

    for (const option of Array.isArray(rawOptions) ? rawOptions : []) {
      if (!option || typeof option !== "object") continue;
      if (typeof option.key !== "string" || !option.key.trim()) continue;
      if (seen.has(option.key)) continue;

      normalized.push({
        key: option.key,
        label: typeof option.label === "string" && option.label.trim().length > 0 ? option.label : option.key,
        description: typeof option.description === "string" ? option.description : "",
        hpCurrent: Math.max(0, Math.floor(Number(option.hpCurrent ?? 0))),
        hpMax: Math.max(1, Math.floor(Number(option.hpMax ?? 1))),
        labels: Array.isArray(option.labels)
          ? option.labels
            .filter((label) => !!label && typeof label === "object")
            .map((label) => {
              const tone: "neutral" | "positive" | "negative" = label.tone === "positive" || label.tone === "negative"
                ? label.tone
                : "neutral";

              return {
                text: typeof label.text === "string" ? label.text : "",
                tone,
              };
            })
            .filter((label) => label.text.trim().length > 0)
          : [],
      });
      seen.add(option.key);
    }

    return normalized;
  }

  private normalizeOutcomeRows(rawRows: FollowerSelectDialogOutcomeRow[] | undefined): FollowerSelectDialogOutcomeRow[] {
    if (!Array.isArray(rawRows)) {
      return [];
    }

    return rawRows
      .filter((row) => !!row && typeof row === "object")
      .map((row, index) => ({
        id: typeof row.id === "string" && row.id.trim().length > 0 ? row.id : `row-${index}`,
        rangeLabel: typeof row.rangeLabel === "string" ? row.rangeLabel : "-",
        effectLabel: typeof row.effectLabel === "string" ? row.effectLabel : "",
      }))
      .filter((row) => row.effectLabel.trim().length > 0);
  }
}
