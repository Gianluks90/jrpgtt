import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, signal, untracked } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Player } from "@models/player/Player";
import { BiomeEnvironment, EnvironmentService } from "@services/map/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { LuckIndicator } from "../../components/ui/luck-indicator/luck-indicator";
import { BiomesCounter } from "../../components/ui/biomes-counter/biomes-counter";
import { CommandPanelAction } from "../../components/ui/commands-panel/commands-panel";
import { MapPlayersPanel } from "../../components/ui/map-players-panel/map-players-panel";
import { MapLogPanel } from "../../components/ui/map-log-panel/map-log-panel";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapUtilitiesPanel } from "../../components/core/map-utilities-panel/map-utilities-panel";
import { MapPlayerUtilitiesPanel } from "../../components/core/map-player-utilities-panel/map-player-utilities-panel";
import { MapLocationDiscardHud } from "../../components/core/map-location-discard-hud/map-location-discard-hud";
import { MapPageStateService } from "@services/map/map-page-state-service";
import { MapPageLayoutService } from "@services/map/map-page-layout-service";
import { MapPageActionsService } from "@services/map/map-page-actions-service";
import { MapPageInteractionService } from "@services/map/map-page-interaction-service";
import { DayNightCyclePanel } from "../../components/ui/day-night-cycle-panel/day-night-cycle-panel";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../consts/gameplay/inventory-config";
import { DEFAULT_SPELLBOOK_CAPACITY } from "../../consts/player/spellbook-config";
import { PlayerComputedStats } from "@models/player/PlayerComputedStats";
import { MapCell } from "@models/world/MapCell";
import { PlayerStatsModifierService } from "@services/player/player-stats-modifier-service";
import { FastTravelVisualService } from "@services/map/fast-travel-visual-service";
import { FastTravelFlowService } from "@services/map/fast-travel-flow-service";
import { PendingFastTravelState, RequiredActionNotificationState } from "@models/world/WorldState";
import { WorldEventRegionTransitionService } from "@services/map/world-event-region-transition-service";
import { BiomeConditionCatalogService } from "@services/catalog/biome-condition-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { DiscardPileService } from "@services/gameplay/discard-pile-service";
import { TranslationPipe } from "../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { RequiredActionNotification, RequiredActionNotificationPlayer } from "../../components/ui/required-action-notification/required-action-notification";
import { RulebookButton } from "../../components/ui/rulebook-button/rulebook-button";
import { RulebookDialogService } from "@services/ui/rulebook-dialog-service";
import { MapSettingsDialogService } from "@services/ui/map-settings-dialog-service";
import { CombatOverlay } from "../../components/ui/combat-overlay/combat-overlay";
import { ExplorationEventService } from "@services/exploration/exploration-event-service";

type WorldEventFlowPhase = "announcing" | "propagating" | "summary" | "completed";

