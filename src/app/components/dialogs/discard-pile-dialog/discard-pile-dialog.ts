import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";

export interface DiscardPileDialogData {
  entries: DiscardPileEntry[];
}

@Component({
  selector: "app-discard-pile-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./discard-pile-dialog.html",
  styleUrl: "./discard-pile-dialog.scss",
})
export class DiscardPileDialog {
  public readonly entries: DiscardPileEntry[];
  public readonly dialogTitle: string;

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: DiscardPileDialogData,
  ) {
    this.entries = Array.isArray(data?.entries) ? data.entries : [];
    this.dialogTitle = this.translationService.tOrFallback(
      "dialogs.discardPile.title",
      "Discard Pile ({count})",
      { count: this.entries.length },
    );
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  public resolveKindLabel(entry: DiscardPileEntry): string {
    const kind = String(entry.card?.kind ?? "unknown");
    if (kind === "follower") return this.translationService.tOrFallback("dialogs.discardPile.kind.follower", "Follower");
    if (kind === "item") return this.translationService.tOrFallback("dialogs.discardPile.kind.item", "Item");
    if (kind === "tile") return this.translationService.tOrFallback("dialogs.discardPile.kind.tile", "Tile");
    if (kind === "event") return this.translationService.tOrFallback("dialogs.discardPile.kind.event", "Event");
    return kind;
  }

  public resolveCardTitle(entry: DiscardPileEntry): string {
    const cardName = String(entry.card?.name ?? "").trim();
    if (cardName) return cardName;

    const cardId = String(entry.card?.cardId ?? "").trim();
    if (cardId) return cardId;

    return this.translationService.tOrFallback("dialogs.discardPile.unknownCard", "Unknown card");
  }

  public resolveReason(entry: DiscardPileEntry): string | null {
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    return reason || null;
  }

  public resolveMetaText(entry: DiscardPileEntry): string {
    const source = String(entry.source ?? this.translationService.tOrFallback("dialogs.discardPile.systemSource", "system"));
    const turn = Math.max(0, Math.floor(Number(entry.turn ?? 0)));
    return this.translationService.tOrFallback(
      "dialogs.discardPile.meta",
      "Source: {source} • Turn: {turn} • {time}",
      { source, turn, time: this.formatDiscardedAt(entry) },
    );
  }

  public formatDiscardedAt(entry: DiscardPileEntry): string {
    const discardedAt = entry.discardedAt;
    if (!discardedAt || typeof discardedAt.toDate !== "function") {
      return "Unknown time";
    }

    try {
      return discardedAt.toDate().toLocaleString();
    } catch {
      return this.translationService.tOrFallback("dialogs.discardPile.unknownTime", "Unknown time");
    }
  }
}
