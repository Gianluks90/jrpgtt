import { Timestamp } from "firebase/firestore";
import { Inventory } from "./Inventory";
import { LuckCheckResult } from "./LuckCheckResult";
import { SanctuaryElement } from "./MapCell";
import { ResourceLabel } from "./Resource";
import { PlayerFollowerEntry } from "./Follower";

export type PlayerStatusKey = "nutrition" | (string & {});
export type PlayerAlignment = "evil" | "neutral" | "good";

export interface PlayerStatus {
    key: PlayerStatusKey;
    label: string;
    description: string;
    durationTurns: number;
    effectKey?: string;
}

export interface PendingResourcePickup {
    resource: ResourceLabel;
    source: "exploration";
    requestedAtTurn: number;
}

export interface Player {
    id: string;
    name: string;
    alignment?: PlayerAlignment;
    location: PlayerLocation;
    parameters: PlayerParameters;
    level: number;
    experience: number;
    pendingLevelUpChoices?: number;
    attunedElement?: SanctuaryElement;
    inventory: Inventory;
    followers: PlayerFollowerEntry[];
    lastLuckCheck?: LuckCheckResult;
    isReady: boolean;
    color: string;
    joinedAt: Timestamp;
    actionsUsedThisTurn?: Record<string, number>;
    statuses?: PlayerStatus[];
    pendingResourcePickup?: PendingResourcePickup | null;
}

export interface PlayerLocation {
    x: number;
    y: number;
}

export interface PlayerParameters {
    hp: PlayerParameter;
    mp: PlayerParameter;
    strength: PlayerParameter;
    magic: PlayerParameter;
    luck: PlayerParameter;
}

export interface PlayerParameter {
    base: number;
    current: number;
    max?: number;
}