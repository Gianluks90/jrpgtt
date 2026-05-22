import { TilesConfig } from "../models/TilesConfig";
import { BiomeType } from "../models/MapCell";
import { ResourceLabel } from "../models/Resource";

/**
 * Estrae il mapping bioma → resources dalla TilesConfig caricata.
 * @param config TilesConfig validata
 */
export function getBiomeResourcesMap(config: TilesConfig): Record<BiomeType, ResourceLabel[]> {
    const result: Record<BiomeType, ResourceLabel[]> = {
        plains: [],
        forest: [],
        mountain: [],
        water: [],
        desert: [],
        ruins: [],
    };
    (Object.keys(result) as BiomeType[]).forEach((biome) => {
        result[biome] = config.biomes[biome]?.resources ?? [];
    });
    return result;
}
