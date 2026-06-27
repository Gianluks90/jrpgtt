import { Injectable } from "@angular/core";
import { collection, deleteField, doc, getDoc, getDocs, runTransaction, Timestamp, Transaction } from "firebase/firestore";
import { GameMap } from "@models/core/GameMap";
import { BiomeType, MapCell, SanctuaryElement } from "@models/world/MapCell";
import { SPECIAL_CELLS } from "../../consts/gameplay/special-cells";
import { InventoryItemEntry } from "@models/player/Inventory";
import { PlayerFollowerEntry } from "@models/player/Follower";
import { Player, PlayerStatus } from "@models/player/Player";
import { PlayerSpellEntry } from "@models/player/Spellbook";
import { ResourceLabel, ResourceStack } from "@models/world/Resource";
import { WorldState, PendingSpellEffectState } from "@models/world/WorldState";
import { QuadrantId } from "@models/world/WorldZone";
import { EventLogService } from "@services/gameplay/event-log-service";
import { FirebaseService } from "@services/app/firebase-service";
import { LuckService } from "@services/gameplay/luck-service";
import { PlayerProgressionService } from "@services/player/player-progression-service";
import { PlayerStatsModifierService } from "@services/player/player-stats-modifier-service";
import { PlayerTurnEffectsService } from "@services/player/player-turn-effects-service";
import { SafePlaceFastTravelService } from "@services/map/safe-place-fast-travel-service";
import { TilesConfigService } from "@services/catalog/tiles-config-service";
import { TurnService } from "@services/gameplay/turn-service";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../consts/gameplay/inventory-config";
import { DEFAULT_ITEM_INVENTORY_CAPACITY } from "../../consts/gameplay/inventory-config";
import { WorldZonesService } from "@services/map/world-zones-service";
import { getDoctorCostPerUnit, SafePlaceDoctorActionId } from "../../consts/gameplay/safe-place-actions";
import { BiomeConditionCatalogService } from "@services/catalog/biome-condition-catalog-service";
import { EnchantressRewardsConfigService } from "@services/catalog/enchantress-rewards-config-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { FollowerUpgradeService } from "@services/catalog/follower-upgrade-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { ItemOwnershipService } from "@services/player/item-ownership-service";
import { MerchantCatalogService } from "@services/catalog/merchant-catalog-service";
import { MerchantTradeOffersService } from "@services/player/merchant-trade-offers-service";
import { MysticRewardsConfigService } from "@services/catalog/mystic-rewards-config-service";
import { StatusCatalogService } from "@services/catalog/status-catalog-service";
import { ItemEffectCatalogService } from "@services/catalog/item-effect-catalog-service";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";
import { GraveyardResurrectRewardsConfigService } from "@services/catalog/graveyard-resurrect-rewards-config-service";
import { WorldEventMapMutationService } from "@services/map/world-event-map-mutation-service";
import { SpellCatalogService } from "@services/catalog/spell-catalog-service";
import { SpellDeckService } from "@services/gameplay/spell-deck-service";
import { AcademySpellUpgradeConfigService } from "@services/catalog/academy-spell-upgrade-config-service";
import { ChaosEffectsConfigService } from "@services/catalog/chaos-effects-config-service";
import { ChaosEffectDefinition } from "@models/catalog/ChaosEffectsConfig";
import { DEFAULT_SPELLBOOK_CAPACITY } from "../../consts/player/spellbook-config";

export interface CapitalEnchantressOutcome {
  rewardId: string;
  rewardLabel: string;
  clampedLuckTotal: number;
  rolledTotal: number;
  pendingMagicReward: boolean;
  overflowLuckyStrikeCandidate: boolean;
  learnedSpellId: string | null;
  learnedSpellName: string;
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
  kind?: "item" | "follower" | "spell";
  itemId: string;
  quantity: number;
}

export interface MerchantCheckoutLineOutcome {
  operation: "buy" | "sell";
  kind: "item" | "follower" | "spell";
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

export interface AcademySpellUpgradeOutcome {
  fromSpellId: string;
  fromSpellName: string;
  toSpellId: string;
  toSpellName: string;
  spentCoins: number;
}

@Injectable({
  providedIn: "root",
})
export class ActionExecutorService {
  private readonly sanctuaryActivationMpCost = 3;
  private readonly sanctuaryPrayerMpCost = 2;
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
    private followerUpgradeService: FollowerUpgradeService,
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
    private spellCatalogService: SpellCatalogService,
    private spellDeckService: SpellDeckService,
    private academySpellUpgradeConfigService: AcademySpellUpgradeConfigService,
    private chaosEffectsConfigService: ChaosEffectsConfigService,
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
    const paludeResult = { poisoned: false };

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
      const baseNextStatuses = this.decrementNormalizedStatuses(statusSnapshot.activeStatuses);

      // Palude (B-PL-006): apply poison when ending the turn on a swamp place card
      const hasPalude = (currentCell?.explorationEvents ?? []).some(
        (e) => e.type === "place" && e.cardId === "B-PL-006",
      );
      let nextStatuses = baseNextStatuses;
      if (hasPalude && !this.hasStatus(baseNextStatuses, this.poisonStatusKey)) {
        const poisonDef = this.statusCatalogService.getCachedStatus(this.poisonStatusKey);
        if (poisonDef) {
          const poisonStatus: PlayerStatus = {
            key: poisonDef.key,
            label: poisonDef.label,
            description: poisonDef.description,
            durationTurns: 3,
          };
          nextStatuses = this.upsertStatus(baseNextStatuses, poisonStatus);
          paludeResult.poisoned = true;
        }
      }

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
                  return null;
                }

