import { RegionSelector } from "@models/world/WorldZone";

export interface MapConfig {
    size: number;
    specialTilesCount: 4;
    spawnColumns?: number[];
    landmarkPlacement?: LandmarkPlacementConfig;
    spawnRule: {
        allowedRegion?: RegionSelector;
        allowedQuadrant?: RegionSelector;
    };
    biomeDeckConfig: BiomeDeckConfig;
}

export interface LandmarkPlacementConfig {
    maxPlacementAttempts?: number;
    alignmentThreshold?: number;
    overflowPenaltyMultiplier?: number;
    targetMinimumManhattanDistance?: number;
    minDistancePenaltyMultiplier?: number;
}

export interface BiomeDeckConfig {
    plains: number;
    forest: number;
    mountain: number;
    water: number;
    desert: number;
    ruins: number;
}