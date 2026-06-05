import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, signal, WritableSignal } from "@angular/core";
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
import { ActivatedRoute, Router } from "@angular/router";
import { GameSettingsDialog, GameSettingsDialogData } from "../../components/dialogs/game-settings-dialog/game-settings-dialog";
import { PlayerService, PlayerSetupData } from "../../services/player-service";
import { Player, PlayerAlignment } from "../../models/Player";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { TranslationPipe } from "../../pipes/translation-pipe";
import { TranslationService } from "../../services/translation-service";

@Component({
  selector: "app-lobby-page",
  imports: [TextButton, ReactiveFormsModule, IconButton, TranslationPipe],
  templateUrl: "./lobby-page.html",
  styleUrl: "./lobby-page.scss",
})
export class LobbyPage implements OnInit, OnDestroy {
  public gameService = inject(GameService);
  public playerService = inject(PlayerService);
  public dialog = inject(Dialog);
  public router = inject(Router);
  public route = inject(ActivatedRoute);
  public fb = inject(FormBuilder);
  public translationService = inject(TranslationService);
  private injector = inject(Injector);

  public myGame: WritableSignal<Game | null> = this.gameService.myGame;
  public myPlayer: WritableSignal<Player | null> = this.playerService.myPlayer;
  public lobbyPlayers = this.playerService.lobbyPlayers;
  public readonly alignments: PlayerAlignment[] = ["good", "neutral", "evil"];
  public readonly playerSetupForm: FormGroup = this.fb.group({
    name: [
      "",
      [
        Validators.required,
        Validators.maxLength(8),
      ],
    ],
    alignment: ["neutral", [Validators.required]],
  });

  public minParameterValue: Record<"strength" | "magic" | "luck", number> = {
    strength: 0,
    magic: 0,
    luck: 0,
  };
  public strength = signal(0);
  public magic = signal(0);
  public luck = signal(0);
  public experiencePool = signal(0);
  public isSubmittingSetup = signal(false);
  private setupSeedKey = "";

  public isOwner = computed(() => {
    const currentUserId = getAuth().currentUser?.uid;
    const game = this.myGame();
    if (!currentUserId || !game) return false;
    return game.ownerId === currentUserId;
  });

  public readyPlayersCount = computed(() => {
    return this.lobbyPlayers().filter((player) => player.isReady).length;
  });

  public isPlayerReady = computed(() => {
    return !!this.myPlayer()?.isReady;
  });

  public canStartGame = computed(() => {
    const game = this.myGame();
    if (!game) return false;

    const players = this.lobbyPlayers();
    const allJoined = game.playerIds.length === game.maxPlayers;
    const allPlayersLoaded = players.length === game.maxPlayers;
    const allReady = allPlayersLoaded && players.every((player) => player.isReady);

    return this.isOwner() && game.status === "waiting" && allJoined && allReady;
  });

  public canConfirmPlayerSetup = computed(() => {
    const player = this.myPlayer();
    return !!player && !player.isReady && this.playerSetupForm.valid && this.experiencePool() === 0 && !this.isSubmittingSetup();
  });

  public copyCodeButtonLabel = computed(() => {
    if (this.copyFeedback() === "copied") {
      return this.translationService.tOrFallback("lobby.copyJoinCode.copied", "Copied");
    }
    return this.translationService.tOrFallback("lobby.copyJoinCode.copy", "Copy join code");
  });

