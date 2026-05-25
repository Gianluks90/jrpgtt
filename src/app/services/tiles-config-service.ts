import { Injectable } from "@angular/core";
import { BiomeType, SanctuaryElement } from "../models/MapCell";
import { ResourceLabel } from "../models/Resource";
import { TilesConfig } from "../models/TilesConfig";

@Injectable({
  providedIn: "root",
})
export class TilesConfigService {
  private readonly tilesConfigUrl = "/configs/tiles.config.json";
  private configCache: TilesConfig | null = null;

  public async loadConfig(): Promise<TilesConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    const response = await fetch(this.tilesConfigUrl, {
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load tiles configuration");
    }

    const raw = await response.json() as unknown;
    const parsed = this.parseTilesConfig(raw);
    this.configCache = parsed;
    return parsed;
  }

  private parseTilesConfig(raw: unknown): TilesConfig {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid tiles configuration: root object is missing");
    }

    const rawBiomes = (raw as { biomes?: unknown }).biomes;
    if (!rawBiomes || typeof rawBiomes !== "object") {
      throw new Error("Invalid tiles configuration: biomes map is missing");
    }

    const biomeKeys: BiomeType[] = ["plains", "forest", "mountain", "water", "desert", "ruins"];
    const resourceLabels = new Set<ResourceLabel>(["timber", "food", "minerals"]);

    biomeKeys.forEach((biome) => {
      const entry = (rawBiomes as Record<string, unknown>)[biome];
      if (!entry || typeof entry !== "object") {
        throw new Error(`Invalid tiles configuration: biome '${biome}' entry is missing`);
      }

      const typedEntry = entry as {
        label?: unknown;
        walkable?: unknown;
        resources?: unknown;
      };

      if (typeof typedEntry.label !== "string" || !typedEntry.label.trim()) {
        throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid label`);
      }

      if (typeof typedEntry.walkable !== "boolean") {
        throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid walkable value`);
      }

      if (!Array.isArray(typedEntry.resources)) {
        throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid resources value`);
      }

      typedEntry.resources.forEach((resource) => {
        if (typeof resource !== "string" || !resourceLabels.has(resource as ResourceLabel)) {
          throw new Error(`Invalid tiles configuration: biome '${biome}' has unknown resource '${String(resource)}'`);
        }
      });
    });

    const rawSpecialTiles = (raw as { specialTiles?: unknown }).specialTiles;
    if (!rawSpecialTiles || typeof rawSpecialTiles !== "object") {
      throw new Error("Invalid tiles configuration: specialTiles map is missing");
    }

    const rawSanctuaries = (rawSpecialTiles as { sanctuaries?: unknown }).sanctuaries;
    if (!rawSanctuaries || typeof rawSanctuaries !== "object") {
      throw new Error("Invalid tiles configuration: sanctuaries map is missing");
    }

    const sanctuaryElements: SanctuaryElement[] = ["water", "fire", "wind", "earth"];
    sanctuaryElements.forEach((element) => {
      const entry = (rawSanctuaries as Record<string, unknown>)[element];
      if (!entry || typeof entry !== "object") {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' entry is missing`);
      }

      const typedEntry = entry as {
        label?: unknown;
        iconUrl?: unknown;
        backgroundColor?: unknown;
        iconColor?: unknown;
      };

      if (typeof typedEntry.label !== "string" || !typedEntry.label.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid label`);
      }

      if (typeof typedEntry.iconUrl !== "string" || !typedEntry.iconUrl.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid iconUrl`);
      }

      if (typeof typedEntry.backgroundColor !== "string" || !typedEntry.backgroundColor.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid backgroundColor`);
      }

      if (typeof typedEntry.iconColor !== "string" || !typedEntry.iconColor.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid iconColor`);
      }
    });

    return raw as TilesConfig;
  }
}
