import { RegionSelector } from "./WorldZone";

export interface MapConfig {
    size: number;
    specialTilesCount: 4;
    spawnColumns?: number[];
    spawnRule: {
        allowedRegion?: RegionSelector;
        allowedQuadrant?: RegionSelector;
    };
    biomeDeckConfig: BiomeDeckConfig;
}

export interface BiomeDeckConfig {
    plains: number;
    forest: number;
    mountain: number;
    water: number;
    desert: number;
    ruins: number;
}