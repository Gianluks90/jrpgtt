import { Dialog } from "@angular/cdk/dialog";
import { Injectable } from "@angular/core";
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { firstValueFrom, take } from "rxjs";
import { DIALOGS_CONFIG } from "../consts/dialog-configs";
import { DialogResponse } from "../models/DialogResponse";
import { Player, PlayerParameter, PlayerParameters } from "../models/Player";
import { calculateMpBase } from '../consts/mp-config';
import {
  LevelUpCharacteristic,
  PlayerLevelUpDialog,
  PlayerLevelUpDialogResult,
} from "../components/dialogs/player-level-up-dialog/player-level-up-dialog";
import { FirebaseService } from "./firebase-service";

@Injectable({
  providedIn: "root",
})
export class PlayerProgressionService {
  constructor(
    private firebaseService: FirebaseService,
    private dialog: Dialog,
  ) { }

  public async assignExperience(gameId: string, playerId: string, experienceAmount: number): Promise<Player> {
    const gainedExperience = Math.max(0, Math.floor(Number(experienceAmount)));
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);

    let updatedPlayer: Player | null = null;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const player = this.normalizePlayer(playerSnap.data() as Player);
      const nextExperience = player.experience + gainedExperience;

      updatedPlayer = {
        ...player,
        experience: nextExperience,
      };

      transaction.set(playerRef, {
        experience: nextExperience,
      }, { merge: true });
    });

    if (!updatedPlayer) {
      throw new Error("Unable to assign experience");
    }

    return updatedPlayer;
  }

  public async checkLevelUpAndHandle(gameId: string, playerId: string, currentPlayer?: Player): Promise<Player> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    let player = currentPlayer ? this.normalizePlayer(currentPlayer) : await this.getPlayer(gameId, playerId);
    let pendingChoices = Math.max(0, Math.floor(Number(player.pendingLevelUpChoices ?? 0)));
    let didLevelUp = false;

    while (player.experience >= player.level) {
      const requiredExperience = player.level;
      player = this.normalizePlayer({
        ...player,
        experience: player.experience - requiredExperience,
        level: player.level + 1,
      });

      pendingChoices += 1;
      didLevelUp = true;
    }

    if (didLevelUp) {
      await setDoc(playerRef, {
        level: player.level,
        experience: player.experience,
        pendingLevelUpChoices: pendingChoices,
      }, { merge: true });
    }

    return {
      ...player,
      pendingLevelUpChoices: pendingChoices,
    };
  }

  public async applyNextPendingLevelUp(gameId: string, playerId: string, currentPlayer?: Player): Promise<Player> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const player = currentPlayer ? this.normalizePlayer(currentPlayer) : await this.getPlayer(gameId, playerId);
    const pendingChoices = Math.max(0, Math.floor(Number(player.pendingLevelUpChoices ?? 0)));

    if (pendingChoices <= 0) {
      throw new Error("No pending level-up choices available");
    }

    const selectedCharacteristic = await this.openLevelUpDialog(player.level, player.experience);
    const upgradedPlayer = this.applyCharacteristicIncrease(player, selectedCharacteristic);
    const nextPendingChoices = pendingChoices - 1;

    await setDoc(playerRef, {
      parameters: upgradedPlayer.parameters,
      pendingLevelUpChoices: nextPendingChoices,
    }, { merge: true });

    return {
      ...upgradedPlayer,
      pendingLevelUpChoices: nextPendingChoices,
    };
  }

  public async assignExperienceAndCheckLevelUp(
    gameId: string,
    playerId: string,
    experienceAmount: number,
    currentPlayer?: Player,
  ): Promise<Player> {
    const playerWithExp = await this.assignExperience(gameId, playerId, experienceAmount);
    return this.checkLevelUpAndHandle(gameId, playerId, currentPlayer ?? playerWithExp);
  }

  private async getPlayer(gameId: string, playerId: string): Promise<Player> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
    const playerSnap = await getDoc(playerRef);

    if (!playerSnap.exists()) {
      throw new Error("Player not found");
    }

    return this.normalizePlayer(playerSnap.data() as Player);
  }

  private async openLevelUpDialog(level: number, experience: number): Promise<LevelUpCharacteristic> {
    const dialogRef = this.dialog.open(PlayerLevelUpDialog, {
      ...DIALOGS_CONFIG,
      disableClose: true,
      data: {
        level,
        experience,
      },
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    if (!this.isConfirmLevelUpResponse(response) || !response.data) {
      throw new Error("Level-up upgrade was not confirmed");
    }

    return response.data.characteristic;
  }

  private isConfirmLevelUpResponse(response: unknown): response is DialogResponse<PlayerLevelUpDialogResult> {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    return response.result === "confirm";
  }

  private applyCharacteristicIncrease(player: Player, characteristic: LevelUpCharacteristic): Player {
    const parameters = this.cloneParameters(player.parameters);
    const targetParameter = parameters[characteristic];

    const nextBase = Math.max(0, targetParameter.base) + 1;
    targetParameter.base = nextBase;
    targetParameter.current = Math.max(0, targetParameter.current) + 1;

    if (characteristic === "strength" && nextBase > 3) {
      const hp = parameters.hp;
      const hpBase = Math.max(1, Math.round(Math.max(1, hp.base) * 1.05));
      const hpCurrent = Math.max(1, Math.round(Math.max(1, hp.current) * 1.05));
      const hpMaxSource = typeof hp.max === "number" ? hp.max : hp.current;
      const hpMax = Math.max(1, Math.round(Math.max(1, hpMaxSource) * 1.05));

      parameters.hp = {
        ...hp,
        base: hpBase,
        current: hpCurrent,
        max: hpMax,
      };
    }

    if (characteristic === "magic" && nextBase > 3) {
      const mp = parameters.mp;
      const mpBase = calculateMpBase(nextBase);
      const mpCurrent = Math.max(0, mp.current) + (mpBase - mp.base);
      const mpMax = typeof mp.max === "number" ? Math.max(0, mp.max + (mpBase - mp.base)) : mpBase;
      parameters.mp = {
        ...mp,
        base: mpBase,
        current: mpCurrent,
        max: mpMax,
      };
    }

    return {
      ...player,
      parameters,
    };
  }

  private cloneParameters(parameters: PlayerParameters): PlayerParameters {
    return {
      hp: this.cloneParameter(parameters.hp),
      mp: this.cloneParameter(parameters.mp),
      strength: this.cloneParameter(parameters.strength),
      magic: this.cloneParameter(parameters.magic),
      luck: this.cloneParameter(parameters.luck),
    };
  }

  private cloneParameter(parameter: PlayerParameter): PlayerParameter {
    const cloned: PlayerParameter = {
      ...parameter,
      base: Math.max(0, Math.floor(Number(parameter.base))),
      current: Math.max(0, Math.floor(Number(parameter.current))),
    };

    if (typeof parameter.max === "number") {
      cloned.max = Math.max(0, Math.floor(Number(parameter.max)));
    }

    return cloned;
  }

  private normalizePlayer(player: Player): Player {
    return {
      ...player,
      level: Math.max(1, Math.floor(Number(player.level))),
      experience: Math.max(0, Math.floor(Number(player.experience))),
      pendingLevelUpChoices: Math.max(0, Math.floor(Number(player.pendingLevelUpChoices ?? 0))),
      parameters: this.cloneParameters(player.parameters),
    };
  }
}