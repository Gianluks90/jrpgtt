import { Injectable } from "@angular/core";
import { BiomeType, MapCell } from "@models/world/MapCell";
import { WorldEventPrimaryOutcome, WorldEventState, WorldState } from "@models/world/WorldState";
import { WorldZonesService } from "@services/map/world-zones-service";

export interface WorldEventCellMutation {
  biomeOverride?: BiomeType;
  conditionIds?: string[];
  enemyLevelBonus?: number;
}

const ENEMY_LEVEL_BONUS_CONDITION_ID = "enemy-level-bonus-by-region-value";

export interface WorldEventEmissionResolution {
  nextWorldEvent: WorldEventState;
  updatedCellsById: Record<string, MapCell>;
  mutationCellIds: string[];
}

const BIOME_TIE_BREAK_ORDER: BiomeType[] = ["forest", "plains", "mountain", "water", "desert", "ruins"];

@Injectable({
  providedIn: "root",
})
export class WorldEventMapMutationService {
  constructor(private worldZonesService: WorldZonesService) {}

  public resolveOnEmission(input: {
    worldState: WorldState;
    mapCellsById: Record<string, MapCell>;
    mapSize: number;
    currentTurn: number;
  }): WorldEventEmissionResolution {
    const existingState = input.worldState.worldEvent ?? {
      title: "Region I -> II",
      emitted: false,
    };

    const seed = this.normalizeSeed(existingState.seed) ?? Math.floor(Math.random() * 1_000_000_000);
    const { targetBiome, driverBiome } = this.resolveTargetAndDriverBiomes(
      this.rankBiomes(input.worldState, input.mapCellsById),
    );
    const activeShrinesInRegionI = this.countActiveShrinesInRegionI(input.mapCellsById, input.mapSize);
    const primaryOutcome = this.rollPrimaryOutcome(seed, activeShrinesInRegionI, "event-summary-primary");
    const title = this.resolveWorldEventTitle();

    const nextWorldEvent: WorldEventState = {
      ...existingState,
      title,
      emitted: true,
      emittedAtTurn: Math.max(1, Math.floor(Number(input.currentTurn ?? 1))),
      targetBiome: targetBiome ?? undefined,
      driverBiome: driverBiome ?? undefined,
      primaryOutcome,
      activeShrinesInRegionI,
      seed,
      cellsAffected: 0,
      cellsMutated: 0,
    };

    if (!targetBiome || !driverBiome) {
      return {
        nextWorldEvent,
        updatedCellsById: {},
        mutationCellIds: [],
      };
    }

    const updatedCellsById: Record<string, MapCell> = {};
    let affected = 0;
    let mutated = 0;

    Object.entries(input.mapCellsById).forEach(([cellId, mapCell]) => {
      if (mapCell.isSpecial === true) return;

      if (this.getEffectiveBiome(mapCell) !== targetBiome) {
        return;
      }

      affected += 1;
      const mutation = this.resolveMutationForCell({
        mapCell,
        worldEvent: nextWorldEvent,
        mapSize: input.mapSize,
      });

      if (!mutation) {
        return;
      }

      const applyResult = this.applyMutationToCell(mapCell, mutation);
      if (!applyResult.changed) {
        return;
      }

      updatedCellsById[cellId] = applyResult.cell;
      mutated += 1;
    });

    nextWorldEvent.cellsAffected = affected;
    nextWorldEvent.cellsMutated = mutated;

    const mutationCellIds = this.buildDeterministicMutationOrder(updatedCellsById);

    return {
      nextWorldEvent,
      updatedCellsById,
      mutationCellIds,
    };
  }

  public resolveMutationForCell(input: {
    mapCell: MapCell;
    worldEvent: WorldEventState | null | undefined;
    mapSize: number;
  }): WorldEventCellMutation | null {
    const worldEvent = input.worldEvent;
    if (!worldEvent || worldEvent.emitted !== true) {
      return null;
    }

    const targetBiome = worldEvent.targetBiome;
    const driverBiome = worldEvent.driverBiome;
    const seed = this.normalizeSeed(worldEvent.seed);

    if (!targetBiome || !driverBiome || typeof seed !== "number") {
      return null;
    }

    if (input.mapCell.isSpecial === true) {
      return null;
    }

    if (this.getEffectiveBiome(input.mapCell) !== targetBiome) {
      return null;
    }

    const activeShrines = Math.max(0, Math.min(2, Math.floor(Number(worldEvent.activeShrinesInRegionI ?? 0))));
    const cellKeyPrefix = `${input.mapCell.x}_${input.mapCell.y}`;
    const primaryOutcome = this.rollPrimaryOutcome(seed, activeShrines, `${cellKeyPrefix}:primary`);

    const primaryMutation = this.resolvePrimaryMutation({
      mapCell: input.mapCell,
      driverBiome,
      primaryOutcome,
      mapSize: input.mapSize,
    });

    const strongerEnemiesChanceByShrines = [0.1, 0.09, 0.08] as const;
    const strongerEnemiesChance = strongerEnemiesChanceByShrines[activeShrines] ?? strongerEnemiesChanceByShrines[0];
    const strongerEnemiesRoll = this.randomFromSeed(seed, `${cellKeyPrefix}:secondary`);
    const secondaryEnemyBonus = strongerEnemiesRoll < strongerEnemiesChance ? 1 : 0;

    const enemyLevelBonus = Math.max(primaryMutation.enemyLevelBonus ?? 0, secondaryEnemyBonus);
    const conditionIds = new Set<string>((primaryMutation.conditionIds ?? []).filter((id) => !!id.trim()));
    if (enemyLevelBonus > 0) {
      conditionIds.add(ENEMY_LEVEL_BONUS_CONDITION_ID);
    }

    if (!primaryMutation.biomeOverride && conditionIds.size === 0 && enemyLevelBonus <= 0) {
      return null;
    }

    return {
      biomeOverride: primaryMutation.biomeOverride,
      conditionIds: Array.from(conditionIds),
      enemyLevelBonus,
    };
  }

