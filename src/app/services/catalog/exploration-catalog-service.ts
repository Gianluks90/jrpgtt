import { Injectable } from "@angular/core";
import {
    ExplorationCardCatalog,
    ExplorationCardDef,
    EventCardDef,
    PlaceCardDef,
    StrangerCardDef,
    ExplorationDeckConfig,
    ExplorationDeckSlot,
} from "@models/catalog/ExplorationCardCatalog";
import {
    PlacedExplorationCard,
    PlacedEnemyCard,
    PlacedEventCard,
    PlacedPlaceCard,
    PlacedStrangerCard,
    PlacedFollowerCard,
    PlacedItemCard,
    PlacedAmuletCard,
} from "@models/exploration/ExplorationCard";
import { MapCell } from "@models/world/MapCell";
import { EnemyCatalogService } from "@services/catalog/enemy-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";

@Injectable({
    providedIn: "root",
})
export class ExplorationCatalogService {
    private readonly cardsConfigUrl = "/configs/exploration-cards.config.json";
    private readonly deckConfigUrl = "/configs/exploration-deck.config.json";

    private catalogCache: ExplorationCardCatalog | null = null;
    private catalogLoadPromise: Promise<ExplorationCardCatalog> | null = null;

    private deckConfigsCache: ExplorationDeckConfig[] | null = null;
    private deckConfigsLoadPromise: Promise<ExplorationDeckConfig[]> | null = null;

    constructor(
        private enemyCatalogService: EnemyCatalogService,
        private itemCatalogService: ItemCatalogService,
        private followerCatalogService: FollowerCatalogService,
    ) {}

    // ── Config loading ────────────────────────────────────────────────────────

    public async loadConfig(): Promise<ExplorationCardCatalog> {
        if (this.catalogCache) return this.catalogCache;
        if (this.catalogLoadPromise) return this.catalogLoadPromise;

        this.catalogLoadPromise = (async () => {
            const response = await fetch(this.cardsConfigUrl, { headers: { "content-type": "application/json" } });
            if (!response.ok) throw new Error("Unable to load exploration cards configuration");
            const raw = await response.json() as unknown;
            const parsed = this.parseCatalog(raw);
            this.catalogCache = parsed;
            return parsed;
        })();

        try {
            return await this.catalogLoadPromise;
        } finally {
            this.catalogLoadPromise = null;
        }
    }

    public async loadDeckConfigs(): Promise<ExplorationDeckConfig[]> {
        if (this.deckConfigsCache) return this.deckConfigsCache;
        if (this.deckConfigsLoadPromise) return this.deckConfigsLoadPromise;

        this.deckConfigsLoadPromise = (async () => {
            const response = await fetch(this.deckConfigUrl, { headers: { "content-type": "application/json" } });
            if (!response.ok) throw new Error("Unable to load exploration deck configuration");
            const raw = await response.json() as unknown;
            const parsed = this.parseDeckConfigs(raw);
            this.deckConfigsCache = parsed;
            return parsed;
        })();

        try {
            return await this.deckConfigsLoadPromise;
        } finally {
            this.deckConfigsLoadPromise = null;
        }
    }

    // ── Exploration-specific lookups (sync, read from cache) ──────────────────

    public getCardDef(cardId: string): ExplorationCardDef | null {
        if (!this.catalogCache) return null;
        const all: ExplorationCardDef[] = [
            ...this.catalogCache.events,
            ...this.catalogCache.places,
            ...this.catalogCache.strangers,
        ];
        return all.find((d) => d.id === cardId) ?? null;
    }

    public getEventDef(cardId: string): EventCardDef | null {
        return this.catalogCache?.events.find((d) => d.id === cardId) ?? null;
    }

    public getPlaceDef(cardId: string): PlaceCardDef | null {
        return this.catalogCache?.places.find((d) => d.id === cardId) ?? null;
    }

    public getStrangerDef(cardId: string): StrangerCardDef | null {
        return this.catalogCache?.strangers.find((d) => d.id === cardId) ?? null;
    }

    // ── Instantiation ─────────────────────────────────────────────────────────

