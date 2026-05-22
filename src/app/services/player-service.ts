import { Injectable, signal } from "@angular/core";
import { Unsubscribe } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { Player } from "../models/Player";
import { FirebaseService } from "./firebase-service";

export interface PlayerSetupData {
  name: string;
  parameters: {
    strength: number;
    magic: number;
    luck: number;
  };
  experience: number;
}

@Injectable({
  providedIn: "root",
})
export class PlayerService {
  public myPlayer = signal<Player | null>(null);

  private playerUnsubscribe: Unsubscribe | null = null;
  private snapshotGameId: string | null = null;
  private snapshotPlayerId: string | null = null;

  constructor(private firebaseService: FirebaseService) { }

  public startMyPlayerSnapshot(gameId: string, playerId: string): void {
    if (
      this.playerUnsubscribe &&
      this.snapshotGameId === gameId &&
      this.snapshotPlayerId === playerId
    ) {
      return;
    }

    this.stopMyPlayerSnapshot();
    this.snapshotGameId = gameId;
    this.snapshotPlayerId = playerId;

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    this.playerUnsubscribe = onSnapshot(playerRef, (snapshot) => {
      if (!snapshot.exists()) {
        this.myPlayer.set(null);
        return;
      }

      const player = {
        id: snapshot.id,
        ...snapshot.data(),
      } as Player;
      this.myPlayer.set(player);
    });
  }

  public stopMyPlayerSnapshot(): void {
    this.playerUnsubscribe?.();
    this.playerUnsubscribe = null;
    this.snapshotGameId = null;
    this.snapshotPlayerId = null;
  }

  public clearPlayerSession(): void {
    this.stopMyPlayerSnapshot();
    this.myPlayer.set(null);
  }

  public async updatePlayerSetup(
    gameId: string,
    playerId: string,
    setup: PlayerSetupData,
    currentPlayer?: Player,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    let player = currentPlayer;

    if (!player || player.id !== playerId) {
      const myPlayer = this.myPlayer();
      if (myPlayer?.id === playerId) {
        player = myPlayer;
      }
    }

    if (!player) {
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }
      player = playerSnap.data() as Player;
    }

    const strength = Math.max(0, Math.floor(Number(setup.parameters.strength)));
    const magic = Math.max(0, Math.floor(Number(setup.parameters.magic)));
    const luck = Math.max(0, Math.floor(Number(setup.parameters.luck)));
    const experience = Math.floor(Number(setup.experience));
    const name = String(setup.name ?? "").trim();

    const originalTotal =
      player.parameters.strength.base +
      player.parameters.magic.base +
      player.parameters.luck.base +
      player.experience;

    const updatedTotal = strength + magic + luck + experience;

    if (!name) {
      throw new Error("Player name is required");
    }

    if (experience !== 0) {
      throw new Error("Spend all experience points before setting ready");
    }

    if (updatedTotal !== originalTotal) {
      throw new Error("Invalid experience distribution");
    }

    await setDoc(playerRef, {
      name,
      parameters: {
        ...player.parameters,
        strength: {
          ...player.parameters.strength,
          base: strength,
          current: strength,
        },
        magic: {
          ...player.parameters.magic,
          base: magic,
          current: magic,
        },
        luck: {
          ...player.parameters.luck,
          base: luck,
          current: luck,
        },
      },
      experience,
      isReady: true,
    }, { merge: true });
  }
}
