import { Injectable } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { doc, getDoc, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { Player } from "../models/Player";
import { ResourceLabel } from "../models/Resource";
import { setDoc } from "firebase/firestore";
import { RESOURCE_CATALOG } from "../consts/resources-catalog";
import { BiomeType, MapCell } from "../models/MapCell";
import { BiomePlacementCount, WorldState } from "../models/WorldState";
import { GameMap } from "../models/GameMap";
import { EnvironmentService } from "./environment-service";
import { TilesConfigService } from "./tiles-config-service";
import { LuckService } from "./luck-service";
import { EXPLORATION_LUCK_EXTRA_RESOURCE_ROLLS } from "../consts/luck-config";
import { LuckCheckResult } from "../models/LuckCheckResult";

@Injectable({
  providedIn: "root",
})
export class MapService {
  constructor(
    private firebaseService: FirebaseService,
    private environmentService: EnvironmentService,
    private tilesConfigService: TilesConfigService,
    private luckService: LuckService,
  ) { }

  public async movePlayer(gameId: string, playerId: string, targetX: number, targetY: number): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const mapCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(targetX, targetY));

    let movedBiome: BiomeType | null = null;
    let movedPlayerLuck = 0;
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
      movedPlayerLuck = Math.max(0, Math.floor(player.parameters.luck.current));
      const worldState = worldStateSnap.data() as WorldState;
      const gameMap = gameMapSnap.exists() ? gameMapSnap.data() as GameMap : null;
      const mapSize = gameMap?.size ?? 10;

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
        const drawnBiome = this.drawBiome(nextWorldState);
        const newCell: MapCell = {
          x: targetX,
          y: targetY,
          biome: drawnBiome,
          revealedAtTurn: nextWorldState.currentTurn,
          discoveredBy: playerId,
        };
        transaction.set(mapCellRef, newCell);
        movedBiome = drawnBiome;
      } else {
        const cell = targetCellSnap.data() as MapCell;
        movedBiome = cell.biome;
      }

      transaction.set(playerRef, {
        location: {
          x: targetX,
          y: targetY,
        },
      }, { merge: true });

      this.advanceTurn(nextWorldState);
      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    // RACCOLTA RISORSA CASUALE
    const landedBiome = movedBiome as BiomeType | null;
    if (landedBiome) {
      const luckResult = this.luckService.checkLuck(movedPlayerLuck);
      const tilesConfig = await this.tilesConfigService.loadConfig();
      const biomeEntry = tilesConfig.biomes[landedBiome];
      const possibleResources = biomeEntry?.resources ?? [];
      const gainedResources: ResourceLabel[] = [];
      if (possibleResources.length > 0) {
        gainedResources.push(this.pickRandomResource(possibleResources));

        if (luckResult.success) {
          for (let i = 0; i < EXPLORATION_LUCK_EXTRA_RESOURCE_ROLLS; i++) {
            gainedResources.push(this.pickRandomResource(possibleResources));
          }
        }
      }

      await this.applyExplorationOutcome(gameId, playerId, gainedResources, luckResult);
    }
  }

  private pickRandomResource(resources: ResourceLabel[]): ResourceLabel {
    const randomIdx = Math.floor(Math.random() * resources.length);
    return resources[randomIdx];
  }

  private async applyExplorationOutcome(
    gameId: string,
    playerId: string,
    resourceLabels: ResourceLabel[],
    luckResult: LuckCheckResult,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) return;
    const player = playerSnap.data() as Player;
    const inventory = player.inventory ?? { items: [], resources: [], money: 0 };
    const resources = Array.isArray(inventory.resources) ? [...inventory.resources] : [];

    resourceLabels.forEach((resourceLabel) => {
      const idx = resources.findIndex((r) => r.label === resourceLabel);
      if (idx >= 0) {
        resources[idx] = {
          ...resources[idx],
          quantity: (resources[idx].quantity ?? 0) + 1,
        };
        return;
      }

      resources.push({
        label: resourceLabel,
        quantity: 1,
        iconUrl: RESOURCE_CATALOG[resourceLabel]?.iconUrl,
      });
    });

    await setDoc(playerRef, {
      inventory: {
        ...inventory,
        resources,
        money: typeof inventory.money === "number" ? inventory.money : 0,
      },
      lastLuckCheck: luckResult,
    }, { merge: true });
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

  private advanceTurn(worldState: WorldState): void {
    const order = worldState.turnOrder ?? [];
    if (order.length === 0) {
      worldState.currentTurn += 1;
      return;
    }

    const currentIndex = worldState.activePlayerId ? order.indexOf(worldState.activePlayerId) : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;

    if (nextIndex === 0) {
      worldState.currentTurn += 1;
    }

    worldState.activePlayerId = order[nextIndex];
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