  public copyFeedback = signal<"idle" | "copied">("idle");
  private copyFeedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public async ngOnInit(): Promise<void> {
    this.playerSetupForm.disable({ emitEvent: false });

    const currentUserId = await this.resolveCurrentUserId();
    if (!currentUserId) return;

    const routeGameId = String(this.route.snapshot.paramMap.get("gameId") ?? "").trim();
    if (routeGameId) {
      this.gameService.startGameSnapshotById(routeGameId);
    } else {
      this.gameService.startMyGameSnapshot(currentUserId);
    }

    effect(() => {
      const game = this.myGame();
      if (!game) {
        this.playerService.stopMyPlayerSnapshot();
        this.playerService.stopLobbyPlayersSnapshot();
        return;
      }

      this.playerService.startMyPlayerSnapshot(game.id, currentUserId);
      this.playerService.startLobbyPlayersSnapshot(game.id);
    }, { injector: this.injector });

    effect(() => {
      const player = this.myPlayer();
      if (!player) {
        this.playerSetupForm.disable({ emitEvent: false });
        this.resetSetupDraft();
        this.setupSeedKey = "";
        return;
      }

      const nextSeed = this.buildSetupSeed(player);
      if (nextSeed === this.setupSeedKey) return;

      this.setupSeedKey = nextSeed;
      this.applyPlayerSetupDraft(player);
    }, { injector: this.injector });

    effect(() => {
      const game = this.myGame();
      if (!game) return;

      if (game.status !== "waiting") {
        void this.router.navigate(["/game", game.id, "map"]);
      }
    }, { injector: this.injector });
  }

