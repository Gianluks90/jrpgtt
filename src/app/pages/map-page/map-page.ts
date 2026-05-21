import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { TextButton } from "../../components/ui/text-button/text-button";
import { FirebaseService } from "../../services/firebase-service";
import { collection, doc, onSnapshot, query, type Unsubscribe } from "firebase/firestore";
import { Player } from "../../models/Player";
import { WorldState } from "../../models/WorldState";
import { MapCell } from "../../models/MapCell";
import { MapService } from "../../services/map-service";
import { getAuth } from "firebase/auth";

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
  imports: [TextButton],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.scss",
})
export class MapPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firebaseService = inject(FirebaseService);
  private mapService = inject(MapService);
  private unsubscribers: Unsubscribe[] = [];

  public gameId = this.route.snapshot.paramMap.get("gameId") ?? "";
  public mapSize = signal(10);
  public currentUserId = signal(getAuth().currentUser?.uid ?? "");
  public isMoving = signal(false);
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});

  public biomeOrder: Array<keyof WorldState["placedBiomeCount"]> = [
    "plains",
    "forest",
    "mountain",
    "water",
    "desert",
    "ruins",
  ];

  public gridCells = computed<GridCellViewModel[]>(() => {
    const size = this.mapSize();
    const mapCells = this.mapCellsById();
    const players = this.players();
    const cells: GridCellViewModel[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const id = this.cellId(x, y);
        cells.push({
          x,
          y,
          id,
          mapCell: mapCells[id] ?? null,
          players: players.filter((player) => player.location.x === x && player.location.y === y),
          isSpecial: this.isSpecialCell(x, y),
        });
      }
    }

    return cells;
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

  public movableCellIds = computed<Set<string>>(() => {
    const current = this.myPlayer();
    if (!current || !this.isMyTurn()) return new Set<string>();

    const candidates = [
      { x: current.location.x + 1, y: current.location.y },
      { x: current.location.x - 1, y: current.location.y },
      { x: current.location.x, y: current.location.y + 1 },
      { x: current.location.x, y: current.location.y - 1 },
    ];

    const size = this.mapSize();
    const validIds = candidates
      .filter((candidate) => candidate.x >= 0 && candidate.y >= 0 && candidate.x < size && candidate.y < size)
      .map((candidate) => this.cellId(candidate.x, candidate.y));

    return new Set(validIds);
  });

  public ngOnInit(): void {
    if (!this.gameId) return;

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

  private isSpecialCell(x: number, y: number): boolean {
    return (
      (x === 3 && y === 3) ||
      (x === 6 && y === 3) ||
      (x === 3 && y === 6) ||
      (x === 6 && y === 6)
    );
  }
}
