import { Component, computed, input, output, signal } from "@angular/core";
import { MerchantDialogOfferRow, MerchantDialogSellRow } from "@models/catalog/MerchantCatalog";
import { MerchantCheckoutOperation } from "@services/gameplay/action-executor-service";
import { DialogWrapper } from "../dialog-wrapper/dialog-wrapper";
import { TextButton } from "../text-button/text-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { ItemCard, ItemCardValue } from "../item-card/item-card";

interface MerchantCartLine {
  operation: "buy" | "sell";
  tradableKind: "item" | "follower" | "spell";
  tradableId: string;
  itemName: string;
  quantity: number;
  totalValue: number;
}

@Component({
  selector: "app-merchant-trade-panel",
  standalone: true,
  imports: [DialogWrapper, TextButton, TranslationPipe, ItemCard],
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

  constructor(private translationService: TranslationService) {}

  public cartLines = computed<MerchantCartLine[]>(() => {
    const lines: MerchantCartLine[] = [];
    const pendingBuyByItemId = this.pendingBuyByItemId();
    const pendingSellByItemId = this.pendingSellByItemId();

    pendingBuyByItemId.forEach((quantity, itemId) => {
      if (quantity <= 0) return;
      const offer = this.buyOffers().find((entry) => this.buildBuyKey(entry.tradableKind, entry.tradableId) === itemId);
      if (!offer) return;

      lines.push({
        operation: "buy",
        tradableKind: offer.tradableKind,
        tradableId: offer.tradableId,
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
        tradableKind: "item",
        tradableId: itemId,
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
    return this.translationService.tOrFallback(
      "dialogs.merchant.confirmWithDelta",
      "Confirm {delta}",
      { delta: this.formatSignedCoins(this.netCoinsDelta()) },
    );
  });

  public headerMoneyText = computed<string>(() => {
    return this.translationService.tOrFallback(
      "dialogs.merchant.coinsValue",
      "Coins {value}",
      { value: this.projectedMoney() },
    );
  });

  public queueBuy(tradableKind: "item" | "follower" | "spell", tradableId: string): void {
    if (this.loading()) return;

    const buyKey = this.buildBuyKey(tradableKind, tradableId);
    const offer = this.buyOffers().find((entry) => this.buildBuyKey(entry.tradableKind, entry.tradableId) === buyKey);
    if (!offer) return;
    if (!offer.canBuy) return;

    if (this.getRemainingStock(tradableKind, tradableId) <= 0) {
      return;
    }

    if (this.projectedMoney() < offer.purchaseValue) {
      return;
    }

    const nextMap = new Map(this.pendingBuyByItemId());
    nextMap.set(buyKey, this.getPendingBuyQuantity(buyKey) + 1);
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
      const buyKey = this.buildBuyKey(line.tradableKind, line.tradableId);
      const nextQuantity = this.getPendingBuyQuantity(buyKey) - line.quantity;
      const nextMap = new Map(this.pendingBuyByItemId());
      if (nextQuantity > 0) {
        nextMap.set(buyKey, nextQuantity);
      } else {
        nextMap.delete(buyKey);
      }
      this.pendingBuyByItemId.set(nextMap);
      return;
    }

    const nextQuantity = this.getPendingSellQuantity(line.tradableId) - line.quantity;
    const nextMap = new Map(this.pendingSellByItemId());
    if (nextQuantity > 0) {
      nextMap.set(line.tradableId, nextQuantity);
    } else {
      nextMap.delete(line.tradableId);
    }
    this.pendingSellByItemId.set(nextMap);
  }

  public toggleCart(): void {
    this.showCart.set(!this.showCart());
  }

  public getRemainingStock(tradableKind: "item" | "follower" | "spell", tradableId: string): number {
    const buyKey = this.buildBuyKey(tradableKind, tradableId);
    const offer = this.buyOffers().find((entry) => this.buildBuyKey(entry.tradableKind, entry.tradableId) === buyKey);
    if (!offer) return 0;

    return Math.max(0, offer.stock - this.getPendingBuyQuantity(buyKey));
  }

  public getRemainingOwnedQuantity(itemId: string): number {
    const offer = this.sellOffers().find((entry) => entry.itemId === itemId);
    if (!offer) return 0;

    const boughtInCart = this.getPendingBuyQuantity(this.buildBuyKey("item", itemId));
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

  private getPendingBuyQuantity(buyKey: string): number {
    return this.pendingBuyByItemId().get(buyKey) ?? 0;
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
      const [rawKind, ...idParts] = itemId.split(":");
      const kind: "item" | "follower" | "spell" =
        rawKind === "follower" ? "follower" :
        rawKind === "spell" ? "spell" :
        "item";
      const tradableId = idParts.join(":");
      operations.push({
        operation: "buy",
        itemId: tradableId,
        kind,
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

  public buyItemValue(offer: MerchantDialogOfferRow): ItemCardValue {
    return { amount: offer.purchaseValue, tone: "cost" };
  }

  public sellItemValue(offer: MerchantDialogSellRow): ItemCardValue {
    return { amount: offer.sellValue, tone: "gain" };
  }

  public buyMetaItems(offer: MerchantDialogOfferRow): string[] {
    const items: string[] = [];
    if (offer.tradableKind !== "spell") {
      items.push(`${this.translationService.tOrFallback("dialogs.merchant.meta.category", "Category")}: ${offer.category}`);
    }
    items.push(`${this.translationService.tOrFallback("dialogs.merchant.meta.stock", "Stock")}: ${this.getRemainingStock(offer.tradableKind, offer.tradableId)}`);
    return items;
  }

  public sellMetaItems(offer: MerchantDialogSellRow): string[] {
    return [
      `${this.translationService.tOrFallback("dialogs.merchant.meta.category", "Category")}: ${offer.category}`,
      `${this.translationService.tOrFallback("dialogs.merchant.meta.owned", "Owned")}: ${this.getRemainingOwnedQuantity(offer.itemId)}`,
    ];
  }

  private buildBuyKey(kind: "item" | "follower" | "spell", tradableId: string): string {
    return `${kind}:${tradableId}`;
  }
}
