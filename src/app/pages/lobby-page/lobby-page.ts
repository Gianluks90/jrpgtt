import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, WritableSignal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { getAuth } from "firebase/auth";
import { GameService } from "../../services/game-service";
import { Game } from "../../models/Game";
import { TextButton } from "../../components/ui/text-button/text-button";
import { GenericDeleteDialog } from "../../components/dialogs/generic-delete-dialog/generic-delete-dialog";
import { GenericConfirmDialog } from "../../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { DIALOGS_CONFIG } from "../../consts/dialog-configs";
import { DialogResponse } from "../../models/DialogResponse";
import { take } from "rxjs";
import { Router } from "@angular/router";
import { GameSettingsDialog, GameSettingsDialogData } from "../../components/dialogs/game-settings-dialog/game-settings-dialog";
import { PlayerService, PlayerSetupData } from "../../services/player-service";
import { Player } from "../../models/Player";
import { GamePlayerSetupDialog, GamePlayerSetupDialogData } from "../../components/dialogs/game-player-setup-dialog/game-player-setup-dialog";

@Component({
  selector: "app-lobby-page",
  imports: [TextButton],
  templateUrl: "./lobby-page.html",
  styleUrl: "./lobby-page.scss",
})
export class LobbyPage implements OnInit, OnDestroy {
  public gameService = inject(GameService);
  public playerService = inject(PlayerService);
  public dialog = inject(Dialog);
  public router = inject(Router);
  private injector = inject(Injector);
  public myGame: WritableSignal<Game | null> = this.gameService.myGame;
  public myPlayer: WritableSignal<Player | null> = this.playerService.myPlayer;
  public isOwner = computed(() => {
    const currentUserId = getAuth().currentUser?.uid;
    const game = this.myGame();
    if (!currentUserId || !game) return false;
    return game.ownerId === currentUserId;
  });
  public canStartGame = computed(() => {
    const game = this.myGame();
    if (!game) return false;
    return this.isOwner() && game.status === "waiting" && game.playerIds.length === game.maxPlayers;
  });
  public canOpenPlayerSetup = computed(() => {
    const player = this.myPlayer();
    return !!player && !player.isReady;
  });

  public ngOnInit(): void {
    const currentUserId = getAuth().currentUser?.uid;
    if (!currentUserId) return;

    this.gameService.startMyGameSnapshot(currentUserId);

    effect(() => {
      const game = this.myGame();
      if (!game) {
        this.playerService.stopMyPlayerSnapshot();
        return;
      }

      this.playerService.startMyPlayerSnapshot(game.id, currentUserId);
    }, { injector: this.injector });
  }

  public ngOnDestroy(): void {
    this.playerService.stopMyPlayerSnapshot();
  }

  private isConfirmResponse(response: unknown): response is DialogResponse {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    const result = response.result;
    return result === "confirm" || result === "cancel";
  }

  public openDeleteDialog(): void {
    this.dialog.open(GenericDeleteDialog, {
      ...DIALOGS_CONFIG,
    }).closed.pipe(take(1)).subscribe((result) => {
      if (!this.isConfirmResponse(result) || result.result !== "confirm") return;
      void this.onDeleteGame();
    });
  }

  public openConfirmDialog(): void {
    this.dialog.open(GenericConfirmDialog, {
      ...DIALOGS_CONFIG,
    }).closed.pipe(take(1)).subscribe((result) => {
      if (!this.isConfirmResponse(result) || result.result !== "confirm") return;
      void this.onLeaveGame();
    });
  }

  public async onLeaveGame(): Promise<void> {
    const currentUserId = getAuth().currentUser?.uid;
    const game = this.myGame();
    if (!currentUserId || !game) return;

    try {
      await this.gameService.leaveGame(game.id, currentUserId);
      await this.router.navigate(["/home"]);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error leaving game");
    }
  }

  public async onDeleteGame(): Promise<void> {
    const game = this.myGame();
    if (!game) return;

    try {
      await this.gameService.deleteGame(game.id);
      await this.router.navigate(["/home"]);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error deleting game");
    }
  }

  public async onStartGame(): Promise<void> {
    const game = this.myGame();
    if (!game || !this.canStartGame()) return;

    try {
      await this.gameService.startGame(game.id);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error starting game");
    }
  }

  public openSettings(): void {
    const game = this.myGame();
    if (!game || !this.isOwner()) return;

    this.dialog.open(GameSettingsDialog, {
      ...DIALOGS_CONFIG,
      data: {
        name: game.name,
        maxPlayers: game.maxPlayers,
      } as GameSettingsDialogData,
    }).closed.pipe(take(1)).subscribe(async (result) => {
      if (!this.isConfirmWithData<GameSettingsDialogData>(result)) return;
      const data = result.data;
      if (!data) return;

      try {
        await this.gameService.updateGame(game.id, {
          name: data.name,
          maxPlayers: data.maxPlayers,
        });
      } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "Error updating game settings");
      }
    });
  }

  public openPlayerSetupDialog(): void {
    const game = this.myGame();
    const player = this.myPlayer();
    if (!game || !player || !this.canOpenPlayerSetup()) return;

    this.dialog.open(GamePlayerSetupDialog, {
      ...DIALOGS_CONFIG,
      data: {
        name: player.name,
        parameters: {
          strength: player.parameters.strength.base,
          magic: player.parameters.magic.base,
          luck: player.parameters.luck.base,
        },
        experience: player.experience,
      } as GamePlayerSetupDialogData,
    }).closed.pipe(take(1)).subscribe(async (result) => {
      if (!this.isConfirmWithData<GamePlayerSetupDialogData>(result)) return;
      const data = result.data;
      if (!data) return;

      try {
        await this.playerService.updatePlayerSetup(game.id, player.id, data as PlayerSetupData);
      } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "Error updating player setup");
      }
    });
  }

  private isConfirmWithData<TData>(response: unknown): response is DialogResponse<TData> {
    if (!this.isConfirmResponse(response)) return false;
    return response.result === "confirm" && "data" in response;
  }

  public onHome(): void {
    void this.router.navigate(["/home"]);
  }

}