    public async instantiatePlacedCard(
        slot: ExplorationDeckSlot,
        cell: MapCell,
    ): Promise<PlacedExplorationCard | null> {
        await this.loadConfig();
        const instanceId = this.generateInstanceId();
        const { cardId, type, expansion } = slot;

        switch (type) {
            case 'enemy': {
                const entry = await this.enemyCatalogService.getEnemyById(cardId);
                if (!entry) return null;
                const worldEventBonus = typeof cell.worldEventEnemyLevelBonus === "number"
                    ? cell.worldEventEnemyLevelBonus : 0;
                const level = this.enemyCatalogService.computeSpawnLevel(cell.x, worldEventBonus);
                const placed = this.enemyCatalogService.resolveSpawnedEnemy(entry, level);
                return { ...placed, cardId, instanceId, expansion } as PlacedEnemyCard;
            }

            case 'event': {
                const placed: PlacedEventCard = { type: 'event', cardId, instanceId, expansion, order: 2 };
                return placed;
            }

            case 'place': {
                const placed: PlacedPlaceCard = { type: 'place', cardId, instanceId, expansion, order: 3 };
                return placed;
            }

            case 'stranger': {
                const def = this.getStrangerDef(cardId);
                const placed: PlacedStrangerCard = {
                    type: 'stranger',
                    cardId,
                    instanceId,
                    expansion,
                    order: 4,
                    persistent: def?.persistent ?? false,
                };
                return placed;
            }

            case 'follower': {
                const placed: PlacedFollowerCard = {
                    type: 'follower',
                    cardId,
                    instanceId,
                    expansion,
                    order: 5,
                    followerId: cardId,
                    forced: slot.forced ?? false,
                };
                return placed;
            }

            case 'item': {
                const placed: PlacedItemCard = {
                    type: 'item',
                    cardId,
                    instanceId,
                    expansion,
                    order: 6,
                    itemId: cardId,
                };
                return placed;
            }

            case 'amulet': {
                const placed: PlacedAmuletCard = {
                    type: 'amulet',
                    cardId,
                    instanceId,
                    expansion,
                    order: 7,
                    amuletId: cardId,
                };
                return placed;
            }
        }
    }

    // ── Parsing ───────────────────────────────────────────────────────────────

