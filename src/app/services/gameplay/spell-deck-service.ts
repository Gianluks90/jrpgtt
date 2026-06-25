import { Injectable } from "@angular/core";
import { SpellDeckConfig } from "@models/catalog/SpellDeckCatalog";

export interface SpellDrawResult {
  drawn: string[];
  remaining: string[];
  /** Updated discard pile — empty if it was reshuffled back into the deck. */
  discard: string[];
  /** True if the discard pile was consumed during this draw. */
  reshuffled: boolean;
}

@Injectable({
  providedIn: "root",
})
export class SpellDeckService {
  /**
   * Expands spell deck configs into a flat array of spell IDs (respecting
   * quantity), then shuffles using Fisher-Yates.
   */
  public buildAndShuffleDeck(configs: SpellDeckConfig[]): string[] {
    const expanded: string[] = [];
    for (const config of configs) {
      for (const entry of config.cards) {
        for (let i = 0; i < entry.quantity; i++) {
          expanded.push(entry.spellId);
        }
      }
    }
    return this.shuffle(expanded);
  }

  /**
   * Draws up to `count` spell IDs from the top of the deck.
   * If the deck runs out mid-draw it reshuffles the discard pile automatically.
   * After the draw, if the deck is still empty and discard has cards, reshuffles
   * eagerly so the just-drawn spell cannot reappear on the very next draw.
   */
  public draw(deck: string[], discard: string[], count: number): SpellDrawResult {
    const remaining = [...deck];
    let currentDiscard = [...discard];
    const drawn: string[] = [];
    let reshuffled = false;

    for (let i = 0; i < count; i++) {
      if (remaining.length === 0) {
        if (currentDiscard.length === 0) break;
        remaining.push(...this.shuffle([...currentDiscard]));
        currentDiscard = [];
        reshuffled = true;
      }
      drawn.push(remaining.shift()!);
    }

    if (remaining.length === 0 && currentDiscard.length > 0) {
      remaining.push(...this.shuffle([...currentDiscard]));
      currentDiscard = [];
      reshuffled = true;
    }

    return { drawn, remaining, discard: currentDiscard, reshuffled };
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