                return {
                  ...allyEntry,
                  hpCurrent: nextFollowerHpCurrent,
                };
              }).filter((f): f is PlayerFollowerEntry => f !== null);
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
        return allyEntry.followerId === "B-FO-017"
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

      const elementalBondBefore = currentStatuses.find((s) => s.key === "elemental-bond");
      const elementalBondAfter = nextStatuses.find((s) => s.key === "elemental-bond");
      if (elementalBondBefore && !elementalBondAfter) {
        const revertedElement = elementalBondBefore.effectKey;
        nextPlayerPatch.attunedElement = (revertedElement as SanctuaryElement) || undefined;
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

    if (paludeResult.poisoned) {
      await this.tryCreateLog(gameId, actor, "player.placeSwampPoison", {});
    }

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

  public async castSpell(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: {
      spellId: string;
      target?: { x: number; y: number } | null;
      targetPlayerId?: string | null;
      selectedSpellId?: string | null;
      selectedKey?: string | null;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const spellId = String(payload.spellId ?? "").trim();
    if (!spellId) {
      throw new Error("Invalid spell");
    }

    await Promise.all([
      this.spellCatalogService.loadConfig(),
      this.statusCatalogService.loadConfig(),
      this.chaosEffectsConfigService.loadConfig(),
    ]);

    const spell = this.spellCatalogService.getSpell(spellId);
    if (!spell) {
      throw new Error("Spell not found");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameMapRef = doc(this.firebaseService.database, "games", gameId, "runtime", "gameMap");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    const targetPlayerId = typeof payload.targetPlayerId === "string" ? payload.targetPlayerId.trim() : null;
    const targetPlayerRef = targetPlayerId
      ? doc(this.firebaseService.database, "games", gameId, "players", targetPlayerId)
      : null;
    const selectedSpellId = typeof payload.selectedSpellId === "string" ? payload.selectedSpellId.trim() : null;
    const selectedKey = typeof payload.selectedKey === "string" ? payload.selectedKey.trim() : null;

    let logCode = "player.castSpell";
    let logArgs: Record<string, unknown> = {
      spellName: this.spellCatalogService.getLocalizedName(spell),
      spentMp: spell.mpCost,
    };

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap, gameMapSnap, gameSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
        transaction.get(gameMapRef),
        transaction.get(gameRef),
      ]);

      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      if (!playerSnap.exists()) {
        throw new Error("Player not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      const player = playerSnap.data() as Player;
      const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
      const mapSize = gameMapSnap.exists() ? ((gameMapSnap.data() as GameMap).size ?? 10) : 10;
      const ownerPlayerId = gameSnap.exists()
        ? (gameSnap.data() as { ownerId?: unknown }).ownerId
        : undefined;

      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      if (player.pendingResourcePickup) {
        throw new Error("Resolve pending resource pickup before casting a spell");
      }

      // Talisman (B-IT-011): silences the holder — cannot cast spells
      const hasTalisman = (player.inventory?.items ?? []).some((e) => {
        const it = this.itemCatalogService.getCachedItemById(e.itemId);
        return (it?.effects ?? []).some((fx) => {
          const ef = this.itemEffectCatalogService.getCachedEffect(fx);
          return ef?.type === "passive-self-silence-and-spell-immunity";
        });
      });
      if (hasTalisman) {
        throw new Error("You are silenced by the Talisman and cannot cast spells");
      }

      const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
      const spellEntry = knownSpells.find((entry) => entry.spellId === spell.id);
      if (!spellEntry) {
        throw new Error("You do not know this spell");
      }

      const blockedUntilTurn = Math.max(0, Math.floor(Number(spellEntry.blockedUntilTurn ?? 0)));
      if (blockedUntilTurn > worldTurn) {
        throw new Error("This spell is on cooldown");
      }

      const mpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
      const mpMax = Math.max(
        1,
        Math.floor(Number(typeof player.parameters?.mp?.max === "number" ? player.parameters.mp.max : player.parameters?.mp?.base)),
      );
      if (mpCurrent < spell.mpCost) {
        throw new Error("Not enough MP");
      }

      const currentCellRef = doc(
        this.firebaseService.database, "games", gameId, "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const currentCellSnap = await transaction.get(currentCellRef);
      const currentCell = currentCellSnap.exists() ? (currentCellSnap.data() as MapCell) : null;

      const nextWorldState: WorldState = {
        ...worldState,
      };
      let nextParameters: Player["parameters"] = {
        ...player.parameters,
        mp: {
          ...player.parameters.mp,
          current: Math.max(0, Math.min(mpMax, mpCurrent - spell.mpCost)),
        },
      };
      const nextPlayerPatch: Partial<Player> = {
        parameters: nextParameters,
      };

      const effectiveStats = this.playerStatsModifierService.computeStats({ player, currentCell, worldState, mapSize });
      const magicValue = effectiveStats.effective.magic;
      const scalar = this.spellCatalogService.computeEffectScalar(spell, magicValue);
      let spellEffectTargetPlayerIds: string[] | null = null;

      // COUNTERSPELL INTERCEPT — only for single-target player spells
      let interceptedByCounter = false;
      if (targetPlayerId && targetPlayerRef) {
        const counterCheckSnap = await transaction.get(targetPlayerRef);
        if (counterCheckSnap.exists()) {
          const counterCheckPlayer = counterCheckSnap.data() as Player;

          // Talisman immunity: target cannot be affected by other players' spells
          const targetHasTalisman = (counterCheckPlayer.inventory?.items ?? []).some((e) => {
            const it = this.itemCatalogService.getCachedItemById(e.itemId);
            return (it?.effects ?? []).some((fx) => {
              const ef = this.itemEffectCatalogService.getCachedEffect(fx);
              return ef?.type === "passive-self-silence-and-spell-immunity";
            });
          });
          if (targetHasTalisman) {
            interceptedByCounter = true;
            logCode = "player.castSpellBlocked";
            logArgs = { ...logArgs, targetPlayerName: counterCheckPlayer.name, reason: "talisman" };
          }

          const counterEntry = !targetHasTalisman
            ? this.normalizePlayerSpellEntries(counterCheckPlayer.spellbook?.spells).find((e) => {
                const s = this.spellCatalogService.getSpell(e.spellId);
                return s?.effect.type === "counter-spell-reaction"
                  && Math.max(0, Math.floor(Number(e.blockedUntilTurn ?? 0))) <= worldTurn;
              })
            : undefined;
          if (counterEntry) {
            const nowMs = Date.now();
            nextWorldState.pendingSpellEffect = {
              spellId: spell.id,
              casterId: actor.id,
              casterName: actor.name,
              targetPlayerId,
              ...(selectedSpellId ? { selectedSpellId } : {}),
              ...(selectedKey ? { selectedKey } : {}),
              ...(payload.target ? { target: payload.target } : {}),
              castAtTurn: worldTurn,
            };
            nextWorldState.requiredActionNotification = {
              type: "spell-pending-counter",
              notificationId: `spell-counter:${spell.id}:${worldTurn}:${actor.id}`,
              activatedByPlayerId: actor.id,
              activatedByPlayerName: actor.name,
              spellName: this.spellCatalogService.getLocalizedName(spell),
              spellEffectSummary: spell.ui.descriptionTemplate,
              canTargetCounter: true,
              requiredPlayerIds: [targetPlayerId],
              acknowledgedPlayerIds: [],
              createdAtMs: nowMs,
              lastActionAtMs: nowMs,
              ...(typeof ownerPlayerId === "string" ? { ownerPlayerId } : {}),
            };
            interceptedByCounter = true;
            logCode = "player.castSpellCounterPending";
            logArgs = { ...logArgs, targetPlayerName: counterCheckPlayer.name };
          }
        }
      }

      if (spell.effect.type === "heal-self") {
        const hpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));
        const hpMax = Math.max(
          1,
          Math.floor(Number(typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base)),
        );
        const healedHp = Math.max(0, Math.min(hpMax - hpCurrent, scalar));

        nextParameters = {
          ...nextParameters,
          hp: {
            ...player.parameters.hp,
            current: hpCurrent + healedHp,
          },
        };
        nextPlayerPatch.parameters = nextParameters;

        logCode = "player.castSpellHeal";
        logArgs = {
          ...logArgs,
          healedHp,
        };
      }

      if (spell.effect.type === "apply-status-self") {
        const statusKey = typeof spell.effect.statusKey === "string" ? spell.effect.statusKey : "";
        const statusDefinition = this.statusCatalogService.getCachedStatus(statusKey);
        if (!statusDefinition) {
          throw new Error("Invalid spell status effect");
        }

        const nextStatuses = this.upsertStatus(this.normalizeStatuses(player.statuses), {
          key: statusDefinition.key,
          label: statusDefinition.label,
          description: statusDefinition.description,
          durationTurns: scalar,
          ...(statusDefinition.effectKey ? { effectKey: statusDefinition.effectKey } : {}),
        });
        nextPlayerPatch.statuses = nextStatuses;

        logCode = "player.castSpellStatus";
        logArgs = {
          ...logArgs,
          statusKey: statusDefinition.key,
          durationTurns: scalar,
        };
      }

      if (spell.effect.type === "enable-diagonal-movement") {
        const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
        if (movedThisTurnByPlayer[actor.id] === worldTurn) {
          throw new Error("Fly must be cast before moving");
        }

        nextWorldState.diagonalMovementByPlayer = {
          ...(worldState.diagonalMovementByPlayer ?? {}),
          [actor.id]: worldTurn,
        };

        logCode = "player.castSpellDiagonal";
      }

      if (spell.effect.type === "teleport-explored-orthogonal") {
        if (!payload.target) {
          throw new Error("Teleport target is required");
        }

        const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
        if (movedThisTurnByPlayer[actor.id] === worldTurn) {
          throw new Error("Teleport can only be used before your standard movement");
        }

        const targetX = Math.max(0, Math.floor(Number(payload.target.x ?? 0)));
        const targetY = Math.max(0, Math.floor(Number(payload.target.y ?? 0)));
        if (!this.isInsideBounds(targetX, targetY, mapSize)) {
          throw new Error("Target cell is out of bounds");
        }

        const targetDistance = Math.abs(targetX - player.location.x) + Math.abs(targetY - player.location.y);
        if (targetDistance <= 0 || targetDistance > scalar) {
          throw new Error("Teleport target is out of range");
        }

        const targetCellRef = doc(
          this.firebaseService.database,
          "games",
          gameId,
          "mapCells",
          this.cellId(targetX, targetY),
        );
        const targetCellSnap = await transaction.get(targetCellRef);
        if (!targetCellSnap.exists()) {
          throw new Error("Target cell is not explored");
        }

        nextPlayerPatch.location = {
          x: targetX,
          y: targetY,
        };
        nextWorldState.movedThisTurnByPlayer = {
          ...movedThisTurnByPlayer,
          [actor.id]: worldTurn,
        };

        logCode = "player.castSpellTeleport";
        logArgs = {
          ...logArgs,
          targetX: targetX + 1,
          targetY: targetY + 1,
          range: scalar,
        };
      }

      if (spell.effect.type === "transform-current-cell-biome") {
        const currentCellRef = doc(
          this.firebaseService.database,
          "games",
          gameId,
          "mapCells",
          this.cellId(player.location.x, player.location.y),
        );
        const currentCellSnap = await transaction.get(currentCellRef);
        if (!currentCellSnap.exists()) {
          throw new Error("You are not standing on a revealed cell");
        }

        const currentCell = currentCellSnap.data() as MapCell;
        if (currentCell.isSpecial === true) {
          throw new Error("This spell cannot transform special cells");
        }

        const targetBiome = typeof spell.effect.biome === "string" ? spell.effect.biome : "";
        if (!targetBiome) {
          throw new Error("Invalid transform biome");
        }

        transaction.set(currentCellRef, {
          biome: targetBiome,
          worldEventBiomeOverride: deleteField(),
          worldEventConditionIds: deleteField(),
          worldEventEnemyLevelBonus: deleteField(),
        }, { merge: true });

        logCode = "player.castSpellTransform";
        logArgs = {
          ...logArgs,
          biome: targetBiome,
          x: player.location.x + 1,
          y: player.location.y + 1,
        };
      }

      if (spell.effect.type === "gain-coins") {
        const baseAmount = Math.max(0, Math.floor(Number(spell.effect.baseAmount ?? 0)));
        const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
        nextPlayerPatch.inventory = {
          ...player.inventory,
          money: currentMoney + baseAmount,
        };
        logCode = "player.castSpellGainCoins";
        logArgs = { ...logArgs, coinsGained: baseAmount };
      }

      if (spell.effect.type === "remove-status-self") {
        const currentStatuses = this.normalizeStatuses(player.statuses);
        const negativeStatus = currentStatuses.find((s) => {
          const def = this.statusCatalogService.getCachedStatus(s.key);
          return def?.isNegative === true;
        });
        nextPlayerPatch.statuses = negativeStatus
          ? currentStatuses.filter((s) => s.key !== negativeStatus.key)
          : currentStatuses;
        logCode = "player.castSpellDispel";
        logArgs = { ...logArgs, removedStatus: negativeStatus?.key ?? "none" };
      }

      if (spell.effect.type === "remove-all-negative-statuses-self") {
        const currentStatuses = this.normalizeStatuses(player.statuses);
        const cleanedStatuses = currentStatuses.filter((s) => {
          const def = this.statusCatalogService.getCachedStatus(s.key);
          return def?.isNegative !== true;
        });
        nextPlayerPatch.statuses = cleanedStatuses;
        logCode = "player.castSpellPurify";
        logArgs = { ...logArgs, removedCount: currentStatuses.length - cleanedStatuses.length };
      }

      if (spell.effect.type === "remove-negative-follower-self") {
        const activeFollowers = (player.followers ?? []).filter((f) => f.state !== "discarded");
        const negativeFollower = activeFollowers.find((f) => {
          const def = this.followerCatalogService.getCachedFollowerById(f.followerId);
          return def?.isNegative === true;
        });
        if (negativeFollower) {
          nextPlayerPatch.followers = (player.followers ?? []).filter((f) =>
            !(f.followerId === negativeFollower.followerId && f.state !== "discarded"),
          );
        }
        logCode = "player.castSpellRemoveFollower";
        logArgs = { ...logArgs, removedFollowerId: negativeFollower?.followerId ?? "none" };
      }

      if (!interceptedByCounter && (spell.effect.type === "apply-status-target" || spell.effect.type === "skip-turn-target")) {
        if (!targetPlayerRef || !targetPlayerId) {
          throw new Error("Target player is required for this spell");
        }

        const statusKey = typeof spell.effect.statusKey === "string" ? spell.effect.statusKey : "";
        const statusDefinition = this.statusCatalogService.getCachedStatus(statusKey);
        if (!statusDefinition) {
          throw new Error("Invalid spell status effect");
        }

        const targetPlayerSnap = await transaction.get(targetPlayerRef);
        if (!targetPlayerSnap.exists()) {
          throw new Error("Target player not found");
        }
        const targetPlayer = targetPlayerSnap.data() as Player;
        const durationTurns = Math.max(1, Math.floor(
          Number(spell.effect.baseDurationTurns ?? 1) + scalar * Number(spell.effect.durationPerMagic ?? 0),
        ));

        let targetStatuses = this.upsertStatus(this.normalizeStatuses(targetPlayer.statuses), {
          key: statusDefinition.key,
          label: statusDefinition.label,
          description: statusDefinition.description,
          durationTurns,
          ...(statusDefinition.effectKey ? { effectKey: statusDefinition.effectKey } : {}),
        });

        for (const extraKey of spell.effect.additionalStatusKeys ?? []) {
          const extraDef = this.statusCatalogService.getCachedStatus(extraKey);
          if (extraDef) {
            targetStatuses = this.upsertStatus(targetStatuses, {
              key: extraDef.key,
              label: extraDef.label,
              description: extraDef.description,
              durationTurns,
              ...(extraDef.effectKey ? { effectKey: extraDef.effectKey } : {}),
            });
          }
        }

        transaction.set(targetPlayerRef, { statuses: targetStatuses }, { merge: true });

        logCode = "player.castSpellStatusTarget";
        logArgs = {
          ...logArgs,
          targetPlayerName: targetPlayer.name,
          statusKey: statusDefinition.key,
          durationTurns,
        };
        spellEffectTargetPlayerIds = [targetPlayerId];
      }

      if (!interceptedByCounter && (
        spell.effect.type === "steal-coins" ||
        spell.effect.type === "drain-mp-target" ||
        spell.effect.type === "steal-follower" ||
        spell.effect.type === "copy-random-spell" ||
        spell.effect.type === "forget-random-spell-target" ||
        spell.effect.type === "copy-chosen-spell" ||
        spell.effect.type === "forget-chosen-spell-target"
      )) {
        if (!targetPlayerRef || !targetPlayerId) {
          throw new Error("Target player is required for this spell");
        }

        const targetPlayerSnap = await transaction.get(targetPlayerRef);
        if (!targetPlayerSnap.exists()) {
          throw new Error("Target player not found");
        }
        const targetPlayer = targetPlayerSnap.data() as Player;

        const playerLuck = Math.max(0, Math.floor(Number(player.parameters?.luck?.current ?? player.parameters?.luck?.base ?? 0)));
        const luckThreshold = typeof spell.effect.luckThreshold === "number" ? spell.effect.luckThreshold : null;
        const luckResult = luckThreshold !== null
          ? this.luckService.checkLuck(playerLuck * this.resolveLuckBonusMultiplier(player.statuses), { successThreshold: 100 })
          : null;
        const luckSuccess = luckResult === null || luckResult.total >= luckThreshold!;

        if (spell.effect.type === "steal-coins") {
          const amount = Math.max(0, Math.floor(Number(spell.effect.baseAmount ?? 0)));
          const targetMoney = Math.max(0, Math.floor(Number(targetPlayer.inventory?.money ?? 0)));
          const stolen = Math.min(amount, targetMoney);
          const selfMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));

          if (luckSuccess && stolen > 0) {
            transaction.set(targetPlayerRef, { inventory: { ...targetPlayer.inventory, money: targetMoney - stolen } }, { merge: true });
            nextPlayerPatch.inventory = { ...player.inventory, money: selfMoney + stolen };
          }
          logCode = "player.castSpellStealCoins";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, amount: stolen, success: luckSuccess };
        }

        if (spell.effect.type === "drain-mp-target") {
          const amount = Math.max(1, Math.floor(Number(spell.effect.baseAmount ?? 1)));
          const targetMpCurrent = Math.max(0, Math.floor(Number(targetPlayer.parameters?.mp?.current ?? 0)));
          const drained = Math.min(amount, targetMpCurrent);
          const selfMpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
          const selfMpMax = Math.max(1, Math.floor(Number(
            typeof player.parameters?.mp?.max === "number" ? player.parameters.mp.max : player.parameters?.mp?.base,
          )));

          if (luckSuccess && drained > 0) {
            transaction.set(targetPlayerRef, {
              parameters: { ...targetPlayer.parameters, mp: { ...targetPlayer.parameters.mp, current: targetMpCurrent - drained } },
            }, { merge: true });
            nextPlayerPatch.parameters = {
              ...nextPlayerPatch.parameters!,
              mp: { ...player.parameters.mp, current: Math.min(selfMpMax, selfMpCurrent - spell.mpCost + drained) },
            };
          }
          logCode = "player.castSpellDrainMp";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, amount: drained, success: luckSuccess };
        }

        if (spell.effect.type === "steal-follower") {
          const targetActiveFollowers = (targetPlayer.followers ?? []).filter((f) => f.state !== "discarded");
          const randomFollower = targetActiveFollowers.length > 0
            ? targetActiveFollowers[Math.floor(Math.random() * targetActiveFollowers.length)]
            : null;

          if (luckSuccess && randomFollower) {
            transaction.set(targetPlayerRef, {
              followers: (targetPlayer.followers ?? []).filter((f) => f.followerId !== randomFollower.followerId),
            }, { merge: true });
            nextPlayerPatch.followers = [
              ...(player.followers ?? []),
              { followerId: randomFollower.followerId, hpCurrent: randomFollower.hpCurrent },
            ];
          }
          logCode = "player.castSpellStealFollower";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, followerId: randomFollower?.followerId ?? "none", success: luckSuccess };
        }

        if (spell.effect.type === "copy-random-spell") {
          const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
          const randomEntry = targetKnownSpells.length > 0
            ? targetKnownSpells[Math.floor(Math.random() * targetKnownSpells.length)]
            : null;
          const selfKnownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
          const selfCapacity = this.getSpellbookCapacity(player);
          const alreadyKnows = randomEntry ? selfKnownSpells.some((e) => e.spellId === randomEntry.spellId) : false;

          if (randomEntry && !alreadyKnows && selfKnownSpells.length < selfCapacity) {
            nextPlayerPatch.spellbook = {
              spells: this.normalizePlayerSpellEntries([...selfKnownSpells, { spellId: randomEntry.spellId }]),
              capacity: selfCapacity,
            };
          }
          logCode = "player.castSpellCopySpell";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, copiedSpellId: randomEntry?.spellId ?? "none" };
        }

        if (spell.effect.type === "forget-random-spell-target") {
          const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
          const randomEntry = targetKnownSpells.length > 0
            ? targetKnownSpells[Math.floor(Math.random() * targetKnownSpells.length)]
            : null;

          if (randomEntry) {
            transaction.set(targetPlayerRef, {
              spellbook: {
                spells: this.normalizePlayerSpellEntries(targetKnownSpells.filter((e) => e.spellId !== randomEntry.spellId)),
                capacity: this.getSpellbookCapacity(targetPlayer),
              },
            }, { merge: true });
          }
          logCode = "player.castSpellForgetSpell";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, forgottenSpellId: randomEntry?.spellId ?? "none" };
        }

        if (spell.effect.type === "copy-chosen-spell") {
          const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
          const chosenEntry = selectedSpellId
            ? targetKnownSpells.find((e) => e.spellId === selectedSpellId) ?? null
            : null;
          const selfKnownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
          const selfCapacity = this.getSpellbookCapacity(player);
          const alreadyKnows = chosenEntry ? selfKnownSpells.some((e) => e.spellId === chosenEntry.spellId) : false;

          if (chosenEntry && !alreadyKnows && selfKnownSpells.length < selfCapacity) {
            nextPlayerPatch.spellbook = {
              spells: this.normalizePlayerSpellEntries([...selfKnownSpells, { spellId: chosenEntry.spellId }]),
              capacity: selfCapacity,
            };
          }
          logCode = "player.castSpellCopySpell";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, copiedSpellId: chosenEntry?.spellId ?? "none" };
        }

        if (spell.effect.type === "forget-chosen-spell-target") {
          const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
          const chosenEntry = selectedSpellId
            ? targetKnownSpells.find((e) => e.spellId === selectedSpellId) ?? null
            : null;

          if (chosenEntry) {
            transaction.set(targetPlayerRef, {
              spellbook: {
                spells: this.normalizePlayerSpellEntries(targetKnownSpells.filter((e) => e.spellId !== chosenEntry.spellId)),
                capacity: this.getSpellbookCapacity(targetPlayer),
              },
            }, { merge: true });
          }
          logCode = "player.castSpellForgetSpell";
          logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, forgottenSpellId: chosenEntry?.spellId ?? "none" };
        }
        spellEffectTargetPlayerIds = [targetPlayerId];
      }

      if (spell.effect.type === "alchemize-item") {
        const itemEntry = (player.inventory?.items ?? []).find((e) => e.itemId === selectedKey);
        const itemDef = itemEntry ? this.itemCatalogService.getCachedItemById(itemEntry.itemId) : null;
        const goldValue = itemDef ? Math.max(0, Math.floor(Number(itemDef.purchaseValue ?? 0))) : 0;

        nextPlayerPatch.inventory = {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: (player.inventory?.items ?? []).filter((e) => e.itemId !== selectedKey),
          money: Math.max(0, Math.floor(Number(player.inventory?.money ?? 0))) + goldValue,
        };
        logCode = "player.castSpellAlchemy";
        logArgs = { ...logArgs, itemId: selectedKey ?? "none", goldValue };
      }

      if (spell.effect.type === "transmute-resource") {
        const allResourceLabels: ResourceLabel[] = ["timber", "food", "minerals", "cloth"];
        const sourceLabel = allResourceLabels.includes(selectedKey as ResourceLabel) ? selectedKey as ResourceLabel : null;
        const currentResources = (player.inventory?.resources ?? []).map((r) => ({ ...r }));
        const sourceStack = sourceLabel ? currentResources.find((r) => r.label === sourceLabel) : null;
        const otherLabels = allResourceLabels.filter((l) => l !== sourceLabel);
        const targetLabel = otherLabels[Math.floor(Math.random() * otherLabels.length)];

        if (sourceStack && sourceStack.quantity > 0 && targetLabel) {
          sourceStack.quantity -= 1;
          const targetStack = currentResources.find((r) => r.label === targetLabel);
          if (targetStack) {
            targetStack.quantity += 1;
          } else {
            currentResources.push({ label: targetLabel, quantity: 1 });
          }
          nextPlayerPatch.inventory = {
            ...(player.inventory ?? { items: [], resources: [], money: 0 }),
            resources: currentResources.filter((r) => r.quantity > 0),
          };
        }
        logCode = "player.castSpellTransmute";
        logArgs = { ...logArgs, sourceLabel: sourceLabel ?? "none", targetLabel: targetLabel ?? "none" };
      }

      if (spell.effect.type === "change-element-temp") {
        const newElement = selectedKey as SanctuaryElement | null;
        if (newElement) {
          const previousElement = player.attunedElement ?? "";
          const durationTurns = Math.max(1, this.spellCatalogService.computeEffectScalar(spell, magicValue));
          const elementalBondStatus: PlayerStatus = {
            key: "elemental-bond",
            label: "Elemental Bond",
            description: "Temporary elemental attunement",
            durationTurns,
            effectKey: previousElement,
          };
          const currentStatuses = this.normalizeStatuses(player.statuses);
          nextPlayerPatch.statuses = [
            ...currentStatuses.filter((s) => s.key !== "elemental-bond"),
            elementalBondStatus,
          ];
          nextPlayerPatch.attunedElement = newElement;
        }
        logCode = "player.castSpellElementalBond";
        logArgs = { ...logArgs, newElement: newElement ?? "none" };
      }

      if (spell.effect.type === "reveal-cell") {
        const targetX = typeof payload.target?.x === "number" ? payload.target.x : null;
        const targetY = typeof payload.target?.y === "number" ? payload.target.y : null;
        if (targetX === null || targetY === null) throw new Error("Target cell required for reveal-cell");

        const targetCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(targetX, targetY));
        const targetCellSnap = await transaction.get(targetCellRef);

        if (!targetCellSnap.exists()) {
          if (nextWorldState.remainingDeck.length === 0 && (nextWorldState.discardedDeck?.length ?? 0) > 0) {
            nextWorldState.remainingDeck = this.shuffleLocal([...nextWorldState.discardedDeck]);
            nextWorldState.discardedDeck = [];
          }
          const drawnBiome = (nextWorldState.remainingDeck.shift() ?? "plains") as BiomeType;
          nextWorldState.placedBiomeCount = {
            ...(nextWorldState.placedBiomeCount ?? {}),
            [drawnBiome]: ((nextWorldState.placedBiomeCount?.[drawnBiome] ?? 0) + 1),
          };
          transaction.set(targetCellRef, {
            x: targetX, y: targetY,
            biome: drawnBiome,
            revealedAtTurn: worldTurn,
            discoveredBy: actor.id,
          } satisfies Partial<MapCell>);
        }
        logCode = "player.castSpellReveal";
        logArgs = { ...logArgs, targetX, targetY };
      }

      if (spell.effect.type === "remove-local-event") {
        const targetX = typeof payload.target?.x === "number" ? payload.target.x : null;
        const targetY = typeof payload.target?.y === "number" ? payload.target.y : null;
        if (targetX === null || targetY === null) throw new Error("Target cell required for remove-local-event");

        const targetCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(targetX, targetY));
        const targetCellSnap = await transaction.get(targetCellRef);

        if (targetCellSnap.exists()) {
          const targetCell = targetCellSnap.data() as MapCell;
          const events = Array.isArray(targetCell.explorationEvents) ? targetCell.explorationEvents : [];
          if (events.length > 0) {
            transaction.set(targetCellRef, { explorationEvents: events.slice(1) }, { merge: true });
          }
        }
        logCode = "player.castSpellDestroy";
        logArgs = { ...logArgs, targetX, targetY };
      }

      if (spell.effect.type === "block-all-spells") {
        const durationTurns = Math.max(1, scalar);
        const silenceStatusDef = this.statusCatalogService.getCachedStatus("silence");
        const allPlayerIds = worldState.turnOrder ?? [];

        for (const pid of allPlayerIds) {
          if (pid === actor.id) continue;
          const pRef = doc(this.firebaseService.database, "games", gameId, "players", pid);
          const pSnap = await transaction.get(pRef);
          if (!pSnap.exists()) continue;
          const p = pSnap.data() as Player;
          const pStatuses = this.normalizeStatuses(p.statuses);
          if (pStatuses.some((s) => s.key === "silence")) continue;
          pStatuses.push({
            key: "silence",
            label: silenceStatusDef?.label ?? "Silence",
            description: silenceStatusDef?.description ?? "Cannot cast spells",
            durationTurns,
            ...(silenceStatusDef?.effectKey ? { effectKey: silenceStatusDef.effectKey } : {}),
          });
          transaction.set(pRef, { statuses: pStatuses }, { merge: true });
        }
        logCode = "player.castSpellBlockAllSpells";
        logArgs = { ...logArgs, durationTurns };
        spellEffectTargetPlayerIds = allPlayerIds.filter((id) => id !== actor.id);
      }

      if (spell.effect.type === "return-to-attuned-sanctuary") {
        const attunedElement = player.attunedElement ?? null;
        const sanctuaryInfluence = worldState.sanctuaryInfluenceByQuadrant ?? {};
        let destCoord: { x: number; y: number } | null = null;

        if (attunedElement) {
          for (const coord of SPECIAL_CELLS) {
            const qId = this.cellQuadrant(coord.x, coord.y, mapSize);
            if (sanctuaryInfluence[qId] === attunedElement) {
              destCoord = coord;
              break;
            }
          }
        }

        if (!destCoord) {
          let minDist = Infinity;
          for (const coord of SPECIAL_CELLS) {
            const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", this.cellId(coord.x, coord.y));
            const cellSnap = await transaction.get(cellRef);
            if (!cellSnap.exists()) continue;
            if ((cellSnap.data() as MapCell).active !== true) continue;
            const dist = Math.abs(coord.x - player.location.x) + Math.abs(coord.y - player.location.y);
            if (dist < minDist) { minDist = dist; destCoord = coord; }
          }
        }

        if (destCoord) {
          nextPlayerPatch.location = destCoord;
          nextWorldState.movedThisTurnByPlayer = {
            ...(nextWorldState.movedThisTurnByPlayer ?? {}),
            [actor.id]: worldTurn,
          };
        }
        logCode = "player.castSpellRecall";
        logArgs = { ...logArgs, attunedElement: attunedElement ?? "none", destX: destCoord?.x ?? null, destY: destCoord?.y ?? null };
      }

      if (!interceptedByCounter && spell.effect.type === "apply-random-effect-target") {
        if (!targetPlayerRef || !targetPlayerId) {
          throw new Error("Target player is required for this spell");
        }
        const chaosConfig = await this.chaosEffectsConfigService.loadConfig();
        const rolledEffect = this.rollWeightedChaosEffect(chaosConfig.effects);

        const targetPlayerSnap = await transaction.get(targetPlayerRef);
        if (!targetPlayerSnap.exists()) {
          throw new Error("Target player not found");
        }
        const targetPlayer = targetPlayerSnap.data() as Player;

        if (rolledEffect) {
          if (rolledEffect.effectType === "apply-status" && rolledEffect.statusKey) {
            const statusDef = this.statusCatalogService.getCachedStatus(rolledEffect.statusKey);
            if (statusDef) {
              const durationTurns = Math.max(1, rolledEffect.durationTurns ?? 1);
              const targetStatuses = this.upsertStatus(this.normalizeStatuses(targetPlayer.statuses), {
                key: statusDef.key,
                label: statusDef.label,
                description: statusDef.description,
                durationTurns,
                ...(statusDef.effectKey ? { effectKey: statusDef.effectKey } : {}),
              });
              transaction.set(targetPlayerRef, { statuses: targetStatuses }, { merge: true });
            }
          } else if (rolledEffect.effectType === "steal-coins") {
            const amount = Math.max(1, rolledEffect.amount ?? 5);
            const targetMoney = Math.max(0, Math.floor(Number(targetPlayer.inventory?.money ?? 0)));
            const stolen = Math.min(amount, targetMoney);
            const selfMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
            if (stolen > 0) {
              transaction.set(targetPlayerRef, { inventory: { ...targetPlayer.inventory, money: targetMoney - stolen } }, { merge: true });
              nextPlayerPatch.inventory = { ...(player.inventory ?? { items: [], resources: [], money: 0 }), money: selfMoney + stolen };
            }
          } else if (rolledEffect.effectType === "drain-mp") {
            const amount = Math.max(1, rolledEffect.amount ?? 3);
            const targetMpCurrent = Math.max(0, Math.floor(Number(targetPlayer.parameters?.mp?.current ?? 0)));
            const drained = Math.min(amount, targetMpCurrent);
            if (drained > 0) {
              transaction.set(targetPlayerRef, {
                parameters: { ...targetPlayer.parameters, mp: { ...targetPlayer.parameters.mp, current: targetMpCurrent - drained } },
              }, { merge: true });
            }
          }
        }

        spellEffectTargetPlayerIds = [targetPlayerId];
        logCode = "player.castSpellChaos";
        logArgs = { ...logArgs, targetPlayerName: targetPlayer.name, effectId: rolledEffect?.id ?? "none" };
      }

      if (spell.effect.type === "copy-stat-gain") {
        const lastStatGain = worldState.lastStatGain;
        if (!lastStatGain || (lastStatGain.parameter !== "strength" && lastStatGain.parameter !== "magic")) {
          throw new Error("No stat gain to copy — wait until another player trains or levels up STR or MAG.");
        }

        const param = lastStatGain.parameter;
        const targetParam = player.parameters[param];
        const nextParam = {
          ...targetParam,
          base: Math.max(0, Math.floor(Number(targetParam.base ?? 0))) + 1,
          current: Math.max(0, Math.floor(Number(targetParam.current ?? 0))) + 1,
          ...(typeof targetParam.max === "number"
            ? { max: Math.max(0, Math.floor(Number(targetParam.max))) + 1 }
            : {}),
        };
        nextParameters = { ...nextParameters, [param]: nextParam };
        nextPlayerPatch.parameters = nextParameters;

        logCode = "player.castSpellCopyStatGain";
        logArgs = {
          ...logArgs,
          parameter: param,
          copiedFromPlayerName: lastStatGain.gainedByPlayerName,
          newValue: nextParam.base,
        };
      }

      if (!interceptedByCounter && spellEffectTargetPlayerIds && spellEffectTargetPlayerIds.length > 0) {
        const nowMs = Date.now();
        nextWorldState.requiredActionNotification = {
          type: "spell-effect-on-player",
          notificationId: `spell-effect:${spell.id}:${worldTurn}:${actor.id}`,
          activatedByPlayerId: actor.id,
          activatedByPlayerName: actor.name,
          spellName: this.spellCatalogService.getLocalizedName(spell),
          spellEffectSummary: spell.ui.descriptionTemplate,
          requiredPlayerIds: spellEffectTargetPlayerIds,
          acknowledgedPlayerIds: [],
          createdAtMs: nowMs,
          lastActionAtMs: nowMs,
          ...(typeof ownerPlayerId === "string" ? { ownerPlayerId } : {}),
        };
      }

      const nextSpellEntries = knownSpells
        .map((entry) => ({ ...entry }))
        .filter((entry) => entry.spellId !== spell.id);

      if (spell.consumableOnCast !== true) {
        const cooldownTurns = Math.max(0, Math.floor(Number(spell.cooldownTurns ?? 0)));
        const blockedTurn = cooldownTurns > 0 ? worldTurn + cooldownTurns : 0;
        nextSpellEntries.push({
          ...spellEntry,
          ...(blockedTurn > 0 ? { blockedUntilTurn: blockedTurn } : { blockedUntilTurn: undefined }),
        });
      }

      // Magic Wand (B-IT-014): draw a spell when the spellbook becomes empty
      if (nextSpellEntries.length === 0) {
        const hasMagicWand = (player.inventory?.items ?? []).some((e) => {
          const it = this.itemCatalogService.getCachedItemById(e.itemId);
          return (it?.effects ?? []).some((fx) => {
            const ef = this.itemEffectCatalogService.getCachedEffect(fx);
            return ef?.type === "draw-spell-on-spellbook-empty";
          });
        });
        if (hasMagicWand) {
          const drawResult = this.spellDeckService.draw(
            nextWorldState.spellDeck ?? [],
            nextWorldState.spellDiscardedDeck ?? [],
            1,
          );
          const drawnSpellId = drawResult.drawn[0] ?? null;
          if (drawnSpellId) {
            nextSpellEntries.push({ spellId: drawnSpellId, source: "item", occupiesSlot: true });
            nextWorldState.spellDeck = drawResult.remaining;
            nextWorldState.spellDiscardedDeck = drawResult.discard;
          }
        }
      }

      nextPlayerPatch.spellbook = {
        spells: this.normalizePlayerSpellEntries(nextSpellEntries),
        capacity: this.getSpellbookCapacity(player),
      };

      transaction.set(playerRef, nextPlayerPatch, { merge: true });
      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, logCode, logArgs);
  }

  public async activateSanctuary(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await this.spellCatalogService.loadConfig();

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
      const gameSnap = await transaction.get(gameRef);

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

      const mpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
      const mpMax = Math.max(
        1,
        Math.floor(Number(
          typeof player.parameters?.mp?.max === "number"
            ? player.parameters.mp.max
            : player.parameters?.mp?.base,
        )),
      );
      if (mpCurrent < this.sanctuaryActivationMpCost) {
        throw new Error("You need 3 MP to activate the sanctuary");
      }

      sanctuaryElement = mapCell.sanctuaryElement;

      const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
      const knownSpellIds = new Set(knownSpells.map((entry) => entry.spellId));
      const configuredCapacity = this.getSpellbookCapacity(player);
      const occupiedSlots = knownSpells.reduce((total, entry) => {
        return total + (entry.occupiesSlot === false ? 0 : 1);
      }, 0);
      const sanctuarySpell = this.spellCatalogService.getSanctuaryRewardSpell(mapCell.sanctuaryElement);
      const canLearnSanctuarySpell = sanctuarySpell
        && !knownSpellIds.has(sanctuarySpell.id)
        && (
          sanctuarySpell.occupiesSlot === false
          || occupiedSlots < configuredCapacity
        );

      const nextSpellbookEntries = [...knownSpells];
      if (canLearnSanctuarySpell && sanctuarySpell) {
        nextSpellbookEntries.push({
          spellId: sanctuarySpell.id,
          source: "sanctuary",
          occupiesSlot: sanctuarySpell.occupiesSlot !== false,
          grantedBySanctuaryElement: mapCell.sanctuaryElement,
        });
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
      const nowMs = Date.now();
      const requiredPlayerIds = Array.isArray(worldState.turnOrder)
        ? worldState.turnOrder.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const ownerPlayerId = gameSnap.exists()
        ? (gameSnap.data() as { ownerId?: unknown }).ownerId
        : undefined;
      const requiredActionNotification: WorldState["requiredActionNotification"] = {
        type: "sanctuary-activated",
        notificationId: `sanctuary-activated:${worldTurn}:${player.location.x}_${player.location.y}`,
        activatedByPlayerId: actor.id,
        activatedByPlayerName: actor.name,
        requiredPlayerIds: requiredPlayerIds.length > 0 ? requiredPlayerIds : [actor.id],
        acknowledgedPlayerIds: [],
        createdAtMs: nowMs,
        lastActionAtMs: nowMs,
        ...(mapCell.sanctuaryElement ? { sanctuaryElement: mapCell.sanctuaryElement } : {}),
        ...(typeof ownerPlayerId === "string" ? { ownerPlayerId } : {}),
      };

      transaction.set(worldStateRef, {
        sanctuaryInfluenceByQuadrant: {
          ...(worldState.sanctuaryInfluenceByQuadrant ?? {}),
          [quadrant]: mapCell.sanctuaryElement,
        },
        requiredActionNotification,
      }, { merge: true });

      transaction.set(playerRef, {
        attunedElement: mapCell.sanctuaryElement,
        parameters: {
          ...player.parameters,
          mp: {
            ...player.parameters.mp,
            current: Math.max(0, Math.min(mpMax, mpCurrent - this.sanctuaryActivationMpCost)),
          },
        },
        spellbook: {
          spells: this.normalizePlayerSpellEntries(nextSpellbookEntries),
          capacity: configuredCapacity,
        },
        actionsUsedThisTurn: this.markActionUsed(player, "activate-sanctuary", worldTurn),
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, 1);

    await this.tryCreateLog(gameId, actor, "player.activateSanctuary", {
      sanctuary: sanctuaryElement,
      sanctuaryLabel: this.sanctuaryElementToLabel(sanctuaryElement ?? undefined),
      spentMp: this.sanctuaryActivationMpCost,
      gainedExperience: 1,
    });
  }

  public async acknowledgeRequiredActionNotification(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const worldStateSnap = await transaction.get(worldStateRef);
      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      const worldState = worldStateSnap.data() as WorldState;
      const notification = worldState.requiredActionNotification;
      if (!notification) {
        return;
      }

      if (notification.forcedByOwnerId) {
        return;
      }

      const requiredPlayerIds = Array.isArray(notification.requiredPlayerIds)
        ? notification.requiredPlayerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      if (!requiredPlayerIds.includes(actor.id)) {
        throw new Error("You are not required to acknowledge this notification");
      }

      const acknowledgedSet = new Set(
        Array.isArray(notification.acknowledgedPlayerIds)
          ? notification.acknowledgedPlayerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          : [],
      );
      acknowledgedSet.add(actor.id);
      const acknowledgedPlayerIds = Array.from(acknowledgedSet);
      const allAcknowledged = requiredPlayerIds.every((id) => acknowledgedSet.has(id));
      const updatedNotification: WorldState["requiredActionNotification"] = {
        ...notification,
        acknowledgedPlayerIds,
        lastActionAtMs: Date.now(),
        ...(allAcknowledged
          ? { allAcknowledgedAtMs: typeof notification.allAcknowledgedAtMs === "number" ? notification.allAcknowledgedAtMs : Date.now() }
          : {}),
      };

      transaction.set(worldStateRef, {
        requiredActionNotification: updatedNotification,
      }, { merge: true });
    });
  }

  public async forceContinueRequiredActionNotification(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, gameSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(gameRef),
      ]);
      if (!worldStateSnap.exists()) {
        throw new Error("World state not found");
      }

      const ownerId = gameSnap.exists() ? (gameSnap.data() as { ownerId?: unknown }).ownerId : undefined;
      if (ownerId !== actor.id) {
        throw new Error("Only the game owner can force continue");
      }

      const worldState = worldStateSnap.data() as WorldState;
      const notification = worldState.requiredActionNotification;
      if (!notification) {
        return;
      }

      transaction.set(worldStateRef, {
        requiredActionNotification: {
          ...notification,
          lastActionAtMs: Date.now(),
          forcedByOwnerId: actor.id,
          forcedAtMs: Date.now(),
        },
      }, { merge: true });
    });
  }

  public async clearRequiredActionNotification(gameId: string, notificationId: string): Promise<void> {
    if (!gameId || !notificationId.trim()) {
      throw new Error("Invalid action payload");
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const worldStateSnap = await transaction.get(worldStateRef);
      if (!worldStateSnap.exists()) {
        return;
      }

      const worldState = worldStateSnap.data() as WorldState;
      const notification = worldState.requiredActionNotification;
      if (!notification) {
        return;
      }

      if (notification.notificationId !== notificationId) {
        return;
      }

      const allAcknowledgedAtMs = Number(notification.allAcknowledgedAtMs ?? 0);
      const clearDelayMs = notification.type === "world-event-activated" ? 800 : 3000;
      const canClearForAllAcknowledged = allAcknowledgedAtMs > 0 && Date.now() >= allAcknowledgedAtMs + clearDelayMs;
      const canClearForForcedContinue = typeof notification.forcedByOwnerId === "string" && notification.forcedByOwnerId.length > 0;
      if (!canClearForAllAcknowledged && !canClearForForcedContinue) {
        return;
      }

      const nowMs = Date.now();
      const patch: Partial<WorldState> = {
        requiredActionNotification: deleteField() as never,
      };

      if (notification.type === "world-event-activated" && worldState.worldEvent?.flow) {
        const pendingMutationsByCellId = worldState.worldEvent.flow.pendingMutationsByCellId ?? {};
        Object.entries(pendingMutationsByCellId).forEach(([cellId, mutation]) => {
          const mapCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", cellId);
          transaction.set(mapCellRef, {
            biome: mutation.biome,
            ...(mutation.worldEventOriginalBiome ? { worldEventOriginalBiome: mutation.worldEventOriginalBiome } : {}),
            ...(mutation.worldEventBiomeOverride ? { worldEventBiomeOverride: mutation.worldEventBiomeOverride } : {}),
            ...(Array.isArray(mutation.worldEventConditionIds)
              ? { worldEventConditionIds: mutation.worldEventConditionIds }
              : {}),
            ...(typeof mutation.worldEventEnemyLevelBonus === "number"
              ? { worldEventEnemyLevelBonus: mutation.worldEventEnemyLevelBonus }
              : {}),
          }, { merge: true });
        });

        patch.worldEvent = {
          ...worldState.worldEvent,
          flow: {
            ...worldState.worldEvent.flow,
            startedAtMs: nowMs,
            pendingMutationsByCellId: {},
              appliedMutationsByCellId: pendingMutationsByCellId,
          },
        };
      }

      transaction.set(worldStateRef, patch, { merge: true });
    });
  }

  public async counterSpell(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await this.spellCatalogService.loadConfig();

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    let counterSpellName = "";
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) throw new Error("World state not found");
      if (!playerSnap.exists()) throw new Error("Player not found");

      const worldState = worldStateSnap.data() as WorldState;
      const player = playerSnap.data() as Player;
      const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));

      const pending = worldState.pendingSpellEffect as PendingSpellEffectState | undefined;
      if (!pending || pending.targetPlayerId !== actor.id) {
        throw new Error("No pending spell effect to counter");
      }
      if (worldState.requiredActionNotification?.type !== "spell-pending-counter") {
        throw new Error("No counter notification active");
      }

      const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
      const counterEntry = knownSpells.find((e) => {
        const s = this.spellCatalogService.getSpell(e.spellId);
        return s?.effect.type === "counter-spell-reaction"
          && Math.max(0, Math.floor(Number(e.blockedUntilTurn ?? 0))) <= worldTurn;
      });
      if (!counterEntry) throw new Error("You do not have an active counter spell");

      const counterSpell = this.spellCatalogService.getSpell(counterEntry.spellId);
      counterSpellName = counterSpell ? this.spellCatalogService.getLocalizedName(counterSpell) : counterEntry.spellId;

      let nextKnownSpells: typeof knownSpells;
      if (counterSpell?.consumableOnCast === true) {
        nextKnownSpells = knownSpells.filter((e) => e.spellId !== counterEntry.spellId);
      } else {
        const cooldownTurns = Math.max(0, Math.floor(Number(counterSpell?.cooldownTurns ?? 0)));
        const blockedTurn = cooldownTurns > 0 ? worldTurn + cooldownTurns : 0;
        nextKnownSpells = knownSpells.map((e) =>
          e.spellId === counterEntry.spellId
            ? { ...e, ...(blockedTurn > 0 ? { blockedUntilTurn: blockedTurn } : { blockedUntilTurn: undefined }) }
            : e,
        );
      }

      transaction.set(playerRef, {
        spellbook: {
          spells: this.normalizePlayerSpellEntries(nextKnownSpells),
          capacity: this.getSpellbookCapacity(player),
        },
      }, { merge: true });

      transaction.set(worldStateRef, {
        pendingSpellEffect: deleteField() as never,
        requiredActionNotification: deleteField() as never,
      }, { merge: true });

      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.counterSpell", {
      counterSpellName,
    });
  }

  public async acceptPendingSpellEffect(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    await Promise.all([
      this.spellCatalogService.loadConfig(),
      this.statusCatalogService.loadConfig(),
      this.chaosEffectsConfigService.loadConfig(),
    ]);

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const worldStateSnap = await transaction.get(worldStateRef);
      if (!worldStateSnap.exists()) throw new Error("World state not found");

      const worldState = worldStateSnap.data() as WorldState;
      const pending = worldState.pendingSpellEffect as PendingSpellEffectState | undefined;
      if (!pending || worldState.requiredActionNotification?.type !== "spell-pending-counter") {
        return; // already resolved
      }

      const spell = this.spellCatalogService.getSpell(pending.spellId);
      if (!spell) {
        transaction.set(worldStateRef, { pendingSpellEffect: deleteField() as never, requiredActionNotification: deleteField() as never }, { merge: true });
        return;
      }

      const targetPlayerRef = doc(this.firebaseService.database, "games", gameId, "players", pending.targetPlayerId);
      const casterPlayerRef = doc(this.firebaseService.database, "games", gameId, "players", pending.casterId);
      const [targetSnap, casterSnap] = await Promise.all([
        transaction.get(targetPlayerRef),
        transaction.get(casterPlayerRef),
      ]);

      if (!targetSnap.exists()) {
        transaction.set(worldStateRef, { pendingSpellEffect: deleteField() as never, requiredActionNotification: deleteField() as never }, { merge: true });
        return;
      }
      const targetPlayer = targetSnap.data() as Player;
      const casterPlayer = casterSnap.exists() ? (casterSnap.data() as Player) : null;

      if (spell.effect.type === "apply-status-target" || spell.effect.type === "skip-turn-target") {
        const statusKey = typeof spell.effect.statusKey === "string" ? spell.effect.statusKey : "";
        const statusDef = this.statusCatalogService.getCachedStatus(statusKey);
        if (statusDef) {
          const durationTurns = Math.max(1, spell.effect.baseDurationTurns ?? 1);
          let targetStatuses = this.upsertStatus(this.normalizeStatuses(targetPlayer.statuses), {
            key: statusDef.key, label: statusDef.label, description: statusDef.description, durationTurns,
            ...(statusDef.effectKey ? { effectKey: statusDef.effectKey } : {}),
          });
          for (const extraKey of spell.effect.additionalStatusKeys ?? []) {
            const extraDef = this.statusCatalogService.getCachedStatus(extraKey);
            if (extraDef) {
              targetStatuses = this.upsertStatus(targetStatuses, {
                key: extraDef.key, label: extraDef.label, description: extraDef.description, durationTurns,
                ...(extraDef.effectKey ? { effectKey: extraDef.effectKey } : {}),
              });
            }
          }
          transaction.set(targetPlayerRef, { statuses: targetStatuses }, { merge: true });
        }
      }

      if (spell.effect.type === "steal-coins" && casterPlayer) {
        const amount = Math.max(0, Math.floor(Number(spell.effect.baseAmount ?? 0)));
        const targetMoney = Math.max(0, Math.floor(Number(targetPlayer.inventory?.money ?? 0)));
        const stolen = Math.min(amount, targetMoney);
        const selfMoney = Math.max(0, Math.floor(Number(casterPlayer.inventory?.money ?? 0)));
        if (stolen > 0) {
          transaction.set(targetPlayerRef, { inventory: { ...targetPlayer.inventory, money: targetMoney - stolen } }, { merge: true });
          transaction.set(casterPlayerRef, { inventory: { ...casterPlayer.inventory, money: selfMoney + stolen } }, { merge: true });
        }
      }

      if (spell.effect.type === "drain-mp-target" && casterPlayer) {
        const amount = Math.max(1, Math.floor(Number(spell.effect.baseAmount ?? 1)));
        const targetMpCurrent = Math.max(0, Math.floor(Number(targetPlayer.parameters?.mp?.current ?? 0)));
        const drained = Math.min(amount, targetMpCurrent);
        const selfMpCurrent = Math.max(0, Math.floor(Number(casterPlayer.parameters?.mp?.current ?? 0)));
        const selfMpMax = Math.max(1, Math.floor(Number(
          typeof casterPlayer.parameters?.mp?.max === "number" ? casterPlayer.parameters.mp.max : casterPlayer.parameters?.mp?.base,
        )));
        if (drained > 0) {
          transaction.set(targetPlayerRef, {
            parameters: { ...targetPlayer.parameters, mp: { ...targetPlayer.parameters.mp, current: targetMpCurrent - drained } },
          }, { merge: true });
          transaction.set(casterPlayerRef, {
            parameters: { ...casterPlayer.parameters, mp: { ...casterPlayer.parameters.mp, current: Math.min(selfMpMax, selfMpCurrent + drained) } },
          }, { merge: true });
        }
      }

      if (spell.effect.type === "steal-follower" && casterPlayer) {
        const targetActiveFollowers = (targetPlayer.followers ?? []).filter((f) => f.state !== "discarded");
        const randomFollower = targetActiveFollowers.length > 0
          ? targetActiveFollowers[Math.floor(Math.random() * targetActiveFollowers.length)]
          : null;
        if (randomFollower) {
          transaction.set(targetPlayerRef, {
            followers: (targetPlayer.followers ?? []).filter((f) => f.followerId !== randomFollower.followerId),
          }, { merge: true });
          transaction.set(casterPlayerRef, {
            followers: [...(casterPlayer.followers ?? []), { followerId: randomFollower.followerId, hpCurrent: randomFollower.hpCurrent }],
          }, { merge: true });
        }
      }

      if ((spell.effect.type === "copy-random-spell" || spell.effect.type === "copy-chosen-spell") && casterPlayer) {
        const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
        const entry = spell.effect.type === "copy-chosen-spell"
          ? (pending.selectedSpellId ? targetKnownSpells.find((e) => e.spellId === pending.selectedSpellId) ?? null : null)
          : (targetKnownSpells.length > 0 ? targetKnownSpells[Math.floor(Math.random() * targetKnownSpells.length)] : null);
        const selfKnownSpells = this.normalizePlayerSpellEntries(casterPlayer.spellbook?.spells);
        const selfCapacity = this.getSpellbookCapacity(casterPlayer);
        if (entry && !selfKnownSpells.some((e) => e.spellId === entry.spellId) && selfKnownSpells.length < selfCapacity) {
          transaction.set(casterPlayerRef, {
            spellbook: { spells: this.normalizePlayerSpellEntries([...selfKnownSpells, { spellId: entry.spellId }]), capacity: selfCapacity },
          }, { merge: true });
        }
      }

      if (spell.effect.type === "forget-random-spell-target" || spell.effect.type === "forget-chosen-spell-target") {
        const targetKnownSpells = this.normalizePlayerSpellEntries(targetPlayer.spellbook?.spells);
        const entry = spell.effect.type === "forget-chosen-spell-target"
          ? (pending.selectedSpellId ? targetKnownSpells.find((e) => e.spellId === pending.selectedSpellId) ?? null : null)
          : (targetKnownSpells.length > 0 ? targetKnownSpells[Math.floor(Math.random() * targetKnownSpells.length)] : null);
        if (entry) {
          transaction.set(targetPlayerRef, {
            spellbook: {
              spells: this.normalizePlayerSpellEntries(targetKnownSpells.filter((e) => e.spellId !== entry.spellId)),
              capacity: this.getSpellbookCapacity(targetPlayer),
            },
          }, { merge: true });
        }
      }

      if (spell.effect.type === "apply-random-effect-target") {
        const chaosConfig = await this.chaosEffectsConfigService.loadConfig();
        const rolledEffect = this.rollWeightedChaosEffect(chaosConfig.effects);
        if (rolledEffect) {
          if (rolledEffect.effectType === "apply-status" && rolledEffect.statusKey) {
            const statusDef = this.statusCatalogService.getCachedStatus(rolledEffect.statusKey);
            if (statusDef) {
              const durationTurns = Math.max(1, rolledEffect.durationTurns ?? 1);
              const targetStatuses = this.upsertStatus(this.normalizeStatuses(targetPlayer.statuses), {
                key: statusDef.key, label: statusDef.label, description: statusDef.description, durationTurns,
                ...(statusDef.effectKey ? { effectKey: statusDef.effectKey } : {}),
              });
              transaction.set(targetPlayerRef, { statuses: targetStatuses }, { merge: true });
            }
          } else if (rolledEffect.effectType === "steal-coins" && casterPlayer) {
            const stolen = Math.min(rolledEffect.amount ?? 5, Math.max(0, Math.floor(Number(targetPlayer.inventory?.money ?? 0))));
            if (stolen > 0) {
              transaction.set(targetPlayerRef, { inventory: { ...targetPlayer.inventory, money: (targetPlayer.inventory?.money ?? 0) - stolen } }, { merge: true });
              transaction.set(casterPlayerRef, { inventory: { ...casterPlayer.inventory, money: (casterPlayer.inventory?.money ?? 0) + stolen } }, { merge: true });
            }
          } else if (rolledEffect.effectType === "drain-mp" && casterPlayer) {
            const drained = Math.min(rolledEffect.amount ?? 3, Math.max(0, Math.floor(Number(targetPlayer.parameters?.mp?.current ?? 0))));
            if (drained > 0) {
              transaction.set(targetPlayerRef, {
                parameters: { ...targetPlayer.parameters, mp: { ...targetPlayer.parameters.mp, current: (targetPlayer.parameters?.mp?.current ?? 0) - drained } },
              }, { merge: true });
            }
          }
        }
      }

      transaction.set(worldStateRef, {
        pendingSpellEffect: deleteField() as never,
        requiredActionNotification: deleteField() as never,
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.acceptPendingSpell", {});
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
      { successThreshold: 100 },
    );
    const prayerAccepted = luckResult.total >= minimumPrayerThreshold;
    const luckyPrayer = luckResult.total >= luckyPrayerThreshold;
    const healRatio = luckyPrayer ? 0.10 : (prayerAccepted ? 0.05 : 0);

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

      const mpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
      const mpMax = Math.max(
        1,
        Math.floor(Number(
          typeof player.parameters?.mp?.max === "number"
            ? player.parameters.mp.max
            : player.parameters?.mp?.base,
        )),
      );
      if (mpCurrent < this.sanctuaryPrayerMpCost) {
        throw new Error(`You need at least ${this.sanctuaryPrayerMpCost} MP to pray at the sanctuary`);
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
          mp: {
            ...player.parameters.mp,
            current: Math.max(0, Math.min(mpMax, mpCurrent - this.sanctuaryPrayerMpCost)),
          },
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
      spentMp: this.sanctuaryPrayerMpCost,
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

  public async resolvePendingItemPickup(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    options: {
      keepNew: boolean;
      discardItemId?: string;
    },
  ): Promise<void> {
    if (!gameId || !actor.id) {
      throw new Error("Invalid action payload");
    }

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    let pickedUpItemId: string | null = null;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) throw new Error("Player not found");

      const player = playerSnap.data() as Player;
      const pendingPickup = player.pendingItemPickup ?? null;
      if (!pendingPickup) throw new Error("No pending item pickup to resolve");

      pickedUpItemId = pendingPickup.itemId;

      if (!options.keepNew) {
        transaction.set(playerRef, { pendingItemPickup: null }, { merge: true });
        return;
      }

      if (!options.discardItemId) throw new Error("discardItemId required when keepNew is true");

      const currentItems = this.normalizeInventoryItems(player.inventory?.items);
      const discardIndex = currentItems.findIndex((entry) => entry.itemId === options.discardItemId);
      if (discardIndex === -1) throw new Error("Selected item to discard not found in inventory");

      const discardedEntry = currentItems[discardIndex];
      const remainingItems = currentItems.filter((_entry, index) => index !== discardIndex);
      const newItemDef = this.itemCatalogService.getCachedItemById(pendingPickup.itemId);
      const newEntry: InventoryItemEntry = newItemDef?.maxCharges
        ? { itemId: pendingPickup.itemId, currentCharges: newItemDef.maxCharges }
        : { itemId: pendingPickup.itemId };

      const discardedItemDef = this.itemCatalogService.getCachedItemById(discardedEntry.itemId);
      const worldStateRef = doc(this.firebaseService.database, "games", gameId, "state", "world");
      const worldStateSnap = await transaction.get(worldStateRef);
      const worldState = worldStateSnap.exists() ? (worldStateSnap.data() as WorldState) : null;
      const currentTurn = Math.max(0, Math.floor(Number(worldState?.currentTurn ?? 0)));
      const seq = Math.max(0, Math.floor(Number(worldState?.nextDiscardSeq ?? 0))) + 1;
      const discardRef = doc(collection(worldStateRef, "discardPile"));

      transaction.set(playerRef, {
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          items: [...remainingItems, newEntry],
        },
        pendingItemPickup: null,
      }, { merge: true });

      transaction.set(discardRef, {
        id: discardRef.id,
        discardSeq: seq,
        discardedAt: Timestamp.now(),
        card: {
          kind: "item",
          cardId: discardedEntry.itemId,
          name: discardedItemDef?.name,
          payload: typeof discardedEntry.currentCharges === "number"
            ? { currentCharges: Math.max(0, Math.floor(discardedEntry.currentCharges)) }
            : undefined,
        },
        source: "player",
        ownerPlayerId: actor.id,
        turn: currentTurn,
        batchId: `item-swap:${actor.id}:${currentTurn}`,
      } as DiscardPileEntry);

      transaction.set(worldStateRef, { nextDiscardSeq: seq }, { merge: true });
    });

    if (!pickedUpItemId) return;

    if (!options.keepNew) {
      await this.tryCreateLog(gameId, actor, "player.itemPickupRefused", { itemId: pickedUpItemId });
      return;
    }

    await this.tryCreateLog(gameId, actor, "player.itemSwapped", {
      itemId: pickedUpItemId,
      discardedItemId: options.discardItemId ?? "",
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

  public async guidePathfind(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
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

      if (!worldStateSnap.exists()) throw new Error("World state not found");
      if (!playerSnap.exists()) throw new Error("Player not found");

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      const player = playerSnap.data() as Player;
      const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));
      this.ensureActionAvailable(player, "guide-pathfind", worldTurn, "You can only use the Guide once per turn.");

      const movedThisTurnByPlayer = worldState.movedThisTurnByPlayer ?? {};
      if (movedThisTurnByPlayer[actor.id] === worldTurn) {
        throw new Error("You must use the Guide before moving");
      }

      if (!this.hasActiveFollowerWithAction(player.followers, "guide-pathfind")) {
        throw new Error("You do not have an active Guide follower");
      }

      const cellRef = doc(
        this.firebaseService.database,
        "games", gameId, "mapCells",
        `${player.location.x}_${player.location.y}`,
      );
      const cellSnap = await transaction.get(cellRef);
      const cell = cellSnap.exists() ? cellSnap.data() as MapCell : null;
      const biome = cell?.biome ?? "";
      if (biome !== "mountain" && biome !== "ruins") {
        throw new Error("The Guide can only pathfind from Mountain or Ruins");
      }

      const currentBonusByPlayer = worldState.followerMovementBonusByPlayer ?? {};
      const previousBonus = currentBonusByPlayer[actor.id];
      const previousAmount = previousBonus?.turn === worldTurn
        ? Math.max(0, Math.floor(Number(previousBonus.amount ?? 0)))
        : 0;

      transaction.set(playerRef, {
        actionsUsedThisTurn: this.markActionUsed(player, "guide-pathfind", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, {
        followerMovementBonusByPlayer: {
          ...currentBonusByPlayer,
          [actor.id]: { turn: worldTurn, amount: previousAmount + 1 },
        },
      }, { merge: true });

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "system.info", {
      textKey: "logs.system.guidePathfind",
      textParams: { playerName: actor.name },
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
        lastStatGain: {
          parameter: trainerConfig.parameter,
          gainedByPlayerId: actor.id,
          gainedByPlayerName: actor.name,
          gainedAtTurn: worldTurn,
        },
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

    let learnedSpellId: string | null = null;

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

      const nextWorldState: WorldState = { ...worldState };

      if (reward.pendingMagicReward === true) {
        if (clampedLuckTotal === 100) {
          learnedSpellId = "B-SP-044";
        } else if (luckResult.total > 100) {
          const drawResult = this.spellDeckService.draw(
            worldState.spellDeck ?? [],
            worldState.spellDiscardedDeck ?? [],
            1,
          );
          learnedSpellId = drawResult.drawn[0] ?? null;
          if (learnedSpellId) {
            nextWorldState.spellDeck = drawResult.remaining;
            nextWorldState.spellDiscardedDeck = drawResult.discard;
          }
        }
      }

      const existingSpells = player.spellbook?.spells ?? [];
      const nextSpells: typeof existingSpells = learnedSpellId
        ? [...existingSpells, { spellId: learnedSpellId, source: "enchantress" as const, occupiesSlot: true }]
        : [...existingSpells];

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
        ...(learnedSpellId
          ? { spellbook: { ...(player.spellbook ?? {}), spells: nextSpells } }
          : {}),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    const learnedSpell = learnedSpellId ? this.spellCatalogService.getSpell(learnedSpellId) : null;
    const learnedSpellName = learnedSpell
      ? this.spellCatalogService.getLocalizedName(learnedSpell)
      : "";

    await this.tryCreateLog(gameId, actor, "player.capitalEnchantress", {
      spentCoins: this.capitalEnchantressCost,
      clampedLuckTotal,
      rolledTotal: Math.floor(luckResult.total),
      roll: luckResult.roll,
      rewardId: reward.id,
      rewardLabel,
      rewardStatuses: reward.statuses.map((s) => `${s.key}:${s.durationTurns}`).join(", "),
      pendingMagicReward: reward.pendingMagicReward === true,
      learnedSpellId: learnedSpellId ?? "",
      learnedSpellName,
      turnEnded: true,
    });

    return {
      rewardId: reward.id,
      rewardLabel,
      clampedLuckTotal,
      rolledTotal: Math.floor(luckResult.total),
      pendingMagicReward: reward.pendingMagicReward === true,
      overflowLuckyStrikeCandidate: luckResult.total > 100,
      learnedSpellId,
      learnedSpellName,
    };
  }

  public async academySpellUpgrade(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    fromSpellId: string,
  ): Promise<AcademySpellUpgradeOutcome> {
    if (!gameId || !actor.id || !fromSpellId) {
      throw new Error("Invalid action payload");
    }

    const upgradePairs = await this.academySpellUpgradeConfigService.loadConfig();
    const upgradePair = this.academySpellUpgradeConfigService.getUpgradeForSpell(upgradePairs, fromSpellId);
    if (!upgradePair) {
      throw new Error(`No upgrade available for spell '${fromSpellId}'`);
    }

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) throw new Error("World state not found");
      if (!playerSnap.exists()) throw new Error("Player not found");

      const worldState = worldStateSnap.data() as WorldState;
      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using safe place actions");

      const player = playerSnap.data() as Player;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "academy-spell-upgrader", worldTurn, "You can only use the Spell Master once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) throw new Error("You are not standing on a revealed cell");

      const mapCell = mapCellSnap.data() as MapCell;
      this.ensurePlayerOnLandmark(mapCell, "academy", "You must be at Academy to use the Spell Master");

      const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (currentMoney < upgradePair.cost) {
        throw new Error(`You need ${upgradePair.cost} coins to upgrade this spell`);
      }

      const existingSpells = [...(player.spellbook?.spells ?? [])];
      const baseIndex = existingSpells.findIndex((e) => e.spellId === fromSpellId);
      if (baseIndex < 0) {
        throw new Error(`You do not have '${fromSpellId}' in your spellbook`);
      }

      existingSpells.splice(baseIndex, 1);
      existingSpells.push({ spellId: upgradePair.to, source: "upgrade" as const, occupiesSlot: true });

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: {
          ...player.parameters,
          mp: { ...player.parameters.mp, current: nextMpCurrent },
        },
        inventory: {
          ...(player.inventory ?? { items: [], resources: [], money: 0 }),
          money: currentMoney - upgradePair.cost,
          resourceCapacity: this.getResourceCapacity(player),
        },
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, "academy-spell-upgrader", worldTurn),
        spellbook: { ...(player.spellbook ?? {}), spells: existingSpells },
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    const fromSpell = this.spellCatalogService.getSpell(fromSpellId);
    const toSpell = this.spellCatalogService.getSpell(upgradePair.to);
    const fromSpellName = fromSpell ? this.spellCatalogService.getLocalizedName(fromSpell) : fromSpellId;
    const toSpellName = toSpell ? this.spellCatalogService.getLocalizedName(toSpell) : upgradePair.to;

    await this.tryCreateLog(gameId, actor, "player.academySpellUpgrade", {
      fromSpellId,
      fromSpellName,
      toSpellId: upgradePair.to,
      toSpellName,
      spentCoins: upgradePair.cost,
      turnEnded: true,
    });

    return { fromSpellId, fromSpellName, toSpellId: upgradePair.to, toSpellName, spentCoins: upgradePair.cost };
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

  public async getDeadFollowersFromDiscardPile(gameId: string): Promise<Array<{ followerId: string; ownerPlayerId?: string }>> {
    await this.followerCatalogService.loadConfig();
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const discardSnapshot = await getDocs(collection(worldStateRef, "discardPile"));
    const seen = new Set<string>();
    const result: Array<{ followerId: string; ownerPlayerId?: string }> = [];
    discardSnapshot.docs
      .map((snap) => snap.data() as DiscardPileEntry)
      .filter((entry) => entry.card?.kind === "follower" && entry.reason === "dead" && !entry.recoveredAt)
      .sort((a, b) => (b.discardSeq ?? 0) - (a.discardSeq ?? 0))
      .forEach((entry) => {
        const followerId = entry.card.cardId;
        if (!seen.has(followerId)) {
          seen.add(followerId);
          result.push({ followerId, ownerPlayerId: entry.ownerPlayerId });
        }
      });
    return result;
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
        return entry.data.card?.kind === "follower"
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

      const targetDefinition = this.followerCatalogService.getCachedFollowerById(selectedFollowerId);
      const targetMaxHp = Math.max(1, Math.floor(Number(targetDefinition?.maxHp ?? 1)));
      const localizedTargetName = targetDefinition
        ? this.followerCatalogService.getLocalizedName(targetDefinition)
        : selectedFollowerId;
      const targetName = String(selectedDiscardEntry.data.card?.name ?? localizedTargetName).trim() || selectedFollowerId;

      let nextFollowers = normalizedFollowers.map((entry) => ({ ...entry }));

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
          return entry.followerId === "B-FO-017"
            && entry.state !== "discarded"
            && Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) > 0;
        });

        if (hasZombie) {
          appliedOutcome = "summon-zombie-blocked";
        } else {
          const zombieDefinition = this.followerCatalogService.getCachedFollowerById("B-FO-017");
          const zombieHp = Math.max(1, Math.floor(Number(zombieDefinition?.maxHp ?? 2)));
          nextFollowers.push({
            followerId: "B-FO-017",
            hpCurrent: zombieHp,
            state: "active",
          });
        }
      }

      if (reward.reviveTarget === "one-hp" || reward.reviveTarget === "full") {
        const resurrectHp = reward.reviveTarget === "one-hp" ? 1 : targetMaxHp;
        const shouldMarkAsUndead = reward.markAsUndead === true || reward.reviveTarget === "one-hp";

        nextFollowers.push({
          followerId: selectedFollowerId,
          hpCurrent: resurrectHp,
          state: "active",
          ...(shouldMarkAsUndead ? { nameOverride: `${targetName} (undead)` } : {}),
          ...(shouldMarkAsUndead ? { categoryOverride: "undead" } : {}),
        });
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
      discardReason: "dead",
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

  public async elementalRitual(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    payload: { followerId: string },
  ): Promise<void> {
    if (!gameId || !actor.id || !payload.followerId) {
      throw new Error("Invalid action payload");
    }

    await Promise.all([
      this.followerCatalogService.loadConfig(),
      this.followerUpgradeService.loadConfig(),
    ]);

    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [worldStateSnap, playerSnap] = await Promise.all([
        transaction.get(worldStateRef),
        transaction.get(playerRef),
      ]);

      if (!worldStateSnap.exists()) throw new Error("World state not found");
      if (!playerSnap.exists()) throw new Error("Player not found");

      const worldState = worldStateSnap.data() as WorldState;
      const player = playerSnap.data() as Player;

      if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
        throw new Error("It is not your turn");
      }

      this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using landmark actions");

      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "elemental-ritual", worldTurn, "You can only perform the Elemental Ritual once per turn.");

      const mapCellRef = doc(
        this.firebaseService.database,
        "games",
        gameId,
        "mapCells",
        this.cellId(player.location.x, player.location.y),
      );
      const mapCellSnap = await transaction.get(mapCellRef);
      if (!mapCellSnap.exists()) throw new Error("You are not standing on a revealed cell");

      const mapCell = mapCellSnap.data() as MapCell;
      this.ensurePlayerOnLandmark(mapCell, "altar", "You must be at the Altar to perform the Elemental Ritual");

      const attunedElement = player.attunedElement;
      if (!attunedElement) throw new Error("No elemental affinity — you must attune to an element first");

      const normalizedFollowers = this.normalizeFollowers(player.followers);

      const alreadyUpgraded = normalizedFollowers.some(
        (f) => f.state !== "discarded" && this.followerUpgradeService.hasElementalUpgrade(f.upgrades),
      );
      if (alreadyUpgraded) throw new Error("You already have an elementally upgraded follower");

      const targetIndex = normalizedFollowers.findIndex(
        (f) => f.followerId === payload.followerId
          && f.state !== "discarded"
          && Math.max(0, Math.floor(Number(f.hpCurrent ?? 0))) > 0,
      );
      if (targetIndex < 0) throw new Error("Selected follower is not eligible for the elemental ritual");

      const upgradeId = this.followerUpgradeService.getElementalUpgradeIdForElement(attunedElement);
      const upgradeHpFloor = this.followerUpgradeService.resolveHpFloor([upgradeId]);
      const entry = normalizedFollowers[targetIndex];
      const followerDef = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      const baseMaxHp = Math.max(1, Math.floor(Number(followerDef?.maxHp ?? 1)));
      const currentHp = Math.max(0, Math.min(baseMaxHp, Math.floor(Number(entry.hpCurrent ?? 0))));
      const newHp = Math.max(currentHp, upgradeHpFloor);

      const nextFollowers = normalizedFollowers.map((f, i) =>
        i === targetIndex
          ? { ...f, hpCurrent: newHp, upgrades: [...(f.upgrades ?? []), upgradeId] }
          : { ...f },
      );

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        followers: nextFollowers,
        statuses: nextStatuses,
        parameters: {
          ...player.parameters,
          mp: { ...player.parameters.mp, current: nextMpCurrent },
        },
        actionsUsedThisTurn: this.markActionUsed(player, "elemental-ritual", worldTurn),
      }, { merge: true });

      transaction.set(worldStateRef, nextWorldState);

      transaction.set(gameRef, {
        updatedAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.elementalRitual", {
      followerId: payload.followerId,
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
        return entry.followerId === "B-FO-017"
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

  public async dismissFollower(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    actionId: string,
    followerId: string,
    xpReward: number,
  ): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");

      const player = playerSnap.data() as Player;
      const worldState = worldSnap.data() as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, actionId, worldTurn, `You can only use ${actionId} once per turn.`);

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const idx = normalizedFollowers.findIndex(
        (e) => e.followerId === followerId && e.state !== "discarded" && Math.max(0, Math.floor(Number(e.hpCurrent ?? 0))) > 0,
      );
      if (idx < 0) throw new Error(`No active ${followerId} to dismiss`);

      const nextFollowers = normalizedFollowers.map((e) => ({ ...e }));
      nextFollowers[idx] = { ...nextFollowers[idx], state: "discarded" as const, discardReason: "released" as const, discardedAtTurn: worldTurn };

      const nextStatuses = this.decrementStatuses(this.normalizeStatuses(player.statuses));
      const nextWorldState: WorldState = { ...worldState };
      await this.applyTurnAdvanceAndDeferredEffects(transaction, gameId, nextWorldState);
      const nextMpCurrent = this.resolveNextMpCurrentAfterTurnAdvance(player, actor.id, nextWorldState);

      transaction.set(playerRef, {
        parameters: { ...player.parameters, mp: { ...player.parameters.mp, current: nextMpCurrent } },
        followers: nextFollowers,
        statuses: nextStatuses,
        actionsUsedThisTurn: this.markActionUsed(player, actionId, worldTurn),
      }, { merge: true });
      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    if (xpReward > 0) {
      await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, xpReward);
    }

    await this.tryCreateLog(gameId, actor, "player.followerDismissed", { followerId, turnEnded: true });
  }

  public async alchimistaHeal(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");

      const player = playerSnap.data() as Player;
      const worldState = worldSnap.data() as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "alchimista-heal", worldTurn, "Already used alchimista-heal.");

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const idx = normalizedFollowers.findIndex((e) => {
        const def = this.followerCatalogService.getCachedFollowerById(e.followerId);
        return e.state !== "discarded" && (def?.oneTimeActions ?? []).includes("alchimista-heal")
          && !(e.usedActions ?? []).includes("alchimista-heal");
      });
      if (idx < 0) throw new Error("No available Alchimista heal");

      const hpMax = Math.max(1, Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)));
      const hpCurrent = Math.max(0, Math.floor(Number(player.parameters?.hp?.current ?? 0)));
      const heal = Math.max(1, Math.floor(hpMax * 0.10));
      const newHp = Math.min(hpMax, hpCurrent + heal);

      const nextFollowers = normalizedFollowers.map((e, i) => i !== idx ? e : {
        ...e,
        usedActions: [...(e.usedActions ?? []), "alchimista-heal"],
      });
      const def = this.followerCatalogService.getCachedFollowerById(normalizedFollowers[idx].followerId)!;
      const allUsed = (def.oneTimeActions ?? []).every((a) => (nextFollowers[idx].usedActions ?? []).includes(a));
      if (allUsed) {
        nextFollowers[idx] = { ...nextFollowers[idx], state: "discarded" as const, discardReason: "released" as const, discardedAtTurn: worldTurn };
      }

      transaction.set(playerRef, {
        "parameters.hp.current": newHp,
        followers: nextFollowers,
        actionsUsedThisTurn: this.markActionUsed(player, "alchimista-heal", worldTurn),
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.alchimistaHeal", {});
  }

  public async alchimistaMana(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");

      const player = playerSnap.data() as Player;
      const worldState = worldSnap.data() as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "alchimista-mana", worldTurn, "Already used alchimista-mana.");

      const normalizedFollowers = this.normalizeFollowers(player.followers);
      const idx = normalizedFollowers.findIndex((e) => {
        const def = this.followerCatalogService.getCachedFollowerById(e.followerId);
        return e.state !== "discarded" && (def?.oneTimeActions ?? []).includes("alchimista-mana")
          && !(e.usedActions ?? []).includes("alchimista-mana");
      });
      if (idx < 0) throw new Error("No available Alchimista mana restore");

      const mpMax = Math.max(0, Math.floor(Number(player.parameters?.mp?.max ?? player.parameters?.mp?.base ?? 0)));
      const mpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
      const newMp = Math.min(mpMax, mpCurrent + 2);

      const nextFollowers = normalizedFollowers.map((e, i) => i !== idx ? e : {
        ...e,
        usedActions: [...(e.usedActions ?? []), "alchimista-mana"],
      });
      const def = this.followerCatalogService.getCachedFollowerById(normalizedFollowers[idx].followerId)!;
      const allUsed = (def.oneTimeActions ?? []).every((a) => (nextFollowers[idx].usedActions ?? []).includes(a));
      if (allUsed) {
        nextFollowers[idx] = { ...nextFollowers[idx], state: "discarded" as const, discardReason: "released" as const, discardedAtTurn: worldTurn };
      }

      transaction.set(playerRef, {
        "parameters.mp.current": newMp,
        followers: nextFollowers,
        actionsUsedThisTurn: this.markActionUsed(player, "alchimista-mana", worldTurn),
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.alchimistaMana", {});
  }

  public async hireMercenary(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");

      const player = playerSnap.data() as Player;
      const worldState = worldSnap.data() as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;
      this.ensureActionAvailable(player, "hire-mercenary", worldTurn, "Already hired mercenary this turn.");

      const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (money < 3) throw new Error("Not enough money to hire mercenary");

      const activeCombat = worldState.activeCombat;
      if (!activeCombat || activeCombat.attackingPlayerId !== actor.id) throw new Error("No active combat to hire for");

      transaction.set(playerRef, {
        "inventory.money": money - 3,
        actionsUsedThisTurn: this.markActionUsed(player, "hire-mercenary", worldTurn),
      }, { merge: true });
      transaction.set(worldStateRef, {
        activeCombat: { ...activeCombat, mercenaryHired: true },
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.hireMercenary", {});
  }

  // ─── Stranger action methods ───────────────────────────────────────────────

  public async strangerHealPercent(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    healPercent: number,
  ): Promise<number> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    let healedHp = 0;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const snap = await transaction.get(playerRef);
      if (!snap.exists()) throw new Error("Player not found");
      const player = snap.data() as Player;
      const hpMax = Math.max(1, Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)));
      const hpCurrent = Math.max(0, Math.floor(Number(player.parameters?.hp?.current ?? 0)));
      if (hpCurrent >= hpMax) return;
      healedHp = Math.max(1, Math.floor(hpMax * (healPercent / 100)));
      const newHp = Math.min(hpMax, hpCurrent + healedHp);
      transaction.set(playerRef, { parameters: { ...player.parameters, hp: { ...player.parameters.hp, current: newHp } } }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    if (healedHp > 0) {
      await this.tryCreateLog(gameId, actor, "player.strangerHealPercent", { healedHp });
    }
    return healedHp;
  }

  public async strangerEnchantress(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
  ): Promise<string> {
    await Promise.all([
      this.statusCatalogService.loadConfig(),
      this.enchantressRewardsConfigService.loadConfig(),
    ]);

    const rollTotal = Math.floor(Math.random() * 100) + 1;
    const reward = await this.enchantressRewardsConfigService.resolveRewardByTotal(rollTotal);
    const rewardLabel = this.enchantressRewardsConfigService.getLocalizedLabel(reward);

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    let learnedSpellId: string | null = null;

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      const player = playerSnap.data() as Player;
      const worldState = worldSnap.exists() ? worldSnap.data() as WorldState : {} as WorldState;

      let nextStatuses = this.normalizeStatuses(player.statuses);
      for (const applied of reward.statuses) {
        const def = this.statusCatalogService.getStatus(applied.key);
        if (!def) continue;
        nextStatuses = this.upsertStatus(nextStatuses, {
          key: def.key, label: def.label, description: def.description,
          durationTurns: applied.durationTurns,
          ...(def.effectKey ? { effectKey: def.effectKey } : {}),
        });
      }

      const nextWorldState: WorldState = { ...worldState };
      if (reward.pendingMagicReward === true) {
        const drawResult = this.spellDeckService.draw(worldState.spellDeck ?? [], worldState.spellDiscardedDeck ?? [], 1);
        learnedSpellId = drawResult.drawn[0] ?? null;
        if (learnedSpellId) {
          nextWorldState.spellDeck = drawResult.remaining;
          nextWorldState.spellDiscardedDeck = drawResult.discard;
        }
      }

      const spellPatch = learnedSpellId ? {
        spellbook: {
          ...(player.spellbook ?? {}),
          spells: [...(player.spellbook?.spells ?? []), { spellId: learnedSpellId, source: "enchantress" as const, occupiesSlot: true }],
        },
      } : {};

      transaction.set(playerRef, { statuses: nextStatuses, ...spellPatch }, { merge: true });
      transaction.set(worldStateRef, nextWorldState);
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.strangerEnchantress", { rewardLabel });
    return rewardLabel;
  }

  public async strangerWishCoins(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    amount: number,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const snap = await transaction.get(playerRef);
      if (!snap.exists()) throw new Error("Player not found");
      const player = snap.data() as Player;
      const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      transaction.set(playerRef, { inventory: { ...(player.inventory ?? { items: [], resources: [], money: 0 }), money: money + amount } }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.strangerWishCoins", { amount });
  }

  public async strangerWishXp(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    amount: number,
  ): Promise<void> {
    await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, amount);
    await this.tryCreateLog(gameId, actor, "player.strangerWishXp", { amount });
  }

  public async strangerWishStatPermanent(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    stat: "strength" | "magic" | "mp",
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const snap = await transaction.get(playerRef);
      if (!snap.exists()) throw new Error("Player not found");
      const player = snap.data() as Player;
      let params = { ...player.parameters };

      if (stat === "strength") {
        params = { ...params, strength: { ...params.strength, base: params.strength.base + 1, current: params.strength.current + 1 } };
      } else if (stat === "magic") {
        params = { ...params, magic: { ...params.magic, base: params.magic.base + 1, current: params.magic.current + 1 } };
      } else {
        const mp = params.mp;
        const newBase = (mp.base ?? 0) + 1;
        const newMax = (typeof mp.max === "number" ? mp.max : mp.base) + 1;
        params = { ...params, mp: { ...mp, base: newBase, current: mp.current + 1, max: newMax } };
      }

      transaction.set(playerRef, { parameters: params }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.strangerWishStat", { stat });
  }

  public async strangerWishTeleport(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    targetX: number,
    targetY: number,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      const worldState = worldSnap.exists() ? worldSnap.data() as WorldState : {} as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;

      transaction.set(playerRef, { location: { x: targetX, y: targetY } }, { merge: true });
      transaction.set(worldStateRef, {
        movedThisTurnByPlayer: { ...(worldState.movedThisTurnByPlayer ?? {}), [actor.id]: worldTurn },
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.strangerWishTeleport", { targetX: targetX + 1, targetY: targetY + 1 });
  }

  public async strangerSpellTeacher(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    cost: number,
    sourceName: string,
  ): Promise<"ok" | "full" | "empty"> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);
    const result = { outcome: "ok" as "ok" | "full" | "empty", spellId: null as string | null };

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      const player = playerSnap.data() as Player;
      const worldState = worldSnap.exists() ? worldSnap.data() as WorldState : {} as WorldState;

      const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
      const capacity = this.getSpellbookCapacity(player);
      if (knownSpells.length >= capacity) { result.outcome = "full"; return; }

      const drawResult = this.spellDeckService.draw(worldState.spellDeck ?? [], worldState.spellDiscardedDeck ?? [], 1);
      result.spellId = drawResult.drawn[0] ?? null;
      if (!result.spellId) { result.outcome = "empty"; return; }

      const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (cost > 0 && money < cost) throw new Error("Not enough coins");

      const nextSpells = [...knownSpells, { spellId: result.spellId, source: "stranger" as const, occupiesSlot: true }];
      transaction.set(playerRef, {
        spellbook: { ...(player.spellbook ?? {}), spells: nextSpells, capacity },
        ...(cost > 0 ? { inventory: { ...(player.inventory ?? { items: [], resources: [], money: 0 }), money: money - cost } } : {}),
      }, { merge: true });
      transaction.set(worldStateRef, {
        spellDeck: drawResult.remaining,
        spellDiscardedDeck: drawResult.discard,
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    if (result.outcome === "ok" && result.spellId) {
      await this.tryCreateLog(gameId, actor, "player.strangerSpellTeacher", { spellId: result.spellId, source: sourceName });
    } else if (result.outcome === "full") {
      await this.tryCreateLog(gameId, actor, "player.strangerSpellTeacherFull", {});
    } else {
      await this.tryCreateLog(gameId, actor, "player.strangerSpellTeacherEmpty", {});
    }
    return result.outcome;
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
    const firingRegionEffects = turnAdvance.firingRegionEffects;

    const playerIdsToLoad = new Set<string>(turnAdvance.skippedPlayerIds);
    if (nextWorldState.activePlayerId) {
      playerIdsToLoad.add(nextWorldState.activePlayerId);
    }

    // When region effects fire we need every player's location to check if they're in the affected region.
    if (firingRegionEffects.length > 0) {
      for (const id of (nextWorldState.turnOrder ?? [])) {
        playerIdsToLoad.add(id);
      }
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

    // Precompute per-player HP damage from firing region effects.
    const regionDamageByPlayer = new Map<string, number>();
    if (firingRegionEffects.length > 0) {
      const allPlayerEntries: Array<{ id: string; player: Player }> = [];
      for (const [id, data] of Object.entries(preloadedPlayers)) {
        allPlayerEntries.push({ id, player: data });
      }
      for (const [id, entry] of playerDocById) {
        if (preloadedPlayers[id]) continue;
        if (!entry.playerSnap.exists()) continue;
        allPlayerEntries.push({ id, player: entry.playerSnap.data() as Player });
      }

      for (const regionEffect of firingRegionEffects) {
        const affectedCols = new Set(regionEffect.regionColumns);
        for (const { id, player } of allPlayerEntries) {
          if (!affectedCols.has(player.location?.x)) continue;
          if (regionEffect.effectType === "hp-percent-damage") {
            const hpMax = Math.max(1, Math.floor(Number(
              typeof player.parameters?.hp?.max === "number"
                ? player.parameters.hp.max
                : player.parameters?.hp?.base ?? 1,
            )));
            const damage = Math.max(1, Math.floor(hpMax * regionEffect.amount / 100));
            regionDamageByPlayer.set(id, (regionDamageByPlayer.get(id) ?? 0) + damage);
          }
        }
      }
    }

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

    const processedPlayerIds = new Set<string>();

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

      processedPlayerIds.add(skippedPlayerId);

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
      const hpAfterStatus = this.applyTurnEndHpPercentDelta(
        hpCurrent,
        hpMax,
        statusSnapshot.turnEndHpPercentDelta,
        !statusSnapshot.disableHpRecovery,
      );
      const regionDamage = regionDamageByPlayer.get(skippedPlayerId) ?? 0;
      const nextHpCurrent = regionDamage > 0 ? Math.max(0, hpAfterStatus - regionDamage) : hpAfterStatus;

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
      processedPlayerIds.add(activePlayerId);
      const activePlayerDoc = playerDocById.get(activePlayerId);
      const resolvedActivePlayer = activePlayer
        ?? (activePlayerDoc?.playerSnap.exists() ? (activePlayerDoc.playerSnap.data() as Player) : null);
      const activePlayerRef = activePlayer
        ? doc(this.firebaseService.database, "games", gameId, "players", activePlayerId)
        : activePlayerDoc?.playerRef;

      if (resolvedActivePlayer && activePlayerRef) {
        const recoveredMpCurrent = this.resolveMpRecoveredOnTurnStart(resolvedActivePlayer);
        const currentMp = Math.max(0, Math.floor(Number(resolvedActivePlayer.parameters.mp.current ?? 0)));
        const activeRegionDamage = regionDamageByPlayer.get(activePlayerId) ?? 0;
        const hpCurrentActive = Math.max(0, Math.floor(Number(resolvedActivePlayer.parameters.hp.current ?? 0)));
        const newHpActive = activeRegionDamage > 0 ? Math.max(0, hpCurrentActive - activeRegionDamage) : hpCurrentActive;

        const mpChanged = recoveredMpCurrent !== currentMp;
        const hpChanged = newHpActive !== hpCurrentActive;

        if (mpChanged || hpChanged) {
          transaction.set(activePlayerRef, {
            parameters: {
              ...resolvedActivePlayer.parameters,
              ...(mpChanged ? { mp: { ...resolvedActivePlayer.parameters.mp, current: recoveredMpCurrent } } : {}),
              ...(hpChanged ? { hp: { ...resolvedActivePlayer.parameters.hp, current: newHpActive } } : {}),
            },
          }, { merge: true });
        }
      }
    }

    // Apply region effect HP damage to all other players (not skipped, not active).
    for (const [playerId, damage] of regionDamageByPlayer) {
      if (processedPlayerIds.has(playerId)) continue;
      const preloaded = preloadedPlayers[playerId];
      const doc_ = playerDocById.get(playerId);
      const playerData = preloaded ?? (doc_?.playerSnap.exists() ? (doc_.playerSnap.data() as Player) : null);
      const playerRef = preloaded
        ? doc(this.firebaseService.database, "games", gameId, "players", playerId)
        : doc_?.playerRef;

      if (!playerData || !playerRef) continue;

      const hpCurrent = Math.max(0, Math.floor(Number(playerData.parameters.hp.current ?? 0)));
      const newHp = Math.max(0, hpCurrent - damage);
      if (newHp !== hpCurrent) {
        transaction.set(playerRef, {
          parameters: {
            ...playerData.parameters,
            hp: { ...playerData.parameters.hp, current: newHp },
          },
        }, { merge: true });
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
      kind: "item" | "follower" | "spell";
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
        const kind: "item" | "follower" | "spell" =
          operation.kind === "follower" ? "follower" :
          operation.kind === "spell" ? "spell" :
          "item";
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
        } else if (kind === "spell") {
          const spell = this.spellCatalogService.getSpell(itemId);
          if (!spell) {
            throw new Error("Spell definition not found");
          }

          if (quantity > 1) {
            throw new Error("Spells can only be bought one at a time");
          }

          itemName = this.spellCatalogService.getLocalizedName(spell);
          purchaseValuePerUnit = typeof stockEntry.purchaseValue === "number"
            ? Math.max(0, Math.floor(stockEntry.purchaseValue))
            : 0;
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
      const nextSpells = [...(player.spellbook?.spells ?? [])];
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

        if (kind === "spell") {
          nextSpells.push({ spellId: itemId, source: "merchant" as const, occupiesSlot: true });
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

      const spellsBought = nextSpells.length > (player.spellbook?.spells?.length ?? 0);

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
          ...(spellsBought
            ? { spellbook: { ...(player.spellbook ?? {}), spells: nextSpells } }
            : {}),
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
          ...(spellsBought
            ? { spellbook: { ...(player.spellbook ?? {}), spells: nextSpells } }
            : {}),
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
      discardReason: "released" | "dead";
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

      const nextFollowers = normalizedFollowers.filter((_, i) => i !== allyIndex);

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

      if (input.discardReason === "dead") {
        const followerDef = this.followerCatalogService.getCachedFollowerById(selectedFollower.followerId);
        let nextDiscardSeq = Math.max(0, Math.floor(Number(worldState.nextDiscardSeq ?? 0))) + 1;
        const discardRef = doc(collection(worldStateRef, "discardPile"));
        transaction.set(discardRef, {
          id: discardRef.id,
          card: { kind: "follower", cardId: selectedFollower.followerId, name: followerDef?.name ?? selectedFollower.followerId },
          source: "world",
          ownerPlayerId: actor.id,
          turn: worldTurn,
          discardedAt: Timestamp.now(),
          discardSeq: nextDiscardSeq,
          reason: "dead",
        } as DiscardPileEntry);
        nextWorldState.nextDiscardSeq = nextDiscardSeq;
      }

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
    void actorId;
    void nextWorldState;
    // MP regeneration is resolved when ending the turn.
    return this.resolveMpRecoveredOnTurnStart(player);
  }

  private getSpellbookCapacity(player: Player): number {
    const configured = player.spellbook?.capacity;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured));
    }

    return DEFAULT_SPELLBOOK_CAPACITY;
  }

  private normalizePlayerSpellEntries(rawEntries: unknown): PlayerSpellEntry[] {
    if (!Array.isArray(rawEntries)) {
      return [];
    }

    const normalized: PlayerSpellEntry[] = [];
    const seen = new Set<string>();

    rawEntries.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const typedEntry = entry as PlayerSpellEntry;
      if (typeof typedEntry.spellId !== "string" || typedEntry.spellId.trim().length === 0) {
        return;
      }

      const spellId = typedEntry.spellId.trim();
      if (seen.has(spellId)) {
        return;
      }

      const blockedUntilTurn = typeof typedEntry.blockedUntilTurn === "number" && Number.isFinite(typedEntry.blockedUntilTurn)
        ? Math.max(0, Math.floor(typedEntry.blockedUntilTurn))
        : undefined;

      normalized.push({
        spellId,
        ...(typeof typedEntry.source === "string" ? { source: typedEntry.source } : {}),
        ...(typeof blockedUntilTurn === "number" ? { blockedUntilTurn } : {}),
        ...(typeof typedEntry.occupiesSlot === "boolean" ? { occupiesSlot: typedEntry.occupiesSlot } : {}),
        ...(typeof typedEntry.grantedBySanctuaryElement === "string" ? { grantedBySanctuaryElement: typedEntry.grantedBySanctuaryElement } : {}),
      });

      seen.add(spellId);
    });

    return normalized;
  }

  private isInsideBounds(x: number, y: number, mapSize: number): boolean {
    return x >= 0 && y >= 0 && x < mapSize && y < mapSize;
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

  private buildMerchantStockKey(kind: "item" | "follower" | "spell", tradableId: string): string {
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

      const rawUpgrades = (entry as { upgrades?: unknown }).upgrades;
      const upgrades = Array.isArray(rawUpgrades)
        ? rawUpgrades.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        : undefined;

      followers.push({
        followerId: followerId.trim(),
        hpCurrent,
        state,
        ...(discardReason ? { discardReason } : {}),
        ...(typeof discardedAtTurn === "number" ? { discardedAtTurn } : {}),
        ...(nameOverride ? { nameOverride } : {}),
        ...(categoryOverride ? { categoryOverride } : {}),
        ...(upgrades && upgrades.length > 0 ? { upgrades } : {}),
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
        if (
          !effect ||
          effect.type === "gain-coins-range-on-pickup" ||
          effect.type === "apply-status-on-pickup" ||
          effect.type === "combat-stat-bonus-vs-enemy-category" ||
          effect.type === "draw-spell-on-spellbook-empty" ||
          effect.type === "apply-status-on-lucky-roll" ||
          effect.type === "passive-self-silence-and-spell-immunity" ||
          effect.type === "region-iii-access" ||
          effect.type === "skip-spirit-for-exp" ||
          effect.type === "skip-exploration-card-once-per-turn" ||
          effect.type === "reduce-combat-damage-on-fortune-check" ||
          effect.biome !== biome
        ) {
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

        if (effect.type === "prevent-biome-condition-damage-passive") {
          if (!preventedBiomeConditionIds.has(effect.conditionId)) {
            preventedBiomeConditionIds.add(effect.conditionId);
          }
          continue;
        }

        if (effect.type !== "recharge-charges-in-biome") {
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

  private shuffleLocal<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private cellQuadrant(x: number, y: number, mapSize: number): QuadrantId {
    const split = Math.max(1, Math.floor(Math.max(1, Math.floor(mapSize)) / 2));
    const isRight = x >= split;
    const isBottom = y >= split;
    if (!isRight && !isBottom) return "Q1";
    if (isRight && !isBottom) return "Q2";
    if (!isRight && isBottom) return "Q3";
    return "Q4";
  }

  // ── Place card effects ───────────────────────────────────────────────────

  public async placeFountainDrink(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    cell: { x: number; y: number },
    instanceId: string,
    params: { stat: "magic" | "strength" | "hp"; statAmount: number; initialUses: number; luckThreshold: number },
    placeName: string,
  ): Promise<{ result: "damage" | "boost"; value: number; usesLeft: number; exhausted: boolean }> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    const roll = Math.ceil(Math.random() * 100);
    const success = roll > params.luckThreshold;
    const outcome = { result: success ? "boost" : "damage" as "boost" | "damage", value: 0, usesLeft: 0, exhausted: false };

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      if (!cellSnap.exists()) throw new Error("Cell not found");

      const player = playerSnap.data() as Player;
      const cellData = cellSnap.data() as MapCell;
      const events = cellData.explorationEvents ?? [];
      const cardIndex = events.findIndex((e) => e.instanceId === instanceId);
      if (cardIndex === -1) throw new Error("Place card not found on cell");
      const placedCard = events[cardIndex] as { usesLeft?: number };
      const currentUses = typeof placedCard.usesLeft === "number" ? placedCard.usesLeft : params.initialUses;
      const nextUses = currentUses - 1;
      outcome.usesLeft = nextUses;
      outcome.exhausted = nextUses <= 0;

      const hpBase = Math.max(1, Math.floor(Number(player.parameters.hp.base)));
      const hpMax = Math.max(1, Math.floor(Number(player.parameters.hp.max ?? player.parameters.hp.base)));
      const hpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current)));

      let params_update: Record<string, unknown> = {};

      if (!success) {
        const damage = Math.max(1, Math.floor(hpMax * 0.1));
        outcome.value = damage;
        params_update = {
          parameters: {
            ...player.parameters,
            hp: { ...player.parameters.hp, current: Math.max(0, hpCurrent - damage) },
          },
        };
      } else if (params.stat === "strength") {
        outcome.value = params.statAmount;
        params_update = {
          parameters: {
            ...player.parameters,
            strength: { ...player.parameters.strength, base: player.parameters.strength.base + params.statAmount, current: player.parameters.strength.current + params.statAmount },
          },
        };
      } else if (params.stat === "magic") {
        outcome.value = params.statAmount;
        params_update = {
          parameters: {
            ...player.parameters,
            magic: { ...player.parameters.magic, base: player.parameters.magic.base + params.statAmount, current: player.parameters.magic.current + params.statAmount },
          },
        };
      } else {
        const newBase = Math.ceil(hpBase * (1 + params.statAmount));
        const newMax = Math.ceil(hpMax * (1 + params.statAmount));
        outcome.value = newMax - hpMax;
        params_update = {
          parameters: {
            ...player.parameters,
            hp: { ...player.parameters.hp, base: newBase, max: newMax },
          },
        };
      }

      transaction.set(playerRef, params_update, { merge: true });

      let updatedEvents: MapCell["explorationEvents"];
      if (outcome.exhausted) {
        updatedEvents = events.filter((e) => e.instanceId !== instanceId);
      } else {
        updatedEvents = events.map((e) => e.instanceId === instanceId ? { ...e, usesLeft: nextUses } : e);
      }
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    const logCode = !success
      ? "player.placeFountainDamage"
      : params.stat === "hp"
        ? "player.placeFountainHpBoost"
        : "player.placeFountainStatBoost";

    await this.tryCreateLog(gameId, actor, logCode, {
      placeName,
      damage: !success ? outcome.value : 0,
      amount: success ? outcome.value : 0,
      stat: params.stat,
      usesLeft: outcome.usesLeft,
    });

    if (outcome.exhausted) {
      await this.tryCreateLog(gameId, actor, "player.placeFountainExhausted", { placeName });
    }

    return outcome;
  }

  public async placePortalTeleport(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
  ): Promise<{ x: number; y: number; destinationName: string } | null> {
    const allSnap = await getDocs(collection(this.firebaseService.database, "games", gameId, "mapCells"));
    const specialCells = allSnap.docs
      .map((d) => d.data() as MapCell)
      .filter((c) => c.isSpecial && (c.specialType === "landmark" || c.specialType === "sanctuary") && typeof c.revealedAtTurn === "number");

    if (specialCells.length === 0) {
      await this.tryCreateLog(gameId, actor, "player.placePortalNoDestination", {});
      return null;
    }

    const target = specialCells[Math.floor(Math.random() * specialCells.length)];
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      const worldState = worldSnap.exists() ? worldSnap.data() as { currentTurn?: number } : {};
      transaction.set(playerRef, {
        location: { x: target.x, y: target.y },
        movedThisTurnByPlayer: true,
        actionsUsedThisTurn: { ...(playerSnap.data() as Player).actionsUsedThisTurn, "portal-move": worldState.currentTurn ?? 0 },
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    const destinationName = target.landmarkDisplayName ?? target.landmarkId ?? `${target.x + 1},${target.y + 1}`;
    await this.tryCreateLog(gameId, actor, "player.placePortal", { destination: destinationName });
    return { x: target.x, y: target.y, destinationName };
  }

  public async placeMazeLuck(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
  ): Promise<"lost" | "escaped"> {
    const roll = Math.ceil(Math.random() * 100);
    const lost = roll <= 50;

    if (lost) {
      const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
      const gameRef = doc(this.firebaseService.database, "games", gameId);
      const sleepDef = this.statusCatalogService.getCachedStatus("sleep");

      if (sleepDef) {
        await runTransaction(this.firebaseService.database, async (transaction) => {
          const snap = await transaction.get(playerRef);
          if (!snap.exists()) throw new Error("Player not found");
          const player = snap.data() as Player;
          const statuses = this.normalizeStatuses(player.statuses);
          const sleepStatus: PlayerStatus = {
            key: sleepDef.key,
            label: sleepDef.label,
            description: sleepDef.description,
            durationTurns: 1,
          };
          transaction.set(playerRef, { statuses: this.upsertStatus(statuses, sleepStatus) }, { merge: true });
          transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
        });
      }
      await this.tryCreateLog(gameId, actor, "player.placeMazeLost", {});
    } else {
      await this.tryCreateLog(gameId, actor, "player.placeMazeEscape", {});
    }

    return lost ? "lost" : "escaped";
  }

  public async placeCaveLuck(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
  ): Promise<"damage" | "nothing" | "coins5" | "coins10" | "xp"> {
    const roll = Math.ceil(Math.random() * 100);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    if (roll <= 20) {
      await runTransaction(this.firebaseService.database, async (transaction) => {
        const snap = await transaction.get(playerRef);
        if (!snap.exists()) throw new Error("Player not found");
        const player = snap.data() as Player;
        const hpMax = Math.max(1, Math.floor(Number(player.parameters.hp.max ?? player.parameters.hp.base)));
        const damage = Math.max(1, Math.floor(hpMax * 0.1));
        const newHp = Math.max(0, Math.floor(Number(player.parameters.hp.current)) - damage);
        transaction.set(playerRef, { parameters: { ...player.parameters, hp: { ...player.parameters.hp, current: newHp } } }, { merge: true });
        transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
      });
      const hpSnap = await getDoc(playerRef);
      const hpMax = Math.max(1, Math.floor(Number((hpSnap.data() as Player).parameters.hp.max ?? (hpSnap.data() as Player).parameters.hp.base)));
      const damage = Math.max(1, Math.floor(hpMax * 0.1));
      await this.tryCreateLog(gameId, actor, "player.placeCaveDamage", { damage });
      return "damage";
    }

    if (roll <= 40) {
      await this.tryCreateLog(gameId, actor, "player.placeCaveNothing", {});
      return "nothing";
    }

    const coins = roll <= 60 ? 5 : roll <= 80 ? 10 : 0;
    if (coins > 0) {
      await runTransaction(this.firebaseService.database, async (transaction) => {
        const snap = await transaction.get(playerRef);
        if (!snap.exists()) throw new Error("Player not found");
        const player = snap.data() as Player;
        const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0))) + coins;
        transaction.set(playerRef, { inventory: { ...player.inventory, money } }, { merge: true });
        transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
      });
      await this.tryCreateLog(gameId, actor, "player.placeCaveCoins", { amount: coins });
      return coins === 5 ? "coins5" : "coins10";
    }

    await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, actor.id, 1);
    await this.tryCreateLog(gameId, actor, "player.placeCaveXp", {});
    return "xp";
  }

  public async placeChapelLuck(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
  ): Promise<"nothing" | "fortune" | "coins" | "heal" | "spell" | "spellFull" | "spellEmpty" | "teleport"> {
    const roll = Math.ceil(Math.random() * 100);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    if (roll <= 16) {
      await this.tryCreateLog(gameId, actor, "player.placeChapelNothing", {});
      return "nothing";
    }

    if (roll <= 32) {
      const fortuneDef = this.statusCatalogService.getCachedStatus("fortune");
      if (fortuneDef) {
        await runTransaction(this.firebaseService.database, async (transaction) => {
          const snap = await transaction.get(playerRef);
          if (!snap.exists()) throw new Error("Player not found");
          const player = snap.data() as Player;
          const statuses = this.normalizeStatuses(player.statuses);
          const fortuneStatus: PlayerStatus = { key: fortuneDef.key, label: fortuneDef.label, description: fortuneDef.description, durationTurns: 2 };
          transaction.set(playerRef, { statuses: this.upsertStatus(statuses, fortuneStatus) }, { merge: true });
          transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
        });
      }
      await this.tryCreateLog(gameId, actor, "player.placeChapelFortune", {});
      return "fortune";
    }

    if (roll <= 48) {
      await runTransaction(this.firebaseService.database, async (transaction) => {
        const snap = await transaction.get(playerRef);
        if (!snap.exists()) throw new Error("Player not found");
        const player = snap.data() as Player;
        const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0))) + 5;
        transaction.set(playerRef, { inventory: { ...player.inventory, money } }, { merge: true });
        transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
      });
      await this.tryCreateLog(gameId, actor, "player.placeChapelCoins", {});
      return "coins";
    }

    if (roll <= 64) {
      const healResult = await runTransaction(this.firebaseService.database, async (transaction) => {
        const snap = await transaction.get(playerRef);
        if (!snap.exists()) throw new Error("Player not found");
        const player = snap.data() as Player;
        const hpMax = Math.max(1, Math.floor(Number(player.parameters.hp.max ?? player.parameters.hp.base)));
        const healedHp = Math.max(1, Math.floor(hpMax * 0.05));
        const newHp = Math.min(hpMax, Math.floor(Number(player.parameters.hp.current)) + healedHp);
        transaction.set(playerRef, { parameters: { ...player.parameters, hp: { ...player.parameters.hp, current: newHp } } }, { merge: true });
        transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
        return healedHp;
      });
      await this.tryCreateLog(gameId, actor, "player.placeChapelHeal", { healedHp: healResult });
      return "heal";
    }

    if (roll <= 80) {
      const spellResult = { outcome: "ok" as "ok" | "full" | "empty", spellId: null as string | null };
      await runTransaction(this.firebaseService.database, async (transaction) => {
        const [playerSnap, worldSnap] = await Promise.all([
          transaction.get(playerRef),
          transaction.get(worldStateRef),
        ]);
        if (!playerSnap.exists()) throw new Error("Player not found");
        const player = playerSnap.data() as Player;
        const worldState = worldSnap.exists() ? worldSnap.data() as { spellDeck?: string[]; spellDiscardedDeck?: string[] } : {};
        const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);
        const capacity = this.getSpellbookCapacity(player);
        if (knownSpells.length >= capacity) { spellResult.outcome = "full"; return; }
        const drawResult = this.spellDeckService.draw(worldState.spellDeck ?? [], worldState.spellDiscardedDeck ?? [], 1);
        spellResult.spellId = drawResult.drawn[0] ?? null;
        if (!spellResult.spellId) { spellResult.outcome = "empty"; return; }
        const nextSpells = [...knownSpells, { spellId: spellResult.spellId, source: "place" as const, occupiesSlot: true }];
        transaction.set(playerRef, { spellbook: { ...(player.spellbook ?? {}), spells: nextSpells, capacity } }, { merge: true });
        transaction.set(worldStateRef, { spellDeck: drawResult.remaining, spellDiscardedDeck: drawResult.discard }, { merge: true });
        transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
      });
      if (spellResult.outcome === "ok" && spellResult.spellId) {
        const spell = this.spellCatalogService.getSpell(spellResult.spellId);
        await this.tryCreateLog(gameId, actor, "player.placeChapelSpell", { spellName: spell ? this.spellCatalogService.getLocalizedName(spell) : spellResult.spellId });
        return "spell";
      }
      const logCode = spellResult.outcome === "full" ? "player.placeChapelSpellFull" : "player.placeChapelSpellEmpty";
      await this.tryCreateLog(gameId, actor, logCode, {});
      return spellResult.outcome === "full" ? "spellFull" : "spellEmpty";
    }

    await runTransaction(this.firebaseService.database, async (transaction) => {
      transaction.set(playerRef, { pendingTeleportOnMove: true }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });
    await this.tryCreateLog(gameId, actor, "player.placeChapelTeleport", {});
    return "teleport";
  }

  public async placeMarketBuy(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    cell: { x: number; y: number },
    tradableId: string,
    price: number,
    stockKey: string,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      if (!cellSnap.exists()) throw new Error("Cell not found");

      const player = playerSnap.data() as Player;
      const cellData = cellSnap.data() as MapCell;
      const money = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
      if (money < price) throw new Error("Not enough coins");

      const stockMap = { ...(cellData.merchantStockByItemId ?? {}) };
      const currentStock = Math.max(0, Math.floor(Number(stockMap[stockKey] ?? 0)));
      if (currentStock <= 0) throw new Error("Item out of stock");
      stockMap[stockKey] = currentStock - 1;

      const item = this.itemCatalogService.getCachedItemById(tradableId);
      if (!item) throw new Error("Item not found in catalog");

      const items = this.normalizeInventoryItems(player.inventory?.items);
      if (items.length >= DEFAULT_ITEM_INVENTORY_CAPACITY) throw new Error("Inventory full");
      items.push({ itemId: tradableId });

      transaction.set(playerRef, {
        inventory: { ...player.inventory, money: money - price, items },
      }, { merge: true });
      transaction.set(cellRef, { merchantStockByItemId: stockMap }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    const item = this.itemCatalogService.getCachedItemById(tradableId);
    await this.tryCreateLog(gameId, actor, "player.merchantBuy", {
      actionId: "place-market",
      itemName: item ? this.itemCatalogService.getLocalizedName(item) : tradableId,
      quantity: 1,
      spentCoins: price,
    });
  }

  public async placeChapelUseTeleport(
    gameId: string,
    actor: Pick<Player, "id" | "name">,
    targetX: number,
    targetY: number,
  ): Promise<void> {
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const gameRef = doc(this.firebaseService.database, "games", gameId);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found");
      const worldState = worldSnap.exists() ? worldSnap.data() as WorldState : {} as WorldState;
      const worldTurn = worldState.currentTurn ?? 0;

      transaction.set(playerRef, {
        location: { x: targetX, y: targetY },
        pendingTeleportOnMove: false,
      }, { merge: true });
      transaction.set(worldStateRef, {
        movedThisTurnByPlayer: { ...(worldState.movedThisTurnByPlayer ?? {}), [actor.id]: worldTurn },
      }, { merge: true });
      transaction.set(gameRef, { updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() }, { merge: true });
    });

    await this.tryCreateLog(gameId, actor, "player.placeChapelActivatedTeleport", { targetX: targetX + 1, targetY: targetY + 1 });
  }

  private rollWeightedChaosEffect(effects: ChaosEffectDefinition[]): ChaosEffectDefinition | null {
    const totalWeight = effects.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight <= 0) return null;
    let roll = Math.random() * totalWeight;
    for (const effect of effects) {
      roll -= effect.weight;
      if (roll <= 0) return effect;
    }
    return effects[effects.length - 1] ?? null;
  }
}
