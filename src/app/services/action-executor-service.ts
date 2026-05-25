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
import { TilesConfigService } from "./tiles-config-service";
import { TurnService } from "./turn-service";

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
    private tilesConfigService: TilesConfigService,
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

        if (isHostileEnvironment && !hasNutrition) {
          const environmentSize = await this.computeConnectedBiomeSize(transaction, gameId, currentCell, mapSize);
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

      this.turnService.advanceTurn(nextWorldState);
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
      const quadrant = this.getQuadrantLabel(player.location.x, mapSize);
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
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) {
      throw new Error("Player not found");
    }

    const playerForLuck = playerSnap.data() as Player;
    const playerLuck = Math.max(0, Math.floor(Number(playerForLuck.parameters?.luck?.current ?? 0)));
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

    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) {
      throw new Error("Player not found");
    }

    const playerForLuck = playerSnap.data() as Player;
    const playerLuck = Math.max(0, Math.floor(Number(playerForLuck.parameters?.luck?.current ?? 0)));
    const luckResult = this.luckService.checkLuck(playerLuck);

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

      let nextResources = player.inventory?.resources ?? [];
      if (luckResult.success) {
        gatheredResource = this.pickRandom(biomeConfig.resources);
        nextResources = this.addResource(nextResources, gatheredResource, 1);
      }

      const currentStatuses = this.normalizeStatuses(player.statuses);
      const nextStatuses = this.decrementStatuses(currentStatuses);
      const nextWorldState: WorldState = { ...worldState };
      this.turnService.advanceTurn(nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
        },
        statuses: nextStatuses,
        lastLuckCheck: luckResult,
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
      lucky: luckResult.success,
      turnEnded: true,
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

  private getQuadrantLabel(x: number, mapSize: number): "I" | "II" | "III" {
    const size = Math.max(1, Math.floor(mapSize));
    const firstBoundary = Math.max(1, Math.floor(size * 0.5));
    const secondBoundary = Math.max(firstBoundary + 1, Math.floor(size * 0.8));

    if (x < firstBoundary) return "I";
    if (x < secondBoundary) return "II";
    return "III";
  }
}
