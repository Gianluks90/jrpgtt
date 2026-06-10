import { BiomeType, SanctuaryElement } from "@models/world/MapCell";
import { ResourceLabel } from "@models/world/Resource";

export interface BiomeTilesConfigEntry {
    label: string;
    walkable: boolean;
    resources: ResourceLabel[];
    actions: string[];
    conditions: string[];
}

export interface SanctuaryTilesConfigEntry {
    label: string;
    description: {
        active: string;
        inactive: string;
    };
    iconUrl: string;
    backgroundColor: string;
    iconColor: string;
    actions: {
        inactive: string[];
        active: string[];
    };
}

export interface SpecialTilesConfig {
    sanctuaries: Record<SanctuaryElement, SanctuaryTilesConfigEntry>;
}

export interface TilesConfig {
    biomes: Record<BiomeType, BiomeTilesConfigEntry>;
    specialTiles: SpecialTilesConfig;
}
