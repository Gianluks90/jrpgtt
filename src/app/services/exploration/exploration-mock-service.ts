import { Injectable } from "@angular/core";
import { doc, setDoc } from "firebase/firestore";
import { FirebaseService } from "@services/app/firebase-service";
import { PlacedEnemyCard } from "@models/exploration/ExplorationCard";
import { ExplorationEventService } from "@services/exploration/exploration-event-service";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { Player } from "@models/player/Player";

const MOCK_ENEMY: PlacedEnemyCard = {
  type: "enemy",
  cardId: "forest-goblin",
  instanceId: "mock-instance-dev",
  expansion: "base",
  order: 1,
  name: "Forest Goblin",
  level: 2,
  time: "both",
  element: "earth",
  combatStat: "strength",
  strength: 5,
  magic: 3,
  luck: 1,
  loot: ["exp", "gold", "resource:timber"],
};

/**
 * DEV ONLY — inject a mock combat encounter directly without moving the player.
 * Usage from browser console (after attaching to the DI tree):
 *
 *   window.__mockCombat()
 *
 * Or call injectMockCombat() directly from a component/service in dev builds.
 */
@Injectable({
  providedIn: "root",
})
export class ExplorationMockService {
  constructor(
    private firebaseService: FirebaseService,
    private explorationEventService: ExplorationEventService,
  ) {}

  /** Seeds mock explorationEvents onto a real Firestore cell, then triggers the flow. */
  public async injectMockCombat(input: {
    gameId: string;
    player: Player;
    cell: MapCell;
    worldState: WorldState;
    mapSize: number;
  }): Promise<void> {
    const cellWithEnemy: MapCell = { ...input.cell, explorationEvents: [MOCK_ENEMY] };
    const cellRef = doc(
      this.firebaseService.database,
      "games", input.gameId, "mapCells", `${input.cell.x}_${input.cell.y}`,
    );
    await setDoc(cellRef, { explorationEvents: [MOCK_ENEMY] }, { merge: true });

    await this.explorationEventService.handleCellArrival({
      gameId: input.gameId,
      player: input.player,
      cell: cellWithEnemy,
      worldState: input.worldState,
      mapSize: input.mapSize,
    });
  }

  /** Triggers the combat overlay with in-memory mock data only (no Firestore write). */
  public async triggerMockCombatInMemory(input: {
    gameId: string;
    player: Player;
    cell: MapCell;
    worldState: WorldState;
    mapSize: number;
  }): Promise<void> {
    const cellWithEnemy: MapCell = { ...input.cell, explorationEvents: [MOCK_ENEMY] };
    await this.explorationEventService.handleCellArrival({
      gameId: input.gameId,
      player: input.player,
      cell: cellWithEnemy,
      worldState: input.worldState,
      mapSize: input.mapSize,
    });
  }
}
