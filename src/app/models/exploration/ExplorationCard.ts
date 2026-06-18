import { SanctuaryElement } from "@models/world/MapCell";

export type ExplorationCardType = 'enemy' | 'event' | 'place' | 'stranger' | 'follower' | 'item' | 'amulet';

export type EnemyTime = 'day' | 'night' | 'both';
export type EnemyCombatStat = 'strength' | 'magic';
export type EnemyLevelUpMode = 'BestFirst' | 'Equal' | 'Lucky';
export type ExplorationElement = SanctuaryElement;

/**
 * Loot token formats:
 *   "exp"              → region-based XP (I=1, II=2, III=3)
 *   "gold"             → 2 × cell.x coins
 *   "resource:<id>"    → 1 unit of a resource (food, timber, minerals, cloth)
 *   "item:<id>"        → drops an item card onto the cell
 *   "magic:<id>"       → drops a magic card onto the cell
 */
export type LootToken = string;
export type EnemyLoot = LootToken[];

export interface PlacedEnemyCard {
    type: 'enemy';
    cardId: string;
    instanceId: string;
    order: 1;
    name: string;
    suffix?: string;
    level: number;
    time: EnemyTime;
    element?: ExplorationElement;
    combatStat: EnemyCombatStat;
    strength: number;
    magic: number;
    luck: number;
    loot?: EnemyLoot;
    effect?: string;
}

export interface PlacedEventCard {
    type: 'event';
    cardId: string;
    instanceId: string;
    order: 2;
}

export interface PlacedPlaceCard {
    type: 'place';
    cardId: string;
    instanceId: string;
    order: 3;
}

export interface PlacedStrangerCard {
    type: 'stranger';
    cardId: string;
    instanceId: string;
    order: 4;
    persistent: boolean;
}

export interface PlacedFollowerCard {
    type: 'follower';
    cardId: string;
    instanceId: string;
    order: 5;
    followerId: string;
    forced: boolean;
}

export interface PlacedItemCard {
    type: 'item';
    cardId: string;
    instanceId: string;
    order: 6;
    itemId: string;
}

export interface PlacedAmuletCard {
    type: 'amulet';
    cardId: string;
    instanceId: string;
    order: 7;
    amuletId: string;
}

export type PlacedExplorationCard =
    | PlacedEnemyCard
    | PlacedEventCard
    | PlacedPlaceCard
    | PlacedStrangerCard
    | PlacedFollowerCard
    | PlacedItemCard
    | PlacedAmuletCard;
