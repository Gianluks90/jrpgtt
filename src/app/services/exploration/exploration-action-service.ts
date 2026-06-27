import { Injectable } from "@angular/core";
import { Timestamp, collection, deleteField, doc, getDocs, runTransaction, setDoc, writeBatch } from "firebase/firestore";
import { FirebaseService } from "@services/app/firebase-service";
import { Player, PlayerStatus } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { ActiveRegionEffect, WorldState } from "@models/world/WorldState";
import { PlacedEnemyCard, PlacedExplorationCard, PlacedItemCard, PlacedAmuletCard, PlacedFollowerCard, PlacedEventCard } from "@models/exploration/ExplorationCard";
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { EventLogService } from "@services/gameplay/event-log-service";
import { PlayerProgressionService } from "@services/player/player-progression-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { EnemyCatalogService } from "@services/catalog/enemy-catalog-service";
import { EnemyCatalogEntry } from "@models/catalog/EnemyCatalog";
import { StatusCatalogService } from "@services/catalog/status-catalog-service";
import { ItemEffectCatalogService } from "@services/catalog/item-effect-catalog-service";
import { GainCoinsRangeOnPickupEffectDefinition, ApplyStatusOnPickupEffectDefinition } from "@models/catalog/ItemEffectCatalog";
import { WorldZonesService } from "@services/map/world-zones-service";
import { ExplorationDeckService } from "@services/exploration/exploration-deck-service";
import { ExplorationEventEffect, ExplorationDeckSlot } from "@models/catalog/ExplorationCardCatalog";
import { PlayerFollowerEntry } from "@models/player/Follower";
import { InventoryItemEntry } from "@models/player/Inventory";
import { ResourceStack } from "@models/world/Resource";
import { ResourceLabel } from "@models/world/Resource";
import { DEFAULT_ITEM_INVENTORY_CAPACITY } from "../../consts/gameplay/inventory-config";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";
import { PlayerSpellEntry } from "@models/player/Spellbook";

export interface PickupItemInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  card: PlacedItemCard | PlacedAmuletCard;
}

export interface PickupFollowerInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  card: PlacedFollowerCard;
}

export interface ApplyEventInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  worldState: WorldState;
  card: PlacedEventCard;
  effect?: ExplorationEventEffect;
  mapSize?: number;
}

export interface CommitCombatResultInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  enemy: PlacedEnemyCard;
  result: CombatResult;
  worldState: WorldState;
  mapSize: number;
}

export interface ExorciseSpiritInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  enemy: PlacedEnemyCard;
  worldState: WorldState;
  xpGained: number;
}

export interface CrystalBallSkipInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  cardInstanceId: string;
  worldState: WorldState;
}

export interface FollowerCombatSkipInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  cardInstanceId: string;
  followerId: string;
  worldState: WorldState;
}

@Injectable({
  providedIn: "root",
})
export class ExplorationActionService {
  constructor(
    private firebaseService: FirebaseService,
    private eventLogService: EventLogService,
    private playerProgressionService: PlayerProgressionService,
    private itemCatalogService: ItemCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private explorationCatalogService: ExplorationCatalogService,
    private enemyCatalogService: EnemyCatalogService,
    private statusCatalogService: StatusCatalogService,
    private itemEffectCatalogService: ItemEffectCatalogService,
    private worldZonesService: WorldZonesService,
    private explorationDeckService: ExplorationDeckService,
  ) {}

