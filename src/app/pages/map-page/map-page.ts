import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, take } from "rxjs";
import { Player } from "../../models/Player";
import { MapCell, SanctuaryElement } from "../../models/MapCell";
import { ResourceLabel } from "../../models/Resource";
import { MapService } from "../../services/map-service";
import { BiomeEnvironment, EnvironmentService } from "../../services/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { ResourceCounter } from "../../components/ui/resource-counter/resource-counter";
import { MoneyCounter } from "../../components/ui/money-counter/money-counter";
import { LuckIndicator } from "../../components/ui/luck-indicator/luck-indicator";
import { AttunementIndicator } from "../../components/ui/attunement-indicator/attunement-indicator";
import { AlignmentIndicator } from "../../components/ui/alignment-indicator/alignment-indicator";
import { BiomesCounter } from "../../components/ui/biomes-counter/biomes-counter";
import { CommandPanelAction, CommandsPanel } from "../../components/ui/commands-panel/commands-panel";
import { MapPlayersPanel } from "../../components/ui/map-players-panel/map-players-panel";
import { MapCellInspectorPanel } from "../../components/ui/map-cell-inspector-panel/map-cell-inspector-panel";
import { MapLogPanel } from "../../components/ui/map-log-panel/map-log-panel";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapPageStateService } from "../../services/map-page-state-service";
import { MapPageLayoutService } from "../../services/map-page-layout-service";
import { MapPageActionsService } from "../../services/map-page-actions-service";
import { DIALOGS_CONFIG } from "../../consts/dialog-configs";
import { GameEventsLogDialog } from "../../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { DayNightCyclePanel } from "../../components/ui/day-night-cycle-panel/day-night-cycle-panel";
import { ActionExecutorService } from "../../services/action-executor-service";
import {
  SanctuaryActionDialog,
  SanctuaryActionDialogData,
  SanctuaryActionDialogResult,
} from "../../components/dialogs/action-dialogs/sanctuary-action-dialog/sanctuary-action-dialog";
import { DialogResponse } from "../../models/DialogResponse";
import { PlayerProgressionService } from "../../services/player-progression-service";
import {
  ResourceInventoryDialog,
  ResourceInventoryDialogResult,
} from "../../components/dialogs/action-dialogs/resource-inventory-dialog/resource-inventory-dialog";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../consts/inventory-config";