    private parseCatalog(raw: unknown): ExplorationCardCatalog {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("Invalid exploration cards config: root must be an object");
        }
        const r = raw as Record<string, unknown>;
        return {
            events:   this.parseEventDefs(r["events"]),
            places:   this.parsePlaceDefs(r["places"]),
            strangers: this.parseStrangerDefs(r["strangers"]),
        };
    }

    private parseEventDefs(raw: unknown): EventCardDef[] {
        if (!Array.isArray(raw)) throw new Error("exploration-cards: 'events' must be an array");
        return raw.map((entry, i) => {
            const e = this.assertObj(entry, `events[${i}]`);
            return {
                type: "event",
                id:          this.assertString(e["id"],          `events[${i}].id`),
                name:        this.assertString(e["name"],        `events[${i}].name`),
                description: this.assertString(e["description"], `events[${i}].description`),
                duration:    (e["duration"] === "turn" ? "turn" : "instant") as "instant" | "turn",
                ...(e["nameKey"]        ? { nameKey:        String(e["nameKey"]) }        : {}),
                ...(e["descriptionKey"] ? { descriptionKey: String(e["descriptionKey"]) } : {}),
                ...(e["effect"]         ? { effect:         this.parseEffect(e["effect"], `events[${i}].effect`) } : {}),
            } satisfies EventCardDef;
        });
    }

    private parsePlaceDefs(raw: unknown): PlaceCardDef[] {
        if (!Array.isArray(raw)) throw new Error("exploration-cards: 'places' must be an array");
        return raw.map((entry, i) => {
            const e = this.assertObj(entry, `places[${i}]`);
            return {
                type: "place",
                id:          this.assertString(e["id"],          `places[${i}].id`),
                name:        this.assertString(e["name"],        `places[${i}].name`),
                description: this.assertString(e["description"], `places[${i}].description`),
                ...(e["nameKey"]        ? { nameKey:        String(e["nameKey"]) }        : {}),
                ...(e["descriptionKey"] ? { descriptionKey: String(e["descriptionKey"]) } : {}),
            } satisfies PlaceCardDef;
        });
    }

    private parseStrangerDefs(raw: unknown): StrangerCardDef[] {
        if (!Array.isArray(raw)) throw new Error("exploration-cards: 'strangers' must be an array");
        return raw.map((entry, i) => {
            const e = this.assertObj(entry, `strangers[${i}]`);
            return {
                type: "stranger",
                id:          this.assertString(e["id"],          `strangers[${i}].id`),
                name:        this.assertString(e["name"],        `strangers[${i}].name`),
                description: this.assertString(e["description"], `strangers[${i}].description`),
                persistent:  Boolean(e["persistent"]),
                dialogType:  this.assertString(e["dialogType"], `strangers[${i}].dialogType`),
                ...(e["nameKey"]        ? { nameKey:        String(e["nameKey"]) }        : {}),
                ...(e["descriptionKey"] ? { descriptionKey: String(e["descriptionKey"]) } : {}),
                ...(e["dialogParams"] && typeof e["dialogParams"] === "object"
                    ? { dialogParams: e["dialogParams"] as Record<string, unknown> } : {}),
            } satisfies StrangerCardDef;
        });
    }

    private parseEffect(raw: unknown, path: string): import("@models/catalog/ExplorationCardCatalog").ExplorationEventEffect {
        const e = this.assertObj(raw, path);
        const validTypes = ["lose-hp", "gain-hp", "lose-gold", "gain-gold", "skip-turn", "none"];
        const type = this.assertString(e["type"], `${path}.type`);
        if (!validTypes.includes(type)) throw new Error(`${path}.type must be one of: ${validTypes.join(", ")}`);
        return {
            type: type as import("@models/catalog/ExplorationCardCatalog").ExplorationEventEffectType,
            ...(e["amount"] !== undefined ? { amount: Number(e["amount"]) } : {}),
        };
    }

    private parseDeckConfigs(raw: unknown): ExplorationDeckConfig[] {
        if (!Array.isArray(raw)) throw new Error("Invalid exploration deck config: root must be an array");
        return raw.map((entry, i) => {
            const e = this.assertObj(entry, `deck[${i}]`);
            const id    = this.assertString(e["id"],    `deck[${i}].id`);
            const label = this.assertString(e["label"], `deck[${i}].label`);
            if (!Array.isArray(e["cards"])) throw new Error(`deck[${i}].cards must be an array`);
            const cards = (e["cards"] as unknown[]).map((c, j) => this.parseDeckEntry(c, `deck[${i}].cards[${j}]`));
            return { id, label, cards } satisfies ExplorationDeckConfig;
        });
    }

    private parseDeckEntry(raw: unknown, path: string): ExplorationDeckConfig["cards"][number] {
        const e = this.assertObj(raw, path);
        const validTypes = ["enemy", "event", "place", "stranger", "follower", "item", "amulet"];
        const type = this.assertString(e["type"], `${path}.type`);
        if (!validTypes.includes(type)) throw new Error(`${path}.type must be one of: ${validTypes.join(", ")}`);
        return {
            type: type as import("@models/exploration/ExplorationCard").ExplorationCardType,
            cardId:    this.assertString(e["cardId"],    `${path}.cardId`),
            expansion: this.assertString(e["expansion"], `${path}.expansion`),
            quantity:  Math.max(1, Math.floor(Number(e["quantity"]))),
            ...(e["forced"] !== undefined ? { forced: Boolean(e["forced"]) } : {}),
        };
    }

    private assertObj(raw: unknown, path: string): Record<string, unknown> {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error(`${path} must be an object`);
        }
        return raw as Record<string, unknown>;
    }

    private assertString(raw: unknown, path: string): string {
        if (typeof raw !== "string" || !raw.trim()) throw new Error(`${path} must be a non-empty string`);
        return raw;
    }

    private generateInstanceId(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        return `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
}
