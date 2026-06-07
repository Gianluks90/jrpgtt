import { Injectable } from "@angular/core";
import { collection, doc, getDoc, getDocs, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { GameMap } from "../models/GameMap";
import { MapCell, SanctuaryElement } from "../models/MapCell";
import { InventoryItemEntry } from "../models/Inventory";
import { PlayerFollowerEntry } from "../models/Follower";
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
import { DEFAULT_ITEM_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { WorldZonesService } from "./world-zones-service";
import { getDoctorCostPerUnit, SafePlaceDoctorActionId } from "../consts/safe-place-actions";
import { BiomeConditionCatalogService } from "./biome-condition-catalog-service";
import { EnchantressRewardsConfigService } from "./enchantress-rewards-config-service";
import { FollowerCatalogService } from "./follower-catalog-service";
import { ItemCatalogService } from "./item-catalog-service";
import { ItemOwnershipService } from "./item-ownership-service";
import { MerchantCatalogService } from "./merchant-catalog-service";
import { MerchantTradeOffersService } from "./merchant-trade-offers-service";
import { MysticRewardsConfigService } from "./mystic-rewards-config-service";
import { StatusCatalogService } from "./status-catalog-service";
import { ItemEffectCatalogService } from "./item-effect-catalog-service";
import { DiscardPileEntry } from "../models/DiscardPile";
import { GraveyardResurrectRewardsConfigService } from "./graveyard-resurrect-rewards-config-service";
import { WorldEventMapMutationService } from "./world-event-map-mutation-service";

export interface CapitalEnchantressOutcome {
  rewardId: string;
  rewardLabel: string;
  clampedLuckTotal: number;
  rolledTotal: number;
  pendingMagicReward: boolean;
  overflowLuckyStrikeCandidate: boolean;
}

export interface CityMysticOutcome {
  rewardId: string;
  rewardLabel: string;
  displayTotal: number;
  rolledTotal: number;
  alignment: Player["alignment"] | null;
  gainedExperience: number;
  grantedLevelUp: boolean;
}

export interface GraveyardResurrectOutcome {
  selectedFollowerId: string;
  rewardId: string;
  rewardLabel: string;
  displayTotal: number;
  rolledTotal: number;
  appliedOutcome: string;
}

export interface MerchantTradeOutcome {
  operation: "buy" | "sell";
  itemId: string;
  itemName: string;
  coinsDelta: number;
  turnEnded: boolean;
}

export interface MerchantCheckoutOperation {
  operation: "buy" | "sell";
  kind?: "item" | "follower";
  itemId: string;
  quantity: number;
}

export interface MerchantCheckoutLineOutcome {
  operation: "buy" | "sell";
  kind: "item" | "follower";
  itemId: string;
  itemName: string;
  quantity: number;
  unitCoinsDelta: number;
  totalCoinsDelta: number;
}

export interface MerchantCheckoutOutcome {
  lines: MerchantCheckoutLineOutcome[];
  netCoinsDelta: number;
  turnEnded: boolean;
}

@Injectable({
  providedIn: "root",
})
export class ActionExecutorService {
  private readonly sanctuaryDonationCost = 5;
  private readonly capitalEnchantressCost = 5;
  private readonly cityMysticCost = 5;
  private readonly followerBiomeHpPercentDelta = 0.05;
  private readonly poisonStatusKey = "poison";
  private readonly regenStatusKey = "regen";
  private readonly minifiedStatusKey = "minified";

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
    private biomeConditionCatalogService: BiomeConditionCatalogService,
    private enchantressRewardsConfigService: EnchantressRewardsConfigService,
    private followerCatalogService: FollowerCatalogService,
    private itemCatalogService: ItemCatalogService,
    private itemOwnershipService: ItemOwnershipService,
    private merchantCatalogService: MerchantCatalogService,
    private merchantTradeOffersService: MerchantTradeOffersService,
    private mysticRewardsConfigService: MysticRewardsConfigService,
    private graveyardResurrectRewardsConfigService: GraveyardResurrectRewardsConfigService,
    private statusCatalogService: StatusCatalogService,
    private itemEffectCatalogService: ItemEffectCatalogService,
    private worldZonesService: WorldZonesService,
    private worldEventMapMutationService: WorldEventMapMutationService,
  ) { }

  public async endTurn(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const [tilesConfig] = await Promise.all([
      this.tilesConfigService.loadConfig(),
      this.biomeConditionCatalogService.loadConfig(),
      this.statusCatalogService.loadConfig(),
      this.followerCatalogService.loadConfig(),
      this.itemCatalogService.loadConfig(),
      this.itemEffectCatalogService.loadConfig(),
    ]);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let biomeConditionLogs: Array<{
      code: string;
      args: Record<string, unknown>;
    }> = [];
    let endTurnItemLogs: Array<{
      textKey: string;
      textParams: Record<string, unknown>;
    }> = [];
    let biomeConditionExperienceGained = 0;

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
      const effectiveBiome = currentCell && currentCell.isSpecial !== true
        ? this.getEffectiveBiome(currentCell)
        : null;
      const normalizedItems = this.normalizeInventoryItems(player.inventory?.items);
      const normalizedFollowers = this.normalizeFollowers(player.followers);
      let nextFollowers = normalizedFollowers.map((entry) => ({ ...entry }));
      const pendingDiscardEntries: Array<Omit<DiscardPileEntry, "id" | "discardSeq" | "discardedAt">> = [];
      const itemTurnEffects = this.applyConfiguredItemTurnEffects(
        normalizedItems,
        effectiveBiome,
      );
      let nextInventoryItems = itemTurnEffects.items;
      let nextInventoryResources = Array.isArray(player.inventory?.resources)
        ? player.inventory.resources.map((resource) => ({ ...resource }))
        : [];
      endTurnItemLogs = [...itemTurnEffects.logs];

      const currentStatuses = this.normalizeStatuses(player.statuses);
      const statusSnapshot = this.buildStatusEffectsSnapshot(currentStatuses);
      const nextStatuses = this.decrementNormalizedStatuses(statusSnapshot.activeStatuses);

      const hpMax = Math.max(
        1,
        Math.floor(Number(
          typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base,
        )),
      );
      let nextHpCurrent = this.applyTurnEndHpPercentDelta(
        Math.max(0, Math.floor(Number(player.parameters.hp.current))),
        hpMax,
        statusSnapshot.turnEndHpPercentDelta,
        !statusSnapshot.disableHpRecovery,
      );
      if (currentCell && currentCell.isSpecial !== true && effectiveBiome) {
        const biomeConfig = tilesConfig.biomes[effectiveBiome];
        const biomeConditionIds = this.getEffectiveConditionIds(currentCell, biomeConfig?.conditions ?? []);

        if (biomeConditionIds.length > 0) {
          const environmentSize = await this.computeConnectedBiomeSize(transaction, gameId, currentCell, mapSize, effectiveBiome);
          const connectedEnvironmentSize = Math.max(1, environmentSize);
          for (const conditionId of biomeConditionIds) {
            const condition = this.biomeConditionCatalogService.getCondition(conditionId);
            const effect = condition?.effect;
            if (!effect) {
              continue;
            }

            if (effect.type === "experience-flat-on-turn-end") {
              const gainAmount = Math.max(0, Math.floor(Number(effect.flatAmount ?? 0)));
              if (gainAmount > 0) {
                biomeConditionExperienceGained += gainAmount;
                biomeConditionLogs.push({
                  code: condition.logCode ?? "player.biomeConditionGainExperience",
                  args: {
                    biome: effectiveBiome,
                    conditionId,
                    amount: gainAmount,
                    environmentSize: connectedEnvironmentSize,
                  },
                });
              }
              continue;
            }

            if (effect.blockedByStatusKey && this.hasStatus(statusSnapshot.activeStatuses, effect.blockedByStatusKey)) {
              continue;
            }

            if (typeof effect.basePercentPerConnectedCell !== "number" || !Number.isFinite(effect.basePercentPerConnectedCell)) {
              continue;
            }

            const rawRatio = effect.basePercentPerConnectedCell * connectedEnvironmentSize;
            const appliedRatio = typeof effect.maxPercent === "number"
              ? Math.min(effect.maxPercent, rawRatio)
              : rawRatio;
            const minDeltaHp = Math.max(1, Math.floor(Number(effect.minDeltaHp ?? 1)));
            const deltaHp = Math.max(minDeltaHp, Math.floor(hpMax * appliedRatio));

            if (effect.type === "hp-heal-percent-per-connected-cell" && statusSnapshot.disableHpRecovery) {
              continue;
            }

            if (effect.type === "hp-damage-percent-per-connected-cell") {
              if (itemTurnEffects.preventedBiomeConditionIds.has(conditionId)) {
                continue;
              }

              const previousHpCurrent = nextHpCurrent;
              nextHpCurrent = Math.max(0, nextHpCurrent - deltaHp);
              const damageHp = Math.max(0, previousHpCurrent - nextHpCurrent);
              if (damageHp <= 0) {
                continue;
              }

              biomeConditionLogs.push({
                code: condition.logCode ?? "player.biomeConditionDamage",
                args: {
                  biome: effectiveBiome,
                  conditionId,
                  damageHp,
                  environmentSize: connectedEnvironmentSize,
                },
              });

              nextFollowers = nextFollowers.map((allyEntry) => {
                if (allyEntry.state === "discarded") {
                  return allyEntry;
                }

                const allyHpCurrent = Math.max(0, Math.floor(Number(allyEntry.hpCurrent ?? 0)));
                if (allyHpCurrent <= 0) {
                  return allyEntry;
                }

                const allyDefinition = this.followerCatalogService.getCachedFollowerById(allyEntry.followerId);
                const allyMaxHp = Math.max(1, Math.floor(Number(allyDefinition?.maxHp ?? allyHpCurrent ?? 1)));
                const allyDeltaHp = Math.max(1, Math.floor(allyMaxHp * this.followerBiomeHpPercentDelta));
                const nextFollowerHpCurrent = Math.max(0, allyHpCurrent - allyDeltaHp);
                const allyDamageHp = Math.max(0, allyHpCurrent - nextFollowerHpCurrent);
                if (allyDamageHp <= 0) {
                  return allyEntry;
                }

                biomeConditionLogs.push({
                  code: "player.followerHostileEnvironmentDamage",
                  args: {
                    biome: effectiveBiome,
                    conditionId,
                    followerId: allyEntry.followerId,
                    followerName: allyDefinition?.name ?? allyEntry.followerId,
                    damageHp: allyDamageHp,
                    environmentSize: connectedEnvironmentSize,
                  },
                });

                if (nextFollowerHpCurrent <= 0) {
                  pendingDiscardEntries.push({
                    card: {
                      kind: "follower",
                      cardId: allyEntry.followerId,
                      name: allyDefinition?.name,
                    },
                    source: "world",
                    ownerPlayerId: actor.id,
                    turn: Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0))),
                    reason: "dead",
                  });

                  return {
                    ...allyEntry,
                    hpCurrent: 0,
                    state: "discarded",
                    discardReason: "dead",
                    discardedAtTurn: worldState.currentTurn,
                  };
                }

                return {
                  ...allyEntry,
                  hpCurrent: nextFollowerHpCurrent,
                };
              });
              continue;
            }

            const previousHpCurrent = nextHpCurrent;
            nextHpCurrent = Math.min(hpMax, nextHpCurrent + deltaHp);
            const healingHp = Math.max(0, nextHpCurrent - previousHpCurrent);
            if (healingHp > 0) {
              biomeConditionLogs.push({
                code: condition.logCode ?? "player.biomeConditionHealing",
                args: {
                  biome: effectiveBiome,
                  conditionId,
                  healingHp,
                  environmentSize: connectedEnvironmentSize,
                },
              });
            }

            nextFollowers = nextFollowers.map((allyEntry) => {
              if (allyEntry.state === "discarded") {
                return allyEntry;
              }

              const allyHpCurrent = Math.max(0, Math.floor(Number(allyEntry.hpCurrent ?? 0)));
              if (allyHpCurrent <= 0) {
                return allyEntry;
              }

              const allyDefinition = this.followerCatalogService.getCachedFollowerById(allyEntry.followerId);
              const allyCategory = String(allyEntry.categoryOverride ?? allyDefinition?.category ?? "").trim().toLowerCase();
              if (allyCategory === "undead") {
                return allyEntry;
              }

              const allyMaxHp = Math.max(1, Math.floor(Number(allyDefinition?.maxHp ?? allyHpCurrent ?? 1)));
              const allyDeltaHp = Math.max(1, Math.floor(allyMaxHp * this.followerBiomeHpPercentDelta));
              const nextFollowerHpCurrent = Math.min(allyMaxHp, allyHpCurrent + allyDeltaHp);
              const allyHealingHp = Math.max(0, nextFollowerHpCurrent - allyHpCurrent);
              if (allyHealingHp <= 0) {
                return allyEntry;
              }

              biomeConditionLogs.push({
                code: "player.followerRegeneratingWatersHealing",
                args: {
                  biome: effectiveBiome,
                  conditionId,
                  followerId: allyEntry.followerId,
                  followerName: allyDefinition?.name ?? allyEntry.followerId,
                  healingHp: allyHealingHp,
                  environmentSize: connectedEnvironmentSize,
                },
              });

              return {
                ...allyEntry,
                hpCurrent: nextFollowerHpCurrent,
              };
            });
          }
        }
      }

      const activeZombies = nextFollowers.filter((allyEntry) => {
        return allyEntry.followerId === "zombie"
          && allyEntry.state !== "discarded"
          && Math.max(0, Math.floor(Number(allyEntry.hpCurrent ?? 0))) > 0;
      }).length;

      if (activeZombies > 0) {
        const currentFood = Math.max(
          0,
          Math.floor(Number(nextInventoryResources.find((resource) => resource.label === "food")?.quantity ?? 0)),
        );
        const consumedFood = Math.min(currentFood, activeZombies);
        const missingFood = Math.max(0, activeZombies - consumedFood);

        if (consumedFood > 0) {
          nextInventoryResources = this.addResource(nextInventoryResources, "food", -consumedFood);
          endTurnItemLogs.push({
            textKey: "logs.system.zombieConsumedFood",
            textParams: {
              consumedFood,
            },
          });
        }

        if (missingFood > 0) {
          nextHpCurrent = Math.max(0, nextHpCurrent - missingFood);
          endTurnItemLogs.push({
            textKey: "logs.system.zombieUpkeepMissingFood",
            textParams: {
              missingFood,
            },
          });
        }
      }

      const activeFollowersById = new Set(
        normalizedFollowers
          .filter((entry) => entry.state !== "discarded" && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0)
          .map((entry) => entry.followerId),
      );
      const alliesJustDiscardedAsDead = new Set(
        nextFollowers
          .filter((entry) => {
            if (entry.state !== "discarded" || entry.discardReason !== "dead") {
              return false;
            }

            return activeFollowersById.has(entry.followerId);
          })
          .map((entry) => entry.followerId),
      );

      const hasLostCapacityFollower = Array.from(alliesJustDiscardedAsDead).some((followerId) => {
        const allyDefinition = this.followerCatalogService.getCachedFollowerById(followerId);
        const itemCapacityBonus = Number(allyDefinition?.itemCapacityBonus ?? 0);
        return Number.isFinite(itemCapacityBonus) && Math.max(0, Math.floor(itemCapacityBonus)) > 0;
      });

      if (hasLostCapacityFollower) {
        const baseItemCapacity = this.getItemCapacity(player);
        if (nextInventoryItems.length > baseItemCapacity) {
          const overflowItems = nextInventoryItems.slice(baseItemCapacity);
          nextInventoryItems = nextInventoryItems.slice(0, baseItemCapacity);
          const overflowBatchId = `capacity-overflow:${actor.id}:${Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)))}`;

          overflowItems.forEach((entry) => {
            const itemDefinition = this.itemCatalogService.getCachedItemById(entry.itemId);
            pendingDiscardEntries.push({
              card: {
                kind: "item",
                cardId: entry.itemId,
                name: itemDefinition?.name,
                payload: typeof entry.currentCharges === "number"
                  ? { currentCharges: Math.max(0, Math.floor(entry.currentCharges)) }
                  : undefined,
              },
              source: "player",
              ownerPlayerId: actor.id,
              turn: Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0))),
              batchId: overflowBatchId,
            });
          });

          endTurnItemLogs.push({
            textKey: "logs.system.inventoryOverflowDiscarded",
            textParams: {
              discardedItemsCount: overflowItems.length,
            },
          });
        }
      }

      const nextWorldState: WorldState = {
        ...worldState,
      };

      if (pendingDiscardEntries.length > 0) {
        let nextDiscardSeq = Math.max(0, Math.floor(Number(worldState.nextDiscardSeq ?? 0)));
        pendingDiscardEntries.forEach((entry) => {
          nextDiscardSeq += 1;
          const discardRef = doc(collection(worldStateRef, "discardPile"));
          transaction.set(discardRef, {
            ...entry,
            id: discardRef.id,
            discardSeq: nextDiscardSeq,
            discardedAt: Timestamp.now(),
          } as DiscardPileEntry);
        });

        nextWorldState.nextDiscardSeq = nextDiscardSeq;
      }

      if (statusSnapshot.maxSkipTurns > 0) {
        this.playerTurnEffectsService.scheduleSkippedTurnsMax(nextWorldState, actor.id, statusSnapshot.maxSkipTurns);
      }

      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState, {
        [actor.id]: player,
      });
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      const nextPlayerPatch: Partial<Player> = {};
      if (!this.areStatusesEquivalent(player.statuses, nextStatuses)) {
        nextPlayerPatch.statuses = nextStatuses;
      }

      const currentMp = Math.max(0, Math.floor(Number(player.parameters.mp.current ?? 0)));
      const currentHp = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));
      if (currentMp !== nextMpCurrent || currentHp !== nextHpCurrent) {
        nextPlayerPatch.parameters = {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        };
      }

      const inventoryItemsChanged = !this.areInventoryItemsEquivalent(normalizedItems, nextInventoryItems);
      const inventoryResourcesChanged = !this.areResourcesEquivalent(player.inventory?.resources ?? [], nextInventoryResources);
      if (inventoryItemsChanged || inventoryResourcesChanged) {
        nextPlayerPatch.inventory = {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: nextInventoryItems,
          resources: nextInventoryResources,
        };
      }

      if (!this.areFollowersEquivalent(normalizedFollowers, nextFollowers)) {
        nextPlayerPatch.followers = nextFollowers;
      }

      if (Object.keys(nextPlayerPatch).length > 0) {
        transaction.set(playerRef, nextPlayerPatch, { merge: true });
      }

      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    for (const conditionLog of biomeConditionLogs) {
      await this.tryCreateLog(gameId, actor, conditionLog.code, conditionLog.args);
    }

    for (const entry of endTurnItemLogs) {
      await this.tryCreateLog(gameId, actor, "system.info", {
        textKey: entry.textKey,
        textParams: {
          playerName: actor.name,
          ...entry.textParams,
        },
      });
    }

    if (biomeConditionExperienceGained > 0) {
      await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, biomeConditionExperienceGained);
      await this.tryCreateLog(gameId, actor, "player.gainExperience", {
        amount: biomeConditionExperienceGained,
        source: "biome-condition",
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
    const luckyPrayerThreshold = 100;
    const minimumPrayerThreshold = (
      playerForLuck.attunedElement
      && mapCellForLuck?.sanctuaryElement
      && playerForLuck.attunedElement === mapCellForLuck.sanctuaryElement
    )
      ? 40
      : 50;
    const luckResult = this.luckService.checkLuck(
      playerLuck * this.resolveLuckBonusMultiplier(playerForLuck.statuses),
      { successThreshold: minimumPrayerThreshold },
    );
    const luckyPrayer = luckResult.total >= luckyPrayerThreshold;
    const healRatio = luckyPrayer ? 0.10 : (luckResult.success ? 0.05 : 0);

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
      const currentStatuses = this.normalizeStatuses(player.statuses);
      const statusSnapshot = this.buildStatusEffectsSnapshot(currentStatuses);
      if (statusSnapshot.disableHpRecovery) {
        throw new Error("Recovery is disabled by your current status");
      }
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

      let nextHpCurrent = hpCurrent;
      if (healRatio > 0) {
        healedHp = Math.max(1, Math.floor(hpMax * healRatio));
        nextHpCurrent = Math.min(hpMax, hpCurrent + healedHp);
        healedHp = Math.max(0, nextHpCurrent - hpCurrent);
      }

      const nextStatuses = this.decrementStatuses(currentStatuses);
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        statuses: nextStatuses,
        lastLuckCheck: luckResult,
        actionsUsedThisTurn: this.markActionUsed(player, "pray-sanctuary", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.praySanctuary", {
      sanctuary: sanctuaryElement,
      sanctuaryLabel: this.sanctuaryElementToLabel(sanctuaryElement ?? undefined),
      healedHp,
      lucky: luckyPrayer,
      minimumThreshold: minimumPrayerThreshold,
      healRatio,
      turnEnded: true,
    });
  }

  public async cellGather(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const [tilesConfig] = await Promise.all([
      this.tilesConfigService.loadConfig(),
      this.statusCatalogService.loadConfig(),
      this.biomeConditionCatalogService.loadConfig(),
    ]);
    const nutritionStatus = this.statusCatalogService.getStatus("nutrition");
    if (!nutritionStatus) {
      throw new Error("Missing status definition for 'nutrition'");
    }
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let gatheredResource: ResourceLabel | null = null;
    let gatheredQuantity = 0;
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

      const effectiveBiome = this.getEffectiveBiome(mapCell);
      const biomeConfig = tilesConfig.biomes[effectiveBiome];
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
      gatheredQuantity = this.resolveResourceGainQuantityForCell({
        mapCell,
        tilesConfig,
        resourceLabel: gatheredResource,
      });
      let nextResources = this.addResource(currentResources, "food", -1);
      nextResources = this.addResource(nextResources, gatheredResource, gatheredQuantity);

      const currentStatuses = this.normalizeStatuses(player.statuses);
      const nextStatuses = this.decrementStatuses(currentStatuses);
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

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
      quantity: Math.max(1, Math.floor(gatheredQuantity || 1)),
      spentFood: 1,
      turnEnded: true,
    });
  }

  public async chopTree(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await Promise.all([
      this.tilesConfigService.loadConfig(),
      this.itemCatalogService.loadConfig(),
    ]);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

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
      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before chopping wood");

      const player = playerTxSnap.data() as Player;
      if (player.pendingResourcePickup) {
        throw new Error("Resolve pending resource pickup before chopping wood");
      }

      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "chop-tree", worldTurn, "You can only chop wood once per turn.");

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
      if (mapCell.isSpecial === true || this.getEffectiveBiome(mapCell) !== "forest") {
        throw new Error("You can chop wood only in forests");
      }

      const inventoryItems = this.normalizeInventoryItems(player.inventory?.items);
      const hasChopAction = inventoryItems.some((entry) => {
        const item = this.itemCatalogService.getCachedItemById(entry.itemId);
        return Array.isArray(item?.actions) && item.actions.includes("chop-tree");
      });
      if (!hasChopAction) {
        throw new Error("You need an axe to chop wood");
      }

      const currentResources = player.inventory?.resources ?? [];
      const nextResources = this.addResource(currentResources, "timber", 1);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "chop-tree", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.chopTree", {
      resource: "timber",
      quantity: 1,
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

    const [tilesConfig] = await Promise.all([
      this.tilesConfigService.loadConfig(),
      this.statusCatalogService.loadConfig(),
    ]);
    const nutritionStatus = this.statusCatalogService.getStatus("nutrition");
    if (!nutritionStatus) {
      throw new Error("Missing status definition for 'nutrition'");
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

      const effectiveBiome = this.getEffectiveBiome(mapCell);
      const biomeConfig = tilesConfig.biomes[effectiveBiome];
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
        key: nutritionStatus.key,
        label: nutritionStatus.label,
        description: nutritionStatus.description,
        durationTurns: nutritionStatus.defaultDurationTurns,
        ...(typeof nutritionStatus.effectKey === "string" && nutritionStatus.effectKey.trim().length > 0
          ? { effectKey: nutritionStatus.effectKey }
          : {}),
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
      status: nutritionStatus.key,
      durationTurns: nutritionStatus.defaultDurationTurns,
    });
  }

  public async feedHorse(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await this.followerCatalogService.loadConfig();

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

      const player = playerSnap.data() as Player;
      const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
      this.ensureActionAvailable(player, "feed-horse", worldTurn, "You can only feed your horse once per turn.");

      const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
      if (movedThisTurnByPlayer[actor.id] === worldTurn) {
        throw new Error("You must feed your horse before moving");
      }

      if (!this.hasActiveFollowerWithAction(player.followers, "feed-horse")) {
        throw new Error("You do not have an active follower that can be fed");
      }

      const currentResources = player.inventory?.resources ?? [];
      const foodAmount = currentResources.find((resource) => resource.label === "food")?.quantity ?? 0;
      if (foodAmount < 1) {
        throw new Error("You need at least 1 food to feed your horse");
      }

      const nextResources = this.addResource(currentResources, "food", -1);
      const currentBonusByPlayer = worldState.followerMovementBonusByPlayer ?? {};
      const previousBonus = currentBonusByPlayer[actor.id];
      const previousAmount = previousBonus?.turn === worldTurn
        ? Math.max(0, Math.floor(Number(previousBonus.amount ?? 0)))
        : 0;

      const nextBonusByPlayer = {
        ...currentBonusByPlayer,
        [actor.id]: {
          turn: worldTurn,
          amount: previousAmount + 1,
        },
      };

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          resources: nextResources,
        },
        actionsUsedThisTurn: this.markActionUsed(player, "feed-horse", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, {
        followerMovementBonusByPlayer: nextBonusByPlayer,
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "system.info", {
      textKey: "logs.system.feedHorse",
      textParams: {
        playerName: actor.name,
      },
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
      const statusSnapshot = this.buildStatusEffectsSnapshot(this.normalizeStatuses(player.statuses));
      if (statusSnapshot.disableHpRecovery) {
        throw new Error("Recovery is disabled by your current status");
      }
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
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
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
    await this.landmarkRest(gameId, actor, {
      actionId: "capital-inn",
    });
  }

  public async landmarkRest(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      actionId: string;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const restConfigByActionId: Record<string, {
      landmarkId: string;
      dayOnly: boolean;
      cost: number;
      logCode: string;
      invalidTimeMessage: string;
      landmarkMessage: string;
      notEnoughCoinsMessage: string;
      actionAlreadyUsedMessage: string;
    }> = {
      "capital-inn": {
        landmarkId: "capital",
        dayOnly: true,
        cost: 10,
        logCode: "player.capitalInn",
        invalidTimeMessage: "Inn is available only during daytime",
        landmarkMessage: "You must be at Capital to use the Inn",
        notEnoughCoinsMessage: "You need 10 coins to rest at inn",
        actionAlreadyUsedMessage: "You can only rest at inn once per turn.",
      },
      "castle-rest": {
        landmarkId: "castle",
        dayOnly: false,
        cost: 10,
        logCode: "player.capitalInn",
        invalidTimeMessage: "Castle rest is not available now",
        landmarkMessage: "You must be at Castle to use Rest",
        notEnoughCoinsMessage: "You need 10 coins to rest at castle",
        actionAlreadyUsedMessage: "You can only rest at castle once per turn.",
      },
    };

    const actionId = String(payload.actionId ?? "").trim();
    const restConfig = restConfigByActionId[actionId];
    if (!restConfig) {
      throw new Error(`Unsupported rest action '${actionId}'`);
    }

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

      if (restConfig.dayOnly && (worldState.timeOfDay ?? "day") === "night") {
        throw new Error(restConfig.invalidTimeMessage);
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const statusSnapshot = this.buildStatusEffectsSnapshot(this.normalizeStatuses(player.statuses));
      if (statusSnapshot.disableHpRecovery) {
        throw new Error("Recovery is disabled by your current status");
      }
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, actionId, worldTurn, restConfig.actionAlreadyUsedMessage);

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
      this.ensurePlayerOnLandmark(mapCell, restConfig.landmarkId, restConfig.landmarkMessage);

      const hp = this.getHpState(player);
      if (hp.missing <= 0) {
        throw new Error("Your HP is already full");
      }

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < restConfig.cost) {
        throw new Error(restConfig.notEnoughCoinsMessage);
      }

      const requestedHeal = Math.max(1, Math.floor(hp.max * 0.5));
      const nextHpCurrent = Math.min(hp.max, hp.current + requestedHeal);
      healedHp = Math.max(0, nextHpCurrent - hp.current);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - restConfig.cost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, actionId, worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, restConfig.logCode, {
      actionId,
      spentCoins: restConfig.cost,
      healedHp,
      turnEnded: true,
    });
  }

  public async landmarkTrainer(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      actionId: string;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const trainerConfigByActionId: Record<string, {
      landmarkId: string;
      parameter: "strength" | "magic";
      actionUsedMessage: string;
      landmarkMessage: string;
      notEnoughCoinsMessage: string;
    }> = {
      "castle-trainer": {
        landmarkId: "castle",
        parameter: "strength",
        actionUsedMessage: "You can only train strength once per turn.",
        landmarkMessage: "You must be at Castle to train Strength",
        notEnoughCoinsMessage: "Not enough coins to train Strength at Castle",
      },
      "academy-trainer": {
        landmarkId: "academy",
        parameter: "magic",
        actionUsedMessage: "You can only train magic once per turn.",
        landmarkMessage: "You must be at Academy to train Magic",
        notEnoughCoinsMessage: "Not enough coins to train Magic at Academy",
      },
    };

    const actionId = String(payload.actionId ?? "").trim();
    const trainerConfig = trainerConfigByActionId[actionId];
    if (!trainerConfig) {
      throw new Error(`Unsupported trainer action '${actionId}'`);
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let spentCoins = 0;
    let newStatValue = 0;

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
      this.ensureActionAvailable(player, actionId, worldTurn, trainerConfig.actionUsedMessage);

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
      this.ensurePlayerOnLandmark(mapCell, trainerConfig.landmarkId, trainerConfig.landmarkMessage);

      const normalizedLevel = Math.max(1, Math.floor(Number(player.level ?? 1)));
      spentCoins = normalizedLevel * 3;

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < spentCoins) {
        throw new Error(trainerConfig.notEnoughCoinsMessage);
      }

      const targetParameter = player.parameters[trainerConfig.parameter];
      const nextParameter = {
        ...targetParameter,
        base: Math.max(0, Math.floor(Number(targetParameter.base ?? 0))) + 1,
        current: Math.max(0, Math.floor(Number(targetParameter.current ?? 0))) + 1,
        ...(typeof targetParameter.max === "number"
          ? { max: Math.max(0, Math.floor(Number(targetParameter.max))) + 1 }
          : {}),
      };

      newStatValue = nextParameter.base;

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      this.playerTurnEffectsService.scheduleSkippedTurns(nextWorldState, actor.id, 1);
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
          [trainerConfig.parameter]: nextParameter,
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - spentCoins,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, actionId, worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.landmarkTraining", {
      actionId,
      parameter: trainerConfig.parameter,
      increasedBy: 1,
      newValue: newStatValue,
      spentCoins,
      skippedTurns: 1,
      turnEnded: true,
    });
  }

  public async capitalEnchantress(gameId: string, actor: Pick<Player, "id" | "name">): Promise<CapitalEnchantressOutcome> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await Promise.all([
      this.statusCatalogService.loadConfig(),
      this.enchantressRewardsConfigService.loadConfig(),
    ]);

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
    const luckResult = this.luckService.checkLuck(playerLuck * this.resolveLuckBonusMultiplier(playerForLuck.statuses));
    const clampedLuckTotal = Math.max(1, Math.min(100, Math.floor(luckResult.total)));
    const reward = await this.enchantressRewardsConfigService.resolveRewardByTotal(clampedLuckTotal);
    const rewardLabel = this.enchantressRewardsConfigService.getLocalizedLabel(reward);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateTxSnap, playerTxSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateTxSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerTxSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateTxSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerTxSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "capital-enchantress", worldTurn, "You can only consult the enchantress once per turn.");

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
      this.ensurePlayerOnLandmark(mapCell, "capital", "You must be at Capital to consult the Enchantress");

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < this.capitalEnchantressCost) {
        throw new Error("You need 5 coins to consult the Enchantress");
      }

      const decrementedStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      let nextStatuses = [...decrementedStatuses];
      for (const applied of reward.statuses) {
        const statusDefinition = this.statusCatalogService.getStatus(applied.key);
        if (!statusDefinition) {
          throw new Error(`Missing status definition for '${applied.key}'`);
        }

        nextStatuses = this.upsertStatus(nextStatuses, {
          key: statusDefinition.key,
          label: statusDefinition.label,
          description: statusDefinition.description,
          durationTurns: applied.durationTurns,
          ...(statusDefinition.effectKey
            ? { effectKey: statusDefinition.effectKey }
            : {}),
        });
      }

      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - this.capitalEnchantressCost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        lastLuckCheck: luckResult,
        actionsUsedThisTurn: this.markActionUsed(player, "capital-enchantress", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.capitalEnchantress", {
      spentCoins: this.capitalEnchantressCost,
      clampedLuckTotal,
      rolledTotal: Math.floor(luckResult.total),
      roll: luckResult.roll,
      rewardId: reward.id,
      rewardLabel,
      rewardStatuses: reward.statuses.map((status) => `${status.key}:${status.durationTurns}`).join(", "),
      pendingMagicReward: reward.pendingMagicReward === true,
      turnEnded: true,
    });

    return {
      rewardId: reward.id,
      rewardLabel,
      clampedLuckTotal,
      rolledTotal: Math.floor(luckResult.total),
      pendingMagicReward: reward.pendingMagicReward === true,
      overflowLuckyStrikeCandidate: luckResult.total > 100,
    };
  }

  public async cityMystic(gameId: string, actor: Pick<Player, "id" | "name">): Promise<CityMysticOutcome> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await Promise.all([
      this.mysticRewardsConfigService.loadConfig(),
      this.itemOwnershipService.loadConfig(),
    ]);

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
    const luckResult = this.luckService.checkLuck(playerLuck * this.resolveLuckBonusMultiplier(playerForLuck.statuses));
    const rolledTotal = Math.floor(luckResult.total);
    const displayTotal = Math.max(1, Math.min(100, rolledTotal));
    // Exact 100 triggers the level-up jackpot, while totals above 100 remain in the 1-99 reward table.
    const rewardTotal = rolledTotal === 100 ? 100 : Math.max(1, Math.min(99, rolledTotal));
    const reward = await this.mysticRewardsConfigService.resolveRewardByTotal(rewardTotal);

    const gainedExperience = Math.max(0, Math.floor(Number(reward.experienceGain ?? 0)));
    const grantedLevelUp = reward.grantLevelUp === true;
    const alignment = typeof reward.alignment === "string" ? reward.alignment : null;
    const localizedRewardLabel = this.mysticRewardsConfigService.getLocalizedLabel(reward);
    let droppedItemsCount = 0;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateTxSnap, playerTxSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateTxSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerTxSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateTxSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerTxSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "city-mystic", worldTurn, "You can only consult the mystic once per turn.");

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
      this.ensurePlayerOnLandmark(mapCell, "city", "You must be at City to consult the Mystic");

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < this.cityMysticCost) {
        throw new Error("You need 5 coins to consult the Mystic");
      }

      const currentAlignment = player.alignment;
      const nextAlignment = alignment ?? currentAlignment;
      const ownershipResolution = this.itemOwnershipService.enforceAlignmentConstraints({
        items: player.inventory?.items ?? [],
        alignment: nextAlignment,
      });
      droppedItemsCount = ownershipResolution.droppedItems.length;

      const nextDroppedItems = [
        ...(mapCell.droppedItems ?? []),
        ...ownershipResolution.droppedItems,
      ];

      const progression = this.applyExperienceAndResolveLevelUps({
        currentLevel: player.level,
        currentExperience: player.experience,
        gainedExperience,
      });

      const nextLevel = progression.level + (grantedLevelUp ? 1 : 0);
      const nextPendingChoices = Math.max(0, Math.floor(Number(player.pendingLevelUpChoices ?? 0)))
        + progression.pendingLevelUpChoices
        + (grantedLevelUp ? 1 : 0);

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: ownershipResolution.keptItems,
          money: currentMoney - this.cityMysticCost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        experience: progression.experience,
        level: nextLevel,
        pendingLevelUpChoices: nextPendingChoices,
        lastLuckCheck: luckResult,
        actionsUsedThisTurn: this.markActionUsed(player, "city-mystic", worldTurn),
        ...(alignment ? { alignment } : {}),
      }, { merge: true });

      if (ownershipResolution.droppedItems.length > 0) {
        transaction.set(mapCellRef, {
          droppedItems: nextDroppedItems,
        }, { merge: true });
      }

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.cityMystic", {
      spentCoins: this.cityMysticCost,
      displayTotal,
      rolledTotal,
      roll: luckResult.roll,
      rewardId: reward.id,
      rewardLabel: localizedRewardLabel,
      gainedExperience,
      grantedLevelUp,
      droppedItemsCount,
      turnEnded: true,
      ...(alignment ? { alignment } : {}),
    });

    return {
      rewardId: reward.id,
      rewardLabel: localizedRewardLabel,
      displayTotal,
      rolledTotal,
      alignment,
      gainedExperience,
      grantedLevelUp,
    };
  }

  public async safePlaceMerchantTrade(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      actionId: string;
      merchantId: string;
      operation: "buy" | "sell";
      itemId: string;
    },
  ): Promise<MerchantTradeOutcome> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const itemId = String(payload.itemId ?? "").trim();
    if (!itemId) {
      throw new Error("Invalid merchant trade item");
    }

    const merchantId = String(payload.merchantId ?? "").trim();
    if (!merchantId) {
      throw new Error("Invalid merchant trade merchant");
    }

    if (payload.operation !== "buy" && payload.operation !== "sell") {
      throw new Error("Invalid merchant trade operation");
    }

    await Promise.all([
      this.itemCatalogService.loadConfig(),
      this.followerCatalogService.loadConfig(),
      this.merchantCatalogService.loadConfig(),
    ]);

    const merchant = this.merchantCatalogService.getCachedMerchantById(merchantId);
    if (!merchant) {
      throw new Error("Merchant not found");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let outcomeItemName = itemId;
    let outcomeCoinsDelta = 0;
    let outcomeTurnEnded = false;

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
      if (mapCell.specialType !== "landmark" || !mapCell.landmarkId) {
        throw new Error("You must be at a merchant landmark");
      }

      if (mapCell.landmarkId !== merchant.landmarkId) {
        throw new Error("Merchant is not available at this landmark");
      }

      const stockEntry = this.merchantCatalogService.getStockEntry(merchant, "item", itemId);
      const itemStockKey = this.buildMerchantStockKey("item", itemId);
      const stockMap = {
        ...this.merchantCatalogService.asDefaultStockMap(merchant),
        ...(mapCell.merchantStockByItemId ?? {}),
      };

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      const normalizedItems = this.normalizeInventoryItems(player.inventory?.items);
      const item = this.itemCatalogService.getCachedItemById(itemId);
      outcomeItemName = item ? this.itemCatalogService.getLocalizedName(item) : itemId;

      if (payload.operation === "buy") {
        this.ensureActionAvailable(player, payload.actionId, worldTurn, "You can only buy once per turn.");

        if (!stockEntry) {
          throw new Error("Item not sold by this merchant");
        }

        const availableStock = Math.max(0, Math.floor(Number(stockMap[itemStockKey] ?? stockMap[itemId] ?? 0)));
        if (availableStock <= 0) {
          throw new Error("Selected item is out of stock");
        }

        if (!item) {
          throw new Error("Item definition not found");
        }

        const allowedAlignments = item.constraints?.allowedAlignments;
        if (Array.isArray(allowedAlignments) && allowedAlignments.length > 0) {
          const effectiveAlignment = player.alignment ?? "neutral";
          if (!allowedAlignments.includes(effectiveAlignment)) {
            throw new Error("Your alignment does not allow this item");
          }
        }

        const purchaseValue = typeof stockEntry.purchaseValue === "number"
          ? Math.max(0, Math.floor(stockEntry.purchaseValue))
          : Math.max(0, Math.floor(item.purchaseValue));
        if (currentMoney < purchaseValue) {
          throw new Error("Not enough coins to buy this item");
        }

        if (item.occupiesSpace) {
          const occupiedSlots = this.getOccupiedItemSlots(normalizedItems);
          const capacity = this.getEffectiveItemCapacity(player);
          if (occupiedSlots >= capacity) {
            throw new Error("Not enough item inventory space");
          }
        }

        const nextItems = [...normalizedItems, this.createInventoryItemEntry(itemId)];
        stockMap[itemStockKey] = availableStock - 1;
        outcomeCoinsDelta = -purchaseValue;
        outcomeTurnEnded = true;

        const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
        const nextWorldState: WorldState = {
          ...worldState,
        };
        await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
        const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

        transaction.set(playerRef, {
          parameters: {
            ...player.parameters,
            mp: {
              ...player.parameters.mp,
              current: nextMpCurrent,
            },
          },
          inventory: {
            ...(player.inventory ?? { items: [], resources: [], money: 0 }),
            items: nextItems,
            money: currentMoney - purchaseValue,
            resourceCapacity: this.getResourceCapacity(player),
            itemCapacity: this.getItemCapacity(player),
          },
          statuses: nextStatuses,
          actionsUsedThisTurn: this.markActionUsed(player, payload.actionId, worldTurn),
        }, { merge: true });

        transaction.set(mapCellRef, {
          merchantStockByItemId: stockMap,
        }, { merge: true });

        transaction.set(worldStateRef, nextWorldState);

        transaction.set(gameRef, {
          updatedAt: Timestamp.now(),
          lastActivityAt: Timestamp.now(),
        }, { merge: true });

        return;
      }

      const sellItemIndex = normalizedItems.findIndex((entry) => entry.itemId === itemId);
      if (sellItemIndex < 0) {
        throw new Error("You do not own this item");
      }

      if (!item) {
        throw new Error("Item definition not found");
      }

      if (Array.isArray(merchant.acceptedCategories) && merchant.acceptedCategories.length > 0) {
        if (!merchant.acceptedCategories.includes(item.category)) {
          throw new Error("This merchant does not buy this item category");
        }
      }

      const gainedCoins = this.itemCatalogService.getSellValue(item);
      const nextItems = normalizedItems.filter((_entry, index) => index !== sellItemIndex);
      stockMap[itemStockKey] = Math.max(0, Math.floor(Number(stockMap[itemStockKey] ?? stockMap[itemId] ?? 0))) + 1;
      outcomeCoinsDelta = gainedCoins;
      outcomeTurnEnded = false;

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: nextItems,
          money: currentMoney + gainedCoins,
          resourceCapacity: this.getResourceCapacity(player),
          itemCapacity: this.getItemCapacity(player),
        },
      }, { merge: true });

      transaction.set(mapCellRef, {
        merchantStockByItemId: stockMap,
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    if (payload.operation === "buy") {
      await this.tryCreateLog(gameId, actor, "player.merchantBuy", {
        actionId: payload.actionId,
        merchantId,
        itemId,
        itemName: outcomeItemName,
        spentCoins: Math.abs(outcomeCoinsDelta),
        turnEnded: true,
      });
    } else {
      await this.tryCreateLog(gameId, actor, "player.merchantSell", {
        actionId: payload.actionId,
        merchantId,
        itemId,
        itemName: outcomeItemName,
        gainedCoins: Math.max(0, outcomeCoinsDelta),
      });
    }

    return {
      operation: payload.operation,
      itemId,
      itemName: outcomeItemName,
      coinsDelta: outcomeCoinsDelta,
      turnEnded: outcomeTurnEnded,
    };
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

      this.playerTurnEffectsService.scheduleStagedFastTravel(
        nextWorldState,
        actor.id,
        {
          x: originCell.x,
          y: originCell.y,
        },
        {
          x: destinationCell.x,
          y: destinationCell.y,
        },
      );
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

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

      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

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

  public async completeFastTravelMidpointTurn(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
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

      const pendingFastTravel = this.playerTurnEffectsService.getPendingFastTravel(worldState, actor.id);
      if (!pendingFastTravel || pendingFastTravel.stage !== "booked") {
        throw new Error("Fast travel midpoint stage is not available");
      }

      const player = playerSnap.data() as Player;
      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));

      const nextWorldState: WorldState = {
        ...worldState,
        movedThisTurnByPlayer: {
          ...(worldState.movedThisTurnByPlayer ?? {}),
          [actor.id]: worldState.currentTurn,
        },
      };

      this.playerTurnEffectsService.moveFastTravelToMidpoint(nextWorldState, actor.id);
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

      transaction.set(playerRef, {
        statuses: nextStatuses,
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });
  }

  public async completeFastTravelArrival(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
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

      const pendingFastTravel = this.playerTurnEffectsService.consumeFastTravelArrival(worldState, actor.id);
      if (!pendingFastTravel || pendingFastTravel.stage !== "midpoint") {
        throw new Error("Fast travel arrival stage is not available");
      }

      const nextWorldState: WorldState = {
        ...worldState,
      };

      transaction.set(playerRef, {
        location: {
          x: pendingFastTravel.destination.x,
          y: pendingFastTravel.destination.y,
        },
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
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
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

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

  public async graveyardResurrect(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      followerId: string;
    },
  ): Promise<GraveyardResurrectOutcome> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const selectedFollowerId = String(payload.followerId ?? "").trim();
    if (!selectedFollowerId) {
      throw new Error("Invalid follower selection");
    }

    await Promise.all([
      this.graveyardResurrectRewardsConfigService.loadConfig(),
      this.followerCatalogService.loadConfig(),
    ]);

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
    const worldStateForLuck = worldStateSnap.data() as WorldState;
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
      worldState: worldStateForLuck,
      mapSize,
    });
    const luckResult = this.luckService.checkLuck(playerLuck * this.resolveLuckBonusMultiplier(playerForLuck.statuses));
    const rewardTotal = Math.max(1, Math.min(100, Math.floor(luckResult.total)));
    const reward = await this.graveyardResurrectRewardsConfigService.resolveRewardByTotal(rewardTotal);
    const rewardLabel = this.graveyardResurrectRewardsConfigService.getLocalizedLabel(reward);

    const discardCollectionRef = collection(worldStateRef, "discardPile");
    const discardSnapshot = await getDocs(discardCollectionRef);
    const selectedDiscardEntry = discardSnapshot.docs
      .map((entrySnap) => ({
        ref: entrySnap.ref,
        data: entrySnap.data() as DiscardPileEntry,
      }))
      .filter((entry) => {
        return entry.data.ownerPlayerId === actor.id
          && entry.data.card?.kind === "follower"
          && entry.data.card?.cardId === selectedFollowerId
          && entry.data.reason === "dead"
          && !entry.data.recoveredAt;
      })
      .sort((left, right) => {
        const leftSeq = Math.max(0, Math.floor(Number(left.data.discardSeq ?? 0)));
        const rightSeq = Math.max(0, Math.floor(Number(right.data.discardSeq ?? 0)));
        return rightSeq - leftSeq;
      })[0] ?? null;

    if (!selectedDiscardEntry) {
      throw new Error("Selected follower is not available in discard pile");
    }

    let appliedOutcome = reward.id;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateTxSnap, playerTxSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateTxSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerTxSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateTxSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using landmark actions");

      const player = playerTxSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "graveyard-resurrect", worldTurn, "You can only use graveyard resurrection once per turn.");

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
      this.ensurePlayerOnLandmark(mapCell, "graveyard", "You must be at Graveyard to use resurrection");

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const targetIndex = normalizedFollowers.findIndex((entry) => {
        return entry.followerId === selectedFollowerId
          && entry.state === "discarded"
          && entry.discardReason === "dead";
      });

      if (targetIndex < 0) {
        throw new Error("Selected follower is not dead in your party records");
      }

      const targetEntry = normalizedFollowers[targetIndex];
      const targetDefinition = this.followerCatalogService.getCachedFollowerById(selectedFollowerId);
      const targetMaxHp = Math.max(1, Math.floor(Number(targetDefinition?.maxHp ?? targetEntry.hpCurrent ?? 1)));
      const localizedTargetName = targetDefinition
        ? this.followerCatalogService.getLocalizedName(targetDefinition)
        : selectedFollowerId;
      const targetName = String(targetEntry.nameOverride ?? localizedTargetName).trim() || selectedFollowerId;

      let nextFollowers = normalizedFollowers.map((entry) => ({ ...entry }));
      nextFollowers[targetIndex] = {
        ...targetEntry,
        state: "discarded",
        discardReason: "lost",
        discardedAtTurn: worldTurn,
      };

      let nextHpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));

      if (typeof reward.playerHpDamagePercent === "number" && reward.playerHpDamagePercent > 0) {
        const playerHpMax = Math.max(
          1,
          Math.floor(Number(
            typeof player.parameters.hp.max === "number"
              ? player.parameters.hp.max
              : player.parameters.hp.base,
          )),
        );
        const damageHp = Math.max(1, Math.floor(playerHpMax * reward.playerHpDamagePercent));
        nextHpCurrent = Math.max(0, nextHpCurrent - damageHp);
      }

      if (reward.summonZombie === true) {
        const hasZombie = nextFollowers.some((entry) => {
          return entry.followerId === "zombie"
            && entry.state !== "discarded"
            && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0;
        });

        if (hasZombie) {
          appliedOutcome = "summon-zombie-blocked";
        } else {
          const zombieDefinition = this.followerCatalogService.getCachedFollowerById("zombie");
          const zombieHp = Math.max(1, Math.floor(Number(zombieDefinition?.maxHp ?? 2)));
          nextFollowers.push({
            followerId: "zombie",
            hpCurrent: zombieHp,
            state: "active",
          });
        }
      }

      if (reward.reviveTarget === "one-hp" || reward.reviveTarget === "full") {
        const resurrectHp = reward.reviveTarget === "one-hp" ? 1 : targetMaxHp;
        const shouldMarkAsUndead = reward.markAsUndead === true || reward.reviveTarget === "one-hp";

        nextFollowers[targetIndex] = {
          followerId: targetEntry.followerId,
          hpCurrent: resurrectHp,
          state: "active",
          ...(shouldMarkAsUndead ? { nameOverride: `${targetName} (undead)` } : {}),
          ...(shouldMarkAsUndead ? { categoryOverride: "undead" } : {}),
        };
      }

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.delete(selectedDiscardEntry.ref);
      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
          hp: {
            ...player.parameters.hp,
            current: nextHpCurrent,
          },
        },
        statuses: nextStatuses,
        followers: nextFollowers,
        lastLuckCheck: luckResult,
        actionsUsedThisTurn: this.markActionUsed(player, "graveyard-resurrect", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.graveyardResurrect", {
      followerId: selectedFollowerId,
      rolledTotal: Math.floor(luckResult.total),
      rewardTotal,
      rewardId: reward.id,
      appliedOutcome,
      turnEnded: true,
    });

    return {
      selectedFollowerId,
      rewardId: reward.id,
      rewardLabel,
      displayTotal: rewardTotal,
      rolledTotal: Math.floor(luckResult.total),
      appliedOutcome,
    };
  }

  public async templeSendDevotee(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      followerId: string;
    },
  ): Promise<void> {
    await this.applyAlignmentFollowerAction(gameId, actor, {
      actionId: "temple-send-devotee",
      landmarkId: "temple",
      targetAlignment: "good",
      selectedFollowerId: payload.followerId,
      experienceGain: 2,
      discardReason: "released",
      blockedCategories: ["animal", "spirit", "undead"],
      alreadyAlignedMessage: "You are already good",
      invalidLandmarkMessage: "You must be at Temple to send a devotee",
      invalidFollowerMessage: "Selected follower cannot be sent to the Temple",
    });

    await this.tryCreateLog(gameId, actor, "player.templeSendDevotee", {
      gainedExperience: 2,
      alignment: "good",
      turnEnded: true,
    });
  }

  public async altarSacrifice(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      followerId: string;
    },
  ): Promise<void> {
    await this.applyAlignmentFollowerAction(gameId, actor, {
      actionId: "altar-sacrifice",
      landmarkId: "altar",
      targetAlignment: "evil",
      selectedFollowerId: payload.followerId,
      experienceGain: 2,
      discardReason: "lost",
      blockedCategories: ["undead"],
      alreadyAlignedMessage: "You are already evil",
      invalidLandmarkMessage: "You must be at Altar to perform a sacrifice",
      invalidFollowerMessage: "Selected follower cannot be sacrificed",
    });

    await this.tryCreateLog(gameId, actor, "player.altarSacrifice", {
      gainedExperience: 2,
      alignment: "evil",
      turnEnded: true,
    });
  }

  public async eliminateZombie(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
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

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "eliminate-zombie", worldTurn, "You can only eliminate zombie once per turn.");

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const zombieIndex = normalizedFollowers.findIndex((entry) => {
        return entry.followerId === "zombie"
          && entry.state !== "discarded"
          && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0;
      });

      if (zombieIndex < 0) {
        throw new Error("You have no active zombie to eliminate");
      }

      const nextFollowers = normalizedFollowers.map((entry) => ({ ...entry }));
      nextFollowers[zombieIndex] = {
        ...nextFollowers[zombieIndex],
        hpCurrent: 0,
        state: "discarded",
        discardReason: "lost",
        discardedAtTurn: worldTurn,
      };

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
        },
        followers: nextFollowers,
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "eliminate-zombie", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.eliminateZombie", {
      turnEnded: true,
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
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);

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

  private async applyTurnAdvanceAndDeferredEffects(
    transaction: Transaction,
    gameId: string,
    nextWorldState: WorldState,
    preloadedPlayers: Record<string, Player> = {},
  ): Promise<void> {
    const turnAdvance = this.turnService.advanceTurn(nextWorldState);

    const playerIdsToLoad = new Set<string>(turnAdvance.skippedPlayerIds);
    if (nextWorldState.activePlayerId) {
      playerIdsToLoad.add(nextWorldState.activePlayerId);
    }

    for (const preloadedPlayerId of Object.keys(preloadedPlayers)) {
      playerIdsToLoad.delete(preloadedPlayerId);
    }

    const playerDocs = await Promise.all(
      Array.from(playerIdsToLoad).map(async (playerId) => {
        const playerRef = doc(this.firebaseService.database, "games", gameId, "players", playerId);
        const playerSnap = await transaction.get(playerRef);
        return {
          playerId,
          playerRef,
          playerSnap,
        };
      }),
    );

    const playerDocById = new Map(playerDocs.map((entry) => [entry.playerId, entry]));
    const skippedPlayers = turnAdvance.skippedPlayerIds
      .map((playerId) => {
        const preloadedPlayer = preloadedPlayers[playerId];
        if (preloadedPlayer) {
          return {
            playerId,
            player: preloadedPlayer,
            playerRef: doc(this.firebaseService.database, "games", gameId, "players", playerId),
          };
        }

        const loaded = playerDocById.get(playerId);
        if (!loaded || !loaded.playerSnap.exists()) {
          return null;
        }

        return {
          playerId,
          player: loaded.playerSnap.data() as Player,
          playerRef: loaded.playerRef,
        };
      })
      .filter((entry): entry is { playerId: string; player: Player; playerRef: ReturnType<typeof doc> } => !!entry);

    const activePlayerId = nextWorldState.activePlayerId;
    const activePlayer = activePlayerId ? (preloadedPlayers[activePlayerId] ?? null) : null;
    const loadedActivePlayerDoc = activePlayerId ? playerDocById.get(activePlayerId) : null;

    const shouldLoadStatusCatalog = skippedPlayers.some((entry) => this.hasStatuses(entry.player.statuses))
      || this.hasStatuses(activePlayer?.statuses)
      || (loadedActivePlayerDoc?.playerSnap.exists() && this.hasStatuses((loadedActivePlayerDoc.playerSnap.data() as Player).statuses));

    if (shouldLoadStatusCatalog) {
      await this.statusCatalogService.loadConfig();
    }

    for (const skippedPlayerId of turnAdvance.skippedPlayerIds) {
      const preloadedPlayer = preloadedPlayers[skippedPlayerId];
      const skippedPlayerDoc = preloadedPlayer
        ? {
          playerRef: doc(this.firebaseService.database, "games", gameId, "players", skippedPlayerId),
          player: preloadedPlayer,
        }
        : null;
      const loadedSkippedPlayerDoc = playerDocById.get(skippedPlayerId);

      const skippedPlayer = skippedPlayerDoc
        ? skippedPlayerDoc.player
        : (loadedSkippedPlayerDoc?.playerSnap.exists() ? (loadedSkippedPlayerDoc.playerSnap.data() as Player) : null);
      const skippedPlayerRef = skippedPlayerDoc
        ? skippedPlayerDoc.playerRef
        : loadedSkippedPlayerDoc?.playerRef;

      if (!skippedPlayer || !skippedPlayerRef) {
        continue;
      }

      const statusSnapshot = this.buildStatusEffectsSnapshot(this.normalizeStatuses(skippedPlayer.statuses));
      const nextStatuses = this.decrementNormalizedStatuses(statusSnapshot.activeStatuses);

      const hpCurrent = Math.max(0, Math.floor(Number(skippedPlayer.parameters.hp.current)));
      const hpMax = Math.max(
        1,
        Math.floor(Number(
          typeof skippedPlayer.parameters.hp.max === "number"
            ? skippedPlayer.parameters.hp.max
            : skippedPlayer.parameters.hp.base,
        )),
      );
      const nextHpCurrent = this.applyTurnEndHpPercentDelta(
        hpCurrent,
        hpMax,
        statusSnapshot.turnEndHpPercentDelta,
        !statusSnapshot.disableHpRecovery,
      );

      const currentHp = Math.max(0, Math.floor(Number(skippedPlayer.parameters.hp.current ?? 0)));
      const skippedPlayerPatch: Partial<Player> = {};
      if (!this.areStatusesEquivalent(skippedPlayer.statuses, nextStatuses)) {
        skippedPlayerPatch.statuses = nextStatuses;
      }

      if (currentHp !== nextHpCurrent) {
        skippedPlayerPatch.parameters = {
          ...skippedPlayer.parameters,
          hp: {
            ...skippedPlayer.parameters.hp,
            current: nextHpCurrent,
          },
        };
      }

      if (Object.keys(skippedPlayerPatch).length > 0) {
        transaction.set(skippedPlayerRef, skippedPlayerPatch, { merge: true });
      }
    }

    if (activePlayerId) {
      const activePlayerDoc = playerDocById.get(activePlayerId);
      const resolvedActivePlayer = activePlayer
        ?? (activePlayerDoc?.playerSnap.exists() ? (activePlayerDoc.playerSnap.data() as Player) : null);
      const activePlayerRef = activePlayer
        ? doc(this.firebaseService.database, "games", gameId, "players", activePlayerId)
        : activePlayerDoc?.playerRef;

      if (resolvedActivePlayer && activePlayerRef) {
        const recoveredMpCurrent = this.resolveMpRecoveredOnTurnStart(resolvedActivePlayer);
        const currentMp = Math.max(0, Math.floor(Number(resolvedActivePlayer.parameters.mp.current ?? 0)));

        if (recoveredMpCurrent !== currentMp) {
          transaction.set(activePlayerRef, {
            parameters: {
              ...resolvedActivePlayer.parameters,
              mp: {
                ...resolvedActivePlayer.parameters.mp,
                current: recoveredMpCurrent,
              },
            },
          }, { merge: true });
        }
      }
    }

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

  public async safePlaceMerchantCheckout(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      actionId: string;
      merchantId: string;
      stockConfigUrl?: string;
      operations: MerchantCheckoutOperation[];
    },
  ): Promise<MerchantCheckoutOutcome> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const merchantId = String(payload.merchantId ?? "").trim();
    if (!merchantId) {
      throw new Error("Invalid merchant trade merchant");
    }

    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    if (operations.length === 0) {
      throw new Error("Merchant cart is empty");
    }

    await Promise.all([
      this.itemCatalogService.loadConfig(),
      this.merchantCatalogService.loadConfig(),
    ]);

    const merchant = this.merchantCatalogService.getCachedMerchantById(merchantId);
    if (!merchant) {
      throw new Error("Merchant not found");
    }

    const stockEntries = await this.merchantTradeOffersService.resolveStockEntries({
      merchant,
      stockConfigUrl: payload.stockConfigUrl,
    });

    const buyQuantitiesByStockKey = new Map<string, {
      kind: "item" | "follower";
      tradableId: string;
      quantity: number;
    }>();
    const sellQuantitiesByItemId = new Map<string, number>();
    operations.forEach((operation, index) => {
      if (!operation || typeof operation !== "object") {
        throw new Error(`Invalid merchant cart line at index ${index}`);
      }

      const itemId = String(operation.itemId ?? "").trim();
      if (!itemId) {
        throw new Error(`Invalid merchant cart item at index ${index}`);
      }

      const quantity = Math.floor(Number(operation.quantity ?? 0));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid merchant cart quantity for item '${itemId}'`);
      }

      if (operation.operation === "buy") {
        const kind: "item" | "follower" = operation.kind === "follower" ? "follower" : "item";
        const stockKey = this.buildMerchantStockKey(kind, itemId);
        const current = buyQuantitiesByStockKey.get(stockKey);
        if (current) {
          buyQuantitiesByStockKey.set(stockKey, {
            ...current,
            quantity: current.quantity + quantity,
          });
        } else {
          buyQuantitiesByStockKey.set(stockKey, {
            kind,
            tradableId: itemId,
            quantity,
          });
        }
        return;
      }

      if (operation.operation === "sell") {
        sellQuantitiesByItemId.set(itemId, (sellQuantitiesByItemId.get(itemId) ?? 0) + quantity);
        return;
      }

      throw new Error(`Invalid merchant cart operation for item '${itemId}'`);
    });

    if (buyQuantitiesByStockKey.size === 0 && sellQuantitiesByItemId.size === 0) {
      throw new Error("Merchant cart is empty");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    const lineOutcomes: MerchantCheckoutLineOutcome[] = [];
    let turnEnded = false;

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
      if (buyQuantitiesByStockKey.size > 0) {
        this.ensureActionAvailable(player, payload.actionId, worldTurn, "You can only buy once per turn.");
      }

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
      if (mapCell.specialType !== "landmark" || !mapCell.landmarkId) {
        throw new Error("You must be at a merchant landmark");
      }

      if (mapCell.landmarkId !== merchant.landmarkId) {
        throw new Error("Merchant is not available at this landmark");
      }

      const normalizedItems = this.normalizeInventoryItems(player.inventory?.items);
      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const activeOwnedFollowers = new Set(
        normalizedFollowers
          .filter((entry) => entry.state !== "discarded" && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0)
          .map((entry) => entry.followerId),
      );
      const ownedCountByItemId = normalizedItems.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.itemId] = (acc[entry.itemId] ?? 0) + 1;
        return acc;
      }, {});

      const stockMap = {
        ...this.merchantTradeOffersService.buildStockMap({
          stockEntries,
          persistedStockByItemId: mapCell.merchantStockByItemId ?? {},
        }),
      };

      const initialMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      let runningMoney = initialMoney;

      sellQuantitiesByItemId.forEach((quantity, itemId) => {
        const owned = Math.max(0, Math.floor(Number(ownedCountByItemId[itemId] ?? 0)));
        if (owned < quantity) {
          throw new Error(`You do not own enough '${itemId}' to sell`);
        }

        const item = this.itemCatalogService.getCachedItemById(itemId);
        if (!item) {
          throw new Error("Item definition not found");
        }

        if (Array.isArray(merchant.acceptedCategories) && merchant.acceptedCategories.length > 0) {
          if (!merchant.acceptedCategories.includes(item.category)) {
            throw new Error("This merchant does not buy this item category");
          }
        }

        const gainedCoinsPerUnit = this.itemCatalogService.getSellValue(item);
        const gainedCoinsTotal = gainedCoinsPerUnit * quantity;
        const stockKey = this.buildMerchantStockKey("item", itemId);

        runningMoney += gainedCoinsTotal;
        ownedCountByItemId[itemId] = owned - quantity;
        stockMap[stockKey] = Math.max(0, Math.floor(Number(stockMap[stockKey] ?? 0))) + quantity;

        lineOutcomes.push({
          operation: "sell",
          kind: "item",
          itemId,
          itemName: this.itemCatalogService.getLocalizedName(item),
          quantity,
          unitCoinsDelta: gainedCoinsPerUnit,
          totalCoinsDelta: gainedCoinsTotal,
        });
      });

      buyQuantitiesByStockKey.forEach((buyLine, stockKey) => {
        const { kind, tradableId: itemId, quantity } = buyLine;
        const stockEntry = this.merchantTradeOffersService.getStockEntry(stockEntries, kind, itemId);
        if (!stockEntry) {
          throw new Error("Selected offer is not sold by this merchant");
        }

        const availableStock = Math.max(0, Math.floor(Number(stockMap[stockKey] ?? 0)));
        if (availableStock < quantity) {
          throw new Error("Selected offer is out of stock");
        }

        if (kind === "follower" && activeOwnedFollowers.has(itemId)) {
          throw new Error("You already have this follower");
        }

        if (kind === "follower" && quantity > 1) {
          throw new Error("Followers are unique and can only be bought once");
        }

        let purchaseValuePerUnit = 0;
        let itemName = itemId;

        if (kind === "item") {
          const item = this.itemCatalogService.getCachedItemById(itemId);
          if (!item) {
            throw new Error("Item definition not found");
          }

          itemName = this.itemCatalogService.getLocalizedName(item);
          const allowedAlignments = item.constraints?.allowedAlignments;
          if (Array.isArray(allowedAlignments) && allowedAlignments.length > 0) {
            const effectiveAlignment = player.alignment ?? "neutral";
            if (!allowedAlignments.includes(effectiveAlignment)) {
              throw new Error("Your alignment does not allow this item");
            }
          }

          purchaseValuePerUnit = typeof stockEntry.purchaseValue === "number"
            ? Math.max(0, Math.floor(stockEntry.purchaseValue))
            : Math.max(0, Math.floor(item.purchaseValue));
        } else {
          const follower = this.followerCatalogService.getCachedFollowerById(itemId);
          if (!follower) {
            throw new Error("Follower definition not found");
          }

          itemName = this.followerCatalogService.getLocalizedName(follower);
          purchaseValuePerUnit = typeof stockEntry.purchaseValue === "number"
            ? Math.max(0, Math.floor(stockEntry.purchaseValue))
            : 0;
        }

        const purchaseValueTotal = purchaseValuePerUnit * quantity;
        if (runningMoney < purchaseValueTotal) {
          throw new Error("Not enough coins to buy selected cart items");
        }

        runningMoney -= purchaseValueTotal;
        stockMap[stockKey] = availableStock - quantity;
        if (kind === "item") {
          ownedCountByItemId[itemId] = Math.max(0, Math.floor(Number(ownedCountByItemId[itemId] ?? 0))) + quantity;
        } else {
          activeOwnedFollowers.add(itemId);
        }

        lineOutcomes.push({
          operation: "buy",
          kind,
          itemId,
          itemName,
          quantity,
          unitCoinsDelta: -purchaseValuePerUnit,
          totalCoinsDelta: -purchaseValueTotal,
        });
      });

      const itemCapacity = this.getItemCapacity(player);
      const effectiveItemCapacity = this.getEffectiveItemCapacity(player);
      let occupiedSlots = this.getOccupiedItemSlots(normalizedItems);

      sellQuantitiesByItemId.forEach((quantity, itemId) => {
        const item = this.itemCatalogService.getCachedItemById(itemId);
        if (!item || !item.occupiesSpace) return;
        occupiedSlots = Math.max(0, occupiedSlots - quantity);
      });

      buyQuantitiesByStockKey.forEach(({ kind, tradableId: itemId, quantity }) => {
        if (kind !== "item") return;
        const item = this.itemCatalogService.getCachedItemById(itemId);
        if (!item || !item.occupiesSpace) return;
        occupiedSlots += quantity;
      });

      if (occupiedSlots > effectiveItemCapacity) {
        throw new Error("Not enough item inventory space");
      }

      const nextItems = [...normalizedItems];
      const nextFollowers = [...normalizedFollowers];
      sellQuantitiesByItemId.forEach((quantity, itemId) => {
        let toRemove = quantity;
        while (toRemove > 0) {
          const index = nextItems.findIndex((entry) => entry.itemId === itemId);
          if (index < 0) {
            throw new Error(`Cannot sell '${itemId}' because it is missing from inventory`);
          }

          nextItems.splice(index, 1);
          toRemove -= 1;
        }
      });

      buyQuantitiesByStockKey.forEach(({ kind, tradableId: itemId, quantity }) => {
        if (kind === "item") {
          for (let i = 0; i < quantity; i += 1) {
            nextItems.push(this.createInventoryItemEntry(itemId));
          }
          return;
        }

        const follower = this.followerCatalogService.getCachedFollowerById(itemId);
        if (!follower) {
          throw new Error("Follower definition not found");
        }

        for (let i = 0; i < quantity; i += 1) {
          nextFollowers.push({
            followerId: follower.id,
            hpCurrent: Math.max(1, Math.floor(Number(follower.maxHp ?? 1))),
            state: "active",
          });
        }
      });

      turnEnded = buyQuantitiesByStockKey.size > 0;
      if (turnEnded) {
        const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
        const nextWorldState: WorldState = {
          ...worldState,
        };
        await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
        const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

        transaction.set(playerRef, {
          parameters: {
            ...player.parameters,
            mp: {
              ...player.parameters.mp,
              current: nextMpCurrent,
            },
          },
          inventory: {
            ...(player.inventory ?? { items: [], resources: [], money: 0 }),
            items: nextItems,
            money: runningMoney,
            resourceCapacity: this.getResourceCapacity(player),
            itemCapacity,
          },
          followers: nextFollowers,
          statuses: nextStatuses,
          actionsUsedThisTurn: this.markActionUsed(player, payload.actionId, worldTurn),
        }, { merge: true });

        transaction.set(worldStateRef, nextWorldState);
      } else {
        transaction.set(playerRef, {
          inventory: {
            ...(player.inventory ?? { items: [], resources: [], money: 0 }),
            items: nextItems,
            money: runningMoney,
            resourceCapacity: this.getResourceCapacity(player),
            itemCapacity,
          },
          followers: nextFollowers,
        }, { merge: true });
      }

      transaction.set(mapCellRef, {
        merchantStockByItemId: stockMap,
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    for (const line of lineOutcomes) {
      if (line.operation === "buy") {
        await this.tryCreateLog(gameId, actor, "player.merchantBuy", {
          actionId: payload.actionId,
          merchantId,
          kind: line.kind,
          itemId: line.itemId,
          itemName: line.itemName,
          quantity: line.quantity,
          spentCoins: Math.abs(line.totalCoinsDelta),
          turnEnded: true,
        });
        continue;
      }

      await this.tryCreateLog(gameId, actor, "player.merchantSell", {
        actionId: payload.actionId,
        merchantId,
        kind: line.kind,
        itemId: line.itemId,
        itemName: line.itemName,
        quantity: line.quantity,
        gainedCoins: Math.max(0, line.totalCoinsDelta),
      });
    }

    const netCoinsDelta = lineOutcomes.reduce((total, line) => total + line.totalCoinsDelta, 0);
    return {
      lines: lineOutcomes,
      netCoinsDelta,
      turnEnded,
    };
  }

  private async applyAlignmentFollowerAction(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    input: {
      actionId: "temple-send-devotee" | "altar-sacrifice";
      landmarkId: "temple" | "altar";
      targetAlignment: "good" | "evil";
      selectedFollowerId: string;
      experienceGain: number;
      discardReason: "released" | "lost";
      blockedCategories: string[];
      alreadyAlignedMessage: string;
      invalidLandmarkMessage: string;
      invalidFollowerMessage: string;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const selectedFollowerId = String(input.selectedFollowerId ?? "").trim();
    if (!selectedFollowerId) {
      throw new Error("Invalid follower selection");
    }

    await Promise.all([
      this.itemOwnershipService.loadConfig(),
      this.followerCatalogService.loadConfig(),
    ]);

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

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using landmark actions");

      const player = playerSnap.data() as Player;
      if ((player.alignment ?? "neutral") === input.targetAlignment) {
        throw new Error(input.alreadyAlignedMessage);
      }

      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, input.actionId, worldTurn, "You can only use this action once per turn.");

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
      this.ensurePlayerOnLandmark(mapCell, input.landmarkId, input.invalidLandmarkMessage);

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const allyIndex = normalizedFollowers.findIndex((entry) => {
        return entry.followerId === selectedFollowerId
          && entry.state !== "discarded"
          && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0;
      });

      if (allyIndex < 0) {
        throw new Error(input.invalidFollowerMessage);
      }

      const selectedFollower = normalizedFollowers[allyIndex];
      const selectedFollowerDefinition = this.followerCatalogService.getCachedFollowerById(selectedFollower.followerId);
      const selectedCategory = String(
        selectedFollower.categoryOverride
        ?? selectedFollowerDefinition?.category
        ?? "",
      ).trim().toLowerCase();

      if (input.blockedCategories.includes(selectedCategory)) {
        throw new Error(input.invalidFollowerMessage);
      }

      const nextFollowers = normalizedFollowers.map((entry) => ({ ...entry }));
      nextFollowers[allyIndex] = {
        ...selectedFollower,
        hpCurrent: 0,
        state: "discarded",
        discardReason: input.discardReason,
        discardedAtTurn: worldTurn,
      };

      const ownershipResolution = this.itemOwnershipService.enforceAlignmentConstraints({
        items: player.inventory?.items ?? [],
        alignment: input.targetAlignment,
      });

      const nextDroppedItems = [
        ...(mapCell.droppedItems ?? []),
        ...ownershipResolution.droppedItems,
      ];

      const progression = this.applyExperienceAndResolveLevelUps({
        currentLevel: player.level,
        currentExperience: player.experience,
        gainedExperience: input.experienceGain,
      });

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextPendingLevelUpChoices = Math.max(0, Math.floor(Number(player.pendingLevelUpChoices ?? 0)))
        + progression.pendingLevelUpChoices;

      const nextWorldState: WorldState = {
        ...worldState,
      };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: nextMpCurrent,
          },
        },
        alignment: input.targetAlignment,
        experience: progression.experience,
        level: progression.level,
        pendingLevelUpChoices: nextPendingLevelUpChoices,
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: ownershipResolution.keptItems,
          resourceCapacity: this.getResourceCapacity(player),
        },
        followers: nextFollowers,
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, input.actionId, worldTurn),
      }, { merge: true });

      if (ownershipResolution.droppedItems.length > 0) {
        transaction.set(mapCellRef, {
          droppedItems: nextDroppedItems,
        }, { merge: true });
      }

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });
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

  private resolveNextMpCurrentAfterTurnAdvance(player: Player, actorId: string, nextWorldState: WorldState): number {
    if (nextWorldState.activePlayerId !== actorId) {
      return player.parameters.mp.current;
    }

    return this.resolveMpRecoveredOnTurnStart(player);
  }

  private resolveMpRecoveredOnTurnStart(player: Player): number {
    const statusSnapshot = this.buildStatusEffectsSnapshot(this.normalizeStatuses(player.statuses));
    if (statusSnapshot.disableMpNaturalRegen || statusSnapshot.disableMpRecovery) {
      return Math.max(0, Math.floor(Number(player.parameters.mp.current ?? 0)));
    }

    return this.playerTurnEffectsService.calculateRecoveredMpCurrentOnTurnStart(player.parameters.mp);
  }

  private hasStatuses(statuses: Player["statuses"] | null | undefined): boolean {
    return Array.isArray(statuses) && statuses.length > 0;
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
      .map((status) => {
        const catalogStatus = this.statusCatalogService.getCachedStatus(status.key);
        const normalizedStatus: PlayerStatus = {
          key: status.key,
          label: typeof status.label === "string" && status.label.trim().length > 0
            ? status.label
            : (catalogStatus?.label ?? status.key),
          description: typeof status.description === "string"
            ? status.description
            : (catalogStatus?.description ?? ""),
          durationTurns: Math.max(1, Math.floor(status.durationTurns)),
        };

        if (typeof status.effectKey === "string" && status.effectKey.trim().length > 0) {
          normalizedStatus.effectKey = status.effectKey;
        } else if (typeof catalogStatus?.effectKey === "string" && catalogStatus.effectKey.trim().length > 0) {
          normalizedStatus.effectKey = catalogStatus.effectKey;
        }

        return normalizedStatus;
      });
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
    const normalized = this.normalizeStatuses(statuses);
    const cleaned = this.removeConflictingStatuses(this.applyMinifiedDominance(normalized));

    return this.decrementNormalizedStatuses(cleaned);
  }

  private decrementNormalizedStatuses(statuses: PlayerStatus[]): PlayerStatus[] {
    return statuses
      .map((status) => ({
        ...status,
        durationTurns: Math.floor(status.durationTurns) - 1,
      }))
      .filter((status) => status.durationTurns > 0);
  }

  private buildStatusEffectsSnapshot(statuses: PlayerStatus[]): {
    activeStatuses: PlayerStatus[];
    turnEndHpPercentDelta: number;
    maxSkipTurns: number;
    disableMpNaturalRegen: boolean;
    disableMpRecovery: boolean;
    disableHpRecovery: boolean;
  } {
    const activeStatuses = this.removeConflictingStatuses(this.applyMinifiedDominance(this.normalizeStatuses(statuses)));

    let turnEndHpPercentDelta = 0;
    let maxSkipTurns = 0;
    let disableMpNaturalRegen = false;
    let disableMpRecovery = false;
    let disableHpRecovery = false;

    for (const status of activeStatuses) {
      const effects = this.statusCatalogService.getCachedStatus(status.key)?.effects;
      if (!effects) continue;

      if (typeof effects.turnEndHpPercentDelta === "number" && Number.isFinite(effects.turnEndHpPercentDelta)) {
        turnEndHpPercentDelta += effects.turnEndHpPercentDelta;
      }

      if (typeof effects.skipTurns === "number" && Number.isFinite(effects.skipTurns) && effects.skipTurns > 0) {
        maxSkipTurns = Math.max(maxSkipTurns, Math.floor(effects.skipTurns));
      }

      disableMpNaturalRegen = disableMpNaturalRegen || effects.disableMpNaturalRegen === true;
      disableMpRecovery = disableMpRecovery || effects.disableMpRecovery === true;
      disableHpRecovery = disableHpRecovery || effects.disableHpRecovery === true;
    }

    return {
      activeStatuses,
      turnEndHpPercentDelta,
      maxSkipTurns,
      disableMpNaturalRegen,
      disableMpRecovery,
      disableHpRecovery,
    };
  }

  private applyMinifiedDominance(statuses: PlayerStatus[]): PlayerStatus[] {
    const hasMinified = statuses.some((status) => status.key === this.minifiedStatusKey);
    if (!hasMinified) {
      return statuses;
    }

    return statuses.filter((status) => {
      if (status.key === this.minifiedStatusKey) {
        return true;
      }

      const skipTurns = this.statusCatalogService.getCachedStatus(status.key)?.effects?.skipTurns;
      return typeof skipTurns === "number" && Number.isFinite(skipTurns) && skipTurns > 0;
    });
  }

  private removeConflictingStatuses(statuses: PlayerStatus[]): PlayerStatus[] {
    const hasPoison = statuses.some((status) => status.key === this.poisonStatusKey);
    const hasRegen = statuses.some((status) => status.key === this.regenStatusKey);
    if (!hasPoison || !hasRegen) {
      return statuses;
    }

    return statuses.filter((status) => status.key !== this.poisonStatusKey && status.key !== this.regenStatusKey);
  }

  private applyTurnEndHpPercentDelta(
    currentHp: number,
    hpMax: number,
    percentDelta: number,
    allowPositiveRecovery: boolean,
  ): number {
    if (!Number.isFinite(percentDelta) || percentDelta === 0) {
      return currentHp;
    }

    if (percentDelta > 0 && !allowPositiveRecovery) {
      return currentHp;
    }

    const magnitude = Math.max(1, Math.floor(hpMax * Math.abs(percentDelta)));
    if (percentDelta > 0) {
      return Math.min(hpMax, currentHp + magnitude);
    }

    return Math.max(0, currentHp - magnitude);
  }

  private resolveLuckBonusMultiplier(statuses: Player["statuses"]): number {
    const normalized = this.normalizeStatuses(statuses);
    const activeStatuses = this.removeConflictingStatuses(this.applyMinifiedDominance(normalized));

    let multiplier = 1;
    for (const status of activeStatuses) {
      const configured = this.statusCatalogService.getCachedStatus(status.key)?.effects?.luckBonusMultiplier;
      if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
        multiplier = Math.max(multiplier, configured);
      }
    }

    return multiplier;
  }

  private applyExperienceAndResolveLevelUps(input: {
    currentLevel: number;
    currentExperience: number;
    gainedExperience: number;
  }): {
    level: number;
    experience: number;
    pendingLevelUpChoices: number;
  } {
    let level = Math.max(1, Math.floor(Number(input.currentLevel ?? 1)));
    let experience = Math.max(0, Math.floor(Number(input.currentExperience ?? 0)))
      + Math.max(0, Math.floor(Number(input.gainedExperience ?? 0)));
    let pendingLevelUpChoices = 0;

    while (experience >= level) {
      experience -= level;
      level += 1;
      pendingLevelUpChoices += 1;
    }

    return {
      level,
      experience,
      pendingLevelUpChoices,
    };
  }

  private upsertStatus(statuses: PlayerStatus[], nextStatus: PlayerStatus): PlayerStatus[] {
    const next = statuses.filter((status) => status.key !== nextStatus.key);
    next.push(nextStatus);
    return next;
  }

  private areStatusesEquivalent(currentStatuses: Player["statuses"], nextStatuses: PlayerStatus[]): boolean {
    const currentNormalized = this.normalizeStatuses(currentStatuses);
    if (currentNormalized.length !== nextStatuses.length) {
      return false;
    }

    for (let i = 0; i < currentNormalized.length; i += 1) {
      const current = currentNormalized[i];
      const next = nextStatuses[i];
      if (
        current.key !== next.key
        || current.durationTurns !== next.durationTurns
        || current.label !== next.label
        || current.description !== next.description
        || current.effectKey !== next.effectKey
      ) {
        return false;
      }
    }

    return true;
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

  private resolveResourceGainQuantityForCell(input: {
    mapCell: MapCell;
    tilesConfig: Awaited<ReturnType<TilesConfigService["loadConfig"]>>;
    resourceLabel: ResourceLabel;
  }): number {
    const { mapCell, tilesConfig, resourceLabel } = input;
    if (mapCell.isSpecial === true) {
      return 1;
    }

    let multiplier = 1;
    const effectiveBiome = this.getEffectiveBiome(mapCell);
    const conditionIds = this.getEffectiveConditionIds(mapCell, tilesConfig.biomes[effectiveBiome]?.conditions ?? []);
    conditionIds.forEach((conditionId) => {
      const effect = this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect;
      if (!effect || effect.type !== "resource-gain-multiplier") {
        return;
      }

      if (Array.isArray(effect.resourceLabels) && effect.resourceLabels.length > 0 && !effect.resourceLabels.includes(resourceLabel)) {
        return;
      }

      if (typeof effect.multiplier !== "number" || !Number.isFinite(effect.multiplier) || effect.multiplier <= 0) {
        return;
      }

      multiplier = Math.max(multiplier, effect.multiplier);
    });

    return Math.max(1, Math.floor(multiplier));
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

  private getItemCapacity(player: Player): number {
    const configuredCapacity = player.inventory?.itemCapacity;
    if (typeof configuredCapacity === "number" && Number.isFinite(configuredCapacity)) {
      return Math.max(1, Math.floor(configuredCapacity));
    }

    return DEFAULT_ITEM_INVENTORY_CAPACITY;
  }

  private getEffectiveItemCapacity(player: Player): number {
    return this.getItemCapacity(player) + this.getFollowersItemCapacityBonus(player.followers);
  }

  private getFollowersItemCapacityBonus(rawFollowers: unknown): number {
    const followers = this.normalizeFollowers(rawFollowers);
    return followers.reduce((total, allyEntry) => {
      if (allyEntry.state === "discarded") {
        return total;
      }

      if (Math.max(0, Math.floor(Number(allyEntry.hpCurrent ?? 0))) <= 0) {
        return total;
      }

      const follower = this.followerCatalogService.getCachedFollowerById(allyEntry.followerId);
      if (!follower) {
        return total;
      }

      const itemCapacityBonus = Number(follower.itemCapacityBonus ?? 0);
      if (!Number.isFinite(itemCapacityBonus)) {
        return total;
      }

      return total + Math.max(0, Math.floor(itemCapacityBonus));
    }, 0);
  }

  private buildMerchantStockKey(kind: "item" | "follower", tradableId: string): string {
    return `${kind}:${tradableId}`;
  }

  private getOccupiedItemSlots(items: InventoryItemEntry[]): number {
    return items.reduce((count, entry) => {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      if (!item) return count;
      return count + (item.occupiesSpace ? 1 : 0);
    }, 0);
  }

  private normalizeInventoryItems(rawItems: unknown): InventoryItemEntry[] {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const items: InventoryItemEntry[] = [];
    rawItems.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        items.push({ itemId: entry.trim() });
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

      items.push({
        itemId: itemId.trim(),
        ...(typeof currentCharges === "number" ? { currentCharges } : {}),
      });
    });

    return items;
  }

  private normalizeFollowers(rawFollowers: unknown): PlayerFollowerEntry[] {
    if (!Array.isArray(rawFollowers)) {
      return [];
    }

    const followers: PlayerFollowerEntry[] = [];
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

      followers.push({
        followerId: followerId.trim(),
        hpCurrent,
        state,
        ...(discardReason ? { discardReason } : {}),
        ...(typeof discardedAtTurn === "number" ? { discardedAtTurn } : {}),
        ...(nameOverride ? { nameOverride } : {}),
        ...(categoryOverride ? { categoryOverride } : {}),
      });
    });

    return followers;
  }

  private hasActiveFollowerWithAction(rawFollowers: unknown, actionId: string): boolean {
    const followers = this.normalizeFollowers(rawFollowers);
    return followers.some((entry) => {
      if (entry.state === "discarded") {
        return false;
      }

      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) {
        return false;
      }

      const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      if (!follower || !Array.isArray(follower.actions)) {
        return false;
      }

      return follower.actions.includes(actionId);
    });
  }

  private createInventoryItemEntry(itemId: string): InventoryItemEntry {
    const item = this.itemCatalogService.getCachedItemById(itemId);
    const maxCharges = this.resolveMaxCharges(item?.maxCharges);
    if (typeof maxCharges === "number") {
      return {
        itemId,
        currentCharges: maxCharges,
      };
    }

    return { itemId };
  }

  private resolveMaxCharges(rawMaxCharges?: unknown): number | null {
    const parsed = Number(rawMaxCharges);
    if (Number.isFinite(parsed) && Math.floor(parsed) === parsed && parsed > 0) {
      return parsed;
    }

    return null;
  }

  private applyConfiguredItemTurnEffects(
    items: InventoryItemEntry[],
    biome: MapCell["biome"] | null,
  ): {
    items: InventoryItemEntry[];
    preventedBiomeConditionIds: Set<string>;
    logs: Array<{
      textKey: string;
      textParams: Record<string, unknown>;
    }>;
  } {
    const nextItems = items.map((entry) => ({ ...entry }));
    const preventedBiomeConditionIds = new Set<string>();
    const logs: Array<{
      textKey: string;
      textParams: Record<string, unknown>;
    }> = [];

    if (!biome) {
      return {
        items: nextItems,
        preventedBiomeConditionIds,
        logs,
      };
    }

    for (let index = 0; index < nextItems.length; index += 1) {
      const inventoryEntry = nextItems[index];
      if (!inventoryEntry) continue;

      const itemDefinition = this.itemCatalogService.getCachedItemById(inventoryEntry.itemId);
      if (!itemDefinition?.effects?.length) {
        continue;
      }

      for (const effectId of itemDefinition.effects) {
        const effect = this.itemEffectCatalogService.getCachedEffect(effectId);
        if (!effect || effect.biome !== biome) {
          continue;
        }

        if (effect.type === "prevent-biome-condition-damage-by-charge") {
          if (preventedBiomeConditionIds.has(effect.conditionId)) {
            continue;
          }

          const maxCharges = this.resolveMaxCharges(itemDefinition.maxCharges);
          if (typeof maxCharges !== "number") {
            continue;
          }

          const currentCharges = this.resolveCurrentCharges(nextItems[index], maxCharges);
          if (currentCharges < effect.consumeCharges) {
            continue;
          }

          const nextCharges = currentCharges - effect.consumeCharges;
          nextItems[index] = {
            ...nextItems[index],
            currentCharges: nextCharges,
          };
          preventedBiomeConditionIds.add(effect.conditionId);
          logs.push({
            textKey: "logs.system.itemPreventedCondition",
            textParams: {
              itemId: itemDefinition.id,
              nextCharges,
              maxCharges,
              conditionId: effect.conditionId,
            },
          });
          continue;
        }

        const maxCharges = this.resolveMaxCharges(itemDefinition.maxCharges);
        if (typeof maxCharges !== "number") {
          continue;
        }

        const currentCharges = this.resolveCurrentCharges(nextItems[index], maxCharges);
        if (currentCharges >= maxCharges) {
          continue;
        }

        const nextCharges = Math.min(maxCharges, currentCharges + effect.rechargeCharges);
        if (nextCharges === currentCharges) {
          continue;
        }

        nextItems[index] = {
          ...nextItems[index],
          currentCharges: nextCharges,
        };
        logs.push({
          textKey: "logs.system.itemRechargedInBiome",
          textParams: {
            itemId: itemDefinition.id,
            nextCharges,
            maxCharges,
            biome,
          },
        });
      }
    }

    return {
      items: nextItems,
      preventedBiomeConditionIds,
      logs,
    };
  }

  private resolveCurrentCharges(entry: InventoryItemEntry | null | undefined, maxCharges: number): number {
    if (!entry) return maxCharges;
    const parsed = Number(entry.currentCharges);
    if (!Number.isFinite(parsed)) {
      return maxCharges;
    }

    return Math.max(0, Math.min(maxCharges, Math.floor(parsed)));
  }

  private areInventoryItemsEquivalent(left: InventoryItemEntry[], right: InventoryItemEntry[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const leftEntry = left[index];
      const rightEntry = right[index];
      if (!leftEntry || !rightEntry) {
        return false;
      }

      if (leftEntry.itemId !== rightEntry.itemId) {
        return false;
      }

      const leftCharges = typeof leftEntry.currentCharges === "number"
        ? Math.max(0, Math.floor(leftEntry.currentCharges))
        : null;
      const rightCharges = typeof rightEntry.currentCharges === "number"
        ? Math.max(0, Math.floor(rightEntry.currentCharges))
        : null;

      if (leftCharges !== rightCharges) {
        return false;
      }
    }

    return true;
  }

  private areResourcesEquivalent(left: ResourceStack[], right: ResourceStack[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const leftEntry = left[index];
      const rightEntry = right[index];
      if (!leftEntry || !rightEntry) {
        return false;
      }

      if (leftEntry.label !== rightEntry.label) {
        return false;
      }

      if (Math.max(0, Math.floor(Number(leftEntry.quantity ?? 0))) !== Math.max(0, Math.floor(Number(rightEntry.quantity ?? 0)))) {
        return false;
      }
    }

    return true;
  }

  private areFollowersEquivalent(left: PlayerFollowerEntry[], right: PlayerFollowerEntry[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const leftEntry = left[index];
      const rightEntry = right[index];
      if (!leftEntry || !rightEntry) {
        return false;
      }

      if (leftEntry.followerId !== rightEntry.followerId) {
        return false;
      }

      if (Math.max(0, Math.floor(Number(leftEntry.hpCurrent ?? 0))) !== Math.max(0, Math.floor(Number(rightEntry.hpCurrent ?? 0)))) {
        return false;
      }

      if ((leftEntry.state === "discarded") !== (rightEntry.state === "discarded")) {
        return false;
      }

      if ((leftEntry.discardReason ?? null) !== (rightEntry.discardReason ?? null)) {
        return false;
      }

      if ((leftEntry.discardedAtTurn ?? null) !== (rightEntry.discardedAtTurn ?? null)) {
        return false;
      }

      if ((leftEntry.nameOverride ?? null) !== (rightEntry.nameOverride ?? null)) {
        return false;
      }

      if ((leftEntry.categoryOverride ?? null) !== (rightEntry.categoryOverride ?? null)) {
        return false;
      }
    }

    return true;
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
    targetBiome: MapCell["biome"],
  ): Promise<number> {
    const safeSize = Math.max(1, Math.floor(mapSize));
    const queue: Array<{ x: number; y: number }> = [{ x: startCell.x, y: startCell.y }];
    const visited = new Set<string>();
    let size = 0;
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
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
      if (cell.isSpecial === true || this.getEffectiveBiome(cell) !== targetBiome) continue;

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

  private getEffectiveBiome(mapCell: MapCell): MapCell["biome"] {
    return this.worldEventMapMutationService.getEffectiveBiome(mapCell);
  }

  private getEffectiveConditionIds(mapCell: MapCell, baseConditionIds: string[]): string[] {
    return this.worldEventMapMutationService.getEffectiveConditionIds(mapCell, baseConditionIds);
  }

  private isResourceLabel(value: unknown): value is ResourceLabel {
    return value === "food" || value === "timber" || value === "minerals" || value === "cloth";
  }
}
