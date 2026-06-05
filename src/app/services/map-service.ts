import { Injectable } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { doc, getDoc, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { Player } from "../models/Player";
import { ResourceLabel } from "../models/Resource";
import { setDoc } from "firebase/firestore";
import { BiomeType, MapCell } from "../models/MapCell";
import { BiomePlacementCount, WorldState } from "../models/WorldState";
import { GameMap } from "../models/GameMap";
import { EnvironmentService } from "./environment-service";
import { TilesConfigService } from "./tiles-config-service";
import { LuckService } from "./luck-service";
import { LuckCheckResult } from "../models/LuckCheckResult";
import { PlayerProgressionService } from "./player-progression-service";
import { SanctuaryElement } from "../models/MapCell";
import { SPECIAL_CELLS, isSpecialCellCoordinate } from "../consts/special-cells";
import { PLAYER_STARTING_MONEY } from "../consts/player-defaults";
import { EventLogService } from "./event-log-service";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { LandmarksService } from "./landmarks-service";
import { PlayerStatsModifierService } from "./player-stats-modifier-service";
import { WorldEventRegionTransitionService } from "./world-event-region-transition-service";
import { StatusCatalogService } from "./status-catalog-service";
import { BiomeConditionCatalogService } from "./biome-condition-catalog-service";
import { TilesConfig } from "../models/TilesConfig";

type EnvironmentProgressionEvent = "discover" | "expand";

@Injectable({
  providedIn: "root",
})
export class MapService {
  constructor(
    private firebaseService: FirebaseService,
    private environmentService: EnvironmentService,
    private tilesConfigService: TilesConfigService,
    private luckService: LuckService,
    private playerProgressionService: PlayerProgressionService,
    private eventLogService: EventLogService,
    private landmarksService: LandmarksService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private worldEventRegionTransitionService: WorldEventRegionTransitionService,
    private statusCatalogService: StatusCatalogService,
    private biomeConditionCatalogService: BiomeConditionCatalogService,
  ) { }

  public async movePlayer(gameId: string, playerId: string, targetX: number, targetY: number): Promise<void> {
    await Promise.all([
      this.landmarksService.loadConfig(),
      this.statusCatalogService.loadConfig(),
      this.biomeConditionCatalogService.loadConfig(),
    ]);

    const tilesConfig = await this.tilesConfigService.loadConfig();

    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const mapCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(targetX, targetY));

    let movedBiome: BiomeType | null = null;
    let landedOnSpecialCell = false;
    let movedPlayerLuck = 0;
    let environmentProgressionEvent: EnvironmentProgressionEvent | null = null;
    let movedPlayerName = "";
    let movedToNewCell = false;
    let movedSanctuaryElement: SanctuaryElement | undefined;
    let movedLandmarkName = "";
    let movedLandmarkId = "";
    let landedSpecialType: "sanctuary" | "landmark" | null = null;
    let movedOnTurn = 0;
    let movedPlayerStatuses: Player["statuses"] = [];
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldStateSnap, gameMapSnap, targetCellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
        transaction.get(gameMapRef),
        transaction.get(mapCellRef),
      ]);

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      const player = playerSnap.data() as Player;
      movedPlayerStatuses = player.statuses ?? [];
      movedPlayerName = player.name;
      if (player.pendingResourcePickup) {
        throw new Error("Resolve pending resource pickup before moving");
      }
      const worldState = worldStateSnap.data() as WorldState;
      movedOnTurn = worldState.currentTurn ?? 0;
      const gameMap = gameMapSnap.exists() ? gameMapSnap.data() as GameMap : null;
      const mapSize = gameMap?.size ?? 10;

      const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
      if (movedThisTurnByPlayer[playerId] === worldState.currentTurn) {
        throw new Error("You have already moved this turn");
      }

      if (worldState.activePlayerId && worldState.activePlayerId !== playerId) {
        throw new Error("It is not your turn");
      }

      if (!this.isInsideBounds(targetX, targetY, mapSize)) {
        throw new Error("Target cell is out of map bounds");
      }

      const targetCellId = this.cellId(targetX, targetY);
      const movementBonus = this.getFollowerMovementBonus(worldState, player.id);
      const isAllowed = await this.canMoveToTarget(
        transaction,
        gameId,
        player,
        targetCellId,
        mapSize,
        tilesConfig,
        movementBonus,
      );
      if (!isAllowed) {
        throw new Error("Invalid movement for current environment");
      }

      if (targetCellSnap.exists()) {
        const targetCell = targetCellSnap.data() as MapCell;
        if (this.isBlockedByMovementEntryConditions(targetCell, tilesConfig)) {
          throw new Error("Target cell is impassable");
        }
      }

      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.worldEventRegionTransitionService.ensureRegionIToIIEventState(nextWorldState);

      if (!targetCellSnap.exists()) {
        movedToNewCell = true;
        let sanctuaryElement: SanctuaryElement | undefined;
        let drawnBiome: BiomeType;
        if (isSpecialCellCoordinate(targetX, targetY)) {
          sanctuaryElement = await this.drawSanctuaryElement(transaction, gameId);
          movedSanctuaryElement = sanctuaryElement;
          drawnBiome = this.biomeFromSanctuaryElement(sanctuaryElement);
        } else {
          drawnBiome = this.drawBiome(nextWorldState);
        }

        environmentProgressionEvent = await this.evaluateEnvironmentProgressionOnReveal(
          transaction,
          gameId,
          targetX,
          targetY,
          drawnBiome,
          mapSize,
        );

        const newCell: MapCell = {
          x: targetX,
          y: targetY,
          biome: drawnBiome,
          revealedAtTurn: nextWorldState.currentTurn,
          discoveredBy: playerId,
        };

        if (isSpecialCellCoordinate(targetX, targetY)) {
          newCell.isSpecial = true;
          newCell.active = false;
          newCell.specialType = "sanctuary";
          newCell.sanctuaryElement = sanctuaryElement;
          landedOnSpecialCell = true;
          landedSpecialType = "sanctuary";
        } else {
          const landmarkTarget = this.landmarksService.findTargetAtCoordinate(
            nextWorldState.landmarkTargets,
            targetX,
            targetY,
          );

          if (landmarkTarget) {
            newCell.isSpecial = true;
            newCell.specialType = "landmark";
            newCell.landmarkId = landmarkTarget.landmarkId;
            newCell.landmarkCategory = landmarkTarget.category;
            newCell.landmarkDisplayName = await this.landmarksService.buildLandmarkDisplayName(landmarkTarget, drawnBiome);

            if (landmarkTarget.alignmentModifier) {
              newCell.landmarkAlignmentModifier = landmarkTarget.alignmentModifier;
            }

            movedLandmarkName = newCell.landmarkDisplayName;
            movedLandmarkId = newCell.landmarkId ?? "";
            landedOnSpecialCell = true;
            landedSpecialType = "landmark";
          }
        }

        transaction.set(mapCellRef, newCell);
        movedBiome = drawnBiome;

        const projectedPlayer: Player = {
          ...player,
          location: {
            x: targetX,
            y: targetY,
          },
        };
        movedPlayerLuck = this.playerStatsModifierService.computeEffectiveLuck({
          player: projectedPlayer,
          currentCell: newCell,
          worldState,
          mapSize,
        });
      } else {
        const cell = targetCellSnap.data() as MapCell;
        movedBiome = cell.biome;
        landedOnSpecialCell = cell.isSpecial === true || isSpecialCellCoordinate(targetX, targetY);
        if (cell.specialType === "sanctuary") {
          landedSpecialType = "sanctuary";
          movedSanctuaryElement = cell.sanctuaryElement;
        }
        if (cell.specialType === "landmark") {
          landedSpecialType = "landmark";
          movedLandmarkName = this.landmarksService.getLocalizedLandmarkNameFromCell(cell);
          movedLandmarkId = cell.landmarkId ?? "";
        }

        const projectedPlayer: Player = {
          ...player,
          location: {
            x: targetX,
            y: targetY,
          },
        };
        movedPlayerLuck = this.playerStatsModifierService.computeEffectiveLuck({
          player: projectedPlayer,
          currentCell: cell,
          worldState,
          mapSize,
        });
      }

      transaction.set(playerRef, {
        location: {
          x: targetX,
          y: targetY,
        },
      }, { merge: true });

      nextWorldState.movedThisTurnByPlayer = {
        ...movedThisTurnByPlayer,
        [playerId]: worldState.currentTurn,
      };

      if (this.worldEventRegionTransitionService.shouldEmitRegionIToIIEventOnMove({
        worldState: nextWorldState,
        sourceX: player.location.x,
        targetX,
        mapSize,
      })) {
        nextWorldState.worldEvent = {
          ...(nextWorldState.worldEvent ?? { title: "Region I -> II", emitted: false }),
          emitted: true,
        };
      }

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    const movingPlayer = {
      id: playerId,
      name: movedPlayerName,
    };

    await this.tryCreateLog(gameId, movingPlayer, "player.move", {
      x: targetX,
      y: targetY,
    });

    const landedBiome = movedBiome as BiomeType | null;

    if (landedSpecialType === "sanctuary") {
      await this.tryCreateLog(gameId, movingPlayer, "player.enterSanctuary", {
        sanctuary: movedSanctuaryElement,
      });
    } else if (landedSpecialType === "landmark") {
      await this.tryCreateLog(gameId, movingPlayer, movedToNewCell ? "player.discoverLandmark" : "player.reachLandmark", {
        landmarkId: movedLandmarkId,
        landmarkName: movedLandmarkName || this.landmarksService.getLocalizedLandmarkNameFromCell(null),
      });
    } else if (movedToNewCell && landedBiome) {
      await this.tryCreateLog(gameId, movingPlayer, "player.discoverBiome", {
        biome: landedBiome,
      });
    }

    if (environmentProgressionEvent && landedBiome && !landedOnSpecialCell) {
      await this.tryCreateLog(
        gameId,
        movingPlayer,
        environmentProgressionEvent === "discover" ? "player.discoverEnvironment" : "player.expandEnvironment",
        {
          biome: landedBiome,
        },
      );
    }

    // RACCOLTA RISORSA CASUALE
    if (landedBiome && !landedOnSpecialCell) {
      const landedCell = {
        x: targetX,
        y: targetY,
        biome: landedBiome,
        revealedAtTurn: movedOnTurn,
        discoveredBy: playerId,
      } as MapCell;
      const conditionLuckMultiplier = this.resolveConditionLuckMultiplier(landedCell, tilesConfig);
      const fortuneMultiplier = this.resolveLuckBonusMultiplierFromStatuses(movedPlayerStatuses) * conditionLuckMultiplier;
      const luckResult = this.luckService.checkLuck(movedPlayerLuck * fortuneMultiplier);
      const biomeEntry = tilesConfig.biomes[landedBiome];
      const possibleResources = biomeEntry?.resources ?? [];
      const gainedResource = luckResult.success && possibleResources.length > 0
        ? this.pickRandomResource(possibleResources)
        : null;
      const gainedResourceQuantity = gainedResource
        ? this.resolveResourceGainQuantity({
          mapCell: landedCell,
          tilesConfig,
          resourceLabel: gainedResource,
        })
        : 0;

      await this.applyExplorationOutcome(gameId, playerId, gainedResource, gainedResourceQuantity, luckResult, movedOnTurn);
    }

    let gainedExperience = 0;
    if (environmentProgressionEvent) {
      gainedExperience += 1;
    }

    if (landedSpecialType === "sanctuary" && movedToNewCell) {
      gainedExperience += 2;
    }

    if (gainedExperience > 0) {
      await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, playerId, gainedExperience);
      await this.tryCreateLog(gameId, movingPlayer, "player.gainExperience", {
        amount: gainedExperience,
      });
    }
  }

  private async tryCreateLog(
    gameId: string,
    player: Pick<Player, "id" | "name">,
    code: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventLogService.newLog(gameId, player, code, args);
    } catch (error) {
      console.error("Unable to write gameplay event log", error);
    }
  }

  private async drawSanctuaryElement(transaction: Transaction, gameId: string): Promise<SanctuaryElement> {
    const usedElements = new Set<SanctuaryElement>();

    for (const specialCell of SPECIAL_CELLS) {
      const specialCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(specialCell.x, specialCell.y));
      const specialCellSnap = await transaction.get(specialCellRef);
      if (!specialCellSnap.exists()) continue;

      const specialCellData = specialCellSnap.data() as MapCell;
      const element = specialCellData.sanctuaryElement;
      if (!element) continue;
      usedElements.add(element);
    }

    const deck: SanctuaryElement[] = ["water", "fire", "wind", "earth"];
    const available = deck.filter((element) => !usedElements.has(element));
    const pool = available.length > 0 ? available : deck;
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  private biomeFromSanctuaryElement(element: SanctuaryElement): BiomeType {
    if (element === "water") return "water";
    if (element === "fire") return "desert";
    if (element === "wind") return "plains";
    return "mountain";
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private resolveLuckBonusMultiplierFromStatuses(statuses: Player["statuses"]): number {
    const normalized = this.normalizeStatuses(statuses);
    const hasMinified = normalized.some((status) => status.key === "minified");
    if (hasMinified) {
      return 1;
    }

    let multiplier = 1;
    for (const status of normalized) {
      const definition = this.statusCatalogService.getCachedStatus(status.key);
      const configured = definition?.effects?.luckBonusMultiplier;
      if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
        multiplier = Math.max(multiplier, configured);
      }
    }

    return multiplier;
  }

  private normalizeStatuses(statuses: Player["statuses"]): Array<{ key: string; durationTurns: number }> {
    if (!Array.isArray(statuses)) {
      return [];
    }

    return statuses
      .filter((status) => {
        if (!status || typeof status !== "object") return false;
        if (typeof status.key !== "string" || !status.key.trim()) return false;
        if (typeof status.durationTurns !== "number" || !Number.isFinite(status.durationTurns)) return false;
        return status.durationTurns > 0;
      })
      .map((status) => ({
        key: String(status.key),
        durationTurns: Math.max(1, Math.floor(Number(status.durationTurns))),
      }));
  }

  private sanctuaryElementToLabel(element?: SanctuaryElement): string {
    if (element === "water") return "Water Shrine";
    if (element === "fire") return "Fire Shrine";
    if (element === "wind") return "Wind Shrine";
    if (element === "earth") return "Earth Shrine";
    return "Elemental Shrine";
  }

  private async evaluateEnvironmentProgressionOnReveal(
    transaction: Transaction,
    gameId: string,
    targetX: number,
    targetY: number,
    biome: BiomeType,
    mapSize: number,
  ): Promise<EnvironmentProgressionEvent | null> {
    if (isSpecialCellCoordinate(targetX, targetY)) {
      return null;
    }

    const adjacentSameBiomeCellIds = new Set<string>();

    for (const neighbor of this.environmentService.getNeighborCoords(targetX, targetY)) {
      if (!this.isInsideBounds(neighbor.x, neighbor.y, mapSize)) continue;

      const neighborId = this.cellId(neighbor.x, neighbor.y);
      const neighborRef = doc(this.firebaseService.database, "games", gameId, "mapCells", neighborId);
      const neighborSnap = await transaction.get(neighborRef);
      if (!neighborSnap.exists()) continue;

      const neighborCell = neighborSnap.data() as MapCell;
      if (neighborCell.isSpecial === true) continue;
      if (neighborCell.biome !== biome) continue;

      adjacentSameBiomeCellIds.add(neighborId);
    }

    if (adjacentSameBiomeCellIds.size === 0) {
      return null;
    }

    const visited = new Set<string>();
    const componentSizes: number[] = [];

    for (const startId of adjacentSameBiomeCellIds) {
      if (visited.has(startId)) continue;

      const queue: string[] = [startId];
      visited.add(startId);
      let componentSize = 0;

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) continue;
        componentSize += 1;

        const [xRaw, yRaw] = currentId.split("_");
        const x = Number(xRaw);
        const y = Number(yRaw);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        for (const neighbor of this.environmentService.getNeighborCoords(x, y)) {
          if (!this.isInsideBounds(neighbor.x, neighbor.y, mapSize)) continue;

          const neighborId = this.cellId(neighbor.x, neighbor.y);
          if (visited.has(neighborId)) continue;

          const neighborRef = doc(this.firebaseService.database, "games", gameId, "mapCells", neighborId);
          const neighborSnap = await transaction.get(neighborRef);
          if (!neighborSnap.exists()) continue;

          const neighborCell = neighborSnap.data() as MapCell;
          if (neighborCell.isSpecial === true) continue;
          if (neighborCell.biome !== biome) continue;

          visited.add(neighborId);
          queue.push(neighborId);
        }
      }

      componentSizes.push(componentSize);
    }

    const hadExistingEnvironment = componentSizes.some((size) => size >= 2);
    return hadExistingEnvironment ? "expand" : "discover";
  }

  private pickRandomResource(resources: ResourceLabel[]): ResourceLabel {
    const randomIdx = Math.floor(Math.random() * resources.length);
    return resources[randomIdx];
  }

  private async applyExplorationOutcome(
    gameId: string,
    playerId: string,
    resourceLabel: ResourceLabel | null,
    resourceQuantity: number,
    luckResult: LuckCheckResult,
    worldTurn: number,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) return;
    const player = playerSnap.data() as Player;
    const inventory = player.inventory ?? { items: [], resources: [], money: PLAYER_STARTING_MONEY };
    const resources = Array.isArray(inventory.resources) ? [...inventory.resources] : [];
    const capacity = typeof inventory.resourceCapacity === "number"
      ? Math.max(1, Math.floor(inventory.resourceCapacity))
      : DEFAULT_RESOURCE_INVENTORY_CAPACITY;

    const totalResourceCount = this.getTotalResourceCount(resources);
    let pendingResourcePickup = player.pendingResourcePickup ?? null;

    if (resourceLabel) {
      const safeQuantity = Math.max(1, Math.floor(resourceQuantity));
      if (totalResourceCount >= capacity) {
        pendingResourcePickup = {
          resource: resourceLabel,
          source: "exploration",
          requestedAtTurn: Math.max(0, Math.floor(worldTurn)),
        };
      } else {
        this.addResourceQuantity(resources, resourceLabel, safeQuantity);
        pendingResourcePickup = null;
      }
    }

    await setDoc(playerRef, {
      inventory: {
        ...inventory,
        resources,
        money: typeof inventory.money === "number" ? inventory.money : PLAYER_STARTING_MONEY,
        resourceCapacity: capacity,
      },
      lastLuckCheck: luckResult,
      pendingResourcePickup,
    }, { merge: true });
  }

  private getTotalResourceCount(resources: Player["inventory"]["resources"]): number {
    return resources.reduce((total, resource) => {
      const qty = Math.max(0, Math.floor(Number(resource?.quantity ?? 0)));
      return total + qty;
    }, 0);
  }

  private addResourceQuantity(resources: Player["inventory"]["resources"], resourceLabel: ResourceLabel, quantity: number): void {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const idx = resources.findIndex((resource) => resource.label === resourceLabel);
    if (idx >= 0) {
      resources[idx] = {
        ...resources[idx],
        quantity: Math.max(0, Math.floor(Number(resources[idx].quantity ?? 0))) + safeQuantity,
      };
      return;
    }

    resources.push({
      label: resourceLabel,
      quantity: safeQuantity,
    });
  }

  private drawBiome(worldState: WorldState): BiomeType {
    if (worldState.remainingDeck.length === 0 && worldState.discardedDeck.length > 0) {
      worldState.remainingDeck = this.shuffleArray([...worldState.discardedDeck]);
      worldState.discardedDeck = [];
    }

    const drawn = worldState.remainingDeck.shift();
    if (!drawn) {
      throw new Error("Biome deck is empty");
    }

    const placed = worldState.placedBiomeCount ?? this.emptyBiomePlacementCount();
    worldState.placedBiomeCount = {
      ...placed,
      [drawn]: (placed[drawn] ?? 0) + 1,
    };

    return drawn;
  }

  private emptyBiomePlacementCount(): BiomePlacementCount {
    return {
      plains: 0,
      forest: 0,
      mountain: 0,
      water: 0,
      desert: 0,
      ruins: 0,
    };
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private parseCellId(cellId: string): { x: number; y: number } {
    const [xRaw, yRaw] = cellId.split("_");
    return {
      x: Math.max(0, Math.floor(Number(xRaw ?? 0))),
      y: Math.max(0, Math.floor(Number(yRaw ?? 0))),
    };
  }

  private getFollowerMovementBonus(worldState: WorldState, playerId: string): number {
    const entry = worldState.followerMovementBonusByPlayer?.[playerId];
    if (!entry) {
      return 0;
    }

    const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
    const entryTurn = Math.max(0, Math.floor(Number(entry.turn ?? -1)));
    if (entryTurn !== worldTurn) {
      return 0;
    }

    return Math.max(0, Math.floor(Number(entry.amount ?? 0)));
  }

  private async canMoveToTarget(
    transaction: Transaction,
    gameId: string,
    player: Player,
    targetCellId: string,
    mapSize: number,
    tilesConfig: TilesConfig,
    movementBonus = 0,
  ): Promise<boolean> {
    const source = player.location;
    const sourceCellId = this.cellId(source.x, source.y);
    const sourceCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", sourceCellId);
    const sourceCellSnap = await transaction.get(sourceCellRef);
    const sourceCell = sourceCellSnap.exists() ? sourceCellSnap.data() as MapCell : null;

    const includeDiagonalAdjacency = this.hasDiagonalMovementCondition(sourceCell, tilesConfig);
    if (this.environmentService.isAdjacentCellId(source.x, source.y, targetCellId, includeDiagonalAdjacency)) {
      return true;
    }

    const bonusDistance = Math.max(0, Math.floor(Number(movementBonus ?? 0)));
    if (bonusDistance > 0) {
      const maxDistance = 1 + bonusDistance;
      const targetCoordinates = this.parseCellId(targetCellId);
      const orthogonalDistance = Math.abs(source.x - targetCoordinates.x) + Math.abs(source.y - targetCoordinates.y);
      if (orthogonalDistance > 1 && orthogonalDistance <= maxDistance) {
        return true;
      }
    }

    if (!sourceCell) {
      return false;
    }

    if (sourceCell.isSpecial === true) {
      return false;
    }

    return this.isTargetReachableFromEnvironment(
      transaction,
      gameId,
      sourceCell,
      targetCellId,
      mapSize,
      includeDiagonalAdjacency,
    );
  }

  private async isTargetReachableFromEnvironment(
    transaction: Transaction,
    gameId: string,
    sourceCell: MapCell,
    targetCellId: string,
    mapSize: number,
    includeDiagonalAdjacency: boolean,
  ): Promise<boolean> {
    const startId = this.cellId(sourceCell.x, sourceCell.y);
    const visited = new Set<string>([startId]);
    const queue: MapCell[] = [sourceCell];
    let environmentSize = 0;
    let canReachTarget = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      environmentSize += 1;

      const currentId = this.cellId(current.x, current.y);
      if (currentId === targetCellId || this.environmentService.isAdjacentCellId(current.x, current.y, targetCellId, includeDiagonalAdjacency)) {
        canReachTarget = true;
      }

      if (canReachTarget && environmentSize >= 2) {
        return true;
      }

      for (const neighbor of this.environmentService.getNeighborCoords(current.x, current.y)) {
        if (!this.isInsideBounds(neighbor.x, neighbor.y, mapSize)) continue;

        const neighborId = this.cellId(neighbor.x, neighbor.y);
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborRef = doc(this.firebaseService.database, "games", gameId, "mapCells", neighborId);
        const neighborSnap = await transaction.get(neighborRef);
        if (!neighborSnap.exists()) continue;

        const neighborCell = neighborSnap.data() as MapCell;
        if (neighborCell.isSpecial === true) continue;
        if (neighborCell.biome !== sourceCell.biome) continue;

        queue.push(neighborCell);
      }
    }

    return canReachTarget && environmentSize >= 2;
  }

  private hasDiagonalMovementCondition(mapCell: MapCell | null, tilesConfig: TilesConfig): boolean {
    if (!mapCell || mapCell.isSpecial === true) {
      return false;
    }

    const conditionIds = tilesConfig.biomes[mapCell.biome]?.conditions ?? [];
    return conditionIds.some((conditionId) => {
      return this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect?.type === "movement-enable-diagonal-adjacency";
    });
  }

  private isBlockedByMovementEntryConditions(mapCell: MapCell | null, tilesConfig: TilesConfig): boolean {
    if (!mapCell || mapCell.isSpecial === true) {
      return false;
    }

    const conditionIds = tilesConfig.biomes[mapCell.biome]?.conditions ?? [];
    return conditionIds.some((conditionId) => {
      return this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect?.type === "movement-block-entry";
    });
  }

  private resolveConditionLuckMultiplier(mapCell: MapCell | null, tilesConfig: TilesConfig): number {
    if (!mapCell || mapCell.isSpecial === true) {
      return 1;
    }

    let multiplier = 1;
    const conditionIds = tilesConfig.biomes[mapCell.biome]?.conditions ?? [];
    conditionIds.forEach((conditionId) => {
      const effect = this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect;
      if (!effect || effect.type !== "luck-check-multiplier") {
        return;
      }

      if (typeof effect.multiplier !== "number" || !Number.isFinite(effect.multiplier) || effect.multiplier <= 0) {
        return;
      }

      multiplier = Math.max(multiplier, effect.multiplier);
    });

    return multiplier;
  }

  private resolveResourceGainQuantity(input: {
    mapCell: MapCell | null;
    tilesConfig: TilesConfig;
    resourceLabel: ResourceLabel;
  }): number {
    const { mapCell, tilesConfig, resourceLabel } = input;
    if (!mapCell || mapCell.isSpecial === true) {
      return 1;
    }

    let multiplier = 1;
    const conditionIds = tilesConfig.biomes[mapCell.biome]?.conditions ?? [];
    conditionIds.forEach((conditionId) => {
      const effect = this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect;
      if (!effect || effect.type !== "resource-gain-multiplier") {
        return;
      }

      if (Array.isArray(effect.resourceLabels) && effect.resourceLabels.length > 0 && !effect.resourceLabels.includes(resourceLabel)) {
        return;
      }

      if (typeof effect.multiplier !== "number" || !Number.isFinite(effect.multiplier) || effect.multiplier <= 0) {
        return;
      }

      multiplier = Math.max(multiplier, effect.multiplier);
    });

    return Math.max(1, Math.floor(multiplier));
  }

  private isInsideBounds(x: number, y: number, size: number): boolean {
    return x >= 0 && x < size && y >= 0 && y < size;
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
}
