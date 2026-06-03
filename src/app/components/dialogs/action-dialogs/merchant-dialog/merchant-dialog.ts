import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { MerchantDialogOfferRow, MerchantDialogSellRow } from "../../../../models/MerchantCatalog";
import {
  MerchantCheckoutOperation,
  MerchantCheckoutOutcome,
} from "../../../../services/action-executor-service";
import { MerchantTradePanel } from "../../../ui/merchant-trade-panel/merchant-trade-panel";

export interface MerchantDialogData {
  merchantLabel: string;
  playerMoney: number;
  buyOffers: MerchantDialogOfferRow[];
  sellOffers: MerchantDialogSellRow[];
  onConfirm: (operations: MerchantCheckoutOperation[]) => Promise<MerchantCheckoutOutcome>;
}

@Component({
  selector: "app-merchant-dialog",
  standalone: true,
  imports: [MerchantTradePanel],
  templateUrl: "./merchant-dialog.html",
  styleUrl: "./merchant-dialog.scss",
})
export class MerchantDialog {
  public readonly merchantLabel: string;
  public readonly playerMoney: number;
  public readonly buyOffers: MerchantDialogOfferRow[];
  public readonly sellOffers: MerchantDialogSellRow[];

  public loading = false;
  public errorMessage = "";

  private readonly onConfirm: MerchantDialogData["onConfirm"];

  constructor(
    private dialogRef: DialogRef<DialogResponse<MerchantCheckoutOutcome>>,
    @Inject(DIALOG_DATA) data: MerchantDialogData,
  ) {
    this.merchantLabel = data.merchantLabel;
    this.playerMoney = Math.max(0, Math.floor(Number(data.playerMoney ?? 0)));
    this.buyOffers = data.buyOffers;
    this.sellOffers = data.sellOffers;
    this.onConfirm = data.onConfirm;
  }

  public get canClose(): boolean {
    return !this.loading;
  }
  public async onConfirmRequested(operations: MerchantCheckoutOperation[]): Promise<void> {
    if (this.loading) return;

    this.errorMessage = "";
    this.loading = true;
    try {
      const outcome = await this.onConfirm(operations);
      this.dialogRef.close({
        result: "confirm",
        data: outcome,
      });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "Unable to confirm merchant cart.";
    } finally {
      this.loading = false;
    }
  }

  public onCloseRequested(): void {
    if (!this.canClose) return;

    this.dialogRef.close({
      result: "cancel",
    });
  }
}