  private async resolveCurrentUserId(): Promise<string | null> {
    const auth = getAuth();
    if (auth.currentUser?.uid) {
      return auth.currentUser.uid;
    }

    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
      return auth.currentUser?.uid ?? null;
    }

    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user?.uid ?? null);
      });
    });
  }

  public ngOnDestroy(): void {
    this.playerService.stopMyPlayerSnapshot();
    this.playerService.stopLobbyPlayersSnapshot();
    this.clearCopyFeedbackTimeout();
  }

  public async onCopyJoinCode(): Promise<void> {
    const joinCode = this.myGame()?.joinCode?.trim();
    if (!joinCode) return;

    try {
      await navigator.clipboard.writeText(joinCode);
      this.copyFeedback.set("copied");
      this.clearCopyFeedbackTimeout();
      this.copyFeedbackTimeoutId = setTimeout(() => this.copyFeedback.set("idle"), 1800);
    } catch (error) {
      console.error(error);
      window.alert(this.translationService.tOrFallback("lobby.errors.copyJoinCode", "Could not copy join code"));
    }
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
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("lobby.errors.leaveGame", "Error leaving game"));
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
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("lobby.errors.deleteGame", "Error deleting game"));
    }
  }

  public async onStartGame(): Promise<void> {
    const game = this.myGame();
    if (!game || !this.canStartGame()) return;

    try {
      await this.gameService.startGame(game.id);
      await this.router.navigate(["/game", game.id, "map"]);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("lobby.errors.startGame", "Error starting game"));
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
        window.alert(error instanceof Error
          ? error.message
          : this.translationService.tOrFallback("lobby.errors.updateSettings", "Error updating game settings"));
      }
    });
  }

  public canIncreaseParameter(): boolean {
    if (this.isPlayerReady()) return false;
    return this.experiencePool() > 0;
  }

  public canDecreaseParameter(parameter: "strength" | "magic" | "luck"): boolean {
    if (this.isPlayerReady()) return false;

    const currentValue = this.getParameterValue(parameter);
    return currentValue > this.minParameterValue[parameter];
  }

  public increaseParameter(parameter: "strength" | "magic" | "luck"): void {
    if (!this.canIncreaseParameter()) return;

    this.setParameterValue(parameter, this.getParameterValue(parameter) + 1);
    this.experiencePool.set(this.experiencePool() - 1);
  }

  public decreaseParameter(parameter: "strength" | "magic" | "luck"): void {
    if (!this.canDecreaseParameter(parameter)) return;

    this.setParameterValue(parameter, this.getParameterValue(parameter) - 1);
    this.experiencePool.set(this.experiencePool() + 1);
  }

  public async onConfirmPlayerSetup(): Promise<void> {
    const game = this.myGame();
    const player = this.myPlayer();
    if (!game || !player || !this.canConfirmPlayerSetup()) return;

    const formData = this.playerSetupForm.getRawValue();
    const setupData: PlayerSetupData = {
      name: String(formData.name ?? "").trim().toUpperCase(),
      alignment: formData.alignment as PlayerAlignment,
      parameters: {
        strength: this.strength(),
        magic: this.magic(),
        luck: this.luck(),
      },
      experience: this.experiencePool(),
    };

    this.isSubmittingSetup.set(true);

    try {
      await this.playerService.updatePlayerSetup(game.id, player.id, setupData, player);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("lobby.errors.updatePlayerSetup", "Error updating player setup"));
    } finally {
      this.isSubmittingSetup.set(false);
    }
  }

  public gameStatusLabel(status: string | null | undefined): string {
    const normalized = String(status ?? "").trim().toLowerCase();
    if (normalized === "waiting") {
      return this.translationService.tOrFallback("lobby.status.waiting", "Waiting");
    }
    if (normalized === "running") {
      return this.translationService.tOrFallback("lobby.status.running", "Running");
    }
    if (normalized === "ended") {
      return this.translationService.tOrFallback("lobby.status.ended", "Ended");
    }
    return status ?? "";
  }

  public playerReadyLabel(isReady: boolean | null | undefined): string {
    return isReady
      ? this.translationService.tOrFallback("lobby.players.ready", "READY")
      : this.translationService.tOrFallback("lobby.players.pending", "PENDING");
  }

  public currentPlayerReadyLabel(isReady: boolean | null | undefined): string {
    return isReady
      ? this.translationService.tOrFallback("lobby.setup.currentPlayerReady", "READY")
      : this.translationService.tOrFallback("lobby.setup.currentPlayerNotReady", "NOT READY");
  }

  public alignmentLabel(alignment: PlayerAlignment): string {
    const key = `lobby.alignment.${alignment}`;
    return this.translationService.tOrFallback(key, alignment);
  }

  private isConfirmWithData<TData>(response: unknown): response is DialogResponse<TData> {
    if (!this.isConfirmResponse(response)) return false;
    return response.result === "confirm" && "data" in response;
  }

  public onHome(): void {
    void this.router.navigate(["/home"]);
  }

  private clearCopyFeedbackTimeout(): void {
    if (this.copyFeedbackTimeoutId === null) return;
    clearTimeout(this.copyFeedbackTimeoutId);
    this.copyFeedbackTimeoutId = null;
  }

  private getParameterValue(parameter: "strength" | "magic" | "luck"): number {
    if (parameter === "strength") return this.strength();
    if (parameter === "magic") return this.magic();
    return this.luck();
  }

  private setParameterValue(parameter: "strength" | "magic" | "luck", value: number): void {
    if (parameter === "strength") {
      this.strength.set(value);
      return;
    }

    if (parameter === "magic") {
      this.magic.set(value);
      return;
    }

    this.luck.set(value);
  }

  private applyPlayerSetupDraft(player: Player): void {
    this.minParameterValue = {
      strength: player.parameters.strength.base,
      magic: player.parameters.magic.base,
      luck: player.parameters.luck.base,
    };

    this.strength.set(player.parameters.strength.base);
    this.magic.set(player.parameters.magic.base);
    this.luck.set(player.parameters.luck.base);
    this.experiencePool.set(player.experience);

    this.playerSetupForm.patchValue({
      name: player.name,
      alignment: player.alignment ?? "neutral",
    }, { emitEvent: false });

    if (player.isReady) {
      this.playerSetupForm.disable({ emitEvent: false });
      return;
    }

    this.playerSetupForm.enable({ emitEvent: false });
  }

  private buildSetupSeed(player: Player): string {
    return [
      player.id,
      player.name,
      player.alignment ?? "neutral",
      player.parameters.strength.base,
      player.parameters.magic.base,
      player.parameters.luck.base,
      player.experience,
      player.isReady ? "1" : "0",
    ].join("|");
  }

  private resetSetupDraft(): void {
    this.minParameterValue = {
      strength: 0,
      magic: 0,
      luck: 0,
    };

    this.strength.set(0);
    this.magic.set(0);
    this.luck.set(0);
    this.experiencePool.set(0);

    this.playerSetupForm.patchValue({
      name: "",
      alignment: "neutral",
    }, { emitEvent: false });
  }

}
