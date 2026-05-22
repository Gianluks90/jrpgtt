import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { FirebaseService } from "../../services/firebase-service";
import { collection, doc, onSnapshot, query, type Unsubscribe } from "firebase/firestore";
import { CdkMenu, CdkMenuTrigger } from "@angular/cdk/menu";
import { Player } from "../../models/Player";
import { WorldState } from "../../models/WorldState";
import { BiomeType, MapCell } from "../../models/MapCell";
import { MapService } from "../../services/map-service";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { MapCellComponent } from "../../components/ui/map-cell/map-cell";
import { BiomeEnvironment, EdgeDirection, EnvironmentService } from "../../services/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { BreakpointService } from "../../services/breakpoint-service";
import { TextButton } from "../../components/ui/text-button/text-button";

interface GridCellViewModel {
  x: number;
  y: number;
  id: string;
  mapCell: MapCell | null;
  players: Player[];
  isSpecial: boolean;
}

@Component({
  selector: "app-map-page",
  imports: [MapCellComponent, IconButton, TextButton, CdkMenu, CdkMenuTrigger, NgTemplateOutlet],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firebaseService = inject(FirebaseService);
  private mapService = inject(MapService);
  private environmentService = inject(EnvironmentService);
  private breakpointService = inject(BreakpointService);
  private unsubscribers: Unsubscribe[] = [];

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = signal(10);
  public currentUserId = signal(getAuth().currentUser?.uid ?? "");
  public isMoving = signal(false);
  public isMobile = this.breakpointService.isMobile;
  public hoveredCellId = signal<string | null>(null);
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});
  public isWorldSidebarOpen = signal(false);
  public isRightSidebarOpen = signal(false);

  public biomeOrder: Array<keyof WorldState["placedBiomeCount"]> = [
    "plains",
    "forest",
    "mountain",
    "water",
    "desert",
    "ruins",
  ];

  public playersByCellId = computed<Record<string, Player[]>>(() => {
    const grouped: Record<string, Player[]> = {};
    for (const player of this.players()) {
      const id = this.cellId(player.location.x, player.location.y);
      const bucket = grouped[id] ?? [];
      bucket.push(player);
      grouped[id] = bucket;
    }
    return grouped;
  });

  public gridCells = computed<GridCellViewModel[]>(() => {
    const size = this.mapSize();
    const mapCells = this.mapCellsById();
    const playersByCell = this.playersByCellId();
    const cells: GridCellViewModel[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const id = this.cellId(x, y);
        cells.push({
          x,
          y,
          id,
          mapCell: mapCells[id] ?? null,
          players: playersByCell[id] ?? [],
          isSpecial: this.isSpecialCell(x, y),
        });
      }
    }

    return cells;
  });

  public biomeEnvironments = computed<BiomeEnvironment[]>(() => {
    return this.environmentService.getBiomeEnvironments(this.mapCellsById());
  });

  public environmentByCellId = computed<Record<string, string[]>>(() => {
    return this.environmentService.getEnvironmentByCellId(this.biomeEnvironments());
  });

  public hoveredEnvironmentCellIds = computed<Set<string>>(() => {
    const hoveredCellId = this.hoveredCellId();
    if (!hoveredCellId) return new Set<string>();

    const environment = this.environmentByCellId()[hoveredCellId];
    if (environment) return new Set<string>(environment);

    return new Set<string>([hoveredCellId]);
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

  public activePlayerName = computed<string>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return "-";

    const player = this.players().find((candidate) => candidate.id === activePlayerId);
    return player?.name?.trim() || activePlayerId.slice(0, 6);
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

  public myLocationBiome = computed<BiomeType | null>(() => {
    const player = this.myPlayer();
    if (!player) return null;

    const cellId = this.cellId(player.location.x, player.location.y);
    return this.mapCellsById()[cellId]?.biome ?? null;
  });

  public myLocationLabel = computed<string>(() => {
    const biome = this.myLocationBiome();
    if (!biome) return "Unknown";

    return this.biomeToLabel(biome);
  });

  public myLocationIsEnvironment = computed<boolean>(() => {
    const player = this.myPlayer();
    if (!player) return false;

    const cellId = this.cellId(player.location.x, player.location.y);
    return (this.environmentByCellId()[cellId]?.length ?? 0) >= 2;
  });

  public ngOnInit(): void {
    if (!this.gameId) return;

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

    this.unsubscribers.push(onSnapshot(query(playersRef), (snapshot) => {
      const data = snapshot.docs.map((playerDoc) => {
        return {
          id: playerDoc.id,
          ...playerDoc.data(),
        } as Player;
      });

      data.sort((a, b) => Number(b.isReady) - Number(a.isReady));
      this.players.set(data);
    }));

    this.unsubscribers.push(onSnapshot(query(mapCellsRef), (snapshot) => {
      const mapCells: Record<string, MapCell> = {};
      snapshot.docs.forEach((cellDoc) => {
        mapCells[cellDoc.id] = cellDoc.data() as MapCell;
      });
      this.mapCellsById.set(mapCells);
    }));
  }

  public ngOnDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  public onBackHome(): void {
    void this.router.navigate(["/home"]);
  }

  public onBackHomeFromMenu(trigger: CdkMenuTrigger): void {
    trigger.close();
    this.closeWorldSidebar();
    this.closeRightSidebar();
    this.onBackHome();
  }

  public openWorldSidebar(trigger?: CdkMenuTrigger): void {
    trigger?.close();
    this.isRightSidebarOpen.set(false);
    this.isWorldSidebarOpen.set(true);
  }

  public closeWorldSidebar(): void {
    this.isWorldSidebarOpen.set(false);
  }

  public openRightSidebar(trigger?: CdkMenuTrigger): void {
    trigger?.close();
    this.isWorldSidebarOpen.set(false);
    this.isRightSidebarOpen.set(true);
  }

  public closeRightSidebar(): void {
    this.isRightSidebarOpen.set(false);
  }

  public trackGridCell(_index: number, cell: GridCellViewModel): string {
    return cell.id;
  }

  public trackPlayer(_index: number, player: Player): string {
    return player.id;
  }

  public hpPercent(player: Player): number {
    const current = player.parameters.hp.current;
    const max = player.parameters.hp.max ?? player.parameters.hp.base;
    if (max <= 0) return 0;

    const raw = (current / max) * 100;
    return Math.max(0, Math.min(100, raw));
  }

  public isMovableCell(cell: GridCellViewModel): boolean {
    return this.movableCellIds().has(cell.id);
  }

  public onCellEnter(cell: GridCellViewModel): void {
    this.hoveredCellId.set(cell.id);
  }

  public onCellLeave(): void {
    this.hoveredCellId.set(null);
  }

  public isHoveredEnvironmentCell(cell: GridCellViewModel): boolean {
    return this.hoveredEnvironmentCellIds().has(cell.id);
  }

  public environmentBorderWidth(cell: GridCellViewModel, direction: EdgeDirection): string {
    return this.environmentService.getEnvironmentBorderWidth(cell.id, direction, this.hoveredEnvironmentCellIds());
  }

  public async onCellClick(cell: GridCellViewModel): Promise<void> {
    const myPlayer = this.myPlayer();
    if (!myPlayer || !this.isMyTurn() || this.isMoving()) return;
    if (!this.isMovableCell(cell)) return;

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

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

  private isSpecialCell(x: number, y: number): boolean {
    return (
      (x === 3 && y === 3) ||
      (x === 6 && y === 3) ||
      (x === 3 && y === 6) ||
      (x === 6 && y === 6)
    );
  }
}
