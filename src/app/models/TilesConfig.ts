import { BiomeType, SanctuaryElement } from "./MapCell";
import { ResourceLabel } from "./Resource";

export interface BiomeTilesConfigEntry {
    label: string;
    walkable: boolean;
    resources: ResourceLabel[];
}

export interface SanctuaryTilesConfigEntry {
    label: string;
    iconUrl: string;
    backgroundColor: string;
    iconColor: string;
}

export interface SpecialTilesConfig {
    sanctuaries: Record<SanctuaryElement, SanctuaryTilesConfigEntry>;
}

export interface TilesConfig {
    biomes: Record<BiomeType, BiomeTilesConfigEntry>;
    specialTiles: SpecialTilesConfig;
}
