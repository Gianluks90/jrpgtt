import { LandmarkAlignmentModifier, LandmarkCategory, LandmarkTarget } from "./Landmark";

export interface MapCell {
    x: number;
    y: number;
    biome: BiomeType;
    revealedAtTurn: number;
    discoveredBy: string;
    isSpecial?: boolean;
    active?: boolean;
    specialType?: SpecialTileType;
    sanctuaryElement?: SanctuaryElement;
    landmarkId?: string;
    landmarkCategory?: LandmarkCategory;
    landmarkAlignmentModifier?: LandmarkAlignmentModifier;
    landmarkDisplayName?: string;
}

export type BiomeType =
    | 'plains'
    | 'forest'
    | 'mountain'
    | 'water'
    | 'desert'
    | 'ruins';

export type SpecialTileType =
    | 'spawn'
    | 'boss'
    | 'shop'
    | 'sanctuary'
    | 'landmark';

export type SanctuaryElement = 'water' | 'fire' | 'wind' | 'earth';

export type LandmarkCellTarget = LandmarkTarget;