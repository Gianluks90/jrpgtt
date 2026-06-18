import { Injectable } from "@angular/core";
import { deleteField, doc, runTransaction, setDoc } from "firebase/firestore";
import { FirebaseService } from "@services/app/firebase-service";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { PlacedEnemyCard, PlacedExplorationCard } from "@models/exploration/ExplorationCard";
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { EventLogService } from "@services/gameplay/event-log-service";
import { PlayerProgressionService } from "@services/player/player-progression-service";

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
  ) {}

  public async openCombat(gameId: string, combatState: CombatState): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, { activeCombat: combatState }, { merge: true });
  }

  public async closeCombat(gameId: string): Promise<void> {
    const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
    await setDoc(worldStateRef, { activeCombat: deleteField() }, { merge: true });
  }

  public async commitCombatResult(input: CommitCombatResultInput): Promise<void> {
    const { gameId, player, cell, enemy, result } = input;
    const isVictory = result.outcome === "player-win";
    const isFlee = result.outcome === "flee" || result.outcome === "flee-lucky";
    const isTie = !isVictory && !isFlee && result.damage === 0;

    const playerRef = doc(this.firebaseService.database, "games", gameId, "players", player.id);
    const cellRef = doc(this.firebaseService.database, "games", gameId, "mapCells", `${cell.x}_${cell.y}`);

    await runTransaction(this.firebaseService.database, async (transaction) => {
      const [playerSnap, cellSnap] = await Promise.all([
        transaction.get(playerRef),
        transaction.get(cellRef),
      ]);

      if (!playerSnap.exists()) throw new Error("Player not found in commitCombatResult");

      const currentPlayer = playerSnap.data() as Player;
      const currentCell = cellSnap.exists() ? (cellSnap.data() as MapCell) : cell;

      const hpCurrent = Math.max(0, Math.floor(Number(currentPlayer.parameters?.hp?.current ?? 0)));
      const hpMax = Math.max(1, Math.floor(Number(
        currentPlayer.parameters?.hp?.max ?? currentPlayer.parameters?.hp?.base ?? 1,
      )));
      const damage = Math.max(0, Math.floor(Number(result.damage)));
      const newHp = isTie ? hpCurrent : Math.max(0, hpCurrent - (isVictory ? 0 : damage));

      transaction.set(playerRef, { "parameters.hp.current": Math.min(newHp, hpMax) }, { merge: true });

      if (isVictory) {
        const updatedEvents = this.removeEnemyFromCell(currentCell.explorationEvents ?? [], enemy.instanceId);
        transaction.set(cellRef, { explorationEvents: updatedEvents }, { merge: true });

        const goldGained = Math.max(0, Math.floor(Number(result.goldGained ?? 0)));
        if (goldGained > 0) {
          const currentMoney = Math.max(0, Math.floor(Number(currentPlayer.inventory?.money ?? 0)));
          transaction.set(playerRef, { "inventory.money": currentMoney + goldGained }, { merge: true });
        }
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
      await this.playerProgressionService.assignExperience(gameId, player.id, result.xpGained!);
    }
  }

  private removeEnemyFromCell(
    events: PlacedExplorationCard[],
    instanceId: string,
  ): PlacedExplorationCard[] {
    return events.filter((e) => !(e.type === "enemy" && e.instanceId === instanceId));
  }
}
