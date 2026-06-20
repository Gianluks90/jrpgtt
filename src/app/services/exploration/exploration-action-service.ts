import { Injectable } from "@angular/core";
import { Timestamp, collection, deleteField, doc, getDocs, getDoc, runTransaction, setDoc, writeBatch } from "firebase/firestore";
import { FirebaseService } from "@services/app/firebase-service";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { PlacedEnemyCard, PlacedExplorationCard, PlacedItemCard, PlacedAmuletCard, PlacedFollowerCard, PlacedEventCard } from "@models/exploration/ExplorationCard";
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { EventLogService } from "@services/gameplay/event-log-service";
import { PlayerProgressionService } from "@services/player/player-progression-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { ExplorationEventEffect, ExplorationDeckSlot } from "@models/catalog/ExplorationCardCatalog";
import { PlayerFollowerEntry } from "@models/player/Follower";
import { InventoryItemEntry } from "@models/player/Inventory";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";

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

      transaction.update(playerRef, { "parameters.hp.current": Math.min(newHp, hpMax) });

      if (isVictory) {
        const updatedEvents = this.removeEnemyFromCell(currentCell.explorationEvents ?? [], enemy.instanceId);
        transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

        const goldGained = Math.max(0, Math.floor(Number(result.goldGained ?? 0)));
        if (goldGained > 0) {
          const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
          transaction.update(playerRef, { "inventory.money": currentMoney + goldGained });
        }

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
      const newEntry: InventoryItemEntry = item?.maxCharges
        ? { itemId, currentCharges: item.maxCharges }
        : { itemId };

      transaction.set(playerRef, {
        inventory: {
          ...(currentPlayer.inventory ?? { items: [], resources: [], money: 0 }),
          items: [...currentItems, newEntry],
        },
      }, { merge: true });

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
      const currentFollowers: PlayerFollowerEntry[] = Array.isArray(currentPlayer.followers)
        ? (currentPlayer.followers as PlayerFollowerEntry[]).filter((f) => typeof (f as { followerId?: unknown }).followerId === "string")
        : [];
      const newFollower: PlayerFollowerEntry = { followerId: card.followerId, hpCurrent: maxHp, state: "active" };

      transaction.set(playerRef, { followers: [...currentFollowers, newFollower] }, { merge: true });

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], card.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationPickupFollower", { followerId: card.followerId });
  }

  public async applyEventEffect(input: ApplyEventInput): Promise<void> {
    const { gameId, player, cell, worldState, card, effect } = input;
    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap, worldSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
        transaction.get(worldStateRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in applyEventEffect");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;
      const currentWorldState = worldSnap.exists() ? (worldSnap.data() as WorldState) : worldState;

      if (effect && (effect.type === "lose-hp" || effect.type === "gain-hp")) {
        const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
        if (amount > 0) {
          const hpCurrent = Math.max(0, Math.floor(Number(currentPlayer.parameters?.hp?.current ?? 0)));
          const hpMax = Math.max(1, Math.floor(Number(
            currentPlayer.parameters?.hp?.max ?? currentPlayer.parameters?.hp?.base ?? 1,
          )));
          const newHp = effect.type === "lose-hp"
            ? Math.max(0, hpCurrent - amount)
            : Math.min(hpMax, hpCurrent + amount);
          transaction.update(playerRef, { "parameters.hp.current": newHp });
        }
      }

      if (effect?.type === "gain-gold" || effect?.type === "lose-gold") {
        const amount = Math.max(0, Math.floor(Number(effect.amount ?? 0)));
        if (amount > 0) {
          const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
          const newMoney = effect.type === "gain-gold"
            ? currentMoney + amount
            : Math.max(0, currentMoney - amount);
          transaction.set(playerRef, { inventory: { ...(currentPlayer.inventory ?? {}), money: newMoney } }, { merge: true });
        }
      }

      const updatedEvents = this.removeCardFromCell(currentCell.explorationEvents ?? [], card.instanceId);
      transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

      const eventName = this.explorationCatalogService.getEventDef(card.cardId)?.name ?? card.cardId;
      const { seq, discardRef } = this.prepareDiscardEntry(worldStateRef, currentWorldState);
      transaction.set(discardRef, {
        id: discardRef.id,
        card: { kind: "exploration", cardId: card.cardId, name: eventName },
        source: "map",
        ownerPlayerId: player.id,
        turn: currentWorldState.currentTurn ?? 0,
        discardedAt: Timestamp.now(),
        discardSeq: seq,
      } as DiscardPileEntry);

      const eventSlot: ExplorationDeckSlot = { type: 'event', cardId: card.cardId, expansion: card.expansion };
      transaction.set(worldStateRef, {
        explorationDiscardedDeck: [...(currentWorldState.explorationDiscardedDeck ?? []), eventSlot],
        nextDiscardSeq: seq,
      }, { merge: true });
    });

    await this.eventLogService.newLog(gameId, player, "player.explorationEvent", {
      cardId: card.cardId,
      effectType: effect?.type ?? "none",
    });
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
