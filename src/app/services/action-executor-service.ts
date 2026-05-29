import { Injectable } from "@angular/core";
import { doc, getDoc, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { GameMap } from "../models/GameMap";
import { MapCell, SanctuaryElement } from "../models/MapCell";
import { Player, PlayerStatus } from "../models/Player";
import { ResourceLabel, ResourceStack } from "../models/Resource";
import { WorldState } from "../models/WorldState";
import { EventLogService } from "./event-log-service";
import { FirebaseService } from "./firebase-service";
import { LuckService } from "./luck-service";
import { PlayerProgressionService } from "./player-progression-service";
import { PlayerStatsModifierService } from "./player-stats-modifier-service";
import { PlayerTurnEffectsService } from "./player-turn-effects-service";
import { SafePlaceFastTravelService } from "./safe-place-fast-travel-service";
import { TilesConfigService } from "./tiles-config-service";
import { TurnService } from "./turn-service";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { WorldZonesService } from "./world-zones-service";
import { getDoctorCostPerUnit, SafePlaceDoctorActionId } from "../consts/safe-place-actions";

@Injectable({
  providedIn: "root",
})
export class ActionExecutorService {
  private readonly sanctuaryDonationCost = 5;

  constructor(
    private firebaseService: FirebaseService,
    private turnService: TurnService,
    private eventLogService: EventLogService,
    private playerProgressionService: PlayerProgressionService,
    private luckService: LuckService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private playerTurnEffectsService: PlayerTurnEffectsService,
    private safePlaceFastTravelService: SafePlaceFastTravelService,
    private tilesConfigService: TilesConfigService,
    private worldZonesService: WorldZonesService,
  ) { }

  public async endTurn(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const tilesConfig = await this.tilesConfigService.loadConfig();
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let hostileDamage: {
      biome: string;
      damageHp: number;
      environmentSize: number;
    } | null = null;

    let regeneratingWaters: {
      biome: string;
      healingHp: number;
      environmentSize: number;
    } | null = null;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap, gameMapSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
        transaction.get(gameMapRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      const player = playerSnap.data() as Player;
      const mapSize = gameMapSnap.exists() ? ((gameMapSnap.data() as GameMap).size ?? 10) : 10;

      if (player.pendingResourcePickup) {
        throw new Error("Resolve pending resource pickup before ending your turn");
      }

      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
      const movedOnCurrentTurn = movedThisTurnByPlayer[actor.id] === worldState.currentTurn;
      if (!movedOnCurrentTurn) {
        throw new Error("You must move before ending your turn");
      }

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      const currentCell = mapCellSnap.exists() ? (mapCellSnap.data() as MapCell) : null;

      const currentStatuses = this.normalizeStatuses(player.statuses);
      const hasNutrition = this.hasStatus(currentStatuses, "nutrition");
      const nextStatuses = this.decrementStatuses(currentStatuses);

      let nextHpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current)));
      if (currentCell && currentCell.isSpecial !== true) {
        const biomeConfig = tilesConfig.biomes[currentCell.biome];
        const isHostileEnvironment = (biomeConfig?.conditions ?? []).includes("hostile-environment");
        const isRegeneratingWaters = (biomeConfig?.conditions ?? []).includes("regenerating-waters");
        const environmentSize = await this.computeConnectedBiomeSize(transaction, gameId, currentCell, mapSize);

        if (isHostileEnvironment && !hasNutrition) {
          const hpMax = Math.max(
            1,
            Math.floor(Number(
              typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base,
            )),
          );
          const damageRatio = 0.03 * Math.max(1, environmentSize);
          const damageHp = Math.max(1, Math.floor(hpMax * damageRatio));
          nextHpCurrent = Math.max(0, nextHpCurrent - damageHp);
          hostileDamage = {
            biome: currentCell.biome,
            damageHp,
            environmentSize: Math.max(1, environmentSize),
          };
        }

        if (isRegeneratingWaters) {
          const hpMax = Math.max(
            1,
            Math.floor(Number(
              typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base,
            )),
          );
          const healingRatio = Math.min(0.15, 0.03 * Math.max(1, environmentSize));
          const healingHp = Math.max(1, Math.floor(hpMax * healingRatio));
          nextHpCurrent = Math.min(hpMax, nextHpCurrent + healingHp);
          regeneratingWaters = {
            biome: currentCell.biome,
            healingHp,
            environmentSize: Math.max(1, environmentSize),
          };
        }
      }

      transaction.set(playerRef, {
        statuses: nextStatuses,
        parameters: {
          ...player.parameters,
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
      }, { merge: true });

      const nextWorldState: WorldState = {
        ...worldState,
      };

      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    const hostileDamageLog = hostileDamage as {
      biome: string;
      damageHp: number;
      environmentSize: number;
    } | null;

    if (hostileDamageLog) {
      await this.tryCreateLog(gameId, actor, "player.hostileEnvironmentDamage", {
        biome: hostileDamageLog.biome,
        damageHp: hostileDamageLog.damageHp,
        environmentSize: hostileDamageLog.environmentSize,
      });
    }

    const regeneratingWatersLog = regeneratingWaters as {
      biome: string;
      healingHp: number;
      environmentSize: number;
    } | null;
    if (regeneratingWatersLog) {
      await this.tryCreateLog(gameId, actor, "player.regeneratingWatersHealing", {
        biome: regeneratingWatersLog.biome,
        healingHp: regeneratingWatersLog.healingHp,
        environmentSize: regeneratingWatersLog.environmentSize,
      });
    }

    await this.tryCreateLog(gameId, actor, "player.endTurn", {
      turn: "completed",
    });
  }

  public async activateSanctuary(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let sanctuaryElement: SanctuaryElement | null = null;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap, gameMapSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
        transaction.get(gameMapRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      const gameMap = gameMapSnap.exists() ? gameMapSnap.data() as GameMap : null;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using cell actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "activate-sanctuary", worldTurn, "You can only activate a sanctuary once per turn.");
      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (mapCell.isSpecial !== true || mapCell.specialType !== "sanctuary") {
        throw new Error("You must be on a sanctuary to use this action");
      }

      if (mapCell.active === true) {
        throw new Error("This sanctuary is already active");
      }

      if (!mapCell.sanctuaryElement) {
        throw new Error("Sanctuary element is missing");
      }

      sanctuaryElement = mapCell.sanctuaryElement;
      const currentMoney = typeof player.inventory?.money === "number" ? player.inventory.money : 0;
      if (currentMoney < this.sanctuaryDonationCost) {
        throw new Error("You need 5 coins to activate the sanctuary");
      }

      transaction.set(mapCellRef, {
        active: true,
      }, { merge: true });

      const mapSize = gameMap?.size ?? 10;
      const quadrant = this.worldZonesService.getQuadrantIdByCoordinate(
        player.location.x,
        player.location.y,
        mapSize,
      );
      transaction.set(worldStateRef, {
        sanctuaryInfluenceByQuadrant: {
          ...(worldState.sanctuaryInfluenceByQuadrant ?? {}),
          [quadrant]: mapCell.sanctuaryElement,
        },
      }, { merge: true });

      transaction.set(playerRef, {
        attunedElement: mapCell.sanctuaryElement,
        inventory: {
          ...(player.inventory ?? { items: [], resources: [] }),
          money: currentMoney - this.sanctuaryDonationCost,
        },
        actionsUsedThisTurn: this.markActionUsed(player, "activate-sanctuary", worldTurn),
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, 2);

    await this.tryCreateLog(gameId, actor, "player.activateSanctuary", {
      sanctuary: sanctuaryElement,
      sanctuaryLabel: this.sanctuaryElementToLabel(sanctuaryElement ?? undefined),
      spentCoins: this.sanctuaryDonationCost,
      gainedExperience: 2,
    });
  }

  public async donateAtSanctuary(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let sanctuaryElement: SanctuaryElement | null = null;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using cell actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "donate-sanctuary", worldTurn, "You can only donate once per turn.");
      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (mapCell.isSpecial !== true || mapCell.specialType !== "sanctuary") {
        throw new Error("You must be on a sanctuary to use this action");
      }

      if (mapCell.active !== true) {
        throw new Error("You can donate only at an active sanctuary");
      }

      if (!mapCell.sanctuaryElement) {
        throw new Error("Sanctuary element is missing");
      }

      sanctuaryElement = mapCell.sanctuaryElement;
      if (!player.attunedElement || player.attunedElement === mapCell.sanctuaryElement) {
        throw new Error("Donation requires being attuned to a different element");
      }

      const currentMoney = typeof player.inventory?.money === "number" ? player.inventory.money : 0;
      if (currentMoney < this.sanctuaryDonationCost) {
        throw new Error("You need 5 coins to donate at the sanctuary");
      }

      transaction.set(playerRef, {
        attunedElement: mapCell.sanctuaryElement,
        inventory: {
          ...(player.inventory ?? { items: [], resources: [] }),
          money: currentMoney - this.sanctuaryDonationCost,
        },
        actionsUsedThisTurn: this.markActionUsed(player, "donate-sanctuary", worldTurn),
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.donateSanctuary", {
      sanctuary: sanctuaryElement,
      sanctuaryLabel: this.sanctuaryElementToLabel(sanctuaryElement ?? undefined),
      spentCoins: this.sanctuaryDonationCost,
    });
  }

  public async prayAtSanctuary(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    const [playerSnap, worldStateSnap, gameMapSnap] = await Promise.all([
      getDoc(playerRef),
      getDoc(worldStateRef),
      getDoc(gameMapRef),
    ]);
    if (!playerSnap.exists()) {
      throw new Error("Player not found");
    }
    if (!worldStateSnap.exists()) {
      throw new Error("World state not found");
    }

    const playerForLuck = playerSnap.data() as Player;
    const mapSize = gameMapSnap.exists() ? ((gameMapSnap.data() as GameMap).size ?? 10) : 10;
    const mapCellRefForLuck = doc(
      this.firebaseService.database,
      "games",
      gameId,
      "mapCells",
      this.cellId(playerForLuck.location.x, playerForLuck.location.y),
    );
    const mapCellSnapForLuck = await getDoc(mapCellRefForLuck);
    const mapCellForLuck = mapCellSnapForLuck.exists() ? (mapCellSnapForLuck.data() as MapCell) : null;
    const playerLuck = this.playerStatsModifierService.computeEffectiveLuck({
      player: playerForLuck,
      currentCell: mapCellForLuck,
      worldState: worldStateSnap.data() as WorldState,
      mapSize,
    });
    const luckResult = this.luckService.checkLuck(playerLuck);
    const healRatio = luckResult.success ? 0.15 : 0.05;

    let sanctuaryElement: SanctuaryElement | null = null;
    let healedHp = 0;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerTxSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerTxSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using cell actions");

      const player = playerTxSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "pray-sanctuary", worldTurn, "You can only pray once per turn.");
      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (mapCell.isSpecial !== true || mapCell.specialType !== "sanctuary") {
        throw new Error("You must be on a sanctuary to use this action");
      }

      if (mapCell.active !== true) {
        throw new Error("You can pray only at an active sanctuary");
      }

      if (!mapCell.sanctuaryElement) {
        throw new Error("Sanctuary element is missing");
      }

      sanctuaryElement = mapCell.sanctuaryElement;
      if (!player.attunedElement || player.attunedElement !== mapCell.sanctuaryElement) {
        throw new Error("Prayer requires matching sanctuary attunement");
      }

      const hpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current)));
      const hpMax = Math.max(
        1,
        Math.floor(Number(
          typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base,
        )),
      );

      if (hpCurrent >= hpMax) {
        throw new Error("Your HP is already full");
      }

      healedHp = Math.max(1, Math.floor(hpMax * healRatio));
      const nextHpCurrent = Math.min(hpMax, hpCurrent + healedHp);
      healedHp = Math.max(0, nextHpCurrent - hpCurrent);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        lastLuckCheck: luckResult,
        actionsUsedThisTurn: this.markActionUsed(player, "pray-sanctuary", worldTurn),
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.praySanctuary", {
      sanctuary: sanctuaryElement,
      sanctuaryLabel: this.sanctuaryElementToLabel(sanctuaryElement ?? undefined),
      healedHp,
      lucky: luckResult.success,
      healRatio,
    });
  }

  public async cellGather(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const tilesConfig = await this.tilesConfigService.loadConfig();
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let gatheredResource: ResourceLabel | null = null;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerTxSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerTxSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before gathering");

      const player = playerTxSnap.data() as Player;
      if (player.pendingResourcePickup) {
        throw new Error("Resolve pending resource pickup before gathering");
      }

      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "cell-gather", worldTurn, "You can only gather once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (mapCell.isSpecial === true) {
        throw new Error("Gathering is available only on biome cells");
      }

      const biomeConfig = tilesConfig.biomes[mapCell.biome];
      if (!biomeConfig) {
        throw new Error("Biome configuration not found");
      }

      if (!(biomeConfig.actions ?? []).includes("cell-gather")) {
        throw new Error("This biome does not support gathering");
      }

      if (!Array.isArray(biomeConfig.resources) || biomeConfig.resources.length === 0) {
        throw new Error("No resources available on this biome");
      }

      const currentResources = player.inventory?.resources ?? [];
      const foodAmount = currentResources.find((resource) => resource.label === "food")?.quantity ?? 0;
      if (foodAmount < 1) {
        throw new Error("You need at least 1 food to gather");
      }

      gatheredResource = this.pickRandom(biomeConfig.resources);
      let nextResources = this.addResource(currentResources, "food", -1);
      nextResources = this.addResource(nextResources, gatheredResource, 1);

      const currentStatuses = this.normalizeStatuses(player.statuses);
      const nextStatuses = this.decrementStatuses(currentStatuses);
      const nextWorldState: WorldState = { ...worldState };
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "cell-gather", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.cellGather", {
      resource: gatheredResource,
      spentFood: 1,
      turnEnded: true,
    });
  }

  public async discardResource(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    resourceLabel: ResourceLabel,
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const player = playerSnap.data() as Player;
      const currentResources = player.inventory?.resources ?? [];
      const hasResource = currentResources.some((resource) => {
        return resource.label === resourceLabel && Math.max(0, Math.floor(Number(resource.quantity ?? 0))) > 0;
      });

      if (!hasResource) {
        throw new Error("Resource not available");
      }

      const nextResources = this.addResource(currentResources, resourceLabel, -1);
      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: this.getResourceCapacity(player),
        },
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.discardResource", {
      resource: resourceLabel,
      amount: 1,
    });
  }

  public async resolvePendingResourcePickup(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    options: {
      collect: boolean;
      discardResourceLabel?: ResourceLabel;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    let pendingResource: ResourceLabel | null = null;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const player = playerSnap.data() as Player;
      const pendingPickup = player.pendingResourcePickup ?? null;
      if (!pendingPickup) {
        throw new Error("No pending resource pickup to resolve");
      }

      pendingResource = pendingPickup.resource;
      if (!options.collect) {
        transaction.set(playerRef, {
          pendingResourcePickup: null,
        }, { merge: true });
        return;
      }

      let nextResources = [...(player.inventory?.resources ?? [])];
      if (options.discardResourceLabel) {
        const hasDiscardable = nextResources.some((resource) => {
          return resource.label === options.discardResourceLabel
            && Math.max(0, Math.floor(Number(resource.quantity ?? 0))) > 0;
        });

        if (!hasDiscardable) {
          throw new Error("Selected resource cannot be discarded");
        }

        nextResources = this.addResource(nextResources, options.discardResourceLabel, -1);
      }

      const capacity = this.getResourceCapacity(player);
      const totalAfterDiscard = this.getTotalResourceCount(nextResources);
      if (totalAfterDiscard >= capacity) {
        throw new Error("No free inventory slot for pending resource");
      }

      nextResources = this.addResource(nextResources, pendingPickup.resource, 1);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: capacity,
        },
        pendingResourcePickup: null,
      }, { merge: true });
    });

    if (!pendingResource) {
      return;
    }

    if (!options.collect) {
      await this.tryCreateLog(gameId, actor, "player.pendingPickupCancelled", {
        resource: pendingResource,
      });
      return;
    }

    if (options.discardResourceLabel) {
      await this.tryCreateLog(gameId, actor, "player.swapResource", {
        droppedResource: options.discardResourceLabel,
        gainedResource: pendingResource,
      });
      return;
    }

    await this.tryCreateLog(gameId, actor, "player.resolvePendingPickup", {
      resource: pendingResource,
    });
  }

  public async consumeRation(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const tilesConfig = await this.tilesConfigService.loadConfig();
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using cell actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "consume-ration", worldTurn, "You can only consume one ration per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (mapCell.isSpecial === true) {
        throw new Error("Rations can only be consumed on biome cells");
      }

      const biomeConfig = tilesConfig.biomes[mapCell.biome];
      if (!biomeConfig || !(biomeConfig.actions ?? []).includes("consume-ration")) {
        throw new Error("Ration can only be consumed in this biome");
      }

      const currentResources = player.inventory?.resources ?? [];
      const foodAmount = currentResources.find((resource) => resource.label === "food")?.quantity ?? 0;
      if (foodAmount < 1) {
        throw new Error("You need at least 1 food ration");
      }

      const nextResources = this.addResource(currentResources, "food", -1);
      const nextStatuses = this.upsertStatus(this.normalizeStatuses(player.statuses), {
        key: "nutrition",
        label: "Nutrition",
        description: "Prevents hostile desert damage for this turn.",
        durationTurns: 1,
      });

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "consume-ration", worldTurn),
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.consumeRation", {
      resource: "food",
      amount: 1,
      status: "nutrition",
      durationTurns: 1,
    });
  }

  public async healAtSafePlace(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      actionId: SafePlaceDoctorActionId;
      units: number;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const units = Math.max(0, Math.floor(Number(payload.units ?? 0)));
    if (!Number.isFinite(units) || units <= 0) {
      throw new Error("Invalid heal amount");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let healedHp = 0;
    let spentCoins = 0;
    let appliedUnits = 0;
    let actionTimeOfDay: "day" | "night" = "day";

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, payload.actionId, worldTurn, "You can only use this action once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      const expectedLandmarkId = payload.actionId === "capital-doctor" ? "capital" : "city";
      this.ensurePlayerOnLandmark(
        mapCell,
        expectedLandmarkId,
        payload.actionId === "capital-doctor"
          ? "You must be at Capital to use the Doctor"
          : "You must be at City to use the Healer",
      );

      const hp = this.getHpState(player);
      if (hp.missing <= 0) {
        throw new Error("Your HP is already full");
      }

      actionTimeOfDay = worldState.timeOfDay ?? "day";
      const costPerUnit = getDoctorCostPerUnit(payload.actionId, actionTimeOfDay);
      const maxUnitsByHp = Math.ceil(hp.missing / hp.healPerUnit);

      if (units > maxUnitsByHp) {
        throw new Error("Selected heal amount exceeds missing HP");
      }

      spentCoins = units * costPerUnit;
      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < spentCoins) {
        throw new Error("Not enough coins for selected heal amount");
      }

      healedHp = Math.min(hp.missing, units * hp.healPerUnit);
      const nextHpCurrent = Math.min(hp.max, hp.current + healedHp);
      healedHp = Math.max(0, nextHpCurrent - hp.current);
      appliedUnits = units;

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - spentCoins,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, payload.actionId, worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.safePlaceHeal", {
      actionId: payload.actionId,
      healedHp,
      spentCoins,
      units: appliedUnits,
      timeOfDay: actionTimeOfDay,
      turnEnded: true,
    });
  }

  public async capitalInn(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const innCost = 10;
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let healedHp = 0;
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      if ((worldState.timeOfDay ?? "day") === "night") {
        throw new Error("Inn is available only during daytime");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "capital-inn", worldTurn, "You can only rest at inn once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      this.ensurePlayerOnLandmark(mapCell, "capital", "You must be at Capital to use the Inn");

      const hp = this.getHpState(player);
      if (hp.missing <= 0) {
        throw new Error("Your HP is already full");
      }

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < innCost) {
        throw new Error("You need 10 coins to rest at inn");
      }

      const requestedHeal = Math.max(1, Math.floor(hp.max * 0.5));
      const nextHpCurrent = Math.min(hp.max, hp.current + requestedHeal);
      healedHp = Math.max(0, nextHpCurrent - hp.current);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - innCost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "capital-inn", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.capitalInn", {
      spentCoins: innCost,
      healedHp,
      turnEnded: true,
    });
  }

  public async fastTravelAtSafePlace(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      destinationX: number;
      destinationY: number;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const rawDestinationX = Number(payload.destinationX);
    const rawDestinationY = Number(payload.destinationY);
    if (!Number.isFinite(rawDestinationX) || !Number.isFinite(rawDestinationY)) {
      throw new Error("Invalid fast travel destination");
    }

    const destinationX = Math.max(0, Math.floor(rawDestinationX));
    const destinationY = Math.max(0, Math.floor(rawDestinationY));

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let travelCost = 0;
    let originName = "Safe place";
    let destinationName = "Safe place";

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "fast-travel", worldTurn, "You can only fast travel once per turn.");

      const originCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const destinationCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(destinationX, destinationY),
      );

      const [originCellSnap, destinationCellSnap] = await Promise.all([
        transaction.get(originCellRef),
        transaction.get(destinationCellRef),
      ]);

      if (!originCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      if (!destinationCellSnap.exists()) {
        throw new Error("Destination safe place has not been discovered yet");
      }

      const originCell = originCellSnap.data() as MapCell;
      const destinationCell = destinationCellSnap.data() as MapCell;

      if (!this.safePlaceFastTravelService.isSafePlaceCell(originCell)) {
        throw new Error("You must be at a safe place to use Fast Travel");
      }

      if (!this.safePlaceFastTravelService.isSafePlaceCell(destinationCell)) {
        throw new Error("Fast Travel destination must be a discovered safe place");
      }

      if (originCell.x === destinationCell.x && originCell.y === destinationCell.y) {
        throw new Error("Fast Travel destination must differ from your current safe place");
      }

      originName = this.safePlaceFastTravelService.getSafePlaceName(originCell);
      destinationName = this.safePlaceFastTravelService.getSafePlaceName(destinationCell);

      travelCost = this.safePlaceFastTravelService.calculateTravelCost(
        { x: originCell.x, y: originCell.y },
        { x: destinationCell.x, y: destinationCell.y },
      );

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < travelCost) {
        throw new Error("Not enough coins for selected fast travel route");
      }

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };

      this.playerTurnEffectsService.scheduleTeleport(nextWorldState, actor.id, {
        x: destinationCell.x,
        y: destinationCell.y,
      });
      this.playerTurnEffectsService.scheduleSkippedTurns(nextWorldState, actor.id, 1);
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - travelCost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "fast-travel", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.fastTravelBooked", {
      from: originName,
      to: destinationName,
      spentCoins: travelCost,
      skippedTurns: 1,
      turnEnded: true,
    });
  }

  public async waitAtSafePlace(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let placeName = "safe place";

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "safe-place-wait", worldTurn, "You can only wait once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      if (!this.safePlaceFastTravelService.isSafePlaceCell(mapCell)) {
        throw new Error("You must be at a safe place to use Wait");
      }

      placeName = this.safePlaceFastTravelService.getSafePlaceName(mapCell);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };

      this.playerTurnEffectsService.scheduleAutoMoveOnTurnStart(nextWorldState, actor.id);

      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "safe-place-wait", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.safePlaceWait", {
      place: placeName,
      simulatedMove: true,
      turnEnded: true,
    });
  }

  public async villageCraftsmanExchange(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      giveLabel: ResourceLabel;
      receiveLabel: ResourceLabel;
      amount: number;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    if (!this.isResourceLabel(payload.giveLabel) || !this.isResourceLabel(payload.receiveLabel)) {
      throw new Error("Invalid resource selection");
    }

    if (payload.giveLabel === payload.receiveLabel) {
      throw new Error("Exchange requires two different resources");
    }

    const amount = Math.max(0, Math.floor(Number(payload.amount ?? 0)));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid exchange amount");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "village-craftsman", worldTurn, "You can only trade once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      this.ensurePlayerOnLandmark(mapCell, "village", "You must be at Village to use the Craftsman");

      const currentResources = player.inventory?.resources ?? [];
      const currentGiveQuantity = currentResources.find((resource) => resource.label === payload.giveLabel)?.quantity ?? 0;
      if (Math.max(0, Math.floor(Number(currentGiveQuantity))) < amount) {
        throw new Error("Not enough resources to exchange");
      }

      let nextResources = this.addResource(currentResources, payload.giveLabel, -amount);
      nextResources = this.addResource(nextResources, payload.receiveLabel, amount);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "village-craftsman", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.villageCraftsmanExchange", {
      giveLabel: payload.giveLabel,
      receiveLabel: payload.receiveLabel,
      amount,
      turnEnded: true,
    });
  }

  public async campGatherer(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    await this.applyCampRewardAction(gameId, actor, {
      actionId: "camp-gatherer",
      rewards: [
        { label: "timber", quantity: 1 },
        { label: "minerals", quantity: 1 },
      ],
    });
  }

  public async campHunter(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    await this.applyCampRewardAction(gameId, actor, {
      actionId: "camp-hunter",
      rewards: [
        { label: "food", quantity: 1 },
        { label: "cloth", quantity: 1 },
      ],
    });
  }

  private async applyCampRewardAction(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    input: {
      actionId: "camp-gatherer" | "camp-hunter";
      rewards: Array<{ label: ResourceLabel; quantity: number }>;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) {
        throw new Error("You are not standing on a revealed cell");
      }

      const mapCell = mapCellSnap.data() as MapCell;
      this.ensurePlayerOnLandmark(mapCell, "camp", "You must be at Camp to use this action");

      const currentResources = player.inventory?.resources ?? [];
      const totalBefore = this.getTotalResourceCount(currentResources);
      const totalReward = input.rewards.reduce((sum, reward) => {
        return sum + Math.max(0, Math.floor(Number(reward.quantity ?? 0)));
      }, 0);
      const capacity = this.getResourceCapacity(player);

      if (totalBefore + totalReward > capacity) {
        throw new Error("Not enough inventory capacity for this reward");
      }

      let nextResources = [...currentResources];
      for (const reward of input.rewards) {
        nextResources = this.addResource(nextResources, reward.label, reward.quantity);
      }

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: capacity,
        },
        statuses: nextStatuses,
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.campReward", {
      actionId: input.actionId,
      rewards: input.rewards.map((reward) => `${reward.label}+${reward.quantity}`).join(", "),
      turnEnded: true,
    });
  }

  private applyTurnAdvanceAndDeferredEffects(
    transaction: Transaction,
    gameId: string,
    nextWorldState: WorldState,
  ): void {
    const turnAdvance = this.turnService.advanceTurn(nextWorldState);

    for (const arrival of turnAdvance.teleportArrivals) {
      const destinationX = Math.max(0, Math.floor(Number(arrival.destination.x ?? 0)));
      const destinationY = Math.max(0, Math.floor(Number(arrival.destination.y ?? 0)));
      const teleportedPlayerRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "players",
        arrival.playerId,
      );

      transaction.set(teleportedPlayerRef, {
        location: {
          x: destinationX,
          y: destinationY,
        },
      }, { merge: true });
    }
  }

  private async tryCreateLog(
    gameId: string,
    player: Pick<Player, "id" | "name">,
    code: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventLogService.newLog(gameId, player, code, args);
    } catch (error) {
      console.error("Unable to write action event log", error);
    }
  }

  private ensureActionAvailable(player: Player, actionId: string, worldTurn: number, message: string): void {
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    if (actionsUsed[actionId] === worldTurn) {
      throw new Error(message);
    }
  }

  private ensurePlayerMovedThisTurn(worldState: WorldState, playerId: string, message: string): void {
    const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
    const worldTurn = worldState.currentTurn ?? 0;
    if (movedThisTurnByPlayer[playerId] !== worldTurn) {
      throw new Error(message);
    }
  }

  private markActionUsed(player: Player, actionId: string, worldTurn: number): Record<string, number> {
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    return {
      ...actionsUsed,
      [actionId]: worldTurn,
    };
  }

  private normalizeStatuses(statuses: Player["statuses"]): PlayerStatus[] {
    if (!Array.isArray(statuses)) return [];
    return statuses
      .filter((status): status is PlayerStatus => {
        if (!status || typeof status !== "object") return false;
        if (typeof status.key !== "string" || !status.key.trim()) return false;
        if (typeof status.durationTurns !== "number") return false;
        return Number.isFinite(status.durationTurns) && status.durationTurns > 0;
      })
      .map((status) => ({
        key: status.key,
        label: status.label,
        description: status.description,
        durationTurns: Math.max(1, Math.floor(status.durationTurns)),
        effectKey: status.effectKey,
      }));
  }

  private hasStatus(statuses: PlayerStatus[], key: string): boolean {
    return statuses.some((status) => status.key === key && status.durationTurns > 0);
  }

  private getHpState(player: Player): {
    current: number;
    max: number;
    missing: number;
    healPerUnit: number;
  } {
    const current = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));
    const max = Math.max(
      1,
      Math.floor(Number(
        typeof player.parameters.hp.max === "number"
          ? player.parameters.hp.max
          : player.parameters.hp.base,
      )),
    );

    return {
      current,
      max,
      missing: Math.max(0, max - current),
      healPerUnit: Math.max(1, Math.floor(max * 0.05)),
    };
  }

  private ensurePlayerOnLandmark(mapCell: MapCell, landmarkId: string, errorMessage: string): void {
    if (mapCell.isSpecial !== true || mapCell.specialType !== "landmark" || mapCell.landmarkId !== landmarkId) {
      throw new Error(errorMessage);
    }
  }

  private decrementStatuses(statuses: PlayerStatus[]): PlayerStatus[] {
    return statuses
      .map((status) => ({
        ...status,
        durationTurns: Math.floor(status.durationTurns) - 1,
      }))
      .filter((status) => status.durationTurns > 0);
  }

  private upsertStatus(statuses: PlayerStatus[], nextStatus: PlayerStatus): PlayerStatus[] {
    const next = statuses.filter((status) => status.key !== nextStatus.key);
    next.push(nextStatus);
    return next;
  }

  private addResource(resources: ResourceStack[], label: ResourceLabel, delta: number): ResourceStack[] {
    const nextResources = resources.map((resource) => ({ ...resource }));
    const index = nextResources.findIndex((resource) => resource.label === label);

    if (index === -1) {
      if (delta <= 0) return nextResources;
      nextResources.push({ label, quantity: delta });
      return nextResources;
    }

    const nextQty = Math.max(0, Math.floor(Number(nextResources[index].quantity)) + delta);
    if (nextQty <= 0) {
      nextResources.splice(index, 1);
      return nextResources;
    }

    nextResources[index] = {
      ...nextResources[index],
      quantity: nextQty,
    };
    return nextResources;
  }

  private getTotalResourceCount(resources: ResourceStack[]): number {
    return resources.reduce((total, resource) => {
      return total + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }, 0);
  }

  private getResourceCapacity(player: Player): number {
    const configuredCapacity = player.inventory?.resourceCapacity;
    if (typeof configuredCapacity === "number" && Number.isFinite(configuredCapacity)) {
      return Math.max(1, Math.floor(configuredCapacity));
    }

    return DEFAULT_RESOURCE_INVENTORY_CAPACITY;
  }

  private pickRandom<T>(values: T[]): T {
    if (values.length === 0) {
      throw new Error("Cannot pick from empty array");
    }

    const index = Math.floor(Math.random() * values.length);
    return values[index];
  }

  private async computeConnectedBiomeSize(
    transaction: Transaction,
    gameId: string,
    startCell: MapCell,
    mapSize: number,
  ): Promise<number> {
    const safeSize = Math.max(1, Math.floor(mapSize));
    const queue: Array<{ x: number; y: number }> = [{ x: startCell.x, y: startCell.y }];
    const visited = new Set<string>();
    let size = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (current.x < 0 || current.y < 0 || current.x >= safeSize || current.y >= safeSize) {
        continue;
      }

      const id = this.cellId(current.x, current.y);
      if (visited.has(id)) continue;
      visited.add(id);

      const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", id);
      const cellSnap = await transaction.get(cellRef);
      if (!cellSnap.exists()) continue;

      const cell = cellSnap.data() as MapCell;
      if (cell.isSpecial === true || cell.biome !== startCell.biome) continue;

      size += 1;
      queue.push({ x: current.x + 1, y: current.y });
      queue.push({ x: current.x - 1, y: current.y });
      queue.push({ x: current.x, y: current.y + 1 });
      queue.push({ x: current.x, y: current.y - 1 });
    }

    return Math.max(1, size);
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

  private isResourceLabel(value: unknown): value is ResourceLabel {
    return value === "food" || value === "timber" || value === "minerals" || value === "cloth";
  }
}
