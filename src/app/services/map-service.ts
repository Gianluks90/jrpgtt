import { Injectable } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { collection, doc, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { Game } from "../models/Game";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";
import { BiomePlacementCount, WorldState } from "../models/WorldState";
import { GameMap } from "../models/GameMap";
import { EnvironmentService } from "./environment-service";

@Injectable({
  providedIn: "root",
})
export class MapService {
  constructor(
    private firebaseService: FirebaseService,
    private environmentService: EnvironmentService,
  ) { }

  public async movePlayer(gameId: string, playerId: string, targetX: number, targetY: number): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const mapCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(targetX, targetY));

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [gameSnap, playerSnap, worldStateSnap, gameMapSnap, targetCellSnap] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(playerRef),
        transaction.get(worldStateRef),
        transaction.get(gameMapRef),
        transaction.get(mapCellRef),
      ]);

      if (!gameSnap.exists()) {
        throw new Error("Game not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      const game = gameSnap.data() as Game;
      const player = playerSnap.data() as Player;
      const worldState = worldStateSnap.data() as WorldState;
      const gameMap = gameMapSnap.exists() ? gameMapSnap.data() as GameMap : null;
      const mapSize = gameMap?.size ?? 10;

      if (game.status !== "running") {
        throw new Error("Game is not running");
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
        const drawnBiome = this.drawBiome(nextWorldState);
        const newCell: MapCell = {
          x: targetX,
          y: targetY,
          biome: drawnBiome,
          revealedAtTurn: nextWorldState.currentTurn,
          discoveredBy: playerId,
        };
        transaction.set(mapCellRef, newCell);
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
    const sourceCellId = this.cellId(source.x, source.y);
    const sourceCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", sourceCellId);
    const sourceCellSnap = await transaction.get(sourceCellRef);
    const sourceCell = sourceCellSnap.exists() ? sourceCellSnap.data() as MapCell : null;

    if (!sourceCell) {
      return this.environmentService.isAdjacentCellId(source.x, source.y, targetCellId);
    }

    const environment = await this.collectEnvironment(transaction, gameId, sourceCell, mapSize);
    if (environment.length < 2) {
      return this.environmentService.isAdjacentCellId(source.x, source.y, targetCellId);
    }

    const allowedTargets = this.environmentService.buildMovementTargetIdsFromEnvironmentCells(environment, mapSize);

    return allowedTargets.has(targetCellId);
  }

  private async collectEnvironment(
    transaction: Transaction,
    gameId: string,
    sourceCell: MapCell,
    mapSize: number,
  ): Promise<MapCell[]> {
    const startId = this.cellId(sourceCell.x, sourceCell.y);
    const visited = new Set<string>([startId]);
    const queue: MapCell[] = [sourceCell];
    const environment: MapCell[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      environment.push(current);

      for (const neighbor of this.environmentService.getNeighborCoords(current.x, current.y)) {
        if (!this.isInsideBounds(neighbor.x, neighbor.y, mapSize)) continue;

        const neighborId = this.cellId(neighbor.x, neighbor.y);
        if (visited.has(neighborId)) continue;

        const neighborRef = doc(this.firebaseService.database, "games", gameId, "mapCells", neighborId);
        const neighborSnap = await transaction.get(neighborRef);
        if (!neighborSnap.exists()) continue;

        const neighborCell = neighborSnap.data() as MapCell;
        if (neighborCell.biome !== sourceCell.biome) continue;

        visited.add(neighborId);
        queue.push(neighborCell);
      }
    }

    return environment;
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
