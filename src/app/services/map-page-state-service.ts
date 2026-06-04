import { computed, inject, Injectable, signal } from "@angular/core";
import { getAuth, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getBiomeResourcesMap } from "../consts/biome-resources";
import { PLAYER_STARTING_MONEY } from "../consts/player-defaults";
import { DEFAULT_ITEM_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { PlayerFollowerEntry } from "../models/Follower";
import { BiomeType, MapCell, SanctuaryElement } from "../models/MapCell";
import { InventoryItemEntry } from "../models/Inventory";
import { Player } from "../models/Player";
import { ResourceLabel } from "../models/Resource";
import { SanctuaryTilesConfigEntry, TilesConfig } from "../models/TilesConfig";
import { WorldState } from "../models/WorldState";
import { EventLog } from "../models/EventLog";
import { EVENT_LOG_CONFIG } from "../consts/logs/event-log-config";
import { EventLogService } from "./event-log-service";
import { ActionCatalogService } from "./action-catalog-service";
import { FollowerCatalogService } from "./follower-catalog-service";
import { FirebaseService } from "./firebase-service";
import { LandmarksConfigService } from "./landmarks-config-service";
import { TilesConfigService } from "./tiles-config-service";
import { BiomeConditionCatalogService } from "./biome-condition-catalog-service";
import { StatusCatalogService } from "./status-catalog-service";

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
      description: {
        active: "A great crystal slowly spins at the center of the sanctuary, radiating a refreshing blue light. The sanctuary is active.",
        inactive: "Suspended above a crystal-clear pool, a large white crystal hovers at the center of the sanctuary.",
      },
      iconUrl: "/map-icons/shrine-water-tile-icon.svg",
      backgroundColor: "#2e4c66",
      iconColor: "#1a3348",
      actions: {
        inactive: ["activate-sanctuary"],
        active: ["donate-sanctuary", "pray-sanctuary"],
      },
    },
    fire: {
      label: "Fire Sanctuary",
      description: {
        active: "A great crystal slowly spins at the center of the sanctuary, radiating an intense red light. The sanctuary is active.",
        inactive: "Suspended above a pool of blazing lava, a large white crystal hovers at the center of the sanctuary.",
      },
      iconUrl: "/map-icons/shrine-fire-tile-icon.svg",
      backgroundColor: "#7a4736",
      iconColor: "#4c281f",
      actions: {
        inactive: ["activate-sanctuary"],
        active: ["donate-sanctuary", "pray-sanctuary"],
      },
    },
    wind: {
      label: "Wind Sanctuary",
      description: {
        active: "A great crystal slowly spins at the center of the sanctuary, radiating a soothing violet light. The sanctuary is active.",
        inactive: "The sound of chimes hanging all around the sanctuary accompanies the sight of a large white crystal hovering at its center.",
      },
      iconUrl: "/map-icons/shrine-wind-tile-icon.svg",
      backgroundColor: "#556e78",
      iconColor: "#34434a",
      actions: {
        inactive: ["activate-sanctuary"],
        active: ["donate-sanctuary", "pray-sanctuary"],
      },
    },
    earth: {
      label: "Earth Sanctuary",
      description: {
        active: "A great crystal slowly spins at the center of the sanctuary, radiating a reassuring yellow light. The sanctuary is active.",
        inactive: "Framed by lush, thriving nature, a large white crystal hovers at the center of the sanctuary.",
      },
      iconUrl: "/map-icons/shrine-earth-tile-icon.svg",
      backgroundColor: "#6b6651",
      iconColor: "#474230",
      actions: {
        inactive: ["activate-sanctuary"],
        active: ["donate-sanctuary", "pray-sanctuary"],
      },
    },
  };

  public mapSize = signal(10);
  public currentUserId = signal(getAuth().currentUser?.uid ?? "");
  public players = signal<Player[]>([]);
  public worldState = signal<WorldState | null>(null);
  public mapCellsById = signal<Record<string, MapCell>>({});
  public eventLogs = signal<EventLog[]>([]);
  public tilesConfig = signal<TilesConfig | null>(null);
  public biomeResourcesByBiome = signal<Record<BiomeType, ResourceLabel[]>>(this.emptyBiomeResourcesMap);
  public sanctuaryStylesByElement = signal<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>(this.defaultSanctuaryStylesByElement);
  public latestEventLog = computed<EventLog | null>(() => this.eventLogs()[0] ?? null);
  public latestEventLogSummary = computed<string>(() => {
    const summary = this.buildLatestEventLogSummary(this.eventLogs(), this.players().length);
    return this.truncateFooterLog(summary);
  });

  private unsubscribers: Unsubscribe[] = [];
  private inventoryBackfillRequested = new Set<string>();
  private activeGameId: string | null = null;
  private eventLogService = inject(EventLogService);

  constructor(
    private firebaseService: FirebaseService,
    private tilesConfigService: TilesConfigService,
    private landmarksConfigService: LandmarksConfigService,
    private actionCatalogService: ActionCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private biomeConditionCatalogService: BiomeConditionCatalogService,
    private statusCatalogService: StatusCatalogService,
  ) { }

  public init(gameId: string): void {
    if (!gameId) return;
    if (this.activeGameId === gameId && this.unsubscribers.length > 0) return;

    this.destroy();
    this.activeGameId = gameId;

    void this.loadBiomeResourcesConfig();
    void this.loadLandmarksConfig();
    void this.loadActionCatalog();
    void this.loadFollowersCatalog();
    void this.loadBiomeConditionsCatalog();
    void this.loadStatusesCatalog();

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
            followers: this.normalizePlayerFollowers(rawPlayer.followers),
            actionsUsedThisTurn: rawPlayer.actionsUsedThisTurn ?? {},
            statuses: Array.isArray(rawPlayer.statuses) ? rawPlayer.statuses : [],
          } as Player;

          const normalizedItems = this.normalizeInventoryItems(rawPlayer.inventory?.items);
          const normalizedItemCapacity = typeof rawPlayer.inventory?.itemCapacity === "number"
            ? Math.max(1, Math.floor(rawPlayer.inventory.itemCapacity))
            : DEFAULT_ITEM_INVENTORY_CAPACITY;

          nextPlayer.inventory = {
            ...(nextPlayer.inventory ?? { items: [], resources: [], money: PLAYER_STARTING_MONEY }),
            items: normalizedItems,
            itemCapacity: normalizedItemCapacity,
          };


          if (
            rawPlayer.id === currentUserId &&
            (
              typeof rawPlayer.level !== "number" ||
              !rawPlayer.inventory ||
              typeof rawPlayer.inventory.money !== "number" ||
              typeof rawPlayer.inventory.itemCapacity !== "number" ||
              !Array.isArray(rawPlayer.followers)
            ) &&
            !this.inventoryBackfillRequested.has(rawPlayer.id)
          ) {
            this.inventoryBackfillRequested.add(rawPlayer.id);
            const legacyPlayerRef = doc(this.firebaseService.database, "games", gameId, "players", rawPlayer.id);
            void setDoc(legacyPlayerRef, {
              level: typeof rawPlayer.level === "number" ? rawPlayer.level : 1,
              followers: this.normalizePlayerFollowers(rawPlayer.followers),
              inventory: {
                items: normalizedItems,
                resources: rawPlayer.inventory?.resources ?? [],
                money: typeof rawPlayer.inventory?.money === "number" ? rawPlayer.inventory.money : PLAYER_STARTING_MONEY,
                itemCapacity: normalizedItemCapacity,
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

    this.unsubscribers.push(this.eventLogService.listenLogs(gameId, (logs) => {
      this.eventLogs.set(logs);
    }));
  }

  public destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.activeGameId = null;
    this.inventoryBackfillRequested.clear();
    this.eventLogs.set([]);
  }

  private async loadBiomeResourcesConfig(): Promise<void> {
    try {
      const config = await this.tilesConfigService.loadConfig();
      this.tilesConfig.set(config);
      this.biomeResourcesByBiome.set(getBiomeResourcesMap(config));
      this.sanctuaryStylesByElement.set(config.specialTiles.sanctuaries);
    } catch (error) {
      console.error(error);
      this.tilesConfig.set(null);
      this.biomeResourcesByBiome.set(this.emptyBiomeResourcesMap);
      this.sanctuaryStylesByElement.set(this.defaultSanctuaryStylesByElement);
    }
  }

  private async loadLandmarksConfig(): Promise<void> {
    try {
      await this.landmarksConfigService.loadConfig();
    } catch (error) {
      console.error(error);
    }
  }

  private async loadActionCatalog(): Promise<void> {
    try {
      await this.actionCatalogService.loadConfig();
    } catch (error) {
      console.error(error);
    }
  }

  private async loadFollowersCatalog(): Promise<void> {
    try {
      await this.followerCatalogService.loadConfig();
    } catch (error) {
      console.error(error);
    }
  }

  private async loadBiomeConditionsCatalog(): Promise<void> {
    try {
      await this.biomeConditionCatalogService.loadConfig();
    } catch (error) {
      console.error(error);
    }
  }

  private async loadStatusesCatalog(): Promise<void> {
    try {
      await this.statusCatalogService.loadConfig();
    } catch (error) {
      console.error(error);
    }
  }

  private buildLatestEventLogSummary(logs: EventLog[], playersCount: number): string {
    if (logs.length === 0) return EVENT_LOG_CONFIG.footer.emptyMessage;

    const latestLog = logs[0];
    if (playersCount <= 1) {
      return latestLog.message;
    }

    const latestAuthorId = latestLog.playerId;
    const latestAuthorName = latestLog.playerName?.trim() || "Unknown";

    const sameAuthorChain: EventLog[] = [];
    for (const log of logs) {
      if (log.playerId !== latestAuthorId) break;
      sameAuthorChain.push(log);
    }

    if (sameAuthorChain.length <= 1) {
      return latestLog.message;
    }

    const timeline = [...sameAuthorChain]
      .reverse()
      .map((log) => this.removePlayerPrefix(log.message, latestAuthorName))
      .filter((message) => message.length > 0);

    if (timeline.length === 0) return latestLog.message;
    return `${latestAuthorName}: ${timeline.join(EVENT_LOG_CONFIG.footer.chainSeparator)}`;
  }

  private removePlayerPrefix(message: string, playerName: string): string {
    const prefix = `${playerName} `;
    if (!message.startsWith(prefix)) return message;
    return message.slice(prefix.length);
  }

  private truncateFooterLog(text: string): string {
    if (text.length <= EVENT_LOG_CONFIG.footer.maxSummaryLength) return text;

    const maxPrefixLength = Math.max(0, EVENT_LOG_CONFIG.footer.maxSummaryLength - 3);
    return `${text.slice(0, maxPrefixLength).trimEnd()}...`;
  }
  private normalizeInventoryItems(rawItems: unknown): InventoryItemEntry[] {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const nextItems: InventoryItemEntry[] = [];
    rawItems.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        nextItems.push({ itemId: entry.trim() });
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

      nextItems.push({
        itemId: itemId.trim(),
        ...(typeof currentCharges === "number" ? { currentCharges } : {}),
      });
    });

    return nextItems;
  }

  private normalizePlayerFollowers(rawFollowers: unknown): PlayerFollowerEntry[] {
    if (!Array.isArray(rawFollowers)) {
      return [];
    }

    const nextFollowers: PlayerFollowerEntry[] = [];
    rawFollowers.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const followerId = (entry as { followerId?: unknown }).followerId;
      if (typeof followerId !== "string" || !followerId.trim()) {
        return;
      }

      const rawHpCurrent = Number((entry as { hpCurrent?: unknown }).hpCurrent);
      const hpCurrent = Number.isFinite(rawHpCurrent)
        ? Math.max(0, Math.floor(rawHpCurrent))
        : 0;

      const rawState = (entry as { state?: unknown }).state;
      const state = rawState === "discarded" ? "discarded" : "active";

      const rawDiscardReason = (entry as { discardReason?: unknown }).discardReason;
      const discardReason = rawDiscardReason === "dead"
        || rawDiscardReason === "released"
        || rawDiscardReason === "lost"
        || rawDiscardReason === "stolen"
        ? rawDiscardReason
        : undefined;

      const rawDiscardedAtTurn = Number((entry as { discardedAtTurn?: unknown }).discardedAtTurn);
      const discardedAtTurn = Number.isFinite(rawDiscardedAtTurn)
        ? Math.max(0, Math.floor(rawDiscardedAtTurn))
        : undefined;

      const rawNameOverride = (entry as { nameOverride?: unknown }).nameOverride;
      const nameOverride = typeof rawNameOverride === "string" && rawNameOverride.trim().length > 0
        ? rawNameOverride.trim()
        : undefined;

      const rawCategoryOverride = (entry as { categoryOverride?: unknown }).categoryOverride;
      const categoryOverride = typeof rawCategoryOverride === "string" && rawCategoryOverride.trim().length > 0
        ? rawCategoryOverride.trim().toLowerCase()
        : undefined;

      nextFollowers.push({
        followerId: followerId.trim(),
        hpCurrent,
        state,
        ...(discardReason ? { discardReason } : {}),
        ...(typeof discardedAtTurn === "number" ? { discardedAtTurn } : {}),
        ...(nameOverride ? { nameOverride } : {}),
        ...(categoryOverride ? { categoryOverride } : {}),
      });
    });

    return nextFollowers;
  }
}