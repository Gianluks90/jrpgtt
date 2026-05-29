import { BiomeType } from "./MapCell";
import {
  LandmarkAlignmentModifier,
  LandmarkCategory,
  LandmarkCategoryDefinition,
  LandmarkDefinition,
  SafeLandmarkBiomeSuffix,
} from "./Landmark";

export interface LandmarksConfig {
  categories: Record<string, LandmarkCategoryDefinition>;
  categoryOrder: LandmarkCategory[];
  definitions: LandmarkDefinition[];
  midAlignmentDistribution: LandmarkAlignmentModifier[];
  safeBiomeSuffixes: Record<BiomeType, SafeLandmarkBiomeSuffix>;
  alignmentPrefixes: Record<LandmarkAlignmentModifier, string>;
  safePlaceActionsByLandmark: Record<string, string[]>;
}
