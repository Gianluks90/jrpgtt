import { Injectable } from "@angular/core";
import { LandmarkAlignmentModifier } from "@models/world/Landmark";
import { BiomeType } from "@models/world/MapCell";
import { LandmarksConfig } from "@models/world/LandmarksConfig";

@Injectable({
  providedIn: "root",
})
export class LandmarksConfigService {
  private readonly landmarksConfigUrl = "/configs/landmarks.config.json";
  private configCache: LandmarksConfig | null = null;

  public getCachedConfig(): LandmarksConfig | null {
    return this.configCache;
  }

  public async loadConfig(): Promise<LandmarksConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    const response = await fetch(this.landmarksConfigUrl, {
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load landmarks configuration");
    }

    const raw = await response.json() as unknown;
    const parsed = this.parseLandmarksConfig(raw);
    this.configCache = parsed;
    return parsed;
  }

  private parseLandmarksConfig(raw: unknown): LandmarksConfig {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid landmarks configuration: root object is missing");
    }

    const typedRoot = raw as {
      categories?: unknown;
      categoryOrder?: unknown;
      definitions?: unknown;
      midAlignmentDistribution?: unknown;
      safeBiomeSuffixes?: unknown;
      alignmentPrefixes?: unknown;
      safePlaceActionsByLandmark?: unknown;
      midPlaceActionsByLandmark?: unknown;
      badPlaceActionsByLandmark?: unknown;
    };

    const categories = this.parseCategories(typedRoot.categories);
    const categoryOrder = this.parseCategoryOrder(typedRoot.categoryOrder);
    const definitions = this.parseDefinitions(typedRoot.definitions);
    const midAlignmentDistribution = this.parseMidAlignmentDistribution(typedRoot.midAlignmentDistribution);
    const safeBiomeSuffixes = this.parseSafeBiomeSuffixes(typedRoot.safeBiomeSuffixes);
    const alignmentPrefixes = this.parseAlignmentPrefixes(typedRoot.alignmentPrefixes);
    const safePlaceActionsByLandmark = this.parseSafePlaceActionsByLandmark(typedRoot.safePlaceActionsByLandmark);
    const midPlaceActionsByLandmark = this.parseLandmarkActionsByLandmark(
      typedRoot.midPlaceActionsByLandmark,
      "midPlaceActionsByLandmark",
    );
    const badPlaceActionsByLandmark = this.parseLandmarkActionsByLandmark(
      typedRoot.badPlaceActionsByLandmark,
      "badPlaceActionsByLandmark",
    );

