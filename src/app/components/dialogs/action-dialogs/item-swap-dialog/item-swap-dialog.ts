import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject, signal } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";
import { ItemCard } from "../../../ui/item-card/item-card";

export interface ItemSwapDialogItem {
  itemId: string;
  name: string;
  description: string;
}

export interface ItemSwapDialogData {
  newItemName: string;
  newItemDescription: string;
  currentItems: ItemSwapDialogItem[];
}

export type ItemSwapDialogResult =
  | { type: "keep-new"; discardItemId: string }
  | { type: "discard-new" };

@Component({
  selector: "app-item-swap-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe, ItemCard],
  templateUrl: "./item-swap-dialog.html",
  styleUrl: "./item-swap-dialog.scss",
})
export class ItemSwapDialog {
  public readonly newItemName: string;
  public readonly newItemDescription: string;
  public readonly currentItems: ItemSwapDialogItem[];
  public readonly selectedItemId = signal<string | null>(null);

  constructor(
    private dialogRef: DialogRef<DialogResponse<ItemSwapDialogResult>>,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: ItemSwapDialogData,
  ) {
    this.newItemName = String(data.newItemName ?? "").trim();
    this.newItemDescription = String(data.newItemDescription ?? "").trim();
    this.currentItems = Array.isArray(data.currentItems) ? data.currentItems : [];
    if (this.currentItems.length > 0) {
      this.selectedItemId.set(this.currentItems[0].itemId);
    }
  }

  public get title(): string {
    return this.translationService.tOrFallback("dialogs.itemSwap.title", "Inventario pieno");
  }

  public get subtitle(): string {
    return this.translationService.tOrFallback(
      "dialogs.itemSwap.subtitle",
      "Non c'è spazio per {item}. Scegli un oggetto da scartare o rifiuta il nuovo.",
      { item: this.newItemName },
    );
  }

  public onSelectItem(itemId: string): void {
    this.selectedItemId.set(itemId);
  }

  public keepNew(): void {
    const selected = this.selectedItemId();
    if (!selected) return;
    this.dialogRef.close({
      result: "confirm",
      data: { type: "keep-new", discardItemId: selected },
    });
  }

  public discardNew(): void {
    this.dialogRef.close({
      result: "confirm",
      data: { type: "discard-new" },
    });
  }

  public close(): void {
    this.discardNew();
  }
}
