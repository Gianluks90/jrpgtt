import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../models/DialogResponse";
import { DiscardPileEntry } from "../../../models/DiscardPile";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

export interface DiscardPileDialogData {
  entries: DiscardPileEntry[];
}

@Component({
  selector: "app-discard-pile-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton],
  templateUrl: "./discard-pile-dialog.html",
  styleUrl: "./discard-pile-dialog.scss",
})
export class DiscardPileDialog {
  public readonly entries: DiscardPileEntry[];
  public readonly dialogTitle: string;

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    @Inject(DIALOG_DATA) data: DiscardPileDialogData,
  ) {
    this.entries = Array.isArray(data?.entries) ? data.entries : [];
    this.dialogTitle = `Discard Pile (${this.entries.length})`;
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  public resolveKindLabel(entry: DiscardPileEntry): string {
    const kind = String(entry.card?.kind ?? "unknown");
    if (kind === "ally") return "Ally";
    if (kind === "item") return "Item";
    if (kind === "tile") return "Tile";
    if (kind === "event") return "Event";
    return kind;
  }

  public resolveCardTitle(entry: DiscardPileEntry): string {
    const cardName = String(entry.card?.name ?? "").trim();
    if (cardName) return cardName;

    const cardId = String(entry.card?.cardId ?? "").trim();
    if (cardId) return cardId;

    return "Unknown card";
  }

  public resolveReason(entry: DiscardPileEntry): string | null {
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    return reason || null;
  }

  public resolveMetaText(entry: DiscardPileEntry): string {
    const source = String(entry.source ?? "system");
    const turn = Math.max(0, Math.floor(Number(entry.turn ?? 0)));
    return `Source: ${source} • Turn: ${turn} • ${this.formatDiscardedAt(entry)}`;
  }

  public formatDiscardedAt(entry: DiscardPileEntry): string {
    const discardedAt = entry.discardedAt;
    if (!discardedAt || typeof discardedAt.toDate !== "function") {
      return "Unknown time";
    }

    try {
      return discardedAt.toDate().toLocaleString();
    } catch {
      return "Unknown time";
    }
  }
}
