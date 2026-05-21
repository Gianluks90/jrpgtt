export interface MapConfig {
    size: 10;
    specialTilesCount: 4;
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