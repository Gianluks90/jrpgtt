import { Injectable, signal } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { getAuth, Unsubscribe } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, Timestamp, where, writeBatch, type DocumentReference } from "firebase/firestore";
import { Game } from "../models/Game";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";
import { GameConfig } from "../models/GameConfig";
import { BiomePlacementCount, WorldState } from "../models/WorldState";
import { PLAYER_SETUP_BASE_HP, PLAYER_STARTING_MONEY } from "../consts/player-defaults";

interface StartGameSetupContext {
  game: Game;
  players: Player[];
  config: GameConfig;
  turnOrder: string[];
  worldState: WorldState;
  gameMap: {
    size: number;
    specialTilesPlaced: number;
    cells: Record<string, MapCell>;
  };
  spawns: Array<{ playerId: string; x: number; y: number }>;
}

@Injectable({
  providedIn: "root",
})
export class GameService {

  public myGame = signal<Game | null>(null);
  private gameUnsubscribe: Unsubscribe | null = null;
  private snapshotPlayerId: string | null = null;
  private readonly gameConfigUrl = "/configs/game-init.config.json";

  constructor(private firebaseService: FirebaseService) { }

  public startMyGameSnapshot(playerId: string): void {
    if (this.gameUnsubscribe && this.snapshotPlayerId === playerId) return;

    this.stopMyGameSnapshot();
    this.snapshotPlayerId = playerId;

    const collectionRef = collection(this.firebaseService.database, "games");
    const q = query(collectionRef, where("playerIds", "array-contains", playerId), limit(1));

    this.gameUnsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        this.myGame.set(null);
      } else {
        const gameDoc = snapshot.docs[0];
        const game = {
          id: gameDoc.id,
          ...gameDoc.data(),
        } as Game;
        this.myGame.set(game);
      }
    });
  }

  public stopMyGameSnapshot(): void {
    this.gameUnsubscribe?.();
    this.gameUnsubscribe = null;
    this.snapshotPlayerId = null;
  }

  public clearGameSession(): void {
    this.stopMyGameSnapshot();
    this.myGame.set(null);
  }

  private async getExistingGameForPlayer(playerId: string): Promise<Game | null> {
    const cachedGame = this.myGame();
    if (cachedGame && cachedGame.playerIds.includes(playerId)) {
      return cachedGame;
    }

    const collectionRef = collection(this.firebaseService.database, "games");
    const q = query(collectionRef, where("playerIds", "array-contains", playerId), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const gameDoc = snapshot.docs[0];
    return {
      id: gameDoc.id,
      ...gameDoc.data(),
    } as Game;
  }

  public async createGame(ownerId: string, gameData: Pick<Game, "name" | "maxPlayers">): Promise<void> {
    const existingGame = await this.getExistingGameForPlayer(ownerId);
    if (existingGame) {
      throw new Error("You are already in a game");
    }

    const collectionRef = collection(this.firebaseService.database, "games");
    const gameRef = doc(collectionRef);
    const newGame: Omit<Game, "id"> = {
      name: gameData.name,
      ownerId,
      joinCode: this.generateJoinCode(),
      status: "waiting",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
      maxPlayers: gameData.maxPlayers,
      playerIds: [ownerId],
    };

    const ownerPlayerRef = doc(collection(gameRef, "players"), ownerId);
    const ownerPlayer = this.buildDefaultPlayer(ownerId);

    const batch = writeBatch(this.firebaseService.database);
    batch.set(gameRef, newGame);
    batch.set(ownerPlayerRef, ownerPlayer);

    await batch.commit();
  }

  private generateJoinCode(): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let joinCode = "";
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      joinCode += characters[randomIndex];
    }
    return joinCode;
  }

  public async joinGame(
    gameId: string,
    playerId: string,
    joinCode: string,
    preloadedGame?: Game,
  ): Promise<void> {
    const existingGame = await this.getExistingGameForPlayer(playerId);
    if (existingGame) {
      throw new Error("You are already in a game");
    }

    const docRef = doc(this.firebaseService.database, "games", gameId);
    const game = preloadedGame ?? await this.getGameById(gameId);
    if (game.joinCode !== joinCode.toUpperCase()) {
      throw new Error("Invalid join code");
    }

    if (game.playerIds.includes(playerId)) {
      throw new Error("Already joined this game");
    }

    if (game.playerIds.length >= game.maxPlayers) {
      throw new Error("Game is full");
    }

    const playerRef = doc(collection(docRef, "players"), playerId);
    const player = this.buildDefaultPlayer(playerId);

    const batch = writeBatch(this.firebaseService.database);
    batch.set(docRef, {
      playerIds: arrayUnion(playerId)
    }, { merge: true });
    batch.set(docRef, {
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    }, { merge: true });
    batch.set(playerRef, player);
    await batch.commit();
  }

  public async joinGameByCode(playerId: string, joinCode: string): Promise<void> {
    const normalizedJoinCode = joinCode.trim().toUpperCase();
    if (!normalizedJoinCode) {
      throw new Error("Invalid join code");
    }

    const collectionRef = collection(this.firebaseService.database, "games");
    const q = query(collectionRef, where("joinCode", "==", normalizedJoinCode), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error("Game not found");
    }

    const gameDoc = snapshot.docs[0];
    const gameId = gameDoc.id;
    const game = {
      id: gameDoc.id,
      ...gameDoc.data(),
    } as Game;

    await this.joinGame(gameId, playerId, normalizedJoinCode, game);
  }

  private async getGameById(gameId: string): Promise<Game> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Game not found");
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Game;
  }

  public async leaveGame(gameId: string, playerId: string): Promise<void> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Game not found");
    }

    const game = docSnap.data() as Game;
    if (!game.playerIds.includes(playerId)) {
      throw new Error("Player not in this game");
    }

    const playerRef = doc(collection(docRef, "players"), playerId);

    const batch = writeBatch(this.firebaseService.database);
    batch.set(docRef, {
      playerIds: arrayRemove(playerId)
    }, { merge: true });
    batch.set(docRef, {
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    }, { merge: true });
    batch.delete(playerRef);
    await batch.commit();
  }

  public async deleteGame(gameId: string): Promise<void> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    const gameSnap = await getDoc(docRef);
    if (!gameSnap.exists()) {
      throw new Error("Game not found");
    }

    const game = gameSnap.data() as Game;
    const currentUserId = getAuth().currentUser?.uid;
    if (!currentUserId || game.ownerId !== currentUserId) {
      throw new Error("Only the game owner can delete this game");
    }

    const [playersSnapshot, mapCellsSnapshot, runtimeSnapshot, logsSnapshot] = await Promise.all([
      getDocs(collection(docRef, "players")),
      getDocs(collection(docRef, "mapCells")),
      getDocs(collection(docRef, "runtime")),
      getDocs(collection(docRef, "logs")),
    ]);

    const refsToDelete: DocumentReference[] = [
      ...playersSnapshot.docs.map((playerDoc) => playerDoc.ref),
      ...mapCellsSnapshot.docs.map((mapCellDoc) => mapCellDoc.ref),
      ...runtimeSnapshot.docs.map((runtimeDoc) => runtimeDoc.ref),
      ...logsSnapshot.docs.map((logDoc) => logDoc.ref),
      docRef,
    ];

    await this.commitDeleteInChunks(refsToDelete);
  }

  private async commitDeleteInChunks(refs: DocumentReference[]): Promise<void> {
    const chunkSize = 400;
    for (let start = 0; start < refs.length; start += chunkSize) {
      const chunk = refs.slice(start, start + chunkSize);
      const batch = writeBatch(this.firebaseService.database);
      chunk.forEach((ref) => {
        batch.delete(ref);
      });

      await batch.commit();
    }
  }

  public async updateGame(gameId: string, updates: Partial<Pick<Game, "name" | "maxPlayers" | "status">>): Promise<void> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    await setDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    }, { merge: true });
  }

  public async startGame(gameId: string): Promise<void> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Game not found");
    }

    const game = docSnap.data() as Game;
    if (game.playerIds.length !== game.maxPlayers) {
      throw new Error("Cannot start game until lobby is full");
    }

    const playersSnapshot = await getDocs(collection(docRef, "players"));
    const players = playersSnapshot.docs.map((playerDoc) => {
      return {
        id: playerDoc.id,
        ...playerDoc.data(),
      } as Player;
    });

    if (players.length !== game.maxPlayers) {
      throw new Error("Cannot start game: players setup is incomplete");
    }

    const allReady = players.every((player) => player.isReady);
    if (!allReady) {
      throw new Error("Cannot start game until all players are ready");
    }

    if (game.status !== "waiting") {
      throw new Error("Game is not in waiting status");
    }

    const config = await this.getGameConfig();
    const setupContext = this.runStartGameSetups(game, players, config);

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const mapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const mapCellsCollectionRef = collection(this.firebaseService.database, "games", gameId, "mapCells");

    const batch = writeBatch(this.firebaseService.database);
    batch.set(docRef, {
      status: "running",
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    }, { merge: true });
    batch.set(mapRef, setupContext.gameMap);

    setupContext.spawns.forEach((spawn) => {
      const playerRef = doc(collection(docRef, "players"), spawn.playerId);
      const spawnCellRef = doc(mapCellsCollectionRef, this.cellId(spawn.x, spawn.y));
      const player = setupContext.players.find((candidate) => candidate.id === spawn.playerId);
      const inventory = player?.inventory;

      batch.set(playerRef, {
        location: {
          x: spawn.x,
          y: spawn.y,
        },
        inventory: {
          items: inventory?.items ?? [],
          resources: inventory?.resources ?? [],
          money: typeof inventory?.money === "number"
            ? Math.max(PLAYER_STARTING_MONEY, Math.floor(inventory.money))
            : PLAYER_STARTING_MONEY,
        },
      }, { merge: true });

      const spawnBiome = this.drawBiome(setupContext.worldState);
      const spawnCell: MapCell = {
        x: spawn.x,
        y: spawn.y,
        biome: spawnBiome,
        revealedAtTurn: 0,
        discoveredBy: spawn.playerId,
      };
      batch.set(spawnCellRef, spawnCell, { merge: true });
    });

    batch.set(worldStateRef, setupContext.worldState);

    await batch.commit();
  }

  private buildDefaultPlayer(playerId: string): Player {
    // const displayName = getAuth().currentUser?.displayName?.trim();
    const palette = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#f15bb5", "#00bbf9"];
    const colorIndex = this.hashString(playerId) % palette.length;

    return {
      id: playerId,
      name: '? ? ?',
      location: {
        x: 0,
        y: 0,
      },
      parameters: {
        hp: {
          base: PLAYER_SETUP_BASE_HP,
          current: PLAYER_SETUP_BASE_HP,
          max: PLAYER_SETUP_BASE_HP
        },
        strength: {
          base: 3,
          current: 3,
        },
        magic: {
          base: 3,
          current: 3,
        },
        luck: {
          base: 1,
          current: 1,
        },
      },
      level: 1,
      experience: 2,
      pendingLevelUpChoices: 0,
      inventory: {
        items: [],
        resources: [],
        money: PLAYER_STARTING_MONEY,
      },
      actionsUsedThisTurn: {},
      statuses: [],
      isReady: false,
      color: palette[colorIndex],
      joinedAt: Timestamp.now(),
    };
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private async getGameConfig(): Promise<GameConfig> {
    const response = await fetch(this.gameConfigUrl, {
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load game configuration");
    }

    return await response.json() as GameConfig;
  }

  private buildBiomeDeck(config: GameConfig): BiomeType[] {
    const deckConfig = config.map.biomeDeckConfig;
    const biomes = Object.entries(deckConfig) as Array<[BiomeType, number]>;

    const deck: BiomeType[] = [];
    for (const [biome, count] of biomes) {
      for (let i = 0; i < count; i++) {
        deck.push(biome);
      }
    }

    return deck;
  }

  private buildSpawnPoints(config: GameConfig, count: number): Array<{ x: number; y: number }> {
    const size = config.map.size;
    const allowedColumns = this.getSpawnColumns(config, size);
    const candidates: Array<{ x: number; y: number }> = [];

    for (const x of allowedColumns) {
      for (let y = 0; y < size; y++) {
        candidates.push({ x, y });
      }
    }

    const shuffled = this.shuffleArray(candidates);
    return shuffled.slice(0, count);
  }

  private getSpawnColumns(config: GameConfig, size: number): number[] {
    if (config.map.spawnColumns?.length) {
      return config.map.spawnColumns.filter((column) => column >= 0 && column < size);
    }

    const rule = config.map.spawnRule.allowedQuadrant;
    if (rule === "first") return [0, 1, 2, 3, 4];
    if (rule === "second") return [5, 6, 7];
    if (rule === "third") return [8, 9];

    const columns = Array.from({ length: size }, (_, index) => index);
    return columns;
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
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

  private runStartGameSetups(game: Game, players: Player[], config: GameConfig): StartGameSetupContext {
    const context: StartGameSetupContext = {
      game,
      players,
      config,
      turnOrder: [],
      worldState: {
        currentTurn: 1,
        phase: "turn",
        timeOfDay: "day",
        remainingDeck: [],
        discardedDeck: [],
        placedBiomeCount: this.emptyBiomePlacementCount(),
        movedThisTurnByPlayer: {},
        sanctuaryInfluenceByQuadrant: {},
      },
      gameMap: {
        size: config.map.size,
        specialTilesPlaced: 0,
        cells: {},
      },
      spawns: [],
    };

    const setupPipeline: Array<(setup: StartGameSetupContext) => void> = [
      this.setupBiomeDeck,
      this.setupTurnOrder,
      this.setupPlayerSpawns,
    ];

    setupPipeline.forEach((setupStep) => {
      setupStep.call(this, context);
    });

    context.worldState.activePlayerId = context.turnOrder[0];

    return context;
  }

  private setupBiomeDeck(context: StartGameSetupContext): void {
    context.worldState.remainingDeck = this.shuffleArray(this.buildBiomeDeck(context.config));
  }

  private setupTurnOrder(context: StartGameSetupContext): void {
    context.turnOrder = this.shuffleArray(context.players.map((player) => player.id));
    context.worldState.turnOrder = context.turnOrder;
  }

  private setupPlayerSpawns(context: StartGameSetupContext): void {
    const spawnPoints = this.buildSpawnPoints(context.config, context.players.length);
    if (spawnPoints.length < context.players.length) {
      throw new Error("Not enough spawn points for all players");
    }

    context.spawns = context.players.map((player, index) => {
      const point = spawnPoints[index];
      return {
        playerId: player.id,
        x: point.x,
        y: point.y,
      };
    });
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
