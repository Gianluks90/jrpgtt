import { Component, computed, inject, OnInit, WritableSignal } from "@angular/core";
import { TextButton } from "../../components/ui/text-button/text-button";
import { AuthService } from "../../services/auth-service";
import { GameService } from "../../services/game-service";
import { getAuth } from "firebase/auth";
import { Game } from "../../models/Game";
import { Dialog } from "@angular/cdk/dialog";
import { GameNewDialog, GameNewDialogData } from "../../components/dialogs/game-new-dialog/game-new-dialog";
import { DIALOGS_CONFIG } from "../../consts/dialog-configs";
import { GenericDeleteDialog } from "../../components/dialogs/generic-delete-dialog/generic-delete-dialog";
import { GameJoinDialog, GameJoinDialogData } from "../../components/dialogs/game-join-dialog/game-join-dialog";
import { GenericConfirmDialog } from "../../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { DialogResponse } from "../../models/DialogResponse";
import { take } from "rxjs";
import { Router } from "@angular/router";

@Component({
  selector: "app-home-page",
  imports: [TextButton],
  templateUrl: "./home-page.html",
  styleUrl: "./home-page.scss",
})
export class HomePage implements OnInit {
  public authService = inject(AuthService);
  public gameService = inject(GameService);
  public router = inject(Router);
  public dialog = inject(Dialog);

  public myGame: WritableSignal<Game | null> = this.gameService.myGame;
  
  public isOwner = computed(() => {
    const currentUserId = getAuth().currentUser?.uid;
    const game = this.myGame();
    if (!currentUserId || !game) return false;
    return game.ownerId === currentUserId;
  });

  public ngOnInit(): void {
    const currentUserId = getAuth().currentUser?.uid;
    if (!currentUserId) return;

    this.gameService.startMyGameSnapshot(currentUserId);
  }

  private isConfirmResponse(response: unknown): response is DialogResponse {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    const result = response.result;
    return result === "confirm" || result === "cancel";
  }

  private isConfirmWithData<TData>(response: unknown): response is DialogResponse<TData> {
    if (!this.isConfirmResponse(response)) return false;
    return response.result === "confirm" && "data" in response;
  }

  public openNewGameDialog(): void {
    this.dialog.open(GameNewDialog, {
      ...DIALOGS_CONFIG
    }).closed.pipe(take(1)).subscribe(async (result) => {
      if (!this.isConfirmWithData<GameNewDialogData>(result)) return;
      const data = result.data;
      if (!data) return;

      const currentUserId = getAuth().currentUser?.uid;
      if (!currentUserId) return;

      const name = String(data.name ?? "").trim();
      const maxPlayersRaw = data.maxPlayers;
      const maxPlayers = Number(maxPlayersRaw);
      if (!name || !Number.isFinite(maxPlayers)) return;

      try {
        await this.gameService.createGame(currentUserId, { name, maxPlayers });
      } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "Error creating game");
      }
    });
  }

  public openJoinGameDialog(): void {
    this.dialog.open(GameJoinDialog, {
      ...DIALOGS_CONFIG
    }).closed.pipe(take(1)).subscribe(async (result) => {
      if (!this.isConfirmWithData<GameJoinDialogData>(result)) return;
      const data = result.data;
      if (!data) return;

      const currentUserId = getAuth().currentUser?.uid;
      if (!currentUserId) return;

      const joinCode = String(data.joinCode ?? "").trim().toUpperCase();
      if (!joinCode) return;

      try {
        await this.gameService.joinGameByCode(currentUserId, joinCode);
      } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "Error joining game");
      }
    });
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
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error deleting game");
    }
  }

  public onLobby(): void {
    const game = this.myGame();
    if (!game) return;

    this.router.navigate([`/game/${game.id}/lobby`]);
  }
}
