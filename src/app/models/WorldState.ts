import { BiomeType } from "./MapCell";
import { SanctuaryElement } from "./MapCell";
import { LandmarkTarget } from "./Landmark";
import { QuadrantId } from "./WorldZone";

export type BiomePlacementCount = Record<BiomeType, number>;
export type TimeOfDay = "day" | "night";

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
    sanctuaryInfluenceByQuadrant?: Partial<Record<QuadrantId, SanctuaryElement>>;
    landmarkTargets?: LandmarkTarget[];
}