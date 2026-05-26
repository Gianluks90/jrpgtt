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
    const resourceLabels = new Set<ResourceLabel>(["timber", "food", "minerals", "cloth"]);

    biomeKeys.forEach((biome) => {
      const entry = (rawBiomes as Record<string, unknown>)[biome];
      if (!entry || typeof entry !== "object") {
        throw new Error(`Invalid tiles configuration: biome '${biome}' entry is missing`);
      }

      const typedEntry = entry as {
        label?: unknown;
        walkable?: unknown;
        resources?: unknown;
        actions?: unknown;
        conditions?: unknown;
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

      if (!Array.isArray(typedEntry.actions)) {
        throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid actions value`);
      }

      if (!Array.isArray(typedEntry.conditions)) {
        throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid conditions value`);
      }

      typedEntry.resources.forEach((resource) => {
        if (typeof resource !== "string" || !resourceLabels.has(resource as ResourceLabel)) {
          throw new Error(`Invalid tiles configuration: biome '${biome}' has unknown resource '${String(resource)}'`);
        }
      });

      typedEntry.actions.forEach((action) => {
        if (typeof action !== "string" || !action.trim()) {
          throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid action '${String(action)}'`);
        }
      });

      typedEntry.conditions.forEach((condition) => {
        if (typeof condition !== "string" || !condition.trim()) {
          throw new Error(`Invalid tiles configuration: biome '${biome}' has invalid condition '${String(condition)}'`);
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
        description?: unknown;
        iconUrl?: unknown;
        backgroundColor?: unknown;
        iconColor?: unknown;
        actions?: unknown;
      };

      if (typeof typedEntry.label !== "string" || !typedEntry.label.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid label`);
      }

      if (!typedEntry.description || typeof typedEntry.description !== "object") {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid description object`);
      }

      const description = typedEntry.description as {
        active?: unknown;
        inactive?: unknown;
      };

      if (typeof description.active !== "string" || !description.active.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid active description`);
      }

      if (typeof description.inactive !== "string" || !description.inactive.trim()) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid inactive description`);
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

      if (!typedEntry.actions || typeof typedEntry.actions !== "object") {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid actions object`);
      }

      const actions = typedEntry.actions as {
        inactive?: unknown;
        active?: unknown;
      };

      if (!Array.isArray(actions.inactive)) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid inactive actions`);
      }

      if (!Array.isArray(actions.active)) {
        throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid active actions`);
      }

      actions.inactive.forEach((action) => {
        if (typeof action !== "string" || !action.trim()) {
          throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid inactive action '${String(action)}'`);
        }
      });

      actions.active.forEach((action) => {
        if (typeof action !== "string" || !action.trim()) {
          throw new Error(`Invalid tiles configuration: sanctuary '${element}' has invalid active action '${String(action)}'`);
        }
      });
    });

    return raw as TilesConfig;
  }
}