  public async clearDiscardPile(gameId: string): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const discardPileRef = collection(worldStateRef, "discardPile");
    const snap = await getDocs(discardPileRef);
    if (snap.empty) return;
    const batch = writeBatch(this.firebaseService.database);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  public async openExplorationSession(gameId: string, playerId: string, cellId: string): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, {
      activeExplorationSession: { playerId, cellId, resolvedInstanceIds: [] },
    }, { merge: true });
  }

  public async closeExplorationSession(gameId: string): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, { activeExplorationSession: deleteField() }, { merge: true });
  }

  public async openCombat(gameId: string, combatState: CombatState): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, { activeCombat: combatState }, { merge: true });
  }

  public async closeCombat(gameId: string): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, { activeCombat: deleteField() }, { merge: true });
  }

  public async commitCombatResult(input: CommitCombatResultInput): Promise<void> {
    const { gameId, player, cell, enemy, result, worldState } = input;
    const isVictory = result.outcome === "player-win";
    const isFlee = result.outcome === "flee" || result.outcome === "flee-lucky";
    const isTie = !isVictory && !isFlee && result.damage === 0;

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in commitCombatResult");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      const hpCurrent = Math.max(0, Math.floor(Number(currentPlayer.parameters?.hp?.current ?? 0)));
      const hpMax = Math.max(1, Math.floor(Number(
        currentPlayer.parameters?.hp?.max ?? currentPlayer.parameters?.hp?.base ?? 1,
      )));
      const damage = Math.max(0, Math.floor(Number(result.damage)));
      const newHp = isTie ? hpCurrent : Math.max(0, hpCurrent - (isVictory ? 0 : damage));

      const playerItems = Array.isArray(currentPlayer.inventory?.items)
        ? (currentPlayer.inventory.items as InventoryItemEntry[])
        : [];

      // Rune Sword (B-IT-005): recover 3% HP on victory (evil/neutral only — enforced by item availability)
      let finalHp = newHp;
      if (isVictory) {
        const hasRuneSword = playerItems.some(e => e.itemId === "B-IT-005");
        if (hasRuneSword) {
          const heal = Math.max(1, Math.floor(hpMax * 0.03));
          finalHp = Math.min(hpMax, finalHp + heal);
        }
      }

      // Golden Sword (B-IT-004): breaks (removed from inventory) on player defeat
      let updatedItems = playerItems;
      if (!isVictory && !isFlee && result.damage > 0) {
        const goldenSwordIndex = playerItems.findIndex(e => e.itemId === "B-IT-004");
        if (goldenSwordIndex !== -1) {
          updatedItems = playerItems.filter((_, i) => i !== goldenSwordIndex);
        }
      }

      // Followers with leavesOnCombatLoss: discard on player defeat
      const currentFollowers = Array.isArray(currentPlayer.followers) ? currentPlayer.followers : [];
      let updatedFollowers = currentFollowers;
      if (!isVictory && !isFlee && result.damage > 0) {
        updatedFollowers = currentFollowers.map((entry) => {
          if (!entry || entry.state === "discarded") return entry;
          const def = this.followerCatalogService.getCachedFollowerById(entry.followerId);
          if (!def?.leavesOnCombatLoss) return entry;
          return { ...entry, state: "discarded" as const, discardedAtTurn: currentWorldState.currentTurn ?? 0 };
        });
      }

      const combatPatch: Record<string, unknown> = { "parameters.hp.current": Math.min(finalHp, hpMax) };
      if (updatedItems !== playerItems) {
        combatPatch["inventory.items"] = updatedItems;
      }
      if (updatedFollowers !== currentFollowers) {
        combatPatch["followers"] = updatedFollowers;
      }
      transaction.update(playerRef, combatPatch);

      if (isVictory) {
        const updatedEvents = this.removeEnemyFromCell(currentCell.explorationEvents ?? [], enemy.instanceId);
        transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

        const hasStolenGoldLoot = (enemy.loot ?? []).some(t => t === "stolen-gold");
        const stolenGold = hasStolenGoldLoot
          ? Math.max(0, Math.floor(Number(currentWorldState.pendingStolenGoldByPlayer?.[player.id] ?? 0)))
          : 0;

        const goldGained = Math.max(0, Math.floor(Number(result.goldGained ?? 0)));
        const totalGold = goldGained + stolenGold;
        if (totalGold > 0) {
          const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
          transaction.update(playerRef, { "inventory.money": currentMoney + totalGold });
        }

        const worldStatePatch: Record<string, unknown> = {};
        const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
        transaction.set(discardRef, {
          id: discardRef.id,
          card: { kind: "exploration", cardId: enemy.cardId, name: enemy.name },
          source: "map",
          ownerPlayerId: player.id,
          turn: currentWorldState.currentTurn ?? 0,
          discardedAt: Timestamp.now(),
          discardSeq: seq,
        } as DiscardPileEntry);

        const enemySlot: ExplorationDeckSlot = { type: 'enemy', cardId: enemy.cardId, expansion: enemy.expansion };
        worldStatePatch["explorationDiscardedDeck"] = [...(currentWorldState.explorationDiscardedDeck ?? []), enemySlot];
        worldStatePatch["nextDiscardSeq"] = seq;

        if (stolenGold > 0) {
          const pending = { ...(currentWorldState.pendingStolenGoldByPlayer ?? {}) };
          delete pending[player.id];
          worldStatePatch["pendingStolenGoldByPlayer"] = pending;
        }

        transaction.set(worldStateRef, worldStatePatch, { merge: true });
      }
      // Resource loot: deferred to the existing pendingResourcePickup flow
    });

    await this.eventLogService.newLog(gameId, player, "player.combatResult", {
      enemy: enemy.name,
      outcome: result.outcome,
      damage: result.damage,
      xp: result.xpGained ?? 0,
    });

    if (isVictory && (result.xpGained ?? 0) > 0) {
      await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, player.id, result.xpGained!);
    }
  }

  public async exorciseSpiritEnemy(input: ExorciseSpiritInput): Promise<void> {
    const { gameId, player, cell, enemy, worldState, xpGained } = input;
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [cellSnap, worldSnap] = await Promise.all([
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      const updatedEvents = this.removeEnemyFromCell(currentCell.explorationEvents ?? [], enemy.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId: enemy.cardId, name: enemy.name },
        source: "map",
        ownerPlayerId: player.id,
        turn: currentWorldState.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      const enemySlot: ExplorationDeckSlot = { type: 'enemy', cardId: enemy.cardId, expansion: enemy.expansion };
      transaction.set(worldStateRef, {
        explorationDiscardedDeck: [...(currentWorldState.explorationDiscardedDeck ?? []), enemySlot],
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.exorcisedSpirit", { enemy: enemy.name, xpGained });

    if (xpGained > 0) {
      await this.playerProgressionService.assignExperienceAndCheckLevelUp(gameId, player.id, xpGained);
    }
  }

  public async followerCombatSkip(input: FollowerCombatSkipInput): Promise<void> {
    const { gameId, player, cell, cardInstanceId, followerId, worldState } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);
      if (!playerSnap.exists()) throw new Error("Player not found in followerCombatSkip");

      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;

      const updatedCards = (currentCell.explorationEvents ?? []).map((ev) => {
        if (ev.instanceId !== cardInstanceId) return ev;
        return { ...ev, resolved: true };
      });
      transaction.set(cellRef, { explorationEvents: updatedCards }, { merge: true });

      const actionKey = `follower-combat-skip-${followerId}`;
      transaction.update(playerRef, {
        actionsUsedThisTurn: { ...(playerSnap.data() as Player).actionsUsedThisTurn, [actionKey]: worldTurn },
      });
    });

    const followerDef = this.followerCatalogService.getCachedFollowerById(followerId);
    await this.eventLogService.newLog(gameId, player, "player.followerSkippedCombat", {
      followerName: followerDef?.name ?? followerId,
    });
  }

  public async crystalBallSkipCard(input: CrystalBallSkipInput): Promise<void> {
    const { gameId, player, cell, cardInstanceId, worldState } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const worldTurn = Math.max(0, Math.floor(Number(worldState.currentTurn ?? 0)));

    let drawnSlot: ExplorationDeckSlot | null = null;
    let remainingEventsAfterSkip: PlacedExplorationCard[] = [];

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in crystalBallSkipCard");
      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      const actionsUsed = currentPlayer.actionsUsedThisTurn ?? {};
      if (actionsUsed["crystal-ball-skip"] === worldTurn) {
        throw new Error("Crystal Ball already used this turn");
      }
      if (!(currentCell.explorationEvents ?? []).some(e => e.instanceId === cardInstanceId)) {
        throw new Error("Card not found on cell");
      }

      remainingEventsAfterSkip = (currentCell.explorationEvents ?? []).filter(e => e.instanceId !== cardInstanceId);

      const drawResult = this.explorationDeckService.draw(
        currentWorldState.explorationDeck ?? [],
        currentWorldState.explorationDiscardedDeck ?? [],
        1,
      );
      drawnSlot = drawResult.drawn[0] ?? null;

      transaction.set(cellRef, { explorationEvents: remainingEventsAfterSkip }, { merge: true });
      transaction.update(playerRef, {
        actionsUsedThisTurn: { ...actionsUsed, "crystal-ball-skip": worldTurn },
      });
      transaction.set(worldStateRef, {
        explorationDeck: drawResult.remaining,
        explorationDiscardedDeck: drawResult.discard,
      }, { merge: true });
    });

    // Phase 2: instantiate and add the replacement card (async, outside transaction)
    if (drawnSlot) {
      const newCard = await this.explorationCatalogService.instantiatePlacedCard(drawnSlot, cell);
      if (newCard) {
        const updatedCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
        await setDoc(updatedCellRef, {
          explorationEvents: [...remainingEventsAfterSkip, newCard],
        }, { merge: true });
      }
    }

    await this.eventLogService.newLog(gameId, player, "player.crystalBallSkip", {});
  }

  public async pickupItemCard(input: PickupItemInput): Promise<void> {
    const { gameId, player, cell, card } = input;
    const itemId = card.type === "item" ? card.itemId : card.amuletId;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in pickupItemCard");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;

      const currentItems: InventoryItemEntry[] = Array.isArray(currentPlayer.inventory?.items)
        ? (currentPlayer.inventory.items as InventoryItemEntry[])
        : [];
      const item = this.itemCatalogService.getCachedItemById(itemId);

      const playerPatch: Record<string, unknown> = {};

      if (item?.consumable) {
        for (const effectId of item.effects ?? []) {
          const effect = this.itemEffectCatalogService.getCachedEffect(effectId);
          if (!effect) continue;

          if (effect.type === "gain-coins-range-on-pickup") {
            const typed = effect as GainCoinsRangeOnPickupEffectDefinition;
            const range = typed.maxAmount - typed.minAmount;
            const coins = typed.minAmount + Math.floor(Math.random() * (range + 1));
            const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
            playerPatch["inventory.money"] = currentMoney + coins;
          }

          if (effect.type === "apply-status-on-pickup") {
            const typed = effect as ApplyStatusOnPickupEffectDefinition;
            const statusDef = this.statusCatalogService.getCachedStatus(typed.statusKey);
            if (statusDef) {
              const existing = (currentPlayer.statuses ?? []).filter(s => s.key !== statusDef.key);
              const newStatus: PlayerStatus = {
                key: statusDef.key,
                label: statusDef.label,
                description: statusDef.description,
                durationTurns: Math.max(1, Math.floor(Number(typed.durationTurns ?? statusDef.defaultDurationTurns ?? 1))),
                ...(statusDef.effectKey ? { effectKey: statusDef.effectKey } : {}),
              };
              playerPatch["statuses"] = [...existing, newStatus];
            }
          }
        }
        if (Object.keys(playerPatch).length > 0) {
          transaction.update(playerRef, playerPatch);
        }
      } else if (item?.occupiesSpace) {
        const baseCapacity = typeof currentPlayer.inventory?.itemCapacity === "number"
          ? Math.max(1, Math.floor(currentPlayer.inventory.itemCapacity))
          : DEFAULT_ITEM_INVENTORY_CAPACITY;
        const followersBonus = this.getFollowersItemCapacityBonus(currentPlayer.followers);
        const effectiveCapacity = baseCapacity + followersBonus;
        const occupiedSlots = this.getOccupiedItemSlots(currentItems);

        if (occupiedSlots >= effectiveCapacity) {
          transaction.set(playerRef, {
            pendingItemPickup: { itemId, source: "exploration", requestedAtTurn: Date.now() },
          }, { merge: true });
        } else {
          const newEntry: InventoryItemEntry = item.maxCharges
            ? { itemId, currentCharges: item.maxCharges }
            : { itemId };
          transaction.set(playerRef, {
            inventory: {
              ...(currentPlayer.inventory ?? { items: [], resources: [], money: 0 }),
              items: [...currentItems, newEntry],
            },
          }, { merge: true });
        }
      } else {
        const newEntry: InventoryItemEntry = item?.maxCharges
          ? { itemId, currentCharges: item.maxCharges }
          : { itemId };
        transaction.set(playerRef, {
          inventory: {
            ...(currentPlayer.inventory ?? { items: [], resources: [], money: 0 }),
            items: [...currentItems, newEntry],
          },
        }, { merge: true });
      }

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], card.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationPickupItem", { itemId });
  }

  public async pickupFollowerCard(input: PickupFollowerInput): Promise<void> {
    const { gameId, player, cell, card } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in pickupFollowerCard");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;

      const followerDef = this.followerCatalogService.getCachedFollowerById(card.followerId);
      const maxHp = Math.max(1, Math.floor(Number(followerDef?.maxHp ?? 3)));
      let currentFollowers: PlayerFollowerEntry[] = Array.isArray(currentPlayer.followers)
        ? (currentPlayer.followers as PlayerFollowerEntry[]).filter((f) => typeof (f as { followerId?: unknown }).followerId === "string")
        : [];
      if (followerDef?.removesOtherFollowersOnPickup) {
        currentFollowers = currentFollowers.map((f) =>
          f.state === "discarded" ? f : { ...f, state: "discarded" as const, discardReason: "released" as const },
        );
      }
      const newFollower: PlayerFollowerEntry = { followerId: card.followerId, hpCurrent: maxHp, state: "active" };

      transaction.set(playerRef, { followers: [...currentFollowers, newFollower] }, { merge: true });

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], card.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationPickupFollower", { followerId: card.followerId });
  }

  public async applyEventEffect(input: ApplyEventInput): Promise<void> {
    const { gameId, player, cell, worldState, card, effect, mapSize = 0 } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    // Single map-cells fetch for both explored-cell teleport and enemy-spawn needs.
    let allMapCells: MapCell[] | null = null;
    const spawnSpec = this.extractSpawnSpec(effect);
    if (this.effectNeedsExploredCells(effect) || spawnSpec) {
      const snap = await getDocs(collection(this.firebaseService.database, "games", gameId, "mapCells"));
      allMapCells = snap.docs.map(d => d.data() as MapCell);
    }

    let exploredCells: Array<{ x: number; y: number }> = [];
    if (allMapCells && this.effectNeedsExploredCells(effect)) {
      exploredCells = allMapCells
        .filter(c => typeof c.revealedAtTurn === "number" && !(c.x === cell.x && c.y === cell.y))
        .map(c => ({ x: c.x, y: c.y }));
    }

    // Pre-fetch enemy entry and nearest cell for spawn effects.
    let spawnEnemyEntry: EnemyCatalogEntry | null = null;
    let spawnTargetCell: MapCell | null = null;
    if (spawnSpec && allMapCells) {
      spawnEnemyEntry = await this.enemyCatalogService.getEnemyById(spawnSpec.enemyId);
      spawnTargetCell = this.findNearestBiomeCell(allMapCells, cell, spawnSpec.biome);
    }

    // Pre-fetch all players for region/global effects
    let allPlayersData: Array<{ id: string; data: Player }> = [];
    let multiTargetIds: string[] = [];
    const isMultiPlayer = this.effectIsMultiPlayer(effect);
    if (isMultiPlayer) {
      await this.statusCatalogService.loadConfig();
      const playersSnap = await getDocs(collection(this.firebaseService.database, "games", gameId, "players"));
      allPlayersData = playersSnap.docs.map(d => ({ id: d.id, data: d.data() as Player }));

      if (effect?.type === "global-amulet-hp-percent-damage") {
        multiTargetIds = allPlayersData.filter(p => this.playerHasAmulet(p.data)).map(p => p.id);
      } else if (mapSize > 0) {
        const currentRegion = this.worldZonesService.getRegionLabelByColumn(cell.x, mapSize);
        multiTargetIds = allPlayersData
          .filter(p => this.worldZonesService.getRegionLabelByColumn(p.data.location.x, mapSize) === currentRegion)
          .map(p => p.id);
      }
    }

    // Main transaction: single-player effects + card removal + deck bookkeeping
    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in applyEventEffect");

      const cp = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const cws = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      // Mutable in-memory copies of world-state deck fields
      const mutableDeck = [...(cws.explorationDeck ?? [])];
      const mutableDiscarded = [...(cws.explorationDiscardedDeck ?? [])];
      const mutableSpellDeck = [...(cws.spellDeck ?? [])];
      const mutableSkips: Record<string, number> = { ...(cws.skippedTurnsByPlayer ?? {}) };
      const mutableActiveRegionEffects: ActiveRegionEffect[] = [...(cws.activeRegionEffects ?? [])];
      const mutablePendingStolenGold: Record<string, number> = { ...(cws.pendingStolenGoldByPlayer ?? {}) };

      // Player field mutations (dot-path -> value)
      const playerMutations: Record<string, unknown> = {};

      // Capture current gold before composite effects (e.g. lose-all-gold) zero it.
      if (spawnSpec && spawnTargetCell) {
        const currentMoney = Math.max(0, Math.floor(Number(cp.inventory?.money ?? 0)));
        if (currentMoney > 0) {
          mutablePendingStolenGold[player.id] = currentMoney;
        }
      }

      if (!isMultiPlayer) {
        this.applyEffectToPlayer(
          effect, cp, cws, player.id,
          playerMutations, mutableDeck, mutableDiscarded, mutableSpellDeck, mutableSkips,
          exploredCells,
        );
      }

      // Handle region-persistent-effect: register recurring area damage.
      if (effect?.type === "region-persistent-effect" && effect.effect && mapSize > 0) {
        const regionLabel = this.worldZonesService.getRegionLabelByColumn(cell.x, mapSize);
        const selector = regionLabel === "I" ? "first" : regionLabel === "II" ? "second" : "third";
        const regionColumns = this.worldZonesService.getRegionColumns(selector as "first" | "second" | "third", mapSize);
        const newRegionEffect: ActiveRegionEffect = {
          id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `re-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          effectType: "hp-percent-damage",
          amount: Math.max(0, Number(effect.effect.amount ?? 0)),
          regionLabel,
          regionColumns,
          remainingRounds: Math.max(1, Math.floor(Number(effect.rounds ?? 1))),
          sourceCardId: card.cardId,
        };
        mutableActiveRegionEffects.push(newRegionEffect);
      }

      // Handle spawn-nearest-biome-enemy: place the enemy on the target cell.
      if (spawnSpec && spawnTargetCell && spawnEnemyEntry) {
        const targetCellRef = doc(
          this.firebaseService.database, "games", gameId, "mapCells",
          `${spawnTargetCell.x}_${spawnTargetCell.y}`,
        );
        const targetCellSnap = await transaction.get(targetCellRef);
        const targetCellData = targetCellSnap.exists() ? (targetCellSnap.data() as MapCell) : null;
        const level = this.enemyCatalogService.computeSpawnLevel(spawnTargetCell.x, 0);
        const placedBase = this.enemyCatalogService.resolveSpawnedEnemy(spawnEnemyEntry, level);
        const placedEnemy: PlacedEnemyCard = { ...placedBase, expansion: card.expansion };
        const existingEvents = targetCellData?.explorationEvents ?? [];
        transaction.set(targetCellRef, { explorationEvents: [...existingEvents, placedEnemy] }, { merge: true });
      }

      // Write player mutations
      if (Object.keys(playerMutations).length > 0) {
        transaction.update(playerRef, playerMutations);
      }

      // Remove card from cell
      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], card.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      // Discard pile entry
      const eventName = this.explorationCatalogService.getEventDef(card.cardId)?.name ?? card.cardId;
      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, cws);
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId: card.cardId, name: eventName },
        source: "map",
        ownerPlayerId: player.id,
        turn: cws.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      // Add event itself to discarded deck
      mutableDiscarded.push({ type: "event", cardId: card.cardId, expansion: card.expansion });

      transaction.set(worldStateRef, {
        explorationDeck: mutableDeck,
        explorationDiscardedDeck: mutableDiscarded,
        spellDeck: mutableSpellDeck,
        skippedTurnsByPlayer: mutableSkips,
        activeRegionEffects: mutableActiveRegionEffects,
        pendingStolenGoldByPlayer: mutablePendingStolenGold,
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    // Batch phase: multi-player effects
    if (isMultiPlayer && multiTargetIds.length > 0 && effect) {
      await this.applyMultiPlayerEventEffect(
        gameId, allPlayersData, multiTargetIds, effect, worldState,
      );
    }

    await this.eventLogService.newLog(gameId, player, "player.explorationEvent", {
      cardId: card.cardId,
      effectType: effect?.type ?? "none",
    });
  }

  private applyEffectToPlayer(
    effect: ExplorationEventEffect | undefined,
    cp: Player,
    cws: WorldState,
    playerId: string,
    playerMutations: Record<string, unknown>,
    mutableDeck: ExplorationDeckSlot[],
    mutableDiscarded: ExplorationDeckSlot[],
    mutableSpellDeck: string[],
    mutableSkips: Record<string, number>,
    exploredCells: Array<{ x: number; y: number }>,
  ): void {
    if (!effect || effect.type === "none") return;

    if (effect.type === "alignment-branch") {
      const alignment = cp.alignment ?? "neutral";
      const sub = effect[alignment];
      if (sub) {
        this.applyEffectToPlayer(sub, cp, cws, playerId, playerMutations, mutableDeck, mutableDiscarded, mutableSpellDeck, mutableSkips, exploredCells);
      }
      return;
    }

    if (effect.type === "time-branch") {
      const time = cws.timeOfDay ?? "day";
      const sub = effect[time as "day" | "night"];
      if (sub) {
        this.applyEffectToPlayer(sub, cp, cws, playerId, playerMutations, mutableDeck, mutableDiscarded, mutableSpellDeck, mutableSkips, exploredCells);
      }
      return;
    }

    if (effect.type === "composite") {
      for (const sub of (effect.effects ?? [])) {
        if (sub.type === "spawn-nearest-biome-enemy") continue; // handled separately (async)
        if (sub.type === "region-persistent-effect") continue; // handled separately (needs mapSize)
        this.applyEffectToPlayer(sub, cp, cws, playerId, playerMutations, mutableDeck, mutableDiscarded, mutableSpellDeck, mutableSkips, exploredCells);
      }
      return;
    }

    if (effect.type === "spawn-nearest-biome-enemy" || effect.type === "region-persistent-effect") {
      return; // handled in applyEventEffect transaction body
    }

    if (effect.type === "lose-hp" || effect.type === "gain-hp") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      if (amount > 0) {
        const hpCurrent = Math.max(0, Math.floor(Number(cp.parameters?.hp?.current ?? 0)));
        const hpMax = Math.max(1, Math.floor(Number(cp.parameters?.hp?.max ?? cp.parameters?.hp?.base ?? 1)));
        const newHp = effect.type === "lose-hp" ? Math.max(0, hpCurrent - amount) : Math.min(hpMax, hpCurrent + amount);
        playerMutations["parameters.hp.current"] = newHp;
      }
      return;
    }

    if (effect.type === "hp-percent-damage") {
      const hpMax = Math.max(1, Math.floor(Number(cp.parameters?.hp?.max ?? cp.parameters?.hp?.base ?? 1)));
      const damage = Math.max(1, Math.floor(hpMax * Math.max(0, Number(effect.amount ?? 0)) / 100));
      const hpCurrent = Math.max(0, Math.floor(Number(cp.parameters?.hp?.current ?? 0)));
      playerMutations["parameters.hp.current"] = Math.max(0, hpCurrent - damage);
      return;
    }

    if (effect.type === "max-hp-percent-gain") {
      const base = Math.max(1, Math.floor(Number(cp.parameters?.hp?.base ?? 1)));
      const gain = Math.max(1, Math.floor(base * Math.max(0, Number(effect.amount ?? 0)) / 100));
      playerMutations["parameters.hp.base"] = base + gain;
      if (cp.parameters?.hp?.max !== undefined) {
        const currentMax = Math.max(1, Math.floor(Number(cp.parameters.hp.max)));
        playerMutations["parameters.hp.max"] = currentMax + gain;
      }
      return;
    }

    if (effect.type === "gain-gold" || effect.type === "lose-gold") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      if (amount > 0) {
        const currentMoney = Math.max(0, Math.floor(Number(cp.inventory?.money ?? 0)));
        playerMutations["inventory.money"] = effect.type === "gain-gold" ? currentMoney + amount : Math.max(0, currentMoney - amount);
      }
      return;
    }

    if (effect.type === "lose-all-gold") {
      playerMutations["inventory.money"] = 0;
      return;
    }

    if (effect.type === "lose-all-exp") {
      playerMutations["experience"] = 0;
      return;
    }

    if (effect.type === "skip-turn") {
      const current = Math.max(0, Math.floor(Number(mutableSkips[playerId] ?? 0)));
      mutableSkips[playerId] = current + Math.max(1, Math.floor(Number(effect.amount ?? 1)));
      return;
    }

    if (effect.type === "magic-permanent-delta") {
      const base = Math.floor(Number(cp.parameters?.magic?.base ?? 0));
      playerMutations["parameters.magic.base"] = base + Math.floor(Number(effect.amount ?? 0));
      return;
    }

    if (effect.type === "change-alignment") {
      if (effect.to) playerMutations["alignment"] = effect.to;
      return;
    }

    if (effect.type === "teleport-random-explored") {
      if (exploredCells.length > 0) {
        const target = exploredCells[Math.floor(Math.random() * exploredCells.length)];
        playerMutations["location.x"] = target.x;
        playerMutations["location.y"] = target.y;
      }
      return;
    }

    if (effect.type === "gain-spells") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      const newEntries: PlayerSpellEntry[] = [];
      for (let i = 0; i < amount; i++) {
        const spellId = mutableSpellDeck.shift();
        if (spellId) newEntries.push({ spellId, source: "memory" });
      }
      if (newEntries.length > 0) {
        const current = [...(cp.spellbook?.spells ?? [])];
        playerMutations["spellbook.spells"] = [...current, ...newEntries];
      }
      return;
    }

    if (effect.type === "gain-random-resources") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      const pool = (effect.pool ?? []) as ResourceLabel[];
      if (pool.length > 0 && amount > 0) {
        const resources: ResourceStack[] = [...(cp.inventory?.resources ?? [])];
        for (let i = 0; i < amount; i++) {
          const label = pool[Math.floor(Math.random() * pool.length)];
          const existing = resources.find(r => r.label === label);
          if (existing) { existing.quantity += 1; }
          else { resources.push({ label, quantity: 1 }); }
        }
        playerMutations["inventory.resources"] = resources;
      }
      return;
    }

    if (effect.type === "reshuffle-enemies-from-discard") {
      const enemies = mutableDiscarded.filter(s => s.type === "enemy");
      const remaining = mutableDiscarded.filter(s => s.type !== "enemy");
      const combined = [...mutableDeck, ...enemies];
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      mutableDeck.length = 0;
      mutableDeck.push(...combined);
      mutableDiscarded.length = 0;
      mutableDiscarded.push(...remaining);
      return;
    }
  }

  private async applyMultiPlayerEventEffect(
    gameId: string,
    allPlayers: Array<{ id: string; data: Player }>,
    targetIds: string[],
    effect: ExplorationEventEffect,
    worldState: WorldState,
  ): Promise<void> {
    const batch = writeBatch(this.firebaseService.database);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    const mutableSkips: Record<string, number> = { ...(worldState.skippedTurnsByPlayer ?? {}) };
    let skipsChanged = false;

    for (const targetId of targetIds) {
      const entry = allPlayers.find(p => p.id === targetId);
      if (!entry) continue;
      const p = entry.data;
      const playerRef = doc(this.firebaseService.database, "games", gameId, "players", targetId);
      const updates: Record<string, unknown> = {};

      if (effect.type === "region-effect" && effect.effect) {
        this.applySimpleEffectToUpdates(effect.effect, p, targetId, updates, mutableSkips);
        if (updates["__skipsChanged"]) { skipsChanged = true; delete updates["__skipsChanged"]; }
      }

      if (effect.type === "region-fortune-check" && effect.onFail) {
        const roll = Math.floor(Math.random() * 100) + 1;
        if (roll < (effect.failBelow ?? 51)) {
          this.applySimpleEffectToUpdates(effect.onFail, p, targetId, updates, mutableSkips);
          if (updates["__skipsChanged"]) { skipsChanged = true; delete updates["__skipsChanged"]; }
        }
      }

      if (effect.type === "region-apply-status") {
        const statusDef = this.statusCatalogService.getCachedStatus(effect.statusKey ?? "");
        if (statusDef) {
          const existing = (p.statuses ?? []).filter(s => s.key !== statusDef.key);
          const newStatus: PlayerStatus = {
            key: statusDef.key,
            label: statusDef.label,
            description: statusDef.description,
            durationTurns: Math.max(1, Math.floor(Number(effect.durationTurns ?? statusDef.defaultDurationTurns ?? 1))),
            ...(statusDef.effectKey ? { effectKey: statusDef.effectKey } : {}),
          };
          updates["statuses"] = [...existing, newStatus];
        }
      }

      if (effect.type === "region-forget-spells") {
        const kept = (p.spellbook?.spells ?? []).filter(s => s.source === "sanctuary");
        updates["spellbook.spells"] = kept;
      }

      if (effect.type === "global-amulet-hp-percent-damage") {
        const hpMax = Math.max(1, Math.floor(Number(p.parameters?.hp?.max ?? p.parameters?.hp?.base ?? 1)));
        const damage = Math.max(1, Math.floor(hpMax * Math.max(0, Number(effect.amount ?? 0)) / 100));
        const hpCurrent = Math.max(0, Math.floor(Number(p.parameters?.hp?.current ?? 0)));
        updates["parameters.hp.current"] = Math.max(0, hpCurrent - damage);
      }

      if (Object.keys(updates).length > 0) {
        batch.update(playerRef, updates);
      }
    }

    if (skipsChanged) {
      batch.update(worldStateRef, { skippedTurnsByPlayer: mutableSkips });
    }

    await batch.commit();
  }

  private applySimpleEffectToUpdates(
    effect: ExplorationEventEffect,
    p: Player,
    playerId: string,
    updates: Record<string, unknown>,
    mutableSkips: Record<string, number>,
  ): void {
    if (effect.type === "skip-turn") {
      const current = Math.max(0, Math.floor(Number(mutableSkips[playerId] ?? 0)));
      mutableSkips[playerId] = current + Math.max(1, Math.floor(Number(effect.amount ?? 1)));
      updates["__skipsChanged"] = true;
    } else if (effect.type === "hp-percent-damage") {
      const hpMax = Math.max(1, Math.floor(Number(p.parameters?.hp?.max ?? p.parameters?.hp?.base ?? 1)));
      const damage = Math.max(1, Math.floor(hpMax * Math.max(0, Number(effect.amount ?? 0)) / 100));
      const hpCurrent = Math.max(0, Math.floor(Number(p.parameters?.hp?.current ?? 0)));
      updates["parameters.hp.current"] = Math.max(0, hpCurrent - damage);
    } else if (effect.type === "lose-hp") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      const hpCurrent = Math.max(0, Math.floor(Number(p.parameters?.hp?.current ?? 0)));
      updates["parameters.hp.current"] = Math.max(0, hpCurrent - amount);
    } else if (effect.type === "gain-hp") {
      const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
      const hpMax = Math.max(1, Math.floor(Number(p.parameters?.hp?.max ?? p.parameters?.hp?.base ?? 1)));
      const hpCurrent = Math.max(0, Math.floor(Number(p.parameters?.hp?.current ?? 0)));
      updates["parameters.hp.current"] = Math.min(hpMax, hpCurrent + amount);
    }
  }

  private effectNeedsExploredCells(effect: ExplorationEventEffect | undefined): boolean {
    if (!effect) return false;
    if (effect.type === "teleport-random-explored") return true;
    if (effect.type === "alignment-branch") {
      return !!(
        this.effectNeedsExploredCells(effect.evil) ||
        this.effectNeedsExploredCells(effect.good) ||
        this.effectNeedsExploredCells(effect.neutral)
      );
    }
    if (effect.type === "time-branch") {
      return !!(this.effectNeedsExploredCells(effect.day) || this.effectNeedsExploredCells(effect.night));
    }
    if (effect.type === "composite") {
      return (effect.effects ?? []).some(sub => this.effectNeedsExploredCells(sub));
    }
    return false;
  }

  private effectIsMultiPlayer(effect: ExplorationEventEffect | undefined): boolean {
    if (!effect) return false;
    if (
      effect.type === "region-effect" ||
      effect.type === "region-fortune-check" ||
      effect.type === "region-apply-status" ||
      effect.type === "region-forget-spells" ||
      effect.type === "global-amulet-hp-percent-damage"
    ) return true;
    if (effect.type === "composite") {
      return (effect.effects ?? []).some(sub => this.effectIsMultiPlayer(sub));
    }
    if (effect.type === "time-branch") {
      return !!(this.effectIsMultiPlayer(effect.day) || this.effectIsMultiPlayer(effect.night));
    }
    if (effect.type === "alignment-branch") {
      return !!(this.effectIsMultiPlayer(effect.evil) || this.effectIsMultiPlayer(effect.good) || this.effectIsMultiPlayer(effect.neutral));
    }
    return false;
  }

  private extractSpawnSpec(effect: ExplorationEventEffect | undefined): { enemyId: string; biome: string } | null {
    if (!effect) return null;
    if (effect.type === "spawn-nearest-biome-enemy" && effect.enemyId && effect.biome) {
      return { enemyId: effect.enemyId, biome: effect.biome };
    }
    if (effect.type === "composite") {
      for (const sub of (effect.effects ?? [])) {
        const found = this.extractSpawnSpec(sub);
        if (found) return found;
      }
    }
    if (effect.type === "time-branch") {
      return this.extractSpawnSpec(effect.day) ?? this.extractSpawnSpec(effect.night) ?? null;
    }
    if (effect.type === "alignment-branch") {
      return this.extractSpawnSpec(effect.evil) ?? this.extractSpawnSpec(effect.good) ?? this.extractSpawnSpec(effect.neutral) ?? null;
    }
    return null;
  }

  private findNearestBiomeCell(cells: MapCell[], origin: { x: number; y: number }, biome: string): MapCell | null {
    let nearest: MapCell | null = null;
    let minDistSq = Infinity;
    for (const c of cells) {
      const effectiveBiome = c.worldEventBiomeOverride ?? c.biome;
      if (effectiveBiome !== biome || c.isSpecial === true) continue;
      if (c.x === origin.x && c.y === origin.y) continue;
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) { minDistSq = distSq; nearest = c; }
    }
    return nearest;
  }

  private playerHasAmulet(player: Player): boolean {
    return (player.inventory?.items ?? []).some(i => i.itemId === "B-IT-019");
  }

  public async applyHealerOffer(input: {
    gameId: string;
    player: Player;
    cell: MapCell;
    worldState: WorldState;
    instanceId: string;
    cardId: string;
    expansion: string;
    healAmount: number;
    cost: number;
  }): Promise<void> {
    const { gameId, player, cell, worldState, instanceId, cardId, expansion, healAmount, cost } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in applyHealerOffer");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
      const hpCurrent = Math.max(0, Math.floor(Number(currentPlayer.parameters?.hp?.current ?? 0)));
      const hpMax = Math.max(1, Math.floor(Number(
        currentPlayer.parameters?.hp?.max ?? currentPlayer.parameters?.hp?.base ?? 1,
      )));
      const newMoney = Math.max(0, currentMoney - cost);
      const newHp = Math.min(hpMax, hpCurrent + healAmount);

      transaction.set(playerRef, {
        inventory: { ...(currentPlayer.inventory ?? {}), money: newMoney },
        parameters: {
          ...(currentPlayer.parameters ?? {}),
          hp: { ...(currentPlayer.parameters?.hp ?? {}), current: newHp },
        },
      }, { merge: true });

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      const strangerName = this.explorationCatalogService.getStrangerDef(cardId)?.name ?? cardId;
      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId, name: strangerName },
        source: "map",
        ownerPlayerId: player.id,
        turn: currentWorldState.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      const healerSlot: ExplorationDeckSlot = { type: 'stranger', cardId, expansion };
      transaction.set(worldStateRef, {
        explorationDiscardedDeck: [...(currentWorldState.explorationDiscardedDeck ?? []), healerSlot],
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationStranger", {
      cardId, action: "healer-accepted", healAmount, cost,
    });
  }

  public async removeStrangerCard(
    gameId: string,
    player: Player,
    cell: MapCell,
    instanceId: string,
    worldState: WorldState,
    cardId: string,
    expansion: string,
  ): Promise<void> {
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [cellSnap, worldSnap] = await Promise.all([
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      const strangerName = this.explorationCatalogService.getStrangerDef(cardId)?.name ?? cardId;
      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId, name: strangerName },
        source: "map",
        ownerPlayerId: player.id,
        turn: currentWorldState.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      const strangerSlot: ExplorationDeckSlot = { type: 'stranger', cardId, expansion };
      transaction.set(worldStateRef, {
        explorationDiscardedDeck: [...(currentWorldState.explorationDiscardedDeck ?? []), strangerSlot],
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationStranger", { cardId });
  }

  public async strangerHermitMove(
    gameId: string,
    player: Player,
    cell: MapCell,
    instanceId: string,
    mapSize: number,
  ): Promise<void> {
    const allCellsSnap = await getDocs(collection(this.firebaseService.database, "games", gameId, "mapCells"));
    const allCells = allCellsSnap.docs.map((d) => d.data() as MapCell);

    const regionIICols = Math.ceil((mapSize * 2) / 3);
    const candidates = allCells.filter((c) =>
      c.biome &&
      typeof c.revealedAtTurn === "number" &&
      c.x <= regionIICols &&
      !(c.x === cell.x && c.y === cell.y),
    );
    if (candidates.length === 0) {
      await this.eventLogService.newLog(gameId, player, "player.strangerHermitMoved", {});
      return;
    }

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const targetCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${target.x}_${target.y}`);
    const sourceCellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [sourceSnap, targetSnap] = await Promise.all([
        transaction.get(sourceCellRef),
        transaction.get(targetCellRef),
      ]);
      const sourceCell = sourceSnap.exists() ? (sourceSnap.data() as MapCell) : cell;
      const targetCell = targetSnap.exists() ? (targetSnap.data() as MapCell) : target;

      const movedCard = (sourceCell.explorationEvents ?? []).find((e) => e.instanceId === instanceId);
      if (!movedCard || movedCard.type !== "stranger") return;

      const updatedSource = this.removeCardFromCell(sourceCell.explorationEvents ?? [], instanceId);
      const movedHermit = { ...movedCard, hermitMoved: true };
      const updatedTarget = [...(targetCell.explorationEvents ?? []), movedHermit];

      transaction.set(sourceCellRef, { explorationEvents: updatedSource }, { merge: true });
      transaction.set(targetCellRef, { explorationEvents: updatedTarget }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.strangerHermitMoved", {});
  }

  public async strangerHermitGiveItem(
    gameId: string,
    player: Player,
    cell: MapCell,
    instanceId: string,
    cardId: string,
    expansion: string,
  ): Promise<void> {
    const itemId = "B-IT-019";
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [cellSnap, playerSnap, worldSnap] = await Promise.all([
        transaction.get(cellRef),
        transaction.get(playerRef),
        transaction.get(worldStateRef),
      ]);
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentPlayer = playerSnap.exists() ? (playerSnap.data() as Player) : player;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : {} as WorldState;

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      const currentItems = currentPlayer.inventory?.items ?? [];
      transaction.set(playerRef, {
        inventory: { ...(currentPlayer.inventory ?? { items: [], resources: [], money: 0 }), items: [...currentItems, { itemId }] },
      }, { merge: true });

      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
      const strangerName = this.explorationCatalogService.getStrangerDef(cardId)?.name ?? cardId;
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId, name: strangerName },
        source: "map",
        ownerPlayerId: player.id,
        turn: currentWorldState.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      const strangerSlot: ExplorationDeckSlot = { type: "stranger", cardId, expansion };
      transaction.set(worldStateRef, {
        explorationDiscardedDeck: [...(currentWorldState.explorationDiscardedDeck ?? []), strangerSlot],
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.strangerHermitAmulet", {});
  }

  private getFollowersItemCapacityBonus(rawFollowers: unknown): number {
    if (!Array.isArray(rawFollowers)) return 0;
    return rawFollowers.reduce((total: number, entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return total;
      const typed = entry as { followerId?: unknown; state?: unknown; hpCurrent?: unknown };
      if (typeof typed.followerId !== "string" || !typed.followerId.trim()) return total;
      if (typed.state === "discarded") return total;
      if (Math.max(0, Math.floor(Number(typed.hpCurrent ?? 0))) <= 0) return total;
      const follower = this.followerCatalogService.getCachedFollowerById(typed.followerId.trim());
      if (!follower) return total;
      const bonus = Number(follower.itemCapacityBonus ?? 0);
      return total + (Number.isFinite(bonus) ? Math.max(0, Math.floor(bonus)) : 0);
    }, 0);
  }

  private getOccupiedItemSlots(items: InventoryItemEntry[]): number {
    return items.reduce((count, entry) => {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      return count + (item?.occupiesSpace ? 1 : 0);
    }, 0);
  }

  private prepareDiscardEntry(
    worldStateRef: ReturnType<typeof doc>,
    worldState: WorldState,
  ): { seq: number; discardRef: ReturnType<typeof doc> } {
    const seq = Math.max(0, Math.floor(Number(worldState.nextDiscardSeq ?? 0))) + 1;
    const discardRef = doc(collection(worldStateRef, "discardPile"));
    return { seq, discardRef };
  }

  private removeCardFromCell(events: PlacedExplorationCard[], instanceId: string): PlacedExplorationCard[] {
    return events.filter((e) => e.instanceId !== instanceId);
  }

  private removeEnemyFromCell(
    events: PlacedExplorationCard[],
    instanceId: string,
  ): PlacedExplorationCard[] {
    return this.removeCardFromCell(events, instanceId);
  }
}
