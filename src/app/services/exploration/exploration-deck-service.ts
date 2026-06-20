import { Injectable } from "@angular/core";
import { ExplorationDeckConfig, ExplorationDeckSlot } from "@models/catalog/ExplorationCardCatalog";

export interface DrawResult {
    drawn: ExplorationDeckSlot[];
    remaining: ExplorationDeckSlot[];
    /** Updated discard pile — may be empty if it was reshuffled back into the deck. */
    discard: ExplorationDeckSlot[];
    /** True if the discard pile was consumed during this draw (mid-draw or eager reshuffle). */
    reshuffled: boolean;
}

@Injectable({
    providedIn: "root",
})
export class ExplorationDeckService {
    /**
     * Expands deck configs into a flat list of slots (respecting quantity),
     * then shuffles the result using Fisher-Yates.
     */
    public buildAndShuffleDeck(configs: ExplorationDeckConfig[]): ExplorationDeckSlot[] {
        const expanded: ExplorationDeckSlot[] = [];
        for (const config of configs) {
            for (const entry of config.cards) {
                for (let i = 0; i < entry.quantity; i++) {
                    const slot: ExplorationDeckSlot = {
                        type: entry.type,
                        cardId: entry.cardId,
                        expansion: entry.expansion,
                        ...(entry.forced !== undefined ? { forced: entry.forced } : {}),
                    };
                    expanded.push(slot);
                }
            }
        }
        return this.shuffle(expanded);
    }

    /**
     * Draws up to `count` slots from the top of the deck.
     * If the deck runs out mid-draw it reshuffles the discard pile automatically.
     * After the draw, if the deck is empty and discard has cards, reshuffles eagerly
     * so the just-drawn card cannot reappear on the very next draw.
     */
    public draw(deck: ExplorationDeckSlot[], discard: ExplorationDeckSlot[], count: number): DrawResult {
        const remaining = [...deck];
        let currentDiscard = [...discard];
        const drawn: ExplorationDeckSlot[] = [];
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

        // Eager reshuffle: deck empty after draw → reshuffle discard immediately.
        // The just-drawn card is not yet in currentDiscard (it gets added after resolution),
        // so it cannot reappear on the very next cell.
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
