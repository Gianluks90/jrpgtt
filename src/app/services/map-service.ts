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
  ) { }

  public async movePlayer(gameId: string, playerId: string, targetX: number, targetY: number): Promise<void> {
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
    let movedOnTurn = 0;
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
      movedPlayerName = player.name;
      movedPlayerLuck = Math.max(0, Math.floor(player.parameters.luck.current));
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
      const isAllowed = await this.canMoveToTarget(transaction, gameId, player, targetCellId, mapSize);
      if (!isAllowed) {
        throw new Error("Invalid movement for current environment");
      }

      const nextWorldState: WorldState = {
        ...worldState,
      };

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
        }

        transaction.set(mapCellRef, newCell);
        movedBiome = drawnBiome;
      } else {
        const cell = targetCellSnap.data() as MapCell;
        movedBiome = cell.biome;
        landedOnSpecialCell = cell.isSpecial === true || isSpecialCellCoordinate(targetX, targetY);
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

    if (landedOnSpecialCell) {
      await this.tryCreateLog(gameId, movingPlayer, "player.enterSanctuary", {
        sanctuary: movedSanctuaryElement,
        sanctuaryLabel: this.sanctuaryElementToLabel(movedSanctuaryElement),
      });
    } else if (movedToNewCell && landedBiome) {
      await this.tryCreateLog(gameId, movingPlayer, "player.discoverBiome", {
        biome: landedBiome,
        biomeLabel: this.biomeToLabel(landedBiome),
      });
    }

    if (environmentProgressionEvent && landedBiome && !landedOnSpecialCell) {
      await this.tryCreateLog(
        gameId,
        movingPlayer,
        environmentProgressionEvent === "discover" ? "player.discoverEnvironment" : "player.expandEnvironment",
        {
          biome: landedBiome,
          biomeLabel: this.biomeToLabel(landedBiome),
        },
      );
    }

    // RACCOLTA RISORSA CASUALE
    if (landedBiome && !landedOnSpecialCell) {
      const luckResult = this.luckService.checkLuck(movedPlayerLuck);
      const tilesConfig = await this.tilesConfigService.loadConfig();
      const biomeEntry = tilesConfig.biomes[landedBiome];
      const possibleResources = biomeEntry?.resources ?? [];
      const gainedResource = luckResult.success && possibleResources.length > 0
        ? this.pickRandomResource(possibleResources)
        : null;

      await this.applyExplorationOutcome(gameId, playerId, gainedResource, luckResult, movedOnTurn);
    }

    let gainedExperience = 0;
    if (environmentProgressionEvent) {
      gainedExperience += 1;
    }

    if (landedOnSpecialCell && movedToNewCell) {
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
      if (totalResourceCount >= capacity) {
        pendingResourcePickup = {
          resource: resourceLabel,
          source: "exploration",
          requestedAtTurn: Math.max(0, Math.floor(worldTurn)),
        };
      } else {
        this.addSingleResource(resources, resourceLabel);
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

  private addSingleResource(resources: Player["inventory"]["resources"], resourceLabel: ResourceLabel): void {
    const idx = resources.findIndex((resource) => resource.label === resourceLabel);
    if (idx >= 0) {
      resources[idx] = {
        ...resources[idx],
        quantity: Math.max(0, Math.floor(Number(resources[idx].quantity ?? 0))) + 1,
      };
      return;
    }

    resources.push({
      label: resourceLabel,
      quantity: 1,
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

  private async canMoveToTarget(
    transaction: Transaction,
    gameId: string,
    player: Player,
    targetCellId: string,
    mapSize: number,
  ): Promise<boolean> {
    const source = player.location;
    if (this.environmentService.isAdjacentCellId(source.x, source.y, targetCellId)) {
      return true;
    }

    const sourceCellId = this.cellId(source.x, source.y);
    const sourceCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", sourceCellId);
    const sourceCellSnap = await transaction.get(sourceCellRef);
    const sourceCell = sourceCellSnap.exists() ? sourceCellSnap.data() as MapCell : null;

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
    );
  }

  private async isTargetReachableFromEnvironment(
    transaction: Transaction,
    gameId: string,
    sourceCell: MapCell,
    targetCellId: string,
    mapSize: number,
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
      if (currentId === targetCellId || this.environmentService.isAdjacentCellId(current.x, current.y, targetCellId)) {
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
