import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Player } from "../../models/Player";
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
import { MapPageInteractionService } from "../../services/map-page-interaction-service";
import { DayNightCyclePanel } from "../../components/ui/day-night-cycle-panel/day-night-cycle-panel";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../consts/inventory-config";
import { PlayerComputedStats } from "../../models/PlayerComputedStats";
import { PlayerStatsModifierService } from "../../services/player-stats-modifier-service";
import { FastTravelVisualService } from "../../services/fast-travel-visual-service";
import { FastTravelFlowService } from "../../services/fast-travel-flow-service";
import { PendingFastTravelState } from "../../models/WorldState";

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
  private injector = inject(Injector);
  private environmentService = inject(EnvironmentService);
  private mapPageState = inject(MapPageStateService);
  private mapPageLayoutService = inject(MapPageLayoutService);
  private mapPageActionsService = inject(MapPageActionsService);
  private mapPageInteractionService = inject(MapPageInteractionService);
  private playerStatsModifierService = inject(PlayerStatsModifierService);
  private fastTravelVisualService = inject(FastTravelVisualService);
  private fastTravelFlowService = inject(FastTravelFlowService);

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = this.mapPageState.mapSize;
  public currentUserId = this.mapPageState.currentUserId;
  public isMoving = signal(false);
  public players = this.mapPageState.players;
  public worldState = this.mapPageState.worldState;
  public mapCellsById = this.mapPageState.mapCellsById;
  public eventLogs = this.mapPageState.eventLogs;
  public tilesConfig = this.mapPageState.tilesConfig;
  public biomeResourcesByBiome = this.mapPageState.biomeResourcesByBiome;
  public sanctuaryStylesByElement = this.mapPageState.sanctuaryStylesByElement;
  public fastTravelAnimationState = this.fastTravelVisualService.state;
  public isFastTravelTransitionRunning = this.fastTravelVisualService.isTransitionRunning;
  public mockPlayers = signal<Player[]>([]);
  public inspectedCell = signal<MapGridPanelCell | null>(null);
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

  public myPendingFastTravel = computed<PendingFastTravelState | null>(() => {
    const worldState = this.worldState();
    const playerId = this.myPlayer()?.id;
    if (!worldState || !playerId) return null;

    return worldState.pendingFastTravelByPlayer?.[playerId] ?? null;
  });

  public isMyTravelLockActive = computed<boolean>(() => {
    const playerId = this.myPlayer()?.id;
    if (!playerId) return false;

    if (this.myPendingFastTravel()) {
      return true;
    }

    const fastTravelState = this.fastTravelAnimationState();
    if (!fastTravelState) {
      return false;
    }

    return fastTravelState.playerId === playerId && this.isFastTravelTransitionRunning();
  });

  public canEndTurn = computed<boolean>(() => {
    if (!this.isMyTurn()) return false;
    if (!this.hasMovedOnCurrentTurn()) return false;
    if (this.isMyTravelLockActive()) return false;
    if (this.mapPageInteractionService.pendingActionId() !== null) return false;
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
    return this.pendingLevelUpChoices() > 0 && !this.mapPageInteractionService.isOpeningLevelUp();
  });

  public myPlayerComputedStats = computed<PlayerComputedStats | null>(() => {
    const player = this.myPlayer();
    if (!player) return null;

    const mapCellId = `${player.location.x}_${player.location.y}`;
    const currentCell = this.mapCellsById()[mapCellId] ?? null;

    return this.playerStatsModifierService.computeStats({
      player,
      currentCell,
      worldState: this.worldState(),
      mapSize: this.mapSize(),
    });
  });

  public commandActions = computed<CommandPanelAction[]>(() => {
    const actions = this.mapPageActionsService.buildCommandActions({
      player: this.myPlayer(),
      mapCellsById: this.mapCellsById(),
      tilesConfig: this.tilesConfig(),
      biomeResourcesByBiome: this.biomeResourcesByBiome(),
      worldState: this.worldState(),
      isMyTurn: this.isMyTurn(),
      hasMovedOnCurrentTurn: this.hasMovedOnCurrentTurn(),
      canEndTurn: this.canEndTurn(),
      pendingActionId: this.mapPageInteractionService.pendingActionId(),
    });

    if (!this.isMyTravelLockActive()) {
      return actions;
    }

    return actions.map((action) => ({
      ...action,
      disabled: true,
      pending: false,
    }));
  });

  public activePlayer = computed<Player | null>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return null;
    return this.players().find((player) => player.id === activePlayerId) ?? null;
  });

  public movableCellIds = computed<Set<string>>(() => {
    const current = this.myPlayer();
    if (!current || !this.isMyTurn()) return new Set<string>();
    if (this.hasMovedOnCurrentTurn()) return new Set<string>();

    return this.environmentService.getMovableCellIdsForPlayer(
      current,
      this.mapCellsById(),
      this.mapSize(),
      this.environmentByCellId(),
    );
  });

  public ngOnInit(): void {
    if (!this.gameId) return;
    this.mapPageInteractionService.resetUiState();
    this.mapPageState.init(this.gameId);
    effect(() => {
      const player = this.myPlayer();
      const pendingPickup = player?.pendingResourcePickup ?? null;
      if (!pendingPickup) {
        this.lastPendingDialogKey.set(null);
        return;
      }

      const key = `${pendingPickup.resource}:${pendingPickup.requestedAtTurn}`;
      if (this.mapPageInteractionService.inventoryDialogOpen() || this.lastPendingDialogKey() === key) {
        return;
      }

      this.lastPendingDialogKey.set(key);
      void this.mapPageInteractionService.openResourceInventoryDialog({
        mode: "pending",
        gameId: this.gameId,
        player,
        maxCapacity: this.resourceCapacity(),
      });
    }, { injector: this.injector });

    effect(() => {
      this.fastTravelFlowService.sync({
        gameId: this.gameId,
        worldState: this.worldState(),
        players: this.players(),
        currentUserId: this.currentUserId(),
      });
    }, { injector: this.injector });

    void this.syncMockPlayersForLayout();
  }

  public ngOnDestroy(): void {
    this.fastTravelFlowService.reset();
    this.mapPageInteractionService.resetUiState();
    this.mapPageState.destroy();
  }

  public onBackHome(): void {
    void this.router.navigate(["/home"]);
  }

  public openLogsDialog(): void {
    this.mapPageInteractionService.openLogsDialog(this.eventLogs());
  }

  public onInspectionCellChanged(cell: MapGridPanelCell | null): void {
    this.inspectedCell.set(cell);
  }

  public async onResourcePanelClicked(): Promise<void> {
    await this.mapPageInteractionService.openResourceInventoryDialog({
      mode: "manage",
      gameId: this.gameId,
      player: this.myPlayer(),
      maxCapacity: this.resourceCapacity(),
    });
  }

  private async syncMockPlayersForLayout(): Promise<void> {
    const parsed = await this.mapPageLayoutService.loadMockPlayersForLayout();
    this.mockPlayers.set(parsed);
  }

  public async onCellClick(cell: MapGridPanelCell): Promise<void> {
    if (this.isMoving() || this.isMyTravelLockActive()) return;

    this.isMoving.set(true);
    try {
      await this.mapPageInteractionService.handleCellClick({
        gameId: this.gameId,
        cell,
        myPlayer: this.myPlayer(),
        isMyTurn: this.isMyTurn(),
        movableCellIds: this.movableCellIds(),
      });
    } finally {
      this.isMoving.set(false);
    }
  }

  public async onCommandActionRequested(actionId: string): Promise<void> {
    if (this.isMyTravelLockActive()) return;

    await this.mapPageInteractionService.handleCommandAction({
      actionId,
      gameId: this.gameId,
      myPlayer: this.myPlayer(),
      isMyTurn: this.isMyTurn(),
      canEndTurn: this.canEndTurn(),
      worldState: this.worldState(),
      mapCellsById: this.mapCellsById(),
    });
  }

  public async onOpenLevelUpDialog(): Promise<void> {
    await this.mapPageInteractionService.openLevelUpDialog({
      gameId: this.gameId,
      player: this.myPlayer(),
      canOpen: this.canOpenLevelUpDialog(),
    });
  }

}
