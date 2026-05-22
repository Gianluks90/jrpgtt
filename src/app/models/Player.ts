import { Timestamp } from "firebase/firestore";
import { Inventory } from "./Inventory";
import { LuckCheckResult } from "./LuckCheckResult";

export interface Player {
    id: string;
    name: string;
    location: PlayerLocation;
    parameters: PlayerParameters;
    level: number;
    experience: number;
    inventory: Inventory;
    lastLuckCheck?: LuckCheckResult;
    isReady: boolean;
    color: string;
    joinedAt: Timestamp;
}

export interface PlayerLocation {
    x: number;
    y: number;
}

export interface PlayerParameters {
    hp: PlayerParameter;
    strength: PlayerParameter;
    magic: PlayerParameter;
    luck: PlayerParameter;
}

export interface PlayerParameter {
    base: number;
    current: number;
    max?: number;
}