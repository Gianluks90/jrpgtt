import { Component, computed, inject, input } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";

export interface ItemCardValue {
  amount: number;
  tone: "cost" | "gain" | "value";
}

export interface ItemCardUses {
  current: number;
  max: number;
  slots: boolean[];
}

export interface ItemCardLabel {
  text: string;
  tone: "neutral" | "positive" | "negative";
}

@Component({
  selector: "app-item-card",
  imports: [TranslationPipe],
  templateUrl: "./item-card.html",
  styleUrl: "./item-card.scss",
  host: {
    "[class.item-card--spell]": "isSpell()",
  },
})
export class ItemCard {
  private readonly translationService = inject(TranslationService);

  public name = input.required<string>();
  public description = input.required<string>();
  public subtype = input<string | null>(null);
  public keywords = input<string[]>([]);
  public labels = input<ItemCardLabel[]>([]);
  public value = input<ItemCardValue | null>(null);
  public uses = input<ItemCardUses | null>(null);
  public isSpell = input<boolean>(false);
  public mpCost = input<number | undefined>(undefined);
  public consumableOnCast = input<boolean>(false);
  public metaItems = input<string[]>([]);

  public readonly subtypeLabel = computed<string | null>(() => {
    const st = this.subtype();
    if (!st) return null;
    const key = `catalogs.items.category.${st}`;
    const label = this.translationService.tOrFallback(key, "");
    return label || null;
  });
}
