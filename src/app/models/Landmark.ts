import { BiomeType } from "./MapCell";
import { QuadrantId } from "./WorldZone";

export type LandmarkCategory = "safe" | "mid" | "bad" | (string & {});
export type LandmarkAlignmentModifier = "good" | "neutral" | "evil";

export interface LandmarkCategoryDefinition {
  id: LandmarkCategory;
  label: string;
  iconUrl: string;
}

export interface LandmarkDefinition {
  id: string;
  baseName: string;
  category: LandmarkCategory;
  usesAlignmentModifier?: boolean;
}

export interface LandmarkTarget {
  x: number;
  y: number;
  landmarkId: string;
  category: LandmarkCategory;
  quadrantId: QuadrantId;
  alignmentModifier?: LandmarkAlignmentModifier;
}

export interface SafeLandmarkBiomeSuffix {
  kind: "prefix" | "suffix";
  value: string;
}

export type SafeLandmarkBiomeSuffixMap = Record<BiomeType, SafeLandmarkBiomeSuffix>;
