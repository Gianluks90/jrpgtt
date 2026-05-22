import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FirebaseService } from "../../services/firebase-service";
import { collection, doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { Player } from "../../models/Player";
import { WorldState } from "../../models/WorldState";
import { MapCell } from "../../models/MapCell";
import { MapService } from "../../services/map-service";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { BiomeEnvironment, EnvironmentService } from "../../services/environment-service";
import { IconButton } from "../../components/ui/icon-button/icon-button";
import { BreakpointService } from "../../services/breakpoint-service";
import { PlayerCard } from "../../components/ui/player-card/player-card";
import { WorldStatePanel } from "../../components/core/world-state-panel/world-state-panel";
import { MapGridPanel, type MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import { MapMobileControls } from "../../components/ui/map-mobile-controls/map-mobile-controls";

@Component({
  selector: "app-map-page",
  imports: [
    IconButton,
    PlayerCard,
    WorldStatePanel,
    MapGridPanel,
    MapMobileControls,
  ],
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
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});

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

        changes.forEach((change) => {
          if (change.type === "removed") {
            playersById.delete(change.doc.id);
            return;
          }

          const nextPlayer = {
            id: change.doc.id,
            ...change.doc.data(),
          } as Player;
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
