export interface MapCell {
    x: number;
    y: number;

    biome: BiomeType;

    revealedAtTurn: number;

    discoveredBy: string;

    isSpecial?: boolean;

    specialType?: SpecialTileType;
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
    | 'sanctuary';