  public applyMutationToCell(cell: MapCell, mutation: WorldEventCellMutation): { cell: MapCell; changed: boolean } {
    if (cell.isSpecial === true) {
      return {
        cell,
        changed: false,
      };
    }

    const nextCell: MapCell = {
      ...cell,
    };

    if (mutation.biomeOverride && mutation.biomeOverride !== cell.biome) {
      if (!cell.worldEventOriginalBiome) {
        nextCell.worldEventOriginalBiome = cell.biome;
      }
      nextCell.biome = mutation.biomeOverride;
      nextCell.worldEventBiomeOverride = undefined;
    }

    if (Array.isArray(mutation.conditionIds) && mutation.conditionIds.length > 0) {
      const merged = new Set<string>([
        ...(Array.isArray(cell.worldEventConditionIds) ? cell.worldEventConditionIds : []),
        ...mutation.conditionIds,
      ]);
      nextCell.worldEventConditionIds = Array.from(merged);
    }

    if (typeof mutation.enemyLevelBonus === "number" && Number.isFinite(mutation.enemyLevelBonus) && mutation.enemyLevelBonus > 0) {
      const existing = Math.max(0, Math.floor(Number(cell.worldEventEnemyLevelBonus ?? 0)));
      nextCell.worldEventEnemyLevelBonus = Math.max(existing, Math.floor(mutation.enemyLevelBonus));
    }

    const changed =
      nextCell.biome !== cell.biome
      || nextCell.worldEventOriginalBiome !== cell.worldEventOriginalBiome
      || nextCell.worldEventBiomeOverride !== cell.worldEventBiomeOverride
      || (nextCell.worldEventEnemyLevelBonus ?? 0) !== (cell.worldEventEnemyLevelBonus ?? 0)
      || JSON.stringify(nextCell.worldEventConditionIds ?? []) !== JSON.stringify(cell.worldEventConditionIds ?? []);

    return {
      cell: nextCell,
      changed,
    };
  }

  public getEffectiveBiome(cell: MapCell): BiomeType {
    return cell.worldEventBiomeOverride ?? cell.biome;
  }

  public getEffectiveConditionIds(cell: MapCell, baseConditionIds: string[]): string[] {
    const merged = new Set<string>([
      ...baseConditionIds,
      ...(Array.isArray(cell.worldEventConditionIds) ? cell.worldEventConditionIds : []),
    ]);
    return Array.from(merged);
  }

  private resolvePrimaryMutation(input: {
    mapCell: MapCell;
    driverBiome: BiomeType;
    primaryOutcome: WorldEventPrimaryOutcome;
    mapSize: number;
  }): WorldEventCellMutation {
    if (input.primaryOutcome === "none") {
      return {};
    }

    if (input.primaryOutcome === "negative") {
      if (input.driverBiome === "forest") {
        return { biomeOverride: "forest" };
      }
      if (input.driverBiome === "desert") {
        return { biomeOverride: "desert" };
      }
      if (input.driverBiome === "water") {
        return { biomeOverride: "water" };
      }
      if (input.driverBiome === "plains") {
        return {
          conditionIds: [ENEMY_LEVEL_BONUS_CONDITION_ID],
          enemyLevelBonus: this.getRegionValue(input.mapCell.x, input.mapSize),
        };
      }
      if (input.driverBiome === "mountain") {
        return { conditionIds: ["impassable"] };
      }
      if (input.driverBiome === "ruins") {
        return { conditionIds: ["cursed-ground"] };
      }
      return {};
    }

    if (input.driverBiome === "forest") {
      return { conditionIds: ["abundant-resources"] };
    }
    if (input.driverBiome === "desert") {
      return { conditionIds: ["swift-path"] };
    }
    if (input.driverBiome === "water") {
      return { conditionIds: ["regenerating-waters"] };
    }
    if (input.driverBiome === "plains") {
      return { conditionIds: ["open-ground"] };
    }
    if (input.driverBiome === "mountain") {
      return { conditionIds: ["vein-of-plenty"] };
    }
    if (input.driverBiome === "ruins") {
      return { conditionIds: ["ancient-knowledge"] };
    }

    return {};
  }

