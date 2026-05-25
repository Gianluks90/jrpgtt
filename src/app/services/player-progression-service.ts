import { Dialog } from "@angular/cdk/dialog";
import { Injectable } from "@angular/core";
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { firstValueFrom, take } from "rxjs";
import { DIALOGS_CONFIG } from "../consts/dialog-configs";
import { DialogResponse } from "../models/DialogResponse";
import { Player, PlayerParameter, PlayerParameters } from "../models/Player";
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

    while (player.experience >= player.level) {
      const requiredExperience = player.level;
      const leveledPlayer = this.normalizePlayer({
        ...player,
        experience: player.experience - requiredExperience,
        level: player.level + 1,
      });

      await setDoc(playerRef, {
        level: leveledPlayer.level,
        experience: leveledPlayer.experience,
      }, { merge: true });

      const selectedCharacteristic = await this.openLevelUpDialog(leveledPlayer.level, leveledPlayer.experience);
      const upgradedPlayer = this.applyCharacteristicIncrease(leveledPlayer, selectedCharacteristic);

      await setDoc(playerRef, {
        parameters: upgradedPlayer.parameters,
      }, { merge: true });

      player = upgradedPlayer;
    }

    return player;
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

    return {
      ...player,
      parameters,
    };
  }

  private cloneParameters(parameters: PlayerParameters): PlayerParameters {
    return {
      hp: this.cloneParameter(parameters.hp),
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
      parameters: this.cloneParameters(player.parameters),
    };
  }
}