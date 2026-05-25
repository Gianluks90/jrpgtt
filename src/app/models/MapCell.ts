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

export type SanctuaryElement = 'water' | 'fire' | 'wind' | 'earth';