@Component({
  selector: "app-map-page",
  imports: [
    IconButton,
    MapPlayersPanel,
    MapGridPanel,
    WorldStatePanel,
    MapPlayerUtilitiesPanel,
    MapLocationDiscardHud,
    LuckIndicator,
    DayNightCyclePanel,
    BiomesCounter,
    MapUtilitiesPanel,
    MapLogPanel,
    TranslationPipe,
    RequiredActionNotification,
    RulebookButton,
    CombatOverlay,
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
  private worldEventRegionTransitionService = inject(WorldEventRegionTransitionService);
  private biomeConditionCatalogService = inject(BiomeConditionCatalogService);
  private itemCatalogService = inject(ItemCatalogService);
  private followerCatalogService = inject(FollowerCatalogService);
  private discardPileService = inject(DiscardPileService);
  private translationService = inject(TranslationService);
  private rulebookDialogService = inject(RulebookDialogService);
  private mapSettingsDialogService = inject(MapSettingsDialogService);
  private explorationEventService = inject(ExplorationEventService);

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
  public isSpecialLocationsCounterHovered = signal(false);
  public inspectedCell = signal<MapGridPanelCell | null>(null);
  private static readonly locationInfoResetDelayMs = 10000;
  private locationInfoResetTimer: ReturnType<typeof setTimeout> | null = null;
  private worldEventFlowClockTimer: ReturnType<typeof setInterval> | null = null;
  private worldEventFlowNowMs = signal<number>(Date.now());
  private lastPendingDialogKey = signal<string | null>(null);
  private lastClearedRequiredActionNotificationId = signal<string | null>(null);
  private requiredActionNotificationSeenAtMsById = signal<Record<string, number>>({});
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

  public isSinglePlayerSidebar = computed<boolean>(() => {
    return this.players().length <= 1;
  });

  public spellCount = computed<number>(() => {
    const spells = this.myPlayer()?.spellbook?.spells;
    if (!Array.isArray(spells)) {
      return 0;
    }

    return spells.filter((entry) => typeof entry?.spellId === "string" && entry.spellId.trim().length > 0).length;
  });

  public spellCapacity = computed<number>(() => {
    const configuredCapacity = this.myPlayer()?.spellbook?.capacity;
    if (typeof configuredCapacity === "number" && Number.isFinite(configuredCapacity)) {
      return Math.max(1, Math.floor(configuredCapacity));
    }

    return DEFAULT_SPELLBOOK_CAPACITY;
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

  public worldEventFlowView = computed<{
    active: boolean;
    phase: WorldEventFlowPhase;
    title: string;
    description: string;
    mutationCellIds: string[];
    propagatedCellsCount: number;
    totalMutations: number;
  }>(() => {
    const worldEvent = this.worldState()?.worldEvent;
    const flow = worldEvent?.flow;
    const requiredNotification = this.worldState()?.requiredActionNotification;
    if (requiredNotification?.type === "world-event-activated") {
      return {
        active: false,
        phase: "completed",
        title: "",
        description: "",
        mutationCellIds: [],
        propagatedCellsCount: 0,
        totalMutations: 0,
      };
    }

    if (!worldEvent || worldEvent.emitted !== true || !flow) {
      return {
        active: false,
        phase: "completed",
        title: "",
        description: "",
        mutationCellIds: [],
        propagatedCellsCount: 0,
        totalMutations: 0,
      };
    }

    const startedAtMs = Math.max(0, Math.floor(Number(flow.startedAtMs ?? 0)));
    const announceDurationMs = Math.max(0, Math.floor(Number(flow.announceDurationMs ?? 0)));
    const propagationDurationMs = Math.max(1, Math.floor(Number(flow.propagationDurationMs ?? 1)));
    const summaryDurationMs = Math.max(0, Math.floor(Number(flow.summaryDurationMs ?? 0)));
    const mutationCellIds = Array.isArray(flow.mutationCellIds) ? flow.mutationCellIds : [];

    const elapsedMs = Math.max(0, this.worldEventFlowNowMs() - startedAtMs);
    const announceEnd = announceDurationMs;
    const propagationEnd = announceEnd + propagationDurationMs;
    const summaryEnd = propagationEnd + summaryDurationMs;

    let phase: WorldEventFlowPhase = "completed";
    if (elapsedMs < announceEnd) {
      phase = "announcing";
    } else if (elapsedMs < propagationEnd) {
      phase = "propagating";
    } else if (elapsedMs < summaryEnd) {
      phase = "summary";
    }

    let propagatedCellsCount = 0;
    if (phase === "announcing") {
      propagatedCellsCount = 0;
    } else if (phase === "propagating") {
      const propagationElapsed = elapsedMs - announceEnd;
      const ratio = Math.max(0, Math.min(1, propagationElapsed / propagationDurationMs));
      propagatedCellsCount = Math.max(0, Math.min(mutationCellIds.length, Math.floor(ratio * mutationCellIds.length)));
    } else {
      propagatedCellsCount = mutationCellIds.length;
    }

    const outcome = this.translationService.tOrFallback(
      `map.worldPanel.worldEventOutcome.${worldEvent.primaryOutcome ?? "none"}`,
      worldEvent.primaryOutcome ?? "none",
    );
    const targetBiome = worldEvent.targetBiome
      ? this.translationService.tOrFallback(`map.biomes.${worldEvent.targetBiome}`, worldEvent.targetBiome)
      : "-";
    const driverBiome = worldEvent.driverBiome
      ? this.translationService.tOrFallback(`map.biomes.${worldEvent.driverBiome}`, worldEvent.driverBiome)
      : "-";

    const title = this.translationService.tOrFallback("map.worldEventFlow.title", "World Event");
    const descriptionKey = phase === "announcing"
      ? "map.worldEventFlow.announcing"
      : phase === "propagating"
        ? "map.worldEventFlow.propagating"
        : phase === "summary"
          ? "map.worldEventFlow.summary"
          : "map.worldEventFlow.completed";
    const descriptionFallback = `${outcome} | ${targetBiome}/${driverBiome}`;
    const description = this.translationService.tOrFallback(descriptionKey, descriptionFallback, {
      outcome,
      targetBiome,
      driverBiome,
      propagatedCellsCount,
      totalMutations: mutationCellIds.length,
    });

    return {
      active: phase !== "completed",
      phase,
      title,
      description,
      mutationCellIds,
      propagatedCellsCount,
      totalMutations: mutationCellIds.length,
    };
  });

  public worldEventMutationCellIds = computed<string[]>(() => {
    return this.worldEventFlowView().mutationCellIds;
  });

  public worldEventPropagatedCellsCount = computed<number>(() => {
    return this.worldEventFlowView().propagatedCellsCount;
  });

  public isWorldEventFlowLockActive = computed<boolean>(() => {
    return this.worldEventFlowView().active;
  });

  public requiredActionNotification = computed<RequiredActionNotificationState | null>(() => {
    const notification = this.worldState()?.requiredActionNotification;
    if (!notification) {
      return null;
    }

    if (notification.forcedByOwnerId) {
      return null;
    }

    const allAcknowledgedAtMs = Number(notification.allAcknowledgedAtMs ?? 0);
    if (allAcknowledgedAtMs > 0 && this.worldEventFlowNowMs() >= allAcknowledgedAtMs + 3000) {
      return null;
    }

    return notification;
  });

  public isRequiredActionNotificationLockActive = computed<boolean>(() => {
    return this.requiredActionNotification() !== null;
  });

  public requiredActionNotificationPlayers = computed<RequiredActionNotificationPlayer[]>(() => {
    const notification = this.requiredActionNotification();
    if (!notification) {
      return [];
    }

    const playersById = new Map(this.players().map((player) => [player.id, player]));
    const acknowledgedSet = new Set(
      (notification.acknowledgedPlayerIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    );
    const requiredPlayerIds = (notification.requiredPlayerIds ?? [])
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    return requiredPlayerIds.map((playerId) => ({
      id: playerId,
      name: playersById.get(playerId)?.name ?? playerId,
      acknowledged: acknowledgedSet.has(playerId),
    }));
  });

  public requiredActionNotificationTitle = computed<string>(() => {
    const notification = this.requiredActionNotification();
    if (!notification) {
      return "";
    }

    if (notification.type === "world-event-activated") {
      const driverBiome = notification.worldEventDriverBiome
        ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventDriverBiome}`, notification.worldEventDriverBiome)
        : this.translationService.tOrFallback("map.worldEventFlow.title", "World Event");
      const targetBiome = notification.worldEventTargetBiome
        ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventTargetBiome}`, notification.worldEventTargetBiome)
        : this.translationService.tOrFallback("map.worldEventFlow.title", "World Event");
      const eventName = `${driverBiome} > ${targetBiome}`;
      return this.translationService.tOrFallback(
        "dialogs.requiredActionNotification.worldEventActivatedTitle",
        "World Event Activated: {eventName}",
        { eventName },
      );
    }

    return this.sanctuaryElementToLabel(notification.sanctuaryElement);
  });

  public requiredActionNotificationDescription = computed<string>(() => {
    const notification = this.requiredActionNotification();
    if (!notification) {
      return "";
    }

    if (notification.type === "world-event-activated") {
      const playerName = notification.activatedByPlayerName;
      const flowDescription = this.resolveWorldEventActivationDescription(notification);

      return this.translationService.tOrFallback(
        "dialogs.requiredActionNotification.worldEventActivatedDescription",
        "Triggered by {playerName}. {description}",
        { playerName, description: flowDescription },
      );
    }

    const sanctuaryLabel = this.requiredActionNotificationTitle();
    const playerName = notification.activatedByPlayerName;
    return this.translationService.tOrFallback(
      "dialogs.requiredActionNotification.sanctuaryActivatedDescription",
      `${sanctuaryLabel} has been activated by ${playerName}`,
      { sanctuaryLabel, playerName },
    );
  });

  public requiredActionNotificationOwnerOverrideVisible = computed<boolean>(() => {
    const notification = this.requiredActionNotification();
    if (!notification) {
      return false;
    }

    const referenceMs = Number(notification.lastActionAtMs ?? notification.createdAtMs ?? 0);
    const seenAtMs = this.requiredActionNotificationSeenAtMsById()[notification.notificationId] ?? 0;
    const effectiveAnchorMs = Math.max(referenceMs, seenAtMs);
    if (effectiveAnchorMs <= 0) {
      return false;
    }

    return this.worldEventFlowNowMs() >= effectiveAnchorMs + 5000;
  });

  public canEndTurn = computed<boolean>(() => {
    if (!this.isMyTurn()) return false;
    if (!this.hasMovedOnCurrentTurn()) return false;
    if (this.isMyTravelLockActive()) return false;
    if (this.isWorldEventFlowLockActive()) return false;
    if (this.isRequiredActionNotificationLockActive()) return false;
    if (this.mapPageInteractionService.pendingActionId() !== null) return false;
    if (this.myPlayer()?.pendingResourcePickup) return false;
    return true;
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

    if (!this.isMyTravelLockActive() && !this.isWorldEventFlowLockActive() && !this.isRequiredActionNotificationLockActive()) {
      return actions;
    }

    return actions.map((action) => ({
      ...action,
      disabled: true,
      pending: false,
    }));
  });

  public spellActions = computed<CommandPanelAction[]>(() => {
    const actions = this.mapPageActionsService.buildSpellActions({
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

    if (!this.isMyTravelLockActive() && !this.isWorldEventFlowLockActive() && !this.isRequiredActionNotificationLockActive()) {
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

    const currentCellId = `${current.location.x}_${current.location.y}`;
    const currentCell = this.mapCellsById()[currentCellId] ?? null;
    const spellDiagonal = (this.worldState()?.diagonalMovementByPlayer ?? {})[current.id] === this.worldState()?.currentTurn;
    const allowDiagonalFromCurrent = spellDiagonal || this.cellHasConditionEffect(currentCell, "movement-enable-diagonal-adjacency", ["open-ground"]);

    const targets = this.environmentService.getMovableCellIdsForPlayer(
      current,
      this.mapCellsById(),
      this.mapSize(),
      this.environmentByCellId(),
      allowDiagonalFromCurrent,
    );

    const filteredTargets = new Set<string>();
    targets.forEach((targetCellId) => {
      const targetCell = this.mapCellsById()[targetCellId] ?? null;
      if (this.cellHasConditionEffect(targetCell, "movement-block-entry", ["impassable"])) {
        return;
      }

      filteredTargets.add(targetCellId);
    });

    const movementBonus = this.getCurrentTurnMovementBonus();
    if (movementBonus > 0) {
      const bonusTargets = this.environmentService.buildOrthogonalRangeTargetIds(
        current.location.x,
        current.location.y,
        1 + movementBonus,
        this.mapSize(),
      );

      bonusTargets.forEach((targetCellId) => {
        const targetCell = this.mapCellsById()[targetCellId] ?? null;
        if (this.cellHasConditionEffect(targetCell, "movement-block-entry", ["impassable"])) {
          return;
        }

        filteredTargets.add(targetCellId);
      });
    }

    return filteredTargets;
  });

  public regionIToIIWarning = computed(() => {
    return this.worldEventRegionTransitionService.shouldShowRegionIToIIBoundaryWarning({
      player: this.myPlayer(),
      worldState: this.worldState(),
      mapSize: this.mapSize(),
    });
  });

  public ngOnInit(): void {
    if (!this.gameId) return;
    this.mapPageInteractionService.resetUiState();
    this.mapPageState.init(this.gameId);
    void this.biomeConditionCatalogService.loadConfig();
    void this.itemCatalogService.loadConfig();
    void this.followerCatalogService.loadConfig();
    this.startWorldEventFlowClock();
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
      const notification = this.requiredActionNotification();
      if (!notification) {
        return;
      }

      const id = notification.notificationId;
      if (!id) {
        return;
      }

      const seenMap = this.requiredActionNotificationSeenAtMsById();
      if (seenMap[id]) {
        return;
      }

      this.requiredActionNotificationSeenAtMsById.set({
        ...seenMap,
        [id]: Date.now(),
      });
    }, { injector: this.injector });

    effect(() => {
      const notification = this.worldState()?.requiredActionNotification;
      if (!notification) {
        this.lastClearedRequiredActionNotificationId.set(null);
        return;
      }

      const allAcknowledgedAtMs = Number(notification.allAcknowledgedAtMs ?? 0);
      const clearDelayMs = notification.type === "world-event-activated" ? 800 : 3000;
      const canClearForAllAcknowledged = allAcknowledgedAtMs > 0
        && this.worldEventFlowNowMs() >= allAcknowledgedAtMs + clearDelayMs;
      const canClearForForcedContinue = typeof notification.forcedByOwnerId === "string"
        && notification.forcedByOwnerId.trim().length > 0;
      if (!canClearForAllAcknowledged && !canClearForForcedContinue) {
        return;
      }

      const notificationId = notification.notificationId;
      if (!notificationId || this.lastClearedRequiredActionNotificationId() === notificationId) {
        return;
      }

      this.lastClearedRequiredActionNotificationId.set(notificationId);
      void this.mapPageInteractionService.clearRequiredActionNotification(this.gameId, notificationId);
    }, { injector: this.injector });

    effect(() => {
      this.fastTravelFlowService.sync({
        gameId: this.gameId,
        worldState: this.worldState(),
        players: this.players(),
        currentUserId: this.currentUserId(),
      });
    }, { injector: this.injector });

    effect(() => {
      const worldState = this.worldState();
      const currentUserId = this.currentUserId();
      const activeCombat = worldState?.activeCombat;

      if (!activeCombat) return;
      if (activeCombat.attackingPlayerId !== currentUserId) return;
      if (untracked(() => this.explorationEventService.pendingCombat()) !== null) return;

      this.explorationEventService.hydrateFromActiveCombat(this.gameId, activeCombat, {
        getPlayer: () => this.myPlayer(),
        getCell: (cellId) => this.mapCellsById()[cellId] ?? null,
        getWorldState: () => this.worldState(),
        mapSize: this.mapSize(),
      });
    }, { injector: this.injector });

    void this.syncMockPlayersForLayout();
  }

  public ngOnDestroy(): void {
    this.clearLocationInfoResetTimer();
    this.stopWorldEventFlowClock();
    this.fastTravelFlowService.reset();
    this.mapPageInteractionService.resetUiState();
    this.mapPageState.destroy();
  }

  public async onBackHome(): Promise<void> {
    const confirmed = await this.mapPageInteractionService.confirmLeaveGameToHome();
    if (!confirmed) return;

    void this.router.navigate(["/home"]);
  }

  public openLogsDialog(): void {
    this.mapPageInteractionService.openLogsDialog(this.eventLogs());
  }

  public openRulebookDialog(): void {
    this.rulebookDialogService.open();
  }

  public openMapSettingsDialog(): void {
    this.mapSettingsDialogService.open();
  }

  public onWorldEventHelpRequested(): void {
    this.mapPageInteractionService.openWorldEventHelpDialog({
      worldState: this.worldState(),
      mapCellsById: this.mapCellsById(),
    });
  }

  public openLocationInfoDialog(titleOverride?: string): void {
    this.mapPageInteractionService.openLocationInfoDialog({
      title: titleOverride ?? this.translationService.tOrFallback("map.cells.unknownCell", "Unknown cell"),
      inspectedCell: this.inspectedCell(),
      activePlayer: this.activePlayer(),
      worldState: this.worldState(),
      players: this.players(),
      mapCellsById: this.mapCellsById(),
      mapSize: this.mapSize(),
      tilesConfig: this.tilesConfig(),
      environmentByCellId: this.environmentByCellId(),
      biomeResourcesByBiome: this.biomeResourcesByBiome(),
      sanctuaryStylesByElement: this.sanctuaryStylesByElement(),
    });
  }

  public async openDiscardPileDialog(): Promise<void> {
    try {
      const entries = await this.discardPileService.getDiscardPileEntries(this.gameId);
      this.mapPageInteractionService.openDiscardPileDialog(entries);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("map.discardPile.openError", "Unable to open discard pile"));
    }
  }

  public onInspectionCellChanged(cell: MapGridPanelCell | null): void {
    if (cell) {
      this.inspectedCell.set(cell);
      this.clearLocationInfoResetTimer();
      return;
    }

    this.scheduleLocationInfoReset();
  }

  public onSpecialLocationsCounterHoverChanged(isHovered: boolean): void {
    this.isSpecialLocationsCounterHovered.set(isHovered);
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
    if (this.isMoving() || this.isMyTravelLockActive() || this.isWorldEventFlowLockActive() || this.isRequiredActionNotificationLockActive()) return;

    this.isMoving.set(true);
    try {
      await this.mapPageInteractionService.handleCellClick({
        gameId: this.gameId,
        cell,
        myPlayer: this.myPlayer(),
        isMyTurn: this.isMyTurn(),
        movableCellIds: this.movableCellIds(),
        worldState: this.worldState(),
        mapSize: this.mapSize(),
      });
    } finally {
      this.isMoving.set(false);
    }
  }

  public onCellContextMenuRequested(cell: MapGridPanelCell): void {
    this.inspectedCell.set(cell);
    this.clearLocationInfoResetTimer();
    this.openLocationInfoDialog(undefined);
  }

  public async onCommandActionRequested(actionId: string): Promise<void> {
    if (this.isMyTravelLockActive() || this.isWorldEventFlowLockActive() || this.isRequiredActionNotificationLockActive()) return;

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

  public async onSpellActionRequested(actionId: string): Promise<void> {
    if (this.isMyTravelLockActive() || this.isWorldEventFlowLockActive() || this.isRequiredActionNotificationLockActive()) return;

    await this.mapPageInteractionService.handleSpellAction({
      spellId: actionId,
      gameId: this.gameId,
      myPlayer: this.myPlayer(),
      isMyTurn: this.isMyTurn(),
      worldState: this.worldState(),
      mapCellsById: this.mapCellsById(),
      mapSize: this.mapSize(),
    });
  }

  public async onOpenLevelUpDialog(): Promise<void> {
    await this.mapPageInteractionService.openLevelUpDialog({
      gameId: this.gameId,
      player: this.myPlayer(),
      canOpen: this.canOpenLevelUpDialog(),
    });
  }

  public onAcknowledgeRequiredActionRequested(playerId: string): void {
    const myPlayer = this.myPlayer();
    if (!myPlayer || myPlayer.id !== playerId) {
      return;
    }

    void this.mapPageInteractionService.acknowledgeRequiredActionNotification(this.gameId, myPlayer);
  }

  public onForceContinueRequiredActionRequested(): void {
    void this.mapPageInteractionService.forceContinueRequiredActionNotification(this.gameId, this.myPlayer());
  }

  private cellHasConditionEffect(
    mapCell: MapCell | null,
    effectType: string,
    fallbackConditionIds: string[] = [],
  ): boolean {
    if (!mapCell || mapCell.isSpecial === true) {
      return false;
    }

    const tilesConfig = this.tilesConfig();
    if (!tilesConfig) {
      return false;
    }

    const effectiveBiome = mapCell.worldEventBiomeOverride ?? mapCell.biome;
    const conditionIds = Array.from(new Set([
      ...(tilesConfig.biomes[effectiveBiome]?.conditions ?? []),
      ...(mapCell.worldEventConditionIds ?? []),
    ]));
    return conditionIds.some((conditionId) => {
      const definition = this.biomeConditionCatalogService.getCachedCondition(conditionId);
      if (definition?.effect?.type === effectType) {
        return true;
      }

      return fallbackConditionIds.includes(conditionId);
    });
  }


  private getCurrentTurnMovementBonus(): number {
    const worldState = this.worldState();
    const playerId = this.myPlayer()?.id;
    if (!worldState || !playerId) {
      return 0;
    }

    const currentTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
    const movementBonus = worldState.followerMovementBonusByPlayer?.[playerId];
    if (!movementBonus || movementBonus.turn !== currentTurn) {
      return 0;
    }

    return Math.max(0, Math.floor(Number(movementBonus.amount ?? 0)));
  }

  private startWorldEventFlowClock(): void {
    this.stopWorldEventFlowClock();
    this.worldEventFlowNowMs.set(Date.now());
    this.worldEventFlowClockTimer = setInterval(() => {
      this.worldEventFlowNowMs.set(Date.now());
    }, 150);
  }

  private sanctuaryElementToLabel(element: string | undefined): string {
    if (element === "water") {
      return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
    }
    if (element === "fire") {
      return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
    }
    if (element === "wind") {
      return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
    }
    if (element === "earth") {
      return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
    }
    return this.translationService.tOrFallback("map.cells.sanctuary.generic", "Elemental Shrine");
  }

  private resolveWorldEventDescriptionFallback(notification: RequiredActionNotificationState): string {
    const outcome = this.translationService.tOrFallback(
      `map.worldPanel.worldEventOutcome.${notification.worldEventPrimaryOutcome ?? "none"}`,
      notification.worldEventPrimaryOutcome ?? "none",
    );
    const targetBiome = notification.worldEventTargetBiome
      ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventTargetBiome}`, notification.worldEventTargetBiome)
      : "-";
    const driverBiome = notification.worldEventDriverBiome
      ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventDriverBiome}`, notification.worldEventDriverBiome)
      : "-";
    const totalMutations = Math.max(0, Math.floor(Number(notification.worldEventTotalMutations ?? 0)));

    return this.translationService.tOrFallback(
      "map.worldEventFlow.summary",
      `${outcome} | ${targetBiome}/${driverBiome}`,
      {
        outcome,
        targetBiome,
        driverBiome,
        propagatedCellsCount: totalMutations,
        totalMutations,
      },
    );
  }

  private resolveWorldEventActivationDescription(notification: RequiredActionNotificationState): string {
    const targetBiome = notification.worldEventTargetBiome
      ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventTargetBiome}`, notification.worldEventTargetBiome)
      : "-";
    const driverBiome = notification.worldEventDriverBiome
      ? this.translationService.tOrFallback(`map.biomes.${notification.worldEventDriverBiome}`, notification.worldEventDriverBiome)
      : "-";

    return this.translationService.tOrFallback(
      "map.worldEventFlow.notificationIntro",
      "Target {targetBiome}, driver {driverBiome}. Confirm to start propagation.",
      {
        targetBiome,
        driverBiome,
      },
    );
  }

  private stopWorldEventFlowClock(): void {
    if (!this.worldEventFlowClockTimer) {
      return;
    }

    clearInterval(this.worldEventFlowClockTimer);
    this.worldEventFlowClockTimer = null;
  }

  private scheduleLocationInfoReset(): void {
    this.clearLocationInfoResetTimer();
    this.locationInfoResetTimer = setTimeout(() => {
      this.inspectedCell.set(null);
      this.locationInfoResetTimer = null;
    }, MapPage.locationInfoResetDelayMs);
  }

  private clearLocationInfoResetTimer(): void {
    if (!this.locationInfoResetTimer) return;
    clearTimeout(this.locationInfoResetTimer);
    this.locationInfoResetTimer = null;
  }

}
