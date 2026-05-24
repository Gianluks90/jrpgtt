import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FirebaseService } from "../../services/firebase-service";
import { collection, doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { Player } from "../../models/Player";
import { WorldState } from "../../models/WorldState";
import { BiomeType, MapCell } from "../../models/MapCell";
import { ResourceLabel } from "../../models/Resource";
import { MapService } from "../../services/map-service";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { BiomeEnvironment, EnvironmentService } from "../../services/environment-service";
import { TilesConfigService } from "../../services/tiles-config-service";
import { getBiomeResourcesMap } from "../../consts/biome-resources";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { BreakpointService } from "../../services/breakpoint-service";
import { PlayerCard } from "../../components/ui/player-card/player-card";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { MapCellComponent } from "../../components/ui/map-cell/map-cell";
import { ResourceCounter } from "../../components/ui/resource-counter/resource-counter";
import { MoneyCounter } from "../../components/ui/money-counter/money-counter";
import { LuckIndicator } from "../../components/ui/luck-indicator/luck-indicator";
import { MapMobileControls } from "../../components/ui/map-mobile-controls/map-mobile-controls";

@Component({
  selector: "app-map-page",
  imports: [
    IconButton,
    PlayerCard,
    MapGridPanel,
    MapCellComponent,
    MapMobileControls,
    ResourceCounter,
    MoneyCounter,
    LuckIndicator,
  ],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private readonly totalSpecialCells = 4;
  private readonly emptyBiomeResourcesMap: Record<BiomeType, ResourceLabel[]> = {
    plains: [],
    forest: [],
    mountain: [],
    water: [],
    desert: [],
    ruins: [],
  };

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firebaseService = inject(FirebaseService);
  private mapService = inject(MapService);
  private environmentService = inject(EnvironmentService);
  private tilesConfigService = inject(TilesConfigService);
  private breakpointService = inject(BreakpointService);
  private unsubscribers: Unsubscribe[] = [];
  private inventoryBackfillRequested = new Set<string>();

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = signal(10);
  public currentUserId = signal(getAuth().currentUser?.uid ?? "");
  public isMoving = signal(false);
  public isMobile = this.breakpointService.isMobile;
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});
  public biomeResourcesByBiome = signal<Record<BiomeType, ResourceLabel[]>>(this.emptyBiomeResourcesMap);
  public biomeOrderLeft: BiomeType[] = ["plains", "forest", "mountain"];
  public biomeOrderRight: BiomeType[] = ["water", "desert", "ruins"];

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

  public discoveredTiles = computed<number>(() => {
    return Object.keys(this.mapCellsById()).length;
  });

  public totalTiles = computed<number>(() => {
    const size = this.mapSize();
    if (size <= 0) return 0;
    return size * size;
  });

  public discoveredTilesLabel = computed<string>(() => {
    const discovered = this.discoveredTiles();
    const total = this.totalTiles();
    if (total <= 0) return `${discovered}/0 (0%)`;

    const clampedDiscovered = Math.min(discovered, total);
    const percentage = Math.round((clampedDiscovered / total) * 100);
    return `${clampedDiscovered}/${total} (${percentage}%)`;
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

  public activePlayerLabel = computed<string>(() => {
    const active = this.activePlayer();
    if (active?.name?.trim()) return active.name.trim();

    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return "-";
    return activePlayerId.slice(0, 6);
  });

  public currentRound = computed<number>(() => {
    const turn = this.worldState()?.currentTurn ?? 0;
    const playersCount = this.players().length;

    if (turn <= 0 || playersCount <= 0) return 0;
    return Math.ceil(turn / playersCount);
  });

  public revealedSpecialCells = computed<number>(() => {
    const count = Object.values(this.mapCellsById()).filter((cell) => cell.isSpecial === true).length;
    return Math.min(count, this.totalSpecialCells);
  });

  public revealedSpecialCellsLabel = computed<string>(() => {
    return `${this.revealedSpecialCells()}/${this.totalSpecialCells}`;
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
    return this.currentCell()?.biome ?? null;
  });

  public currentCellBiomeLabel = computed<string>(() => {
    const biome = this.currentCellBiome();
    if (!biome) return "Unknown";
    return this.biomeToLabel(biome);
  });

  public currentCellResourcesLabel = computed<string>(() => {
    const biome = this.currentCellBiome();
    if (!biome) return "-";
    const resources = this.biomeResourcesByBiome()[biome] ?? [];
    if (resources.length === 0) return "None";
    return resources.map((resource) => this.resourceToLabel(resource)).join(", ");
  });

  public currentCellIsEnvironment = computed<boolean>(() => {
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

    void this.loadBiomeResourcesConfig();

    const auth = getAuth();
    if (typeof auth.authStateReady === "function") {
      void auth.authStateReady().then(() => {
        this.currentUserId.set(auth.currentUser?.uid ?? "");
      });
    }
    this.unsubscribers.push(onAuthStateChanged(auth, (user) => {
      this.currentUserId.set(user?.uid ?? "");
    }));

    const gameMapRef = doc(this.firebaseService.database, "games", this.gameId, "runtime", "gameMap");
    const worldStateRef = doc(this.firebaseService.database, "games", this.gameId, "runtime", "worldState");
    const playersRef = collection(this.firebaseService.database, "games", this.gameId, "players");
    const mapCellsRef = collection(this.firebaseService.database, "games", this.gameId, "mapCells");

    this.unsubscribers.push(onSnapshot(gameMapRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as { size?: number };
      this.mapSize.set(data.size ?? 10);
    }));

    this.unsubscribers.push(onSnapshot(worldStateRef, (snapshot) => {
      if (!snapshot.exists()) {
        this.worldState.set(null);
        return;
      }
      this.worldState.set(snapshot.data() as WorldState);
    }));

    this.unsubscribers.push(onSnapshot(playersRef, (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      this.players.update((previousPlayers) => {
        const playersById = new Map(previousPlayers.map((player) => [player.id, player]));
        const currentUserId = this.currentUserId();

        changes.forEach((change) => {
          if (change.type === "removed") {
            playersById.delete(change.doc.id);
            return;
          }

          const rawPlayer = {
            id: change.doc.id,
            ...change.doc.data(),
          } as Partial<Player> & { id: string };

          const nextPlayer = {
            ...rawPlayer,
            level: typeof rawPlayer.level === "number" ? rawPlayer.level : 1,
            inventory: rawPlayer.inventory ?? {
              items: [],
              resources: [],
              money: 0,
            },
          } as Player;

          if (
            rawPlayer.id === currentUserId &&
            (
              typeof rawPlayer.level !== "number" ||
              !rawPlayer.inventory ||
              typeof rawPlayer.inventory.money !== "number"
            ) &&
            !this.inventoryBackfillRequested.has(rawPlayer.id)
          ) {
            this.inventoryBackfillRequested.add(rawPlayer.id);
            const legacyPlayerRef = doc(this.firebaseService.database, "games", this.gameId, "players", rawPlayer.id);
            void setDoc(legacyPlayerRef, {
              level: typeof rawPlayer.level === "number" ? rawPlayer.level : 1,
              inventory: {
                items: rawPlayer.inventory?.items ?? [],
                resources: rawPlayer.inventory?.resources ?? [],
                money: typeof rawPlayer.inventory?.money === "number" ? rawPlayer.inventory.money : 0,
              },
            }, { merge: true }).catch((error) => {
              console.error(error);
              this.inventoryBackfillRequested.delete(rawPlayer.id);
            });
          }

          playersById.set(change.doc.id, nextPlayer);
        });

        const nextPlayers = Array.from(playersById.values());
        nextPlayers.sort((a, b) => Number(b.isReady) - Number(a.isReady));
        return nextPlayers;
      });
    }));

    this.unsubscribers.push(onSnapshot(mapCellsRef, (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      this.mapCellsById.update((previousCells) => {
        const nextCells: Record<string, MapCell> = { ...previousCells };

        changes.forEach((change) => {
          if (change.type === "removed") {
            delete nextCells[change.doc.id];
            return;
          }

          nextCells[change.doc.id] = change.doc.data() as MapCell;
        });

        return nextCells;
      });
    }));
  }

  public ngOnDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  public onBackHome(): void {
    void this.router.navigate(["/home"]);
  }

  public trackPlayer(_index: number, player: Player): string {
    return player.id;
  }

  private async loadBiomeResourcesConfig(): Promise<void> {
    try {
      const config = await this.tilesConfigService.loadConfig();
      this.biomeResourcesByBiome.set(getBiomeResourcesMap(config));
    } catch (error) {
      console.error(error);
      this.biomeResourcesByBiome.set(this.emptyBiomeResourcesMap);
    }
  }

  private resourceToLabel(resource: ResourceLabel): string {
    if (resource === "timber") return "Timber";
    if (resource === "food") return "Food";
    return "Minerals";
  }

  public biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
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
