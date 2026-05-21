import { Injectable, signal } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { getAuth, Unsubscribe } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, Timestamp, where, writeBatch } from "firebase/firestore";
import { Game } from "../models/Game";
import { Player } from "../models/Player";

@Injectable({
  providedIn: "root",
})
export class GameService {

  public myGame = signal<Game | null>(null);
  private gameUnsubscribe: Unsubscribe | null = null;
  private snapshotPlayerId: string | null = null;

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

  public async joinGame(gameId: string, playerId: string, joinCode: string): Promise<void> {
    const existingGame = await this.getExistingGameForPlayer(playerId);
    if (existingGame) {
      throw new Error("You are already in a game");
    }

    const docRef = doc(this.firebaseService.database, "games", gameId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Game not found");
    }

    const game = docSnap.data() as Game;
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

    const gameId = snapshot.docs[0].id;
    await this.joinGame(gameId, playerId, normalizedJoinCode);
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
    const playersSnapshot = await getDocs(collection(docRef, "players"));

    const batch = writeBatch(this.firebaseService.database);
    playersSnapshot.docs.forEach((playerDoc) => {
      batch.delete(playerDoc.ref);
    });
    batch.delete(docRef);

    await batch.commit();
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

    if (game.status !== "waiting") {
      throw new Error("Game is not in waiting status");
    }

    await this.updateGame(gameId, { status: "running" });
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
          base: 100,
          current: 100,
          max: 100
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
      experience: 2,
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
}
