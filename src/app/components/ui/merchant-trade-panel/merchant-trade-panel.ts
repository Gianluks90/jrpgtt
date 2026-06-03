import { Component, computed, input, output, signal } from "@angular/core";
import { MerchantDialogOfferRow, MerchantDialogSellRow } from "../../../models/MerchantCatalog";
import { MerchantCheckoutOperation } from "../../../services/action-executor-service";
import { DialogWrapper } from "../dialog-wrapper/dialog-wrapper";
import { TextButton } from "../text-button/text-button";

interface MerchantCartLine {
  operation: "buy" | "sell";
  itemId: string;
  itemName: string;
  quantity: number;
  totalValue: number;
}

@Component({
  selector: "app-merchant-trade-panel",
  standalone: true,
  imports: [DialogWrapper, TextButton],
  templateUrl: "./merchant-trade-panel.html",
  styleUrl: "./merchant-trade-panel.scss",
})
export class MerchantTradePanel {
  public merchantLabel = input.required<string>();
  public playerMoney = input.required<number>();
  public buyOffers = input.required<MerchantDialogOfferRow[]>();
  public sellOffers = input.required<MerchantDialogSellRow[]>();
  public loading = input(false);
  public errorMessage = input("");

  public confirmRequested = output<MerchantCheckoutOperation[]>();
  public closeRequested = output<void>();

  public showCart = signal(false);
  private readonly pendingBuyByItemId = signal<Map<string, number>>(new Map<string, number>());
  private readonly pendingSellByItemId = signal<Map<string, number>>(new Map<string, number>());

  public cartLines = computed<MerchantCartLine[]>(() => {
    const lines: MerchantCartLine[] = [];
    const pendingBuyByItemId = this.pendingBuyByItemId();
    const pendingSellByItemId = this.pendingSellByItemId();

    pendingBuyByItemId.forEach((quantity, itemId) => {
      if (quantity <= 0) return;
      const offer = this.buyOffers().find((entry) => entry.itemId === itemId);
      if (!offer) return;

      lines.push({
        operation: "buy",
        itemId,
        itemName: offer.name,
        quantity,
        totalValue: -offer.purchaseValue * quantity,
      });
    });

    pendingSellByItemId.forEach((quantity, itemId) => {
      if (quantity <= 0) return;
      const offer = this.sellOffers().find((entry) => entry.itemId === itemId);
      if (!offer) return;

      lines.push({
        operation: "sell",
        itemId,
        itemName: offer.name,
        quantity,
        totalValue: offer.sellValue * quantity,
      });
    });

    return lines.sort((a, b) => a.itemName.localeCompare(b.itemName));
  });

  public cartCount = computed<number>(() => {
    return this.cartLines().reduce((count, line) => count + line.quantity, 0);
  });

  public netCoinsDelta = computed<number>(() => {
    return this.cartLines().reduce((total, line) => total + line.totalValue, 0);
  });

  public projectedMoney = computed<number>(() => {
    return this.playerMoney() + this.netCoinsDelta();
  });

  public canConfirm = computed<boolean>(() => {
    return !this.loading() && this.cartCount() > 0;
  });

  public confirmText = computed<string>(() => {
    return `Confirm ${this.formatSignedCoins(this.netCoinsDelta())}`;
  });

  public headerMoneyText = computed<string>(() => {
    return `Coins ${this.projectedMoney()}`;
  });

  public queueBuy(itemId: string): void {
    if (this.loading()) return;

    const offer = this.buyOffers().find((entry) => entry.itemId === itemId);
    if (!offer) return;
    if (!offer.canBuy) return;

    if (this.getRemainingStock(itemId) <= 0) {
      return;
    }

    if (this.projectedMoney() < offer.purchaseValue) {
      return;
    }

    const nextMap = new Map(this.pendingBuyByItemId());
    nextMap.set(itemId, this.getPendingBuyQuantity(itemId) + 1);
    this.pendingBuyByItemId.set(nextMap);
  }

  public queueSell(itemId: string): void {
    if (this.loading()) return;

    if (this.getRemainingOwnedQuantity(itemId) <= 0) {
      return;
    }

    const nextMap = new Map(this.pendingSellByItemId());
    nextMap.set(itemId, this.getPendingSellQuantity(itemId) + 1);
    this.pendingSellByItemId.set(nextMap);
  }

  public removeCartLine(line: MerchantCartLine): void {
    if (this.loading()) return;

    if (line.operation === "buy") {
      const nextQuantity = this.getPendingBuyQuantity(line.itemId) - line.quantity;
      const nextMap = new Map(this.pendingBuyByItemId());
      if (nextQuantity > 0) {
        nextMap.set(line.itemId, nextQuantity);
      } else {
        nextMap.delete(line.itemId);
      }
      this.pendingBuyByItemId.set(nextMap);
      return;
    }

    const nextQuantity = this.getPendingSellQuantity(line.itemId) - line.quantity;
    const nextMap = new Map(this.pendingSellByItemId());
    if (nextQuantity > 0) {
      nextMap.set(line.itemId, nextQuantity);
    } else {
      nextMap.delete(line.itemId);
    }
    this.pendingSellByItemId.set(nextMap);
  }

  public toggleCart(): void {
    this.showCart.set(!this.showCart());
  }

  public getRemainingStock(itemId: string): number {
    const offer = this.buyOffers().find((entry) => entry.itemId === itemId);
    if (!offer) return 0;

    return Math.max(0, offer.stock - this.getPendingBuyQuantity(itemId));
  }

  public getRemainingOwnedQuantity(itemId: string): number {
    const offer = this.sellOffers().find((entry) => entry.itemId === itemId);
    if (!offer) return 0;

    const boughtInCart = this.getPendingBuyQuantity(itemId);
    const soldInCart = this.getPendingSellQuantity(itemId);
    return Math.max(0, offer.ownedQuantity + boughtInCart - soldInCart);
  }

  public confirm(): void {
    if (!this.canConfirm()) return;

    this.confirmRequested.emit(this.toCheckoutOperations());
  }

  public close(): void {
    if (this.loading()) return;

    this.closeRequested.emit();
  }

  private getPendingBuyQuantity(itemId: string): number {
    return this.pendingBuyByItemId().get(itemId) ?? 0;
  }

  private getPendingSellQuantity(itemId: string): number {
    return this.pendingSellByItemId().get(itemId) ?? 0;
  }

  private toCheckoutOperations(): MerchantCheckoutOperation[] {
    const operations: MerchantCheckoutOperation[] = [];

    this.pendingSellByItemId().forEach((quantity, itemId) => {
      if (quantity <= 0) return;
      operations.push({
        operation: "sell",
        itemId,
        quantity,
      });
    });

    this.pendingBuyByItemId().forEach((quantity, itemId) => {
      if (quantity <= 0) return;
      operations.push({
        operation: "buy",
        itemId,
        quantity,
      });
    });

    return operations;
  }

  private formatSignedCoins(value: number): string {
    const amount = Math.floor(Number(value));
    if (!Number.isFinite(amount) || amount === 0) {
      return "0";
    }

    if (amount > 0) {
      return `+${amount}`;
    }

    return String(amount);
  }
}
