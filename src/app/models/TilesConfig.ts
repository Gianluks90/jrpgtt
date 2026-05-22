import { BiomeType } from "./MapCell";
import { ResourceLabel } from "./Resource";

export interface BiomeTilesConfigEntry {
    label: string;
    walkable: boolean;
    resources: ResourceLabel[];
}

export interface TilesConfig {
    biomes: Record<BiomeType, BiomeTilesConfigEntry>;
}
