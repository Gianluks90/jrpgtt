import { Component, computed, effect, inject, Injector, OnDestroy, OnInit, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { firstValueFrom, take } from "rxjs";
import { Player } from "../../models/Player";
import { BiomeType, MapCell, SanctuaryElement } from "../../models/MapCell";
import { ResourceLabel } from "../../models/Resource";
import { MapService } from "../../services/map-service";
import { BiomeEnvironment, EnvironmentService } from "../../services/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { PlayerCard } from "../../components/ui/player-card/player-card";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { ResourceCounter } from "../../components/ui/resource-counter/resource-counter";
import { MoneyCounter } from "../../components/ui/money-counter/money-counter";
import { LuckIndicator } from "../../components/ui/luck-indicator/luck-indicator";
import { AttunementIndicator } from "../../components/ui/attunement-indicator/attunement-indicator";
import { BiomesCounter } from "../../components/ui/biomes-counter/biomes-counter";
import { CommandPanelAction, CommandsPanel } from "../../components/ui/commands-panel/commands-panel";
import { SanctuaryTilesConfigEntry } from "../../models/TilesConfig";
import { ActionRegistryService } from "../../services/action-registry-service";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapPageStateService } from "../../services/map-page-state-service";
import { DIALOGS_CONFIG } from "../../consts/dialog-configs";
import { GameEventsLogDialog } from "../../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { DayNightCyclePanel } from "../../components/ui/day-night-cycle-panel/day-night-cycle-panel";
import { isSpecialCellCoordinate } from "../../consts/special-cells";
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
    PlayerCard,
    MapGridPanel,
    WorldStatePanel,
    ResourceCounter,
    MoneyCounter,
    AttunementIndicator,
    LuckIndicator,
    DayNightCyclePanel,
    BiomesCounter,
    CommandsPanel,
  ],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private readonly sanctuaryDonationCost = 5;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private injector = inject(Injector);
  private mapService = inject(MapService);
  private actionExecutorService = inject(ActionExecutorService);
  private playerProgressionService = inject(PlayerProgressionService);
  private environmentService = inject(EnvironmentService);
  private mapPageState = inject(MapPageStateService);
  private actionRegistry = inject(ActionRegistryService);

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
    const actions: CommandPanelAction[] = [];

    actions.push({
      id: "end-turn",
      label: "End turn",
      description: this.myPlayer()?.pendingResourcePickup
        ? "Resolve pending resource pickup before ending your turn."
        : this.hasMovedOnCurrentTurn()
        ? "Pass control to the next player."
        : "Move at least once before ending your turn.",
      disabled: !this.canEndTurn(),
      pending: this.pendingActionId() === "end-turn",
    });

    return [...actions, ...this.collectPositionActions()];
  });

  public activePlayer = computed<Player | null>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return null;
    return this.players().find((player) => player.id === activePlayerId) ?? null;
  });

  public sidebarPlayers = computed<Player[]>(() => {
    const me = this.myPlayer();
    const mocks = this.mockPlayers();
    if (!me) return mocks;
    return [me, ...mocks];
  });

  public sidebarMainPlayer = computed<Player | null>(() => {
    const me = this.myPlayer();
    if (me) return me;
    return this.sidebarPlayers()[0] ?? null;
  });

  public sidebarOtherPlayers = computed<Player[]>(() => {
    const main = this.sidebarMainPlayer();
    const all = this.sidebarPlayers();
    if (!main) return all;
    return all.filter((player) => player.id !== main.id);
  });

  public locationInfoCell = computed<MapGridPanelCell | null>(() => {
    const inspected = this.inspectedCell();
    if (inspected) {
      const liveMapCell = this.mapCellsById()[inspected.id] ?? null;
      return {
        ...inspected,
        mapCell: liveMapCell,
      };
    }

    const active = this.activePlayer();
    if (!active) return null;

    const x = active.location.x;
    const y = active.location.y;
    const id = this.cellId(x, y);
    const mapCell = this.mapCellsById()[id] ?? null;
    const playersOnCell = this.players().filter((player) => player.location.x === x && player.location.y === y);

    return {
      x,
      y,
      id,
      mapCell,
      players: playersOnCell,
      isSpecial: isSpecialCellCoordinate(x, y),
    };
  });

  public currentCellCoordinatesLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const displayX = cell.x + 1;
    const displayY = cell.y + 1;
    return `${displayX}, ${displayY}`;
  });

  public currentCellId = computed<string | null>(() => {
    return this.locationInfoCell()?.id ?? null;
  });

  public currentCell = computed<MapCell | null>(() => {
    return this.locationInfoCell()?.mapCell ?? null;
  });

  public currentCellBiome = computed<BiomeType | null>(() => {
    const cell = this.currentCell();
    if (!cell || cell.isSpecial === true) return null;
    return cell.biome;
  });

  public currentCellBiomeLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      return this.sanctuaryElementToLabel(cell.sanctuaryElement);
    }

    const biome = this.currentCellBiome();
    if (!biome) return "? ? ?";
    return this.biomeToLabel(biome);
  });

  public currentCellResourcesLabel = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) return "None";

    const biome = this.currentCellBiome();
    if (!biome) return "-";
    const resources = this.biomeResourcesByBiome()[biome] ?? [];
    if (resources.length === 0) return "None";
    return resources.map((resource) => this.resourceToLabel(resource)).join(", ");
  });

  public currentCellIsEnvironment = computed<boolean>(() => {
    if (this.currentCell()?.isSpecial === true) return false;

    const cellId = this.currentCellId();
    if (!cellId) return false;
    return (this.environmentByCellId()[cellId]?.length ?? 0) >= 2;
  });

  public currentCellSectorLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const size = this.mapSize();
    if (size <= 0) return "-";

    const firstBoundary = Math.max(1, Math.floor(size * 0.5));
    const secondBoundary = Math.max(firstBoundary + 1, Math.floor(size * 0.8));

    if (cell.x < firstBoundary) return "I";
    if (cell.x < secondBoundary) return "II";
    return "III";
  });

  public currentCellEnemiesLevelLabel = computed<string>(() => {
    const cell = this.locationInfoCell();
    if (!cell) return "-";

    const centerLevel = cell.x + 1;
    const minLevel = Math.max(1, centerLevel - 1);
    const maxLevel = Math.min(10, centerLevel + 1);
    return `${minLevel}-${maxLevel}`;
  });

  public currentCellIsSpecial = computed<boolean>(() => {
    const infoCell = this.locationInfoCell();
    if (!infoCell) return false;
    if (infoCell.isSpecial) return true;
    return this.currentCell()?.isSpecial === true;
  });

  public currentCellSpecialStatusLabel = computed<string>(() => {
    if (!this.currentCellIsSpecial()) return "-";
    const sanctuaryIsActive = this.currentCell()?.active === true;
    return sanctuaryIsActive ? "Sanctuary active" : "Sanctuary inactive";
  });

  public currentCellSpecialDescription = computed<string>(() => {
    if (!this.currentCellIsSpecial()) return "-";

    const currentCell = this.currentCell();
    const sanctuaryElement = currentCell?.sanctuaryElement;
    if (!sanctuaryElement) {
      return "The sanctuary is still dormant and hidden.";
    }

    const config = this.sanctuaryStylesByElement()[sanctuaryElement];
    if (!config) return "-";

    const sanctuaryIsActive = currentCell?.active === true;
    return sanctuaryIsActive ? config.description.active : config.description.inactive;
  });

  public currentCellPreviewBackground = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.backgroundColor ?? "#5f5a47";
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "#788b69";
    if (biome === "forest") return "#496149";
    if (biome === "mountain") return "#7a7977";
    if (biome === "water") return "#4b658d";
    if (biome === "desert") return "#9f8a64";
    if (biome === "ruins") return "#665953";
    return "#050505";
  });

  public currentCellPreviewIconUrl = computed<string | null>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.iconUrl ?? null;
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "/map-icons/plains-tile-icon.svg";
    if (biome === "forest") return "/map-icons/forest-tile-icon.svg";
    if (biome === "mountain") return "/map-icons/mountain-tile-icon.svg";
    if (biome === "water") return "/map-icons/water-tile-icon.svg";
    if (biome === "ruins") return "/map-icons/ruins-tile-icon.svg";
    return null;
  });

  public currentCellPreviewIconColor = computed<string>(() => {
    const cell = this.currentCell();
    if (cell?.isSpecial === true) {
      const style = cell.sanctuaryElement ? this.sanctuaryStylesByElement()[cell.sanctuaryElement] : null;
      return style?.iconColor ?? "rgba(0, 0, 0, 0.35)";
    }

    const biome = this.currentCellBiome();
    if (biome === "plains") return "#5f7250";
    if (biome === "forest") return "#314131";
    if (biome === "mountain") return "#5f5e5c";
    if (biome === "water") return "#374b69";
    if (biome === "ruins") return "#52463f";
    return "transparent";
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
    void this.loadMockPlayersForLayout();
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

  public trackPlayer(_index: number, player: Player): string {
    return player.id;
  }

  public onInspectionCellChanged(cell: MapGridPanelCell | null): void {
    this.inspectedCell.set(cell);
  }

  public async onResourcePanelClicked(): Promise<void> {
    await this.openResourceInventoryDialog("manage");
  }

  private resourceToLabel(resource: ResourceLabel): string {
    if (resource === "timber") return "Timber";
    if (resource === "food") return "Food";
    return "Minerals";
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private sanctuaryElementToLabel(element?: SanctuaryElement): string {
    if (element === "water") return "Water Shrine";
    if (element === "fire") return "Fire Shrine";
    if (element === "wind") return "Wind Shrine";
    if (element === "earth") return "Earth Shrine";
    return "Elemental Shrine";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private async loadMockPlayersForLayout(): Promise<void> {
    try {
      const response = await fetch("/configs/mock/players-setup.mock.json");
      if (!response.ok) {
        this.mockPlayers.set([]);
        return;
      }

      const raw = (await response.json()) as unknown;
      if (!Array.isArray(raw)) {
        this.mockPlayers.set([]);
        return;
      }

      const parsed = raw
        .slice(0, 3)
        .map((entry, index) => this.toMockPlayer(entry, index))
        .filter((player): player is Player => player !== null);

      this.mockPlayers.set(parsed);
    } catch {
      this.mockPlayers.set([]);
    }
  }

  private toMockPlayer(entry: unknown, index: number): Player | null {
    if (!entry || typeof entry !== "object") return null;

    const candidate = entry as {
      id?: unknown;
      name?: unknown;
      color?: unknown;
      level?: unknown;
      experience?: unknown;
      isReady?: unknown;
      location?: { x?: unknown; y?: unknown };
      parameters?: {
        hp?: { base?: unknown; current?: unknown; max?: unknown };
        strength?: { base?: unknown; current?: unknown; max?: unknown };
        magic?: { base?: unknown; current?: unknown; max?: unknown };
        luck?: { base?: unknown; current?: unknown; max?: unknown };
      };
    };

    const hpBase = this.toNumber(candidate.parameters?.hp?.base, 20);
    const hpCurrent = this.toNumber(candidate.parameters?.hp?.current, hpBase);
    const hpMax = this.toNumber(candidate.parameters?.hp?.max, hpBase);

    return {
      id: typeof candidate.id === "string" ? candidate.id : `mock-player-${index + 1}`,
      name: typeof candidate.name === "string" ? candidate.name : `Mock ${index + 1}`,
      color: typeof candidate.color === "string" ? candidate.color : "#ffffff",
      level: this.toNumber(candidate.level, 1),
      experience: this.toNumber(candidate.experience, 0),
      isReady: typeof candidate.isReady === "boolean" ? candidate.isReady : true,
      location: {
        x: this.toNumber(candidate.location?.x, 0),
        y: this.toNumber(candidate.location?.y, 0),
      },
      parameters: {
        hp: {
          base: hpBase,
          current: hpCurrent,
          max: hpMax,
        },
        strength: {
          base: this.toNumber(candidate.parameters?.strength?.base, 4),
          current: this.toNumber(candidate.parameters?.strength?.current, 4),
          max: this.toNumber(candidate.parameters?.strength?.max, 4),
        },
        magic: {
          base: this.toNumber(candidate.parameters?.magic?.base, 4),
          current: this.toNumber(candidate.parameters?.magic?.current, 4),
          max: this.toNumber(candidate.parameters?.magic?.max, 4),
        },
        luck: {
          base: this.toNumber(candidate.parameters?.luck?.base, 4),
          current: this.toNumber(candidate.parameters?.luck?.current, 4),
          max: this.toNumber(candidate.parameters?.luck?.max, 4),
        },
      },
      inventory: {
        money: 0,
        items: [],
        resources: [{ label: "food", quantity: 3 }],
        resourceCapacity: DEFAULT_RESOURCE_INVENTORY_CAPACITY,
      },
      actionsUsedThisTurn: {},
      statuses: [],
      pendingResourcePickup: null,
      joinedAt: Timestamp.now(),
    };
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return fallback;
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
    if (actionId === "end-turn") {
      await this.onEndTurnRequested();
      return;
    }

    if (actionId === "activate-sanctuary") {
      await this.onActivateSanctuaryRequested();
      return;
    }

    if (actionId === "donate-sanctuary") {
      await this.onDonateSanctuaryRequested();
      return;
    }

    if (actionId === "pray-sanctuary") {
      await this.onPraySanctuaryRequested();
      return;
    }

    if (actionId === "cell-gather") {
      await this.onCellGatherRequested();
      return;
    }

    if (actionId === "consume-ration") {
      await this.onConsumeRationRequested();
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

    this.pendingActionId.set("end-turn");
    try {
      await this.actionExecutorService.endTurn(this.gameId, {
        id: myPlayer.id,
        name: myPlayer.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while ending turn");
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private collectPositionActions(): CommandPanelAction[] {
    const player = this.myPlayer();
    if (!player) return [];

    const cell = this.mapCellsById()[this.cellId(player.location.x, player.location.y)] ?? null;
    if (!cell) {
      return [];
    }

    const isBusy = this.pendingActionId() !== null;
    const hasMoney = (player.inventory?.money ?? 0) >= this.sanctuaryDonationCost;
    const isMyTurn = this.isMyTurn();
    const hasMovedThisTurn = this.hasMovedOnCurrentTurn();
    const worldTurn = this.worldState()?.currentTurn ?? 0;
    const isSanctuaryCell = cell.isSpecial === true && cell.specialType === "sanctuary" && !!cell.sanctuaryElement;
    const actionIds = isSanctuaryCell
      ? this.getConfiguredSanctuaryActionIds(cell)
      : this.getConfiguredBiomeActionIds(cell);
    const biomeResources = cell.biome ? (this.biomeResourcesByBiome()[cell.biome] ?? []) : [];
    const sanctuaryLabel = isSanctuaryCell && cell.sanctuaryElement
      ? this.sanctuaryElementToLabel(cell.sanctuaryElement)
      : undefined;

    return actionIds
      .map((actionId) => {
        const card = this.actionRegistry.buildActionCard(actionId, {
          isBusy,
          hasMoney,
          isMyTurn,
          hasMovedThisTurn,
          sanctuaryLabel,
          player,
          cell,
          worldTurn,
          biome: cell.biome,
          biomeResourceLabels: biomeResources,
          hasPendingResourcePickup: !!player.pendingResourcePickup,
        });
        if (!card) return null;
        return {
          ...card,
          pending: this.pendingActionId() === card.id,
        } as CommandPanelAction;
      })
      .filter((action) => action !== null) as CommandPanelAction[];
  }

  private getConfiguredBiomeActionIds(cell: MapCell): string[] {
    if (cell.isSpecial === true || !cell.biome) {
      return [];
    }

    const config = this.tilesConfig();
    if (!config) {
      return [];
    }

    return config.biomes[cell.biome]?.actions ?? [];
  }

  private getConfiguredSanctuaryActionIds(cell: MapCell): string[] {
    if (!cell.sanctuaryElement) {
      return [];
    }

    const fallbackActionIds = cell.active === true
      ? ["donate-sanctuary", "pray-sanctuary"]
      : ["activate-sanctuary"];

    const config = this.tilesConfig();
    if (!config) {
      return fallbackActionIds;
    }

    const sanctuaryConfig = config.specialTiles.sanctuaries[cell.sanctuaryElement];
    if (!sanctuaryConfig?.actions) {
      return fallbackActionIds;
    }

    return cell.active === true ? sanctuaryConfig.actions.active : sanctuaryConfig.actions.inactive;
  }


  private async onActivateSanctuaryRequested(): Promise<void> {
    const player = this.myPlayer();
    const cell = this.getMyCurrentSanctuaryCell();
    if (!player || !cell || cell.active === true || !cell.sanctuaryElement || !this.isMyTurn()) return;

    const confirmed = await this.openSanctuaryActionDialog({
      mode: "activate",
      sanctuaryElement: cell.sanctuaryElement,
      playerMoney: player.inventory?.money ?? 0,
    });
    if (!confirmed) return;

    this.pendingActionId.set("activate-sanctuary");
    try {
      await this.actionExecutorService.activateSanctuary(this.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while activating sanctuary");
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async onDonateSanctuaryRequested(): Promise<void> {
    const player = this.myPlayer();
    const cell = this.getMyCurrentSanctuaryCell();
    if (!player || !cell || cell.active !== true || !cell.sanctuaryElement || !this.isMyTurn()) return;

    const confirmed = await this.openSanctuaryActionDialog({
      mode: "donate",
      sanctuaryElement: cell.sanctuaryElement,
      playerMoney: player.inventory?.money ?? 0,
    });
    if (!confirmed) return;

    this.pendingActionId.set("donate-sanctuary");
    try {
      await this.actionExecutorService.donateAtSanctuary(this.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while donating at sanctuary");
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async onPraySanctuaryRequested(): Promise<void> {
    const player = this.myPlayer();
    const cell = this.getMyCurrentSanctuaryCell();
    if (!player || !cell || cell.active !== true || !cell.sanctuaryElement || !this.isMyTurn()) return;

    this.pendingActionId.set("pray-sanctuary");
    try {
      await this.actionExecutorService.prayAtSanctuary(this.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while praying at sanctuary");
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async onCellGatherRequested(): Promise<void> {
    const player = this.myPlayer();
    if (!player || !this.isMyTurn()) return;

    this.pendingActionId.set("cell-gather");
    try {
      await this.actionExecutorService.cellGather(this.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while gathering resources");
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async onConsumeRationRequested(): Promise<void> {
    const player = this.myPlayer();
    if (!player || !this.isMyTurn()) return;

    this.pendingActionId.set("consume-ration");
    try {
      await this.actionExecutorService.consumeRation(this.gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while consuming ration");
    } finally {
      this.pendingActionId.set(null);
    }
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
