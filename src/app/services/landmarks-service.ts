import { Injectable } from "@angular/core";
import {
  BAD_PLACE_ACTIONS_BY_LANDMARK,
  LANDMARK_ALIGNMENT_PREFIX,
  LANDMARK_CATEGORY_DEFINITIONS,
  LANDMARK_CATEGORY_ORDER,
  LANDMARK_DEFINITIONS,
  MID_PLACE_ACTIONS_BY_LANDMARK,
  MID_LANDMARK_ALIGNMENT_DISTRIBUTION,
  SAFE_LANDMARK_BIOME_SUFFIXES,
  isKnownLandmarkCategory,
} from "../consts/landmarks-catalog";
import { SAFE_PLACE_ACTIONS_BY_LANDMARK, SafePlaceLandmarkId } from "../consts/safe-place-actions";
import { SPECIAL_CELLS } from "../consts/special-cells";
import { BiomeType, MapCell } from "../models/MapCell";
import {
  LandmarkAlignmentModifier,
  LandmarkCategory,
  LandmarkCategoryDefinition,
  LandmarkDefinition,
  LandmarkTarget,
} from "../models/Landmark";
import { LandmarksConfig } from "../models/LandmarksConfig";
import { QuadrantId } from "../models/WorldZone";
import { LandmarksConfigService } from "./landmarks-config-service";
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

  constructor(
    private worldZonesService: WorldZonesService,
    private landmarksConfigService: LandmarksConfigService,
  ) {}

  public async loadConfig(): Promise<LandmarksConfig> {
    return this.landmarksConfigService.loadConfig();
  }

  public async generateLandmarkTargets(
    mapSize: number,
    excludedCoordinates: Array<{ x: number; y: number }>,
  ): Promise<LandmarkTarget[]> {
    const config = await this.landmarksConfigService.loadConfig();
    const excluded = new Set<string>([
      ...excludedCoordinates.map((coordinate) => this.cellId(coordinate.x, coordinate.y)),
      ...SPECIAL_CELLS.map((coordinate) => this.cellId(coordinate.x, coordinate.y)),
    ]);

    const categoryOrder = this.getCategoryOrder(config);
    const definitionsByCategory = this.buildDefinitionsByCategory(this.getDefinitions(config));
    const categoryIndices: Partial<Record<LandmarkCategory, number>> = {};
    const midAlignmentPool = this.shuffleArray([...this.getMidAlignmentDistribution(config)]);
    let midAlignmentIndex = 0;

    const targets: LandmarkTarget[] = [];
    for (const quadrantId of this.quadrantOrder) {
      const availableCoordinates = this.buildQuadrantCandidates(quadrantId, mapSize, excluded);
      if (availableCoordinates.length < categoryOrder.length) {
        throw new Error(`Not enough free cells in quadrant ${quadrantId} to place landmarks`);
      }

      const selectedCoordinates = this.shuffleArray(availableCoordinates).slice(0, categoryOrder.length);

      categoryOrder.forEach((category, index) => {
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

  public async buildLandmarkDisplayName(target: LandmarkTarget, biome: BiomeType): Promise<string> {
    const config = await this.landmarksConfigService.loadConfig();
    const definition = this.getDefinitionByIdFromDefinitions(target.landmarkId, this.getDefinitions(config));
    if (!definition) {
      return "Unknown Landmark";
    }

    if (target.category === "safe") {
      const suffix = this.getSafeBiomeSuffixes(config)[biome];
      if (suffix.kind === "prefix") {
        return `${suffix.value} ${definition.baseName}`;
      }
      return `${definition.baseName} ${suffix.value}`;
    }

    if (target.category === "mid") {
      const alignmentPrefixes = this.getAlignmentPrefixes(config);
      const modifier = alignmentPrefixes[target.alignmentModifier ?? "neutral"];
      if (!modifier) return definition.baseName;
      return `${modifier} ${definition.baseName}`;
    }

    return definition.baseName;
  }

  public getCategoryDefinition(category: LandmarkCategory): LandmarkCategoryDefinition | null {
    if (!isKnownLandmarkCategory(category)) {
      return null;
    }

    const categories = this.getCategoryDefinitionsMap(this.landmarksConfigService.getCachedConfig());
    const configCategory = categories[category];
    if (configCategory) {
      return configCategory;
    }

    return LANDMARK_CATEGORY_DEFINITIONS[category];
  }

  public getCategoryIconUrl(category: LandmarkCategory | undefined): string | null {
    if (!category) return null;
    return this.getCategoryDefinition(category)?.iconUrl ?? null;
  }

  public getDefinitionById(landmarkId: string | undefined): LandmarkDefinition | null {
    if (!landmarkId) return null;

    const config = this.landmarksConfigService.getCachedConfig();
    return this.getDefinitionByIdFromDefinitions(landmarkId, this.getDefinitions(config));
  }

  public getCategoryLabel(category: LandmarkCategory | undefined): string {
    if (!category) return "Unknown";
    return this.getCategoryDefinition(category)?.label ?? category;
  }

  public getSafePlaceActionIds(landmarkId: string | undefined): string[] {
    return this.getLandmarkActionIds(landmarkId, "safe");
  }

  public getLandmarkActionIdsForCell(cell: MapCell | null | undefined): string[] {
    if (!cell) {
      return [];
    }

    const hasLandmarkHints = cell.specialType === "landmark"
      || cell.isSpecial === true
      || (typeof cell.landmarkId === "string" && cell.landmarkId.trim().length > 0)
      || (typeof cell.landmarkDisplayName === "string" && cell.landmarkDisplayName.trim().length > 0)
      || typeof cell.landmarkCategory === "string";

    if (!hasLandmarkHints || cell.specialType === "sanctuary") {
      return [];
    }

    const inferredLandmarkId = this.resolveLandmarkIdFromCell(cell);
    if (!inferredLandmarkId) {
      return [];
    }

    const inferredCategory = cell.landmarkCategory ?? this.resolveLandmarkCategoryFromId(inferredLandmarkId);
    if (!inferredCategory) {
      return [];
    }

    return this.getLandmarkActionIds(inferredLandmarkId, inferredCategory);
  }

  public getLandmarkActionIds(landmarkId: string | undefined, category: LandmarkCategory | undefined): string[] {
    if (!landmarkId || !category) {
      return [];
    }

    const cached = this.landmarksConfigService.getCachedConfig();
    const configuredActions = category === "safe"
      ? cached?.safePlaceActionsByLandmark?.[landmarkId]
      : category === "mid"
        ? cached?.midPlaceActionsByLandmark?.[landmarkId]
        : cached?.badPlaceActionsByLandmark?.[landmarkId];

    if (Array.isArray(configuredActions)) {
      return configuredActions.filter((actionId) => typeof actionId === "string" && actionId.trim().length > 0);
    }

    if (category === "safe" && this.isSafeLandmarkId(landmarkId)) {
      return [...SAFE_PLACE_ACTIONS_BY_LANDMARK[landmarkId]];
    }

    if (category === "mid") {
      return [...(MID_PLACE_ACTIONS_BY_LANDMARK[landmarkId] ?? [])];
    }

    if (category === "bad") {
      return [...(BAD_PLACE_ACTIONS_BY_LANDMARK[landmarkId] ?? [])];
    }

    return [];
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

  private buildDefinitionsByCategory(definitions: LandmarkDefinition[]): Record<string, LandmarkDefinition[]> {
    const grouped: Record<string, LandmarkDefinition[]> = {};

    for (const definition of definitions) {
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

  private getCategoryOrder(config: LandmarksConfig | null): LandmarkCategory[] {
    if (!config?.categoryOrder || config.categoryOrder.length === 0) {
      return [...LANDMARK_CATEGORY_ORDER];
    }

    return [...config.categoryOrder];
  }

  private getDefinitions(config: LandmarksConfig | null): LandmarkDefinition[] {
    if (!config?.definitions || config.definitions.length === 0) {
      return [...LANDMARK_DEFINITIONS];
    }

    return [...config.definitions];
  }

  private getMidAlignmentDistribution(config: LandmarksConfig | null): LandmarkAlignmentModifier[] {
    if (!config?.midAlignmentDistribution || config.midAlignmentDistribution.length === 0) {
      return [...MID_LANDMARK_ALIGNMENT_DISTRIBUTION];
    }

    return [...config.midAlignmentDistribution];
  }

  private getSafeBiomeSuffixes(config: LandmarksConfig | null) {
    if (!config?.safeBiomeSuffixes) {
      return SAFE_LANDMARK_BIOME_SUFFIXES;
    }

    return config.safeBiomeSuffixes;
  }

  private getAlignmentPrefixes(config: LandmarksConfig | null) {
    if (!config?.alignmentPrefixes) {
      return LANDMARK_ALIGNMENT_PREFIX;
    }

    return config.alignmentPrefixes;
  }

  private getCategoryDefinitionsMap(config: LandmarksConfig | null): Record<string, LandmarkCategoryDefinition> {
    if (!config?.categories) {
      return LANDMARK_CATEGORY_DEFINITIONS;
    }

    return config.categories;
  }

  private getDefinitionByIdFromDefinitions(
    landmarkId: string,
    definitions: LandmarkDefinition[],
  ): LandmarkDefinition | null {
    return definitions.find((definition) => definition.id === landmarkId) ?? null;
  }

  private resolveLandmarkCategoryFromId(landmarkId: string): LandmarkCategory | null {
    const definition = this.getDefinitionById(landmarkId);
    return definition?.category ?? null;
  }

  private resolveLandmarkIdFromCell(cell: MapCell): string | null {
    const directId = typeof cell.landmarkId === "string" ? cell.landmarkId.trim() : "";
    if (directId.length > 0) {
      return directId;
    }

    const displayName = typeof cell.landmarkDisplayName === "string"
      ? cell.landmarkDisplayName.trim().toLowerCase()
      : "";
    if (!displayName) {
      return null;
    }

    const definitions = this.getDefinitions(this.landmarksConfigService.getCachedConfig());
    const matched = definitions.find((definition) => {
      return displayName.includes(definition.id.toLowerCase())
        || displayName.includes(definition.baseName.toLowerCase());
    });

    return matched?.id ?? null;
  }

  private isSafeLandmarkId(value: string): value is SafePlaceLandmarkId {
    return value === "capital" || value === "city" || value === "village" || value === "camp";
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
