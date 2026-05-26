import {
  LandmarkAlignmentModifier,
  LandmarkCategory,
  LandmarkCategoryDefinition,
  LandmarkDefinition,
  SafeLandmarkBiomeSuffixMap,
} from "../models/Landmark";

export const LANDMARK_CATEGORY_DEFINITIONS: Record<"safe" | "mid" | "bad", LandmarkCategoryDefinition> = {
  safe: {
    id: "safe",
    label: "Safe place",
    iconUrl: "/landmark-icons/safe-place-icon.svg",
  },
  mid: {
    id: "mid",
    label: "Mid place",
    iconUrl: "/landmark-icons/mid-place-icon.svg",
  },
  bad: {
    id: "bad",
    label: "Bad place",
    iconUrl: "/landmark-icons/bad-place-icon.svg",
  },
};

export const LANDMARK_CATEGORY_ORDER: Array<"safe" | "mid" | "bad"> = ["safe", "mid", "bad"];

export const LANDMARK_DEFINITIONS: LandmarkDefinition[] = [
  { id: "capital", baseName: "Capital", category: "safe" },
  { id: "city", baseName: "City", category: "safe" },
  { id: "village", baseName: "Village", category: "safe" },
  { id: "camp", baseName: "Camp", category: "safe" },

  { id: "graveyard", baseName: "Graveyard", category: "mid", usesAlignmentModifier: true },
  { id: "temple", baseName: "Temple", category: "mid", usesAlignmentModifier: true },
  { id: "castle", baseName: "Castle", category: "mid", usesAlignmentModifier: true },
  { id: "academy", baseName: "Academy", category: "mid", usesAlignmentModifier: true },

  { id: "cave", baseName: "Cave", category: "bad" },
  { id: "dungeon", baseName: "Dungeon", category: "bad" },
  { id: "manor", baseName: "Manor", category: "bad" },
  { id: "altar", baseName: "Altar", category: "bad" },
];

export const MID_LANDMARK_ALIGNMENT_DISTRIBUTION: LandmarkAlignmentModifier[] = [
  "good",
  "neutral",
  "neutral",
  "evil",
];

export const SAFE_LANDMARK_BIOME_SUFFIXES: SafeLandmarkBiomeSuffixMap = {
  plains: { kind: "prefix", value: "Frontier" },
  forest: { kind: "suffix", value: "of the Woods" },
  mountain: { kind: "prefix", value: "Highland" },
  water: { kind: "prefix", value: "Coastal" },
  desert: { kind: "suffix", value: "of the Desert" },
  ruins: { kind: "suffix", value: "of the Fallen" },
};

export const LANDMARK_ALIGNMENT_PREFIX: Record<LandmarkAlignmentModifier, string> = {
  good: "Blessed",
  neutral: "",
  evil: "Cursed",
};

export function isKnownLandmarkCategory(value: string): value is "safe" | "mid" | "bad" {
  return value === "safe" || value === "mid" || value === "bad";
}