@Component({
  selector: "app-map-page",
  imports: [
    IconButton,
    MapPlayersPanel,
    MapGridPanel,
    WorldStatePanel,
    ResourceCounter,
    MoneyCounter,
    AlignmentIndicator,
    AttunementIndicator,
    LuckIndicator,
    DayNightCyclePanel,
    BiomesCounter,
    CommandsPanel,
    MapCellInspectorPanel,
    MapLogPanel,
  ],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private injector = inject(Injector);
  private mapService = inject(MapService);
  private actionExecutorService = inject(ActionExecutorService);
  private playerProgressionService = inject(PlayerProgressionService);
  private environmentService = inject(EnvironmentService);
  private mapPageState = inject(MapPageStateService);
  private mapPageLayoutService = inject(MapPageLayoutService);
  private mapPageActionsService = inject(MapPageActionsService);

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = this.mapPageState.mapSize;
  public currentUserId = this.mapPageState.currentUserId;
  public isMoving = signal(false);
  public pendingActionId = signal<string | null>(null);
  public isOpeningLevelUp = signal(false);
  public players = this.mapPageState.players;
  public worldState = this.mapPageState.worldState;
  public mapCellsById = this.mapPageState.mapCellsById;
  public eventLogs = this.mapPageState.eventLogs;
  public tilesConfig = this.mapPageState.tilesConfig;
  public biomeResourcesByBiome = this.mapPageState.biomeResourcesByBiome;
  public sanctuaryStylesByElement = this.mapPageState.sanctuaryStylesByElement;
  public mockPlayers = signal<Player[]>([]);
  public inspectedCell = signal<MapGridPanelCell | null>(null);
  public inventoryDialogOpen = signal(false);
  private lastPendingDialogKey = signal<string | null>(null);
  public latestLogMessage = computed<string>(() => {
    return this.mapPageState.latestEventLogSummary();
  });

  public biomeEnvironments = computed<BiomeEnvironment[]>(() => {
    return this.environmentService.getBiomeEnvironments(this.mapCellsById());
  });

  public environmentByCellId = computed<Record<string, string[]>>(() => {
    return this.environmentService.getEnvironmentByCellId(this.biomeEnvironments());
  });

  public myPlayer = computed<Player | null>(() => {
    const uid = this.currentUserId();
    if (!uid) return null;
    return this.players().find((player) => player.id === uid) ?? null;
  });

  public isMyTurn = computed<boolean>(() => {
    const uid = this.currentUserId();
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!uid || !activePlayerId) return false;
    return uid === activePlayerId;
  });

  public hasMovedOnCurrentTurn = computed<boolean>(() => {
    const uid = this.currentUserId();
    const worldState = this.worldState();
    if (!uid || !worldState) return false;

    const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
    return movedThisTurnByPlayer[uid] === worldState.currentTurn;
  });

  public canEndTurn = computed<boolean>(() => {
    if (!this.isMyTurn()) return false;
    if (!this.hasMovedOnCurrentTurn()) return false;
    if (this.pendingActionId() !== null) return false;
    if (this.myPlayer()?.pendingResourcePickup) return false;
    return true;
  });

  public resourceCount = computed<number>(() => {
    const resources = this.myPlayer()?.inventory?.resources ?? [];
    return resources.reduce((total, resource) => {
      return total + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }, 0);
  });

  public resourceCapacity = computed<number>(() => {
    const configured = this.myPlayer()?.inventory?.resourceCapacity;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured));
    }

    return DEFAULT_RESOURCE_INVENTORY_CAPACITY;
  });

  public pendingLevelUpChoices = computed<number>(() => {
    const player = this.myPlayer();
    return Math.max(0, Math.floor(Number(player?.pendingLevelUpChoices ?? 0)));
  });

  public canOpenLevelUpDialog = computed<boolean>(() => {
    return this.pendingLevelUpChoices() > 0 && !this.isOpeningLevelUp();
  });

  public commandActions = computed<CommandPanelAction[]>(() => {
    return this.mapPageActionsService.buildCommandActions({
      player: this.myPlayer(),
      mapCellsById: this.mapCellsById(),
      tilesConfig: this.tilesConfig(),
      biomeResourcesByBiome: this.biomeResourcesByBiome(),
      worldState: this.worldState(),
      isMyTurn: this.isMyTurn(),
      hasMovedOnCurrentTurn: this.hasMovedOnCurrentTurn(),
      canEndTurn: this.canEndTurn(),
      pendingActionId: this.pendingActionId(),
    });
  });

  public activePlayer = computed<Player | null>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return null;
    return this.players().find((player) => player.id === activePlayerId) ?? null;
  });

  public movableCellIds = computed<Set<string>>(() => {
    const current = this.myPlayer();
    if (!current || !this.isMyTurn()) return new Set<string>();

    return this.environmentService.getMovableCellIdsForPlayer(
      current,
      this.mapCellsById(),
      this.mapSize(),
      this.environmentByCellId(),
    );
  });

  public ngOnInit(): void {
    if (!this.gameId) return;
    this.mapPageState.init(this.gameId);
    effect(() => {
      const player = this.myPlayer();
      const pendingPickup = player?.pendingResourcePickup ?? null;
      if (!pendingPickup) {
        this.lastPendingDialogKey.set(null);
        return;
      }

      const key = `${pendingPickup.resource}:${pendingPickup.requestedAtTurn}`;
      if (this.inventoryDialogOpen() || this.lastPendingDialogKey() === key) {
        return;
      }

      this.lastPendingDialogKey.set(key);
      void this.openResourceInventoryDialog("pending");
    }, { injector: this.injector });
    void this.syncMockPlayersForLayout();
  }

  public ngOnDestroy(): void {
    this.mapPageState.destroy();
  }

  public onBackHome(): void {
    void this.router.navigate(["/home"]);
  }

  public openLogsDialog(): void {
    this.dialog.open(GameEventsLogDialog, {
      ...DIALOGS_CONFIG,
      data: {
        logs: this.eventLogs(),
      },
    }).closed.pipe(take(1)).subscribe();
  }

  public onInspectionCellChanged(cell: MapGridPanelCell | null): void {
    this.inspectedCell.set(cell);
  }

  public async onResourcePanelClicked(): Promise<void> {
    await this.openResourceInventoryDialog("manage");
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private async syncMockPlayersForLayout(): Promise<void> {
    const parsed = await this.mapPageLayoutService.loadMockPlayersForLayout();
    this.mockPlayers.set(parsed);
  }

  public async onCellClick(cell: MapGridPanelCell): Promise<void> {
    const myPlayer = this.myPlayer();
    if (!myPlayer || !this.isMyTurn() || this.isMoving() || this.pendingActionId() !== null) return;
    if (!this.movableCellIds().has(cell.id)) return;

    this.isMoving.set(true);
    try {
      await this.mapService.movePlayer(this.gameId, myPlayer.id, cell.x, cell.y);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while moving player");
    } finally {
      this.isMoving.set(false);
    }
  }

  public async onCommandActionRequested(actionId: string): Promise<void> {
    const actionHandlers: Record<string, () => Promise<void>> = {
      "end-turn": () => this.onEndTurnRequested(),
      "activate-sanctuary": () => this.onActivateSanctuaryRequested(),
      "donate-sanctuary": () => this.onDonateSanctuaryRequested(),
      "pray-sanctuary": () => this.onPraySanctuaryRequested(),
      "cell-gather": () => this.onCellGatherRequested(),
      "consume-ration": () => this.onConsumeRationRequested(),
    };

    const handler = actionHandlers[actionId];
    if (handler) {
      await handler();
      return;
    }

    window.alert(`Action '${actionId}' is not implemented yet.`);
  }

  public async onOpenLevelUpDialog(): Promise<void> {
    const player = this.myPlayer();
    if (!player || !this.canOpenLevelUpDialog()) return;

    this.isOpeningLevelUp.set(true);
    try {
      await this.playerProgressionService.applyNextPendingLevelUp(this.gameId, player.id, player);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while applying level-up choice");
    } finally {
      this.isOpeningLevelUp.set(false);
    }
  }

  public async onEndTurnRequested(): Promise<void> {
    const myPlayer = this.myPlayer();
    if (!myPlayer || !this.canEndTurn()) return;

    await this.runNamedAction("end-turn", async () => {
      await this.actionExecutorService.endTurn(this.gameId, {
        id: myPlayer.id,
        name: myPlayer.name,
      });
    }, "Error while ending turn");
  }

  private async onActivateSanctuaryRequested(): Promise<void> {
    await this.runSanctuaryAction({
      actionId: "activate-sanctuary",
      mode: "activate",
      requiredActive: false,
      errorMessage: "Error while activating sanctuary",
      execute: async (player) => {
        await this.actionExecutorService.activateSanctuary(this.gameId, {
          id: player.id,
          name: player.name,
        });
      },
    });
  }

  private async onDonateSanctuaryRequested(): Promise<void> {
    await this.runSanctuaryAction({
      actionId: "donate-sanctuary",
      mode: "donate",
      requiredActive: true,
      errorMessage: "Error while donating at sanctuary",
      execute: async (player) => {
        await this.actionExecutorService.donateAtSanctuary(this.gameId, {
          id: player.id,
          name: player.name,
        });
      },
    });
  }

  private async onPraySanctuaryRequested(): Promise<void> {
    await this.runSanctuaryAction({
      actionId: "pray-sanctuary",
      mode: null,
      requiredActive: true,
      errorMessage: "Error while praying at sanctuary",
      execute: async (player) => {
        await this.actionExecutorService.prayAtSanctuary(this.gameId, {
          id: player.id,
          name: player.name,
        });
      },
    });
  }

  private async onCellGatherRequested(): Promise<void> {
    const player = this.myPlayer();
    if (!player || !this.isMyTurn()) return;

    await this.runNamedAction("cell-gather", async () => {
      await this.actionExecutorService.cellGather(this.gameId, {
        id: player.id,
        name: player.name,
      });
    }, "Error while gathering resources");
  }

  private async onConsumeRationRequested(): Promise<void> {
    const player = this.myPlayer();
    if (!player || !this.isMyTurn()) return;

    await this.runNamedAction("consume-ration", async () => {
      await this.actionExecutorService.consumeRation(this.gameId, {
        id: player.id,
        name: player.name,
      });
    }, "Error while consuming ration");
  }

  private async runNamedAction(actionId: string, task: () => Promise<void>, fallbackErrorMessage: string): Promise<void> {
    this.pendingActionId.set(actionId);
    try {
      await task();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : fallbackErrorMessage);
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async runSanctuaryAction(options: {
    actionId: string;
    mode: SanctuaryActionDialogData["mode"] | null;
    requiredActive: boolean;
    errorMessage: string;
    execute: (player: Player) => Promise<void>;
  }): Promise<void> {
    const player = this.myPlayer();
    const cell = this.getMyCurrentSanctuaryCell();
    if (!player || !cell || !cell.sanctuaryElement || !this.isMyTurn()) return;

    const isStateMismatch = options.requiredActive ? cell.active !== true : cell.active === true;
    if (isStateMismatch) return;

    if (options.mode) {
      const confirmed = await this.openSanctuaryActionDialog({
        mode: options.mode,
        sanctuaryElement: cell.sanctuaryElement,
        playerMoney: player.inventory?.money ?? 0,
      });
      if (!confirmed) return;
    }

    await this.runNamedAction(options.actionId, async () => {
      await options.execute(player);
    }, options.errorMessage);
  }

  private async openResourceInventoryDialog(mode: "manage" | "pending"): Promise<void> {
    const player = this.myPlayer();
    if (!player || this.inventoryDialogOpen()) return;

    const pendingResource = player.pendingResourcePickup?.resource ?? null;
    if (mode === "pending" && !pendingResource) {
      return;
    }

    this.inventoryDialogOpen.set(true);
    try {
      const dialogRef = this.dialog.open(ResourceInventoryDialog, {
        ...DIALOGS_CONFIG,
        data: {
          resources: player.inventory?.resources ?? [],
          maxCapacity: this.resourceCapacity(),
          pendingResource: mode === "pending" ? pendingResource : null,
        },
      });

      const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
      const result = this.asResourceInventoryResult(response);

      if (mode === "pending") {
        await this.applyPendingInventoryDialogResult(player, result);
        return;
      }

      if (result?.type === "discard") {
        await this.actionExecutorService.discardResource(this.gameId, {
          id: player.id,
          name: player.name,
        }, result.resourceLabel);
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while managing resources");
    } finally {
      this.inventoryDialogOpen.set(false);
    }
  }

  private async applyPendingInventoryDialogResult(
    player: Player,
    result: ResourceInventoryDialogResult | null,
  ): Promise<void> {
    if (!player.pendingResourcePickup) return;

    if (!result || result.type === "close" || result.type === "cancel-collect") {
      await this.actionExecutorService.resolvePendingResourcePickup(this.gameId, {
        id: player.id,
        name: player.name,
      }, {
        collect: false,
      });
      return;
    }

    if (result.type === "swap-and-collect") {
      await this.actionExecutorService.resolvePendingResourcePickup(this.gameId, {
        id: player.id,
        name: player.name,
      }, {
        collect: true,
        discardResourceLabel: result.resourceLabel,
      });
      return;
    }
  }

  private asResourceInventoryResult(response: unknown): ResourceInventoryDialogResult | null {
    if (typeof response !== "object" || response === null || !("data" in response)) {
      return null;
    }

    const data = (response as { data?: unknown }).data;
    if (!data || typeof data !== "object") {
      return null;
    }

    const typed = data as { type?: unknown; resourceLabel?: unknown };
    if (typed.type === "discard" && typeof typed.resourceLabel === "string") {
      return {
        type: "discard",
        resourceLabel: typed.resourceLabel as ResourceLabel,
      };
    }

    if (typed.type === "swap-and-collect" && typeof typed.resourceLabel === "string") {
      return {
        type: "swap-and-collect",
        resourceLabel: typed.resourceLabel as ResourceLabel,
      };
    }

    if (typed.type === "cancel-collect") {
      return { type: "cancel-collect" };
    }

    if (typed.type === "close") {
      return { type: "close" };
    }

    return null;
  }

  private getMyCurrentSanctuaryCell(): MapCell | null {
    const player = this.myPlayer();
    if (!player) return null;

    const cell = this.mapCellsById()[this.cellId(player.location.x, player.location.y)] ?? null;
    if (!cell || cell.isSpecial !== true || cell.specialType !== "sanctuary") {
      return null;
    }

    return cell;
  }

  private async openSanctuaryActionDialog(data: SanctuaryActionDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(SanctuaryActionDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmSanctuaryActionResponse(response);
  }

  private isConfirmSanctuaryActionResponse(response: unknown): response is DialogResponse<SanctuaryActionDialogResult> {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    return response.result === "confirm";
  }

}
