import { Injectable } from "@angular/core";
import {
  LANDMARK_ALIGNMENT_PREFIX,
  LANDMARK_CATEGORY_DEFINITIONS,
  LANDMARK_CATEGORY_ORDER,
  LANDMARK_DEFINITIONS,
  MID_LANDMARK_ALIGNMENT_DISTRIBUTION,
  SAFE_LANDMARK_BIOME_SUFFIXES,
  isKnownLandmarkCategory,
} from "../consts/landmarks-catalog";
import { SPECIAL_CELLS } from "../consts/special-cells";
import { BiomeType } from "../models/MapCell";
import {
  LandmarkAlignmentModifier,
  LandmarkCategory,
  LandmarkCategoryDefinition,
  LandmarkDefinition,
  LandmarkTarget,
} from "../models/Landmark";
import { QuadrantId } from "../models/WorldZone";
import { WorldZonesService } from "./world-zones-service";

interface PlacementCoordinate {
  x: number;
  y: number;
}

@Injectable({
  providedIn: "root",
})
export class LandmarksService {
  private readonly quadrantOrder: QuadrantId[] = ["Q1", "Q2", "Q3", "Q4"];

  constructor(private worldZonesService: WorldZonesService) {}

  public generateLandmarkTargets(
    mapSize: number,
    excludedCoordinates: Array<{ x: number; y: number }>,
  ): LandmarkTarget[] {
    const excluded = new Set<string>([
      ...excludedCoordinates.map((coordinate) => this.cellId(coordinate.x, coordinate.y)),
      ...SPECIAL_CELLS.map((coordinate) => this.cellId(coordinate.x, coordinate.y)),
    ]);

    const definitionsByCategory = this.buildDefinitionsByCategory();
    const categoryIndices: Partial<Record<LandmarkCategory, number>> = {};
    const midAlignmentPool = this.shuffleArray([...MID_LANDMARK_ALIGNMENT_DISTRIBUTION]);
    let midAlignmentIndex = 0;

    const targets: LandmarkTarget[] = [];
    for (const quadrantId of this.quadrantOrder) {
      const availableCoordinates = this.buildQuadrantCandidates(quadrantId, mapSize, excluded);
      if (availableCoordinates.length < LANDMARK_CATEGORY_ORDER.length) {
        throw new Error(`Not enough free cells in quadrant ${quadrantId} to place landmarks`);
      }

      const selectedCoordinates = this.shuffleArray(availableCoordinates).slice(0, LANDMARK_CATEGORY_ORDER.length);

      LANDMARK_CATEGORY_ORDER.forEach((category, index) => {
        const coordinate = selectedCoordinates[index];
        if (!coordinate) return;

        excluded.add(this.cellId(coordinate.x, coordinate.y));
        const landmarkDefinition = this.pickDefinitionForCategory(category, definitionsByCategory, categoryIndices);

        let alignmentModifier: LandmarkAlignmentModifier | undefined;
        if (landmarkDefinition.usesAlignmentModifier) {
          alignmentModifier = midAlignmentPool[midAlignmentIndex % Math.max(1, midAlignmentPool.length)] ?? "neutral";
          midAlignmentIndex += 1;
        }

        const target: LandmarkTarget = {
          x: coordinate.x,
          y: coordinate.y,
          landmarkId: landmarkDefinition.id,
          category,
          quadrantId,
        };

        if (alignmentModifier) {
          target.alignmentModifier = alignmentModifier;
        }

        targets.push(target);
      });
    }

    return targets;
  }

  public findTargetAtCoordinate(targets: LandmarkTarget[] | undefined, x: number, y: number): LandmarkTarget | null {
    if (!Array.isArray(targets) || targets.length === 0) return null;
    return targets.find((target) => target.x === x && target.y === y) ?? null;
  }

  public buildLandmarkDisplayName(target: LandmarkTarget, biome: BiomeType): string {
    const definition = this.getDefinitionById(target.landmarkId);
    if (!definition) {
      return "Unknown Landmark";
    }

    if (target.category === "safe") {
      const suffix = SAFE_LANDMARK_BIOME_SUFFIXES[biome];
      if (suffix.kind === "prefix") {
        return `${suffix.value} ${definition.baseName}`;
      }
      return `${definition.baseName} ${suffix.value}`;
    }

    if (target.category === "mid") {
      const modifier = LANDMARK_ALIGNMENT_PREFIX[target.alignmentModifier ?? "neutral"];
      if (!modifier) return definition.baseName;
      return `${modifier} ${definition.baseName}`;
    }

    return definition.baseName;
  }

  public getCategoryDefinition(category: LandmarkCategory): LandmarkCategoryDefinition | null {
    if (isKnownLandmarkCategory(category)) {
      return LANDMARK_CATEGORY_DEFINITIONS[category];
    }

    return null;
  }

  public getCategoryIconUrl(category: LandmarkCategory | undefined): string | null {
    if (!category) return null;
    return this.getCategoryDefinition(category)?.iconUrl ?? null;
  }

  public getDefinitionById(landmarkId: string | undefined): LandmarkDefinition | null {
    if (!landmarkId) return null;
    return LANDMARK_DEFINITIONS.find((definition) => definition.id === landmarkId) ?? null;
  }

  public getCategoryLabel(category: LandmarkCategory | undefined): string {
    if (!category) return "Unknown";
    return this.getCategoryDefinition(category)?.label ?? category;
  }

  private buildQuadrantCandidates(
    quadrantId: QuadrantId,
    mapSize: number,
    excluded: Set<string>,
  ): PlacementCoordinate[] {
    const bounds = this.worldZonesService.getQuadrantBounds(quadrantId, mapSize);
    const candidates: PlacementCoordinate[] = [];

    for (let y = bounds.startY; y < bounds.startY + bounds.size; y++) {
      for (let x = bounds.startX; x < bounds.startX + bounds.size; x++) {
        const id = this.cellId(x, y);
        if (excluded.has(id)) continue;
        candidates.push({ x, y });
      }
    }

    return candidates;
  }

  private buildDefinitionsByCategory(): Record<string, LandmarkDefinition[]> {
    const grouped: Record<string, LandmarkDefinition[]> = {};

    for (const definition of LANDMARK_DEFINITIONS) {
      const bucket = grouped[definition.category] ?? [];
      bucket.push(definition);
      grouped[definition.category] = bucket;
    }

    for (const category of Object.keys(grouped)) {
      grouped[category] = this.shuffleArray(grouped[category]);
    }

    return grouped;
  }

  private pickDefinitionForCategory(
    category: LandmarkCategory,
    grouped: Record<string, LandmarkDefinition[]>,
    indices: Partial<Record<LandmarkCategory, number>>,
  ): LandmarkDefinition {
    const pool = grouped[category] ?? [];
    if (pool.length === 0) {
      throw new Error(`Landmark catalog for category '${category}' is empty`);
    }

    const index = indices[category] ?? 0;
    const definition = pool[index % pool.length];
    indices[category] = index + 1;
    return definition;
  }

  private shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      const current = shuffled[i];
      shuffled[i] = shuffled[randomIndex];
      shuffled[randomIndex] = current;
    }
    return shuffled;
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}