  private rankBiomes(worldState: WorldState, mapCellsById: Record<string, MapCell>): BiomeType[] {
    const counts = worldState.placedBiomeCount ?? {
      plains: 0,
      forest: 0,
      mountain: 0,
      water: 0,
      desert: 0,
      ruins: 0,
    };

    const latestRevealByBiome: Record<BiomeType, number> = {
      plains: 0,
      forest: 0,
      mountain: 0,
      water: 0,
      desert: 0,
      ruins: 0,
    };

    Object.values(mapCellsById).forEach((cell) => {
      if (cell.isSpecial === true) return;
      const effectiveBiome = this.getEffectiveBiome(cell);
      const revealedAtTurn = Math.max(0, Math.floor(Number(cell.revealedAtTurn ?? 0)));
      latestRevealByBiome[effectiveBiome] = Math.max(latestRevealByBiome[effectiveBiome], revealedAtTurn);
    });

    return [...BIOME_TIE_BREAK_ORDER].sort((left, right) => {
      const leftCount = Math.max(0, Math.floor(Number(counts[left] ?? 0)));
      const rightCount = Math.max(0, Math.floor(Number(counts[right] ?? 0)));
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }

      const leftLatest = latestRevealByBiome[left] ?? 0;
      const rightLatest = latestRevealByBiome[right] ?? 0;
      if (leftLatest !== rightLatest) {
        return rightLatest - leftLatest;
      }

      return BIOME_TIE_BREAK_ORDER.indexOf(left) - BIOME_TIE_BREAK_ORDER.indexOf(right);
    });
  }

  private resolveTargetAndDriverBiomes(ranking: BiomeType[]): { targetBiome: BiomeType | null; driverBiome: BiomeType | null } {
    const targetBiome = ranking[0] ?? null;
    const driverBiome = targetBiome
      ? (ranking.find((biome) => biome !== targetBiome) ?? null)
      : null;

    return {
      targetBiome,
      driverBiome: driverBiome !== targetBiome ? driverBiome : null,
    };
  }

  private countActiveShrinesInRegionI(mapCellsById: Record<string, MapCell>, mapSize: number): number {
    let count = 0;

    Object.values(mapCellsById).forEach((cell) => {
      if (cell.specialType !== "sanctuary") return;
      if (cell.active !== true) return;

      const region = this.worldZonesService.getRegionLabelByColumn(cell.x, mapSize);
      if (region === "I") {
        count += 1;
      }
    });

    return Math.max(0, Math.min(2, count));
  }

  private rollPrimaryOutcome(seed: number, activeShrinesInRegionI: number, key: string): WorldEventPrimaryOutcome {
    const clampedShrines = Math.max(0, Math.min(2, Math.floor(activeShrinesInRegionI)));
    const negativeByShrines = [0.75, 0.7, 0.65] as const;
    const positiveByShrines = [0.15, 0.2, 0.25] as const;

    const roll = this.randomFromSeed(seed, key);
    const negativeThreshold = negativeByShrines[clampedShrines] ?? negativeByShrines[0];
    if (roll < negativeThreshold) {
      return "negative";
    }

    const positiveThreshold = negativeThreshold + (positiveByShrines[clampedShrines] ?? positiveByShrines[0]);
    if (roll < positiveThreshold) {
      return "positive";
    }

    return "none";
  }

  private resolveWorldEventTitle(): string {
    return "map.worldEventTitle.default";
  }

  private getRegionValue(x: number, mapSize: number): number {
    const region = this.worldZonesService.getRegionLabelByColumn(x, mapSize);
    if (region === "I") return 1;
    if (region === "II") return 2;
    return 3;
  }

  private normalizeSeed(seed: unknown): number | null {
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
      return null;
    }

    return Math.max(0, Math.floor(seed));
  }

  private randomFromSeed(seed: number, key: string): number {
    let hash = (2166136261 ^ seed) >>> 0;
    const source = `${seed}:${key}`;

    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return hash / 4294967296;
  }

  private buildDeterministicMutationOrder(updatedCellsById: Record<string, MapCell>): string[] {
    return Object.keys(updatedCellsById).sort((left, right) => {
      const [leftX, leftY] = left.split("_").map((value) => Math.max(0, Math.floor(Number(value ?? 0))));
      const [rightX, rightY] = right.split("_").map((value) => Math.max(0, Math.floor(Number(value ?? 0))));

      if (leftY !== rightY) {
        return leftY - rightY;
      }

      return leftX - rightX;
    });
  }
}
