export interface MapConfig {
    size: number;
    specialTilesCount: 4;
    spawnColumns?: number[];
    spawnRule: {
        allowedQuadrant: 'first' | 'second' | 'third' | 'random';
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