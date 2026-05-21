import { Injectable, signal } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { Unsubscribe } from "firebase/auth";
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import { Game } from "../models/Game";

@Injectable({
  providedIn: "root",
})
export class GameService {

  public myGame = signal<Game | null>(null);
  private gameUnsubscribe: Unsubscribe | null = null;

  constructor(private firebaseService: FirebaseService) { }

  public startMyGameSnapshot(playerId: string): void {
    this.stopMyGameSnapshot();

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

    await addDoc(collectionRef, newGame);
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

    await setDoc(docRef, {
      playerIds: arrayUnion(playerId)
    }, { merge: true });
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

    await setDoc(docRef, {
      playerIds: arrayRemove(playerId)
    }, { merge: true });
  }

  public async deleteGame(gameId: string): Promise<void> {
    const docRef = doc(this.firebaseService.database, "games", gameId);
    await deleteDoc(docRef);
  }
}
