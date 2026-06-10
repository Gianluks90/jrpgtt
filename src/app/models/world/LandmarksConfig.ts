import { BiomeType } from "@models/world/MapCell";
import {
  LandmarkAlignmentModifier,
  LandmarkCategory,
  LandmarkCategoryDefinition,
  LandmarkDefinition,
  SafeLandmarkBiomeSuffix,
} from "@models/world/Landmark";

export interface LandmarksConfig {
  categories: Record<string, LandmarkCategoryDefinition>;
  categoryOrder: LandmarkCategory[];
  definitions: LandmarkDefinition[];
  midAlignmentDistribution: LandmarkAlignmentModifier[];
  safeBiomeSuffixes: Record<BiomeType, SafeLandmarkBiomeSuffix>;
  alignmentPrefixes: Record<LandmarkAlignmentModifier, string>;
  safePlaceActionsByLandmark: Record<string, string[]>;
  midPlaceActionsByLandmark: Record<string, string[]>;
  badPlaceActionsByLandmark: Record<string, string[]>;
}
