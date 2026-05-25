import { Injectable, signal } from "@angular/core";
import { getAuth, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getBiomeResourcesMap } from "../consts/biome-resources";
import { PLAYER_STARTING_MONEY } from "../consts/player-defaults";
import { BiomeType, MapCell, SanctuaryElement } from "../models/MapCell";
import { Player } from "../models/Player";
import { ResourceLabel } from "../models/Resource";
import { SanctuaryTilesConfigEntry } from "../models/TilesConfig";
import { WorldState } from "../models/WorldState";
import { FirebaseService } from "./firebase-service";
import { TilesConfigService } from "./tiles-config-service";

@Injectable({
  providedIn: "root",
})
export class MapPageStateService {
  private readonly emptyBiomeResourcesMap: Record<BiomeType, ResourceLabel[]> = {
    plains: [],
    forest: [],
    mountain: [],
    water: [],
    desert: [],
    ruins: [],
  };

  private readonly defaultSanctuaryStylesByElement: Record<SanctuaryElement, SanctuaryTilesConfigEntry> = {
    water: {
      label: "Water Sanctuary",
      iconUrl: "/map-icons/shrine-water-tile-icon.svg",
      backgroundColor: "#2e4c66",
      iconColor: "#1a3348",
    },
    fire: {
      label: "Fire Sanctuary",
      iconUrl: "/map-icons/shrine-fire-tile-icon.svg",
      backgroundColor: "#7a4736",
      iconColor: "#4c281f",
    },
    wind: {
      label: "Wind Sanctuary",
      iconUrl: "/map-icons/shrine-wind-tile-icon.svg",
      backgroundColor: "#556e78",
      iconColor: "#34434a",
    },
    earth: {
      label: "Earth Sanctuary",
      iconUrl: "/map-icons/shrine-earth-tile-icon.svg",
      backgroundColor: "#6b6651",
      iconColor: "#474230",
    },
  };

  public mapSize = signal(10);
  public currentUserId = signal(getAuth().currentUser?.uid ?? "");
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});
  public biomeResourcesByBiome = signal<Record<BiomeType, ResourceLabel[]>>(this.emptyBiomeResourcesMap);
  public sanctuaryStylesByElement = signal<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>(this.defaultSanctuaryStylesByElement);

  private unsubscribers: Unsubscribe[] = [];
  private inventoryBackfillRequested = new Set<string>();
  private activeGameId: string | null = null;

  constructor(
    private firebaseService: FirebaseService,
    private tilesConfigService: TilesConfigService,
  ) { }

  public init(gameId: string): void {
    if (!gameId) return;
    if (this.activeGameId === gameId && this.unsubscribers.length > 0) return;

    this.destroy();
    this.activeGameId = gameId;

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

    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playersRef = collection(this.firebaseService.database, "games", gameId, "players");
    const mapCellsRef = collection(this.firebaseService.database, "games", gameId, "mapCells");

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
              money: PLAYER_STARTING_MONEY,
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
            const legacyPlayerRef = doc(this.firebaseService.database, "games", gameId, "players", rawPlayer.id);
            void setDoc(legacyPlayerRef, {
              level: typeof rawPlayer.level === "number" ? rawPlayer.level : 1,
              inventory: {
                items: rawPlayer.inventory?.items ?? [],
                resources: rawPlayer.inventory?.resources ?? [],
                money: typeof rawPlayer.inventory?.money === "number" ? rawPlayer.inventory.money : PLAYER_STARTING_MONEY,
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

  public destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.activeGameId = null;
    this.inventoryBackfillRequested.clear();
  }

  private async loadBiomeResourcesConfig(): Promise<void> {
    try {
      const config = await this.tilesConfigService.loadConfig();
      this.biomeResourcesByBiome.set(getBiomeResourcesMap(config));
      this.sanctuaryStylesByElement.set(config.specialTiles.sanctuaries);
    } catch (error) {
      console.error(error);
      this.biomeResourcesByBiome.set(this.emptyBiomeResourcesMap);
      this.sanctuaryStylesByElement.set(this.defaultSanctuaryStylesByElement);
    }
  }
}