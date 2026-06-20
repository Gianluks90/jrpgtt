import { ExplorationCardType } from "@models/exploration/ExplorationCard";

export type StrangerDialogType = 'merchant' | 'healer' | 'mercenary' | (string & {});

export type ExplorationEventEffectType =
    | 'lose-hp'
    | 'gain-hp'
    | 'lose-gold'
    | 'gain-gold'
    | 'skip-turn'
    | 'none';

export interface ExplorationEventEffect {
    type: ExplorationEventEffectType;
    amount?: number;
}

interface ExplorationCardDefBase {
    id: string;
    name: string;
    nameKey?: string;
    description: string;
    descriptionKey?: string;
}

export interface EventCardDef extends ExplorationCardDefBase {
    type: 'event';
    duration: 'instant' | 'turn';
    effect?: ExplorationEventEffect;
}

export interface PlaceCardDef extends ExplorationCardDefBase {
    type: 'place';
}

export interface StrangerCardDef extends ExplorationCardDefBase {
    type: 'stranger';
    persistent: boolean;
    dialogType: StrangerDialogType;
    dialogParams?: Record<string, unknown>;
}

/** Union of exploration-specific card definitions (events, places, strangers). */
export type ExplorationCardDef =
    | EventCardDef
    | PlaceCardDef
    | StrangerCardDef;

/** Catalog of exploration-specific card definitions. Enemies, items, followers etc. live in their own catalogs. */
export interface ExplorationCardCatalog {
    events: EventCardDef[];
    places: PlaceCardDef[];
    strangers: StrangerCardDef[];
}

/**
 * One row in a deck configuration.
 * cardId references the native catalog of the specified type:
 *   enemy    → enemy catalog (enemyId)
 *   item     → item catalog (itemId)
 *   amulet   → item/amulet catalog (amuletId)
 *   follower → follower catalog (followerId)
 *   event    → exploration events catalog
 *   place    → exploration places catalog
 *   stranger → exploration strangers catalog
 */
export interface ExplorationDeckEntry {
    type: ExplorationCardType;
    cardId: string;
    quantity: number;
    expansion: string;
    /** For follower type: whether the follower joins automatically without player choice. */
    forced?: boolean;
}

/**
 * A single physical card slot in the shuffled deck (quantity already expanded).
 * Stored in Firestore as explorationDeck / explorationDiscardedDeck arrays.
 */
export interface ExplorationDeckSlot {
    type: ExplorationCardType;
    cardId: string;
    expansion: string;
    /** Carried through for follower cards. */
    forced?: boolean;
}

export interface ExplorationDeckConfig {
    id: string;
    label: string;
    cards: ExplorationDeckEntry[];
}
