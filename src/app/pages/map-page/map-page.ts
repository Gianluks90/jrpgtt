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
import { MapLogPanel } from "../../components/ui/map-log-panel/map-log-panel";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapPageStateService } from "../../services/map-page-state-service";
import { MapPageLayoutService } from "../../services/map-page-layout-service";
import { MapPageActionsService } from "../../services/map-page-actions-service";
import { MapPageInteractionService } from "../../services/map-page-interaction-service";
import { DayNightCyclePanel } from "../../components/ui/day-night-cycle-panel/day-night-cycle-panel";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../consts/inventory-config";
import { PlayerAllyEntry } from "../../models/Ally";
import { ItemDefinition } from "../../models/ItemCatalog";
import { PlayerComputedStats } from "../../models/PlayerComputedStats";
import { MapCell } from "../../models/MapCell";
import { InventoryItemEntry } from "../../models/Inventory";
import { PlayerStatsModifierService } from "../../services/player-stats-modifier-service";
import { FastTravelVisualService } from "../../services/fast-travel-visual-service";
import { FastTravelFlowService } from "../../services/fast-travel-flow-service";
import { PendingFastTravelState } from "../../models/WorldState";
import { WorldEventRegionTransitionService } from "../../services/world-event-region-transition-service";
import { BiomeConditionCatalogService } from "../../services/biome-condition-catalog-service";
import { ItemCatalogService } from "../../services/item-catalog-service";
import { AllyCatalogService } from "../../services/ally-catalog-service";
import { DiscardPileService } from "../../services/discard-pile-service";

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
  private worldEventRegionTransitionService = inject(WorldEventRegionTransitionService);
  private biomeConditionCatalogService = inject(BiomeConditionCatalogService);
  private itemCatalogService = inject(ItemCatalogService);
  private allyCatalogService = inject(AllyCatalogService);
  private discardPileService = inject(DiscardPileService);

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
  public utilitiesExpandedPanel = signal<"inventory" | "allies">("inventory");
    private static readonly locationInfoResetDelayMs = 10000;
    private locationInfoResetTimer: ReturnType<typeof setTimeout> | null = null;
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

  public isSinglePlayerSidebar = computed<boolean>(() => {
    return this.players().length <= 1;
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

  public locationInfoCellName = computed<string>(() => {
    const hoveredCell = this.inspectedCell();
    if (hoveredCell) {
      return this.resolveCellNameFromCoordinates(hoveredCell.x, hoveredCell.y);
    }

    const activePlayer = this.activePlayer();
    if (!activePlayer) return "-";
    return this.resolveCellNameFromCoordinates(activePlayer.location.x, activePlayer.location.y);
  });

  public locationInfoContextLabel = computed<string>(() => {
    if (this.inspectedCell()) {
      return "Observing cell";
    }

    return "Active player in";
  });

  public discardPileCount = computed<number>(() => {
    const rawCount = Number(this.worldState()?.nextDiscardSeq ?? 0);
    if (!Number.isFinite(rawCount)) {
      return 0;
    }

    return Math.max(0, Math.floor(rawCount));
  });

  public visibleInventoryItems = computed<Array<{
    itemId: string;
    name: string;
    sellValue: number | null;
    description: string;
    occupiesSpace: boolean;
    uses: {
      current: number;
      max: number;
      slots: boolean[];
    } | null;
    labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }>;
  }>>(() => {
    const items = this.normalizeInventoryItems(this.myPlayer()?.inventory?.items);
    return items.map((entry) => {
      const definition = this.itemCatalogService.getCachedItemById(entry.itemId);
      const sellValue = definition ? this.itemCatalogService.getSellValue(definition) : 0;
      const labels = definition ? this.buildInventoryLabels(definition) : [];
      const uses = definition ? this.buildInventoryUses(entry, definition) : null;
      return {
        itemId: entry.itemId,
        name: definition?.name ?? entry.itemId,
        sellValue: sellValue > 0 ? sellValue : null,
        description: definition?.description?.trim() || "No description available.",
        occupiesSpace: definition?.occupiesSpace === true,
        uses,
        labels,
      };
    });
  });

  public visibleInventoryOccupiedSlots = computed<number>(() => {
    return this.visibleInventoryItems().reduce((total, item) => {
      return total + (item.occupiesSpace ? 1 : 0);
    }, 0);
  });

  public visibleInventoryCapacity = computed<number>(() => {
    const configured = this.myPlayer()?.inventory?.itemCapacity;
    const alliesBonus = this.getAlliesItemCapacityBonus(this.myPlayer()?.allies);
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured)) + alliesBonus;
    }

    return 4 + alliesBonus;
  });

  public visibleAllies = computed<Array<{
    allyId: string;
    name: string;
    description: string;
    hpCurrent: number;
    hpMax: number;
    hpPercent: number;
    labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }>;
  }>>(() => {
    const allies = this.normalizePlayerAllies(this.myPlayer()?.allies);
    return allies
      .filter((entry) => entry.state !== "discarded")
      .map((entry) => {
        const definition = this.allyCatalogService.getCachedAllyById(entry.allyId);
        const hpMax = typeof definition?.maxHp === "number" ? Math.max(1, Math.floor(definition.maxHp)) : 1;
        const hpCurrent = Math.max(0, Math.min(hpMax, Math.floor(Number(entry.hpCurrent ?? 0))));
        return {
          allyId: entry.allyId,
          name: definition?.name ?? entry.allyId,
          description: definition?.description?.trim() || "No description available.",
          hpCurrent,
          hpMax,
          hpPercent: Math.max(0, Math.min(100, Math.floor((hpCurrent / hpMax) * 100))),
          labels: definition ? this.buildAllyLabels(definition.parameterModifiers ?? []) : [],
        };
      });
  });

  public discardedAlliesCount = computed<number>(() => {
    return this.normalizePlayerAllies(this.myPlayer()?.allies)
      .filter((entry) => entry.state === "discarded")
      .length;
  });

  public collapsedInventorySummary = computed<string>(() => {
    const names = this.visibleInventoryItems().map((item) => item.name.trim()).filter((name) => name.length > 0);
    if (names.length === 0) {
      return "no items";
    }

    return names.join(", ");
  });

  public collapsedAlliesSummary = computed<string>(() => {
    const names = this.visibleAllies().map((ally) => ally.name.trim()).filter((name) => name.length > 0);
    if (names.length === 0) {
      return "no allies";
    }

    return names.join(", ");
  });

  public movableCellIds = computed<Set<string>>(() => {
    const current = this.myPlayer();
    if (!current || !this.isMyTurn()) return new Set<string>();
    if (this.hasMovedOnCurrentTurn()) return new Set<string>();

    const currentCellId = `${current.location.x}_${current.location.y}`;
    const currentCell = this.mapCellsById()[currentCellId] ?? null;
    const allowDiagonalFromCurrent = this.cellHasConditionEffect(currentCell, "movement-enable-diagonal-adjacency", ["open-ground"]);

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
    void this.allyCatalogService.loadConfig();
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
    this.clearLocationInfoResetTimer();
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

  public openLocationInfoDialog(): void {
    this.mapPageInteractionService.openLocationInfoDialog({
      title: this.locationInfoCellName(),
      inspectedCell: this.inspectedCell(),
      activePlayer: this.activePlayer(),
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
      window.alert(error instanceof Error ? error.message : "Unable to open discard pile");
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

  public async onResourcePanelClicked(): Promise<void> {
    await this.mapPageInteractionService.openResourceInventoryDialog({
      mode: "manage",
      gameId: this.gameId,
      player: this.myPlayer(),
      maxCapacity: this.resourceCapacity(),
    });
  }

  public isInventoryExpanded(): boolean {
    return this.utilitiesExpandedPanel() === "inventory";
  }

  public isAlliesExpanded(): boolean {
    return this.utilitiesExpandedPanel() === "allies";
  }

  public onInventoryPanelToggle(): void {
    this.utilitiesExpandedPanel.set("inventory");
  }

  public onAlliesPanelToggle(): void {
    this.utilitiesExpandedPanel.set("allies");
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
        worldState: this.worldState(),
        mapSize: this.mapSize(),
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

    const conditionIds = tilesConfig.biomes[mapCell.biome]?.conditions ?? [];
    return conditionIds.some((conditionId) => {
      const definition = this.biomeConditionCatalogService.getCachedCondition(conditionId);
      if (definition?.effect?.type === effectType) {
        return true;
      }

      return fallbackConditionIds.includes(conditionId);
    });
  }

  private normalizeInventoryItems(rawItems: unknown): InventoryItemEntry[] {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const items: InventoryItemEntry[] = [];
    rawItems.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        items.push({ itemId: entry.trim() });
        return;
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const itemId = (entry as { itemId?: unknown }).itemId;
      if (typeof itemId !== "string" || !itemId.trim()) {
        return;
      }

      const rawCurrentCharges = (entry as { currentCharges?: unknown }).currentCharges;
      const currentCharges = typeof rawCurrentCharges === "number" && Number.isFinite(rawCurrentCharges)
        ? Math.max(0, Math.floor(rawCurrentCharges))
        : undefined;

      items.push({
        itemId: itemId.trim(),
        ...(typeof currentCharges === "number" ? { currentCharges } : {}),
      });
    });

    return items;
  }

  private biomeToLabel(biome: MapCell["biome"]): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private buildInventoryLabels(item: ItemDefinition): Array<{
    text: string;
    tone: "neutral" | "positive" | "negative";
  }> {
    const labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }> = [];

    if (item.occupiesSpace !== true) {
      labels.push({
        text: "little",
        tone: "neutral",
      });
    }

    const scopeLabels = this.buildModifierScopeLabels(item.parameterModifiers ?? []);
    scopeLabels.forEach((scopeLabel) => {
      labels.push({
        text: scopeLabel,
        tone: "neutral",
      });
    });

    const parameterModifiers = item.parameterModifiers ?? [];
    parameterModifiers.forEach((modifier) => {
      const sign = modifier.amount >= 0 ? "+" : "";
      const parameterLabel = modifier.parameter === "strength"
        ? "STR"
        : modifier.parameter === "magic"
          ? "MAG"
          : "LCK";
      labels.push({
        text: `${sign}${modifier.amount} ${parameterLabel}`,
        tone: modifier.amount >= 0 ? "positive" : "negative",
      });
    });

    return labels;
  }

  private buildInventoryUses(entry: InventoryItemEntry, item: ItemDefinition): {
    current: number;
    max: number;
    slots: boolean[];
  } | null {
    const maxCharges = typeof item.maxCharges === "number" && Number.isFinite(item.maxCharges)
      ? Math.max(1, Math.floor(item.maxCharges))
      : null;
    if (!maxCharges) {
      return null;
    }

    const rawCurrentCharges = Number(entry.currentCharges);
    const currentCharges = Number.isFinite(rawCurrentCharges)
      ? Math.max(0, Math.min(maxCharges, Math.floor(rawCurrentCharges)))
      : maxCharges;

    return {
      current: currentCharges,
      max: maxCharges,
      slots: Array.from({ length: maxCharges }, (_value, index) => index < currentCharges),
    };
  }

  private buildModifierScopeLabels(modifiers: NonNullable<ItemDefinition["parameterModifiers"]>): string[] {
    const labels = new Set<string>();

    modifiers.forEach((modifier) => {
      const scopes = modifier.scopes ?? [];
      scopes.forEach((scope) => {
        if (scope === "always") return;
        if (scope === "fight-only") {
          labels.add("fight only");
          return;
        }
        if (scope === "day-only") {
          labels.add("day only");
          return;
        }
        labels.add("night only");
      });
    });

    return Array.from(labels);
  }

  private buildAllyLabels(modifiers: Array<{
    parameter: "strength" | "magic" | "luck";
    amount: number;
    scopes: Array<"always" | "fight-only" | "day-only" | "night-only">;
  }>): Array<{
    text: string;
    tone: "neutral" | "positive" | "negative";
  }> {
    const labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }> = [];

    const scopeLabels = this.buildModifierScopeLabels(modifiers);
    scopeLabels.forEach((scopeLabel) => {
      labels.push({
        text: scopeLabel,
        tone: "neutral",
      });
    });

    modifiers.forEach((modifier) => {
      const sign = modifier.amount >= 0 ? "+" : "";
      const parameterLabel = modifier.parameter === "strength"
        ? "STR"
        : modifier.parameter === "magic"
          ? "MAG"
          : "LCK";

      labels.push({
        text: `${sign}${modifier.amount} ${parameterLabel}`,
        tone: modifier.amount >= 0 ? "positive" : "negative",
      });
    });

    return labels;
  }

  private normalizePlayerAllies(rawAllies: unknown): PlayerAllyEntry[] {
    if (!Array.isArray(rawAllies)) {
      return [];
    }

    const allies: PlayerAllyEntry[] = [];
    rawAllies.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const allyId = (entry as { allyId?: unknown }).allyId;
      if (typeof allyId !== "string" || !allyId.trim()) {
        return;
      }

      const hpCurrent = Math.max(0, Math.floor(Number((entry as { hpCurrent?: unknown }).hpCurrent ?? 0)));
      const state = (entry as { state?: unknown }).state === "discarded" ? "discarded" : "active";

      allies.push({
        allyId: allyId.trim(),
        hpCurrent,
        state,
      });
    });

    return allies;
  }

  private getCurrentTurnMovementBonus(): number {
    const worldState = this.worldState();
    const playerId = this.myPlayer()?.id;
    if (!worldState || !playerId) {
      return 0;
    }

    const currentTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
    const movementBonus = worldState.allyMovementBonusByPlayer?.[playerId];
    if (!movementBonus || movementBonus.turn !== currentTurn) {
      return 0;
    }

    return Math.max(0, Math.floor(Number(movementBonus.amount ?? 0)));
  }

  private getAlliesItemCapacityBonus(rawAllies: unknown): number {
    const allies = this.normalizePlayerAllies(rawAllies);
    return allies.reduce((total, entry) => {
      if (entry.state === "discarded") {
        return total;
      }

      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) {
        return total;
      }

      const ally = this.allyCatalogService.getCachedAllyById(entry.allyId);
      if (!ally) {
        return total;
      }

      const itemCapacityBonus = Number(ally.itemCapacityBonus ?? 0);
      if (!Number.isFinite(itemCapacityBonus)) {
        return total;
      }

      return total + Math.max(0, Math.floor(itemCapacityBonus));
    }, 0);
  }

  private capitalize(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private resolveCellNameFromCoordinates(x: number, y: number): string {
    const cellId = `${x}_${y}`;
    const cell = this.mapCellsById()[cellId] ?? null;
    if (!cell) return "Unknown cell";

    if (cell.isSpecial === true) {
      if (cell.specialType === "landmark") {
        return cell.landmarkDisplayName ?? "Unknown Landmark";
      }

      if (cell.specialType === "sanctuary") {
        if (cell.sanctuaryElement === "water") return "Water Shrine";
        if (cell.sanctuaryElement === "fire") return "Fire Shrine";
        if (cell.sanctuaryElement === "wind") return "Wind Shrine";
        if (cell.sanctuaryElement === "earth") return "Earth Shrine";
        return "Elemental Shrine";
      }
    }

    return this.biomeToLabel(cell.biome);
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
