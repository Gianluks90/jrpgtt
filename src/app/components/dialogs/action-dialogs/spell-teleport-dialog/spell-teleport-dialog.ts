import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface SpellTeleportTargetOption {
  cellId: string;
  x: number;
  y: number;
  biomeLabel: string;
}

export interface SpellTeleportDialogData {
  spellName: string;
  maxRange: number;
  options: SpellTeleportTargetOption[];
}

export interface SpellTeleportDialogResult {
  targetX: number;
  targetY: number;
}

@Component({
  selector: "app-spell-teleport-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./spell-teleport-dialog.html",
  styleUrl: "./spell-teleport-dialog.scss",
})
export class SpellTeleportDialog {
  public readonly spellName: string;
  public readonly maxRange: number;
  public readonly options: SpellTeleportTargetOption[];
  public selectedCellId: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<SpellTeleportDialogResult>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: SpellTeleportDialogData,
  ) {
    this.spellName = typeof data.spellName === "string" && data.spellName.trim().length > 0
      ? data.spellName
      : this.translationService.tOrFallback("dialogs.spellTeleport.fallbackSpellName", "Spell");
    this.maxRange = Math.max(1, Math.floor(Number(data.maxRange ?? 1)));
    this.options = this.normalizeOptions(data.options);
    this.selectedCellId = this.options[0]?.cellId ?? null;
  }

  public get selectedOption(): SpellTeleportTargetOption | null {
    const selectedCellId = this.selectedCellId;
    if (!selectedCellId) return null;
    return this.options.find((option) => option.cellId === selectedCellId) ?? null;
  }

  public selectTarget(cellId: string): void {
    this.selectedCellId = cellId;
  }

  public confirm(): void {
    const selected = this.selectedOption;
    if (!selected) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        targetX: selected.x,
        targetY: selected.y,
      },
    });
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  private normalizeOptions(options: SpellTeleportTargetOption[]): SpellTeleportTargetOption[] {
    const normalized: SpellTeleportTargetOption[] = [];
    const seen = new Set<string>();

    for (const option of Array.isArray(options) ? options : []) {
      if (!option || typeof option !== "object") continue;
      if (typeof option.cellId !== "string" || option.cellId.trim().length === 0) continue;
      if (seen.has(option.cellId)) continue;

      const x = Number(option.x);
      const y = Number(option.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      normalized.push({
        cellId: option.cellId,
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        biomeLabel: typeof option.biomeLabel === "string" && option.biomeLabel.trim().length > 0
          ? option.biomeLabel
          : this.translationService.tOrFallback("map.cells.unknownCell", "Unknown cell"),
      });
      seen.add(option.cellId);
    }

    normalized.sort((left, right) => {
      if (left.y !== right.y) return left.y - right.y;
      return left.x - right.x;
    });

    return normalized;
  }
}
