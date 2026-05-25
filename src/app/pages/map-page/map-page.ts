import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { take } from "rxjs";
import { Player } from "../../models/Player";
import { BiomeType, MapCell, SanctuaryElement } from "../../models/MapCell";
import { ResourceLabel } from "../../models/Resource";
import { MapService } from "../../services/map-service";
import { BiomeEnvironment, EnvironmentService } from "../../services/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { BreakpointService } from "../../services/breakpoint-service";
import { PlayerCard } from "../../components/ui/player-card/player-card";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { MapCellComponent } from "../../components/ui/map-cell/map-cell";
import { ResourceCounter } from "../../components/ui/resource-counter/resource-counter";
import { MoneyCounter } from "../../components/ui/money-counter/money-counter";
import { LuckIndicator } from "../../components/ui/luck-indicator/luck-indicator";
import { BiomesCounter } from "../../components/ui/biomes-counter/biomes-counter";
import { CommandsPanel } from "../../components/ui/commands-panel/commands-panel";
import { MapMobileControls } from "../../components/ui/map-mobile-controls/map-mobile-controls";
import { SanctuaryTilesConfigEntry } from "../../models/TilesConfig";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapPageStateService } from "../../services/map-page-state-service";
import { DIALOGS_CONFIG } from "../../consts/dialog-configs";
import { GameEventsLogDialog } from "../../components/dialogs/game-events-log-dialog/game-events-log-dialog";

@Component({
  selector: "app-map-page",
  imports: [
    IconButton,
    PlayerCard,
    MapGridPanel,
    MapCellComponent,
    MapMobileControls,
    WorldStatePanel,
    ResourceCounter,
    MoneyCounter,
    LuckIndicator,
    BiomesCounter,
    CommandsPanel,
  ],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(Dialog);
  private mapService = inject(MapService);
  private environmentService = inject(EnvironmentService);
  private breakpointService = inject(BreakpointService);
  private mapPageState = inject(MapPageStateService);

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = this.mapPageState.mapSize;
  public currentUserId = this.mapPageState.currentUserId;
  public isMoving = signal(false);
  public isMobile = this.breakpointService.isMobile;
  public players = this.mapPageState.players;
  public worldState = this.mapPageState.worldState;
  public mapCellsById = this.mapPageState.mapCellsById;
  public eventLogs = this.mapPageState.eventLogs;
  public biomeResourcesByBiome = this.mapPageState.biomeResourcesByBiome;
  public sanctuaryStylesByElement = this.mapPageState.sanctuaryStylesByElement;
  public mockPlayers = signal<Player[]>([]);
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

  public currentCellCoordinatesLabel = computed<string>(() => {
    const player = this.myPlayer();
    if (!player) return "-";

    const displayX = player.location.x + 1;
    const displayY = player.location.y + 1;
    return `${displayX}, ${displayY}`;
  });

  public currentCellId = computed<string | null>(() => {
    const player = this.myPlayer();
    if (!player) return null;
    return this.cellId(player.location.x, player.location.y);
  });

  public currentCell = computed<MapCell | null>(() => {
    const cellId = this.currentCellId();
    if (!cellId) return null;
    return this.mapCellsById()[cellId] ?? null;
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
    if (!biome) return "Unknown";
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
    const player = this.myPlayer();
    if (!player) return "-";

    const size = this.mapSize();
    if (size <= 0) return "-";

    const firstBoundary = Math.max(1, Math.floor(size * 0.5));
    const secondBoundary = Math.max(firstBoundary + 1, Math.floor(size * 0.8));

    if (player.location.x < firstBoundary) return "I";
    if (player.location.x < secondBoundary) return "II";
    return "III";
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
        resources: [],
      },
      joinedAt: Timestamp.now(),
    };
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return fallback;
  }

  public async onCellClick(cell: MapGridPanelCell): Promise<void> {
    const myPlayer = this.myPlayer();
    if (!myPlayer || !this.isMyTurn() || this.isMoving()) return;
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

}