    return {
      categories,
      categoryOrder,
      definitions,
      midAlignmentDistribution,
      safeBiomeSuffixes,
      alignmentPrefixes,
      safePlaceActionsByLandmark,
      midPlaceActionsByLandmark,
      badPlaceActionsByLandmark,
    };
  }

  private parseCategories(raw: unknown): LandmarksConfig["categories"] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid landmarks configuration: categories map is missing");
    }

    const categories: LandmarksConfig["categories"] = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") {
        throw new Error(`Invalid landmarks configuration: category '${key}' entry is invalid`);
      }

      const typed = value as {
        id?: unknown;
        label?: unknown;
        iconUrl?: unknown;
      };

      if (typeof typed.id !== "string" || !typed.id.trim()) {
        throw new Error(`Invalid landmarks configuration: category '${key}' has invalid id`);
      }

      if (typeof typed.label !== "string" || !typed.label.trim()) {
        throw new Error(`Invalid landmarks configuration: category '${key}' has invalid label`);
      }

      if (typeof typed.iconUrl !== "string" || !typed.iconUrl.trim()) {
        throw new Error(`Invalid landmarks configuration: category '${key}' has invalid iconUrl`);
      }

      categories[key] = {
        id: typed.id,
        label: typed.label,
        iconUrl: typed.iconUrl,
      };
    }

    return categories;
  }

  private parseCategoryOrder(raw: unknown): LandmarksConfig["categoryOrder"] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Invalid landmarks configuration: categoryOrder array is missing");
    }

    const order = raw.map((entry) => {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error("Invalid landmarks configuration: categoryOrder has invalid value");
      }
      return entry;
    });

    return order;
  }

  private parseDefinitions(raw: unknown): LandmarksConfig["definitions"] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Invalid landmarks configuration: definitions array is missing");
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`Invalid landmarks configuration: definition at index ${index} is invalid`);
      }

      const typed = entry as {
        id?: unknown;
        baseName?: unknown;
        category?: unknown;
        usesAlignmentModifier?: unknown;
      };

      if (typeof typed.id !== "string" || !typed.id.trim()) {
        throw new Error(`Invalid landmarks configuration: definition at index ${index} has invalid id`);
      }

      if (typeof typed.baseName !== "string" || !typed.baseName.trim()) {
        throw new Error(`Invalid landmarks configuration: definition '${typed.id}' has invalid baseName`);
      }

      if (typeof typed.category !== "string" || !typed.category.trim()) {
        throw new Error(`Invalid landmarks configuration: definition '${typed.id}' has invalid category`);
      }

      if (typeof typed.usesAlignmentModifier !== "undefined" && typeof typed.usesAlignmentModifier !== "boolean") {
        throw new Error(`Invalid landmarks configuration: definition '${typed.id}' has invalid usesAlignmentModifier`);
      }

      return {
        id: typed.id,
        baseName: typed.baseName,
        category: typed.category,
        usesAlignmentModifier: typed.usesAlignmentModifier,
      };
    });
  }

  private parseMidAlignmentDistribution(raw: unknown): LandmarksConfig["midAlignmentDistribution"] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Invalid landmarks configuration: midAlignmentDistribution array is missing");
    }

    return raw.map((entry, index) => {
      if (!this.isAlignmentModifier(entry)) {
        throw new Error(`Invalid landmarks configuration: midAlignmentDistribution index ${index} is invalid`);
      }

      return entry;
    });
  }

  private parseSafeBiomeSuffixes(raw: unknown): LandmarksConfig["safeBiomeSuffixes"] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid landmarks configuration: safeBiomeSuffixes map is missing");
    }

    const biomes: BiomeType[] = ["plains", "forest", "mountain", "water", "desert", "ruins"];
    const suffixes = raw as Record<string, unknown>;

    const parsed = {} as LandmarksConfig["safeBiomeSuffixes"];
    for (const biome of biomes) {
      const value = suffixes[biome];
      if (!value || typeof value !== "object") {
        throw new Error(`Invalid landmarks configuration: safeBiomeSuffixes '${biome}' entry is missing`);
      }

      const typed = value as {
        kind?: unknown;
        value?: unknown;
      };

      if (typed.kind !== "prefix" && typed.kind !== "suffix") {
        throw new Error(`Invalid landmarks configuration: safeBiomeSuffixes '${biome}' has invalid kind`);
      }

      if (typeof typed.value !== "string" || !typed.value.trim()) {
        throw new Error(`Invalid landmarks configuration: safeBiomeSuffixes '${biome}' has invalid value`);
      }

      parsed[biome] = {
        kind: typed.kind,
        value: typed.value,
      };
    }

    return parsed;
  }

  private parseAlignmentPrefixes(raw: unknown): LandmarksConfig["alignmentPrefixes"] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid landmarks configuration: alignmentPrefixes map is missing");
    }

    const typed = raw as Record<string, unknown>;
    const good = typed["good"];
    const neutral = typed["neutral"];
    const evil = typed["evil"];

    if (typeof good !== "string" || typeof neutral !== "string" || typeof evil !== "string") {
      throw new Error("Invalid landmarks configuration: alignmentPrefixes values must be strings");
    }

    return {
      good,
      neutral,
      evil,
    };
  }

  private parseSafePlaceActionsByLandmark(raw: unknown): LandmarksConfig["safePlaceActionsByLandmark"] {
    return this.parseLandmarkActionsByLandmark(raw, "safePlaceActionsByLandmark");
  }

  private parseLandmarkActionsByLandmark(
    raw: unknown,
    sectionName: "safePlaceActionsByLandmark" | "midPlaceActionsByLandmark" | "badPlaceActionsByLandmark",
  ): Record<string, string[]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid landmarks configuration: ${sectionName} map is missing`);
    }

    const parsed: Record<string, string[]> = {};

    for (const [landmarkId, actionIds] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(actionIds)) {
        throw new Error(`Invalid landmarks configuration: ${sectionName} '${landmarkId}' must be an array`);
      }

      parsed[landmarkId] = actionIds.map((actionId) => {
        if (typeof actionId !== "string" || !actionId.trim()) {
          throw new Error(`Invalid landmarks configuration: ${sectionName} '${landmarkId}' contains invalid action id`);
        }

        return actionId;
      });
    }

    return parsed;
  }

  private isAlignmentModifier(value: unknown): value is LandmarkAlignmentModifier {
    return value === "good" || value === "neutral" || value === "evil";
  }
}
