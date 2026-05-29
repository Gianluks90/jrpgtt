import { BiomeType } from "./MapCell";
import { SanctuaryElement } from "./MapCell";
import { LandmarkTarget } from "./Landmark";
import { QuadrantId } from "./WorldZone";

export type BiomePlacementCount = Record<BiomeType, number>;
export type TimeOfDay = "day" | "night";

export interface PendingTeleportState {
    x: number;
    y: number;
}

export type PendingFastTravelStage = "booked" | "midpoint";

export interface PendingFastTravelState {
    origin: PendingTeleportState;
    destination: PendingTeleportState;
    stage: PendingFastTravelStage;
}

export interface WorldState {
    currentTurn: number;
    phase: 'lobby' | 'turn' | 'resolution';
    timeOfDay?: TimeOfDay;
    remainingDeck: BiomeType[];
    discardedDeck: BiomeType[];
    placedBiomeCount: BiomePlacementCount;
    turnOrder?: string[];
    activePlayerId?: string;
    movedThisTurnByPlayer?: Record<string, number>;
    pendingAutoMoveOnTurnStartByPlayer?: Record<string, boolean>;
    pendingFastTravelByPlayer?: Record<string, PendingFastTravelState>;
    skippedTurnsByPlayer?: Record<string, number>;
    pendingTeleportsByPlayer?: Record<string, PendingTeleportState>;
    sanctuaryInfluenceByQuadrant?: Partial<Record<QuadrantId, SanctuaryElement>>;
    landmarkTargets?: LandmarkTarget[];
}