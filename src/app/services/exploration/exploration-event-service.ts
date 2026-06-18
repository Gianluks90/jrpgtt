import { Injectable, signal } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { PlacedEnemyCard, PlacedExplorationCard } from "@models/exploration/ExplorationCard";
import { CombatState } from "@models/exploration/CombatState";
import { CombatResolverService } from "@services/gameplay/combat-resolver-service";
import { ExplorationActionService, CommitCombatResultInput } from "@services/exploration/exploration-action-service";
import { PlayerStatsModifierService } from "@services/player/player-stats-modifier-service";
import { WorldZonesService } from "@services/map/world-zones-service";
import { RegionLabel } from "@models/world/WorldZone";

export interface HandleCellArrivalInput {
  gameId: string;
  player: Player;
  cell: MapCell;
  worldState: WorldState;
  mapSize: number;
}

@Injectable({
  providedIn: "root",
})
export class ExplorationEventService {
  public readonly pendingCombat = signal<CombatState | null>(null);
  public readonly explorationFlowActive = signal(false);

  private combatActionResolver: ((action: "fight" | "flee") => void) | null = null;
  private combatResultDismissResolver: (() => void) | null = null;

  constructor(
    private combatResolverService: CombatResolverService,
    private explorationActionService: ExplorationActionService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private worldZonesService: WorldZonesService,
  ) {}

  /**
   * Entry point: resolves all exploration events on the cell in priority order.
   * Called by MapPageInteractionService after a player arrives at a cell with events.
   */
  public async handleCellArrival(input: HandleCellArrivalInput): Promise<void> {
    const events = this.getSortedEvents(input.cell);
    if (!events.length) return;

    this.explorationFlowActive.set(true);
    try {
      await this.resolveEventsInOrder(input, events);
    } finally {
      this.explorationFlowActive.set(false);
    }
  }

  /** Called by the combat dialog when the player chooses an action. */
  public submitCombatAction(action: "fight" | "flee"): void {
    this.combatActionResolver?.(action);
    this.combatActionResolver = null;
  }

  /** Called by the combat dialog when the player dismisses the result screen. */
  public dismissCombatResult(): void {
    this.combatResultDismissResolver?.();
    this.combatResultDismissResolver = null;
  }

  private async resolveEventsInOrder(
    input: HandleCellArrivalInput,
    events: PlacedExplorationCard[],
  ): Promise<void> {
    for (const event of events) {
      if (event.type === "enemy") {
        const continueChain = await this.resolveCombatEvent(input, event);
        if (!continueChain) return;
      }
      // Other card types (place, event, stranger, follower, item, amulet): future handlers
    }
  }

  /**
   * Runs a single combat encounter:
   * 1. Opens combat in Firestore (visible to all players)
   * 2. Waits for the local player to choose fight or flee
   * 3. Resolves the result with pure logic
   * 4. Shows the result and waits for dismissal
   * 5. Commits the result to Firestore
   * 6. Closes combat
   *
   * Returns false if the player can no longer continue (was defeated or fled).
   */
  private async resolveCombatEvent(
    input: HandleCellArrivalInput,
    enemy: PlacedEnemyCard,
  ): Promise<boolean> {
    const { gameId, player, cell, worldState, mapSize } = input;

    const combatState: CombatState = {
      combatId: this.generateCombatId(),
      attackingPlayerId: player.id,
      cellId: `${cell.x}_${cell.y}`,
      enemy,
      phase: "setup",
      startedAtMs: Date.now(),
    };

    await this.explorationActionService.openCombat(gameId, combatState);
    this.pendingCombat.set(combatState);

    const action = await this.waitForCombatAction();

    const quadrantId = this.worldZonesService.getQuadrantIdByCoordinate(cell.x, cell.y, mapSize);
    const quadrantElement = worldState.sanctuaryInfluenceByQuadrant?.[quadrantId] ?? undefined;
    const timeOfDay = worldState.timeOfDay ?? "day";

    const stats = this.playerStatsModifierService.computeStats({
      player,
      currentCell: cell,
      worldState,
      mapSize,
    });

    let result;
    if (action === "fight") {
      const playerCombatStat = enemy.combatStat === "strength"
        ? stats.effective.strength
        : stats.effective.magic;

      result = this.combatResolverService.resolveFight({
        playerCombatStat,
        playerLuck: stats.effective.luck,
        playerElement: player.attunedElement,
        quadrantElement,
        enemy,
        timeOfDay,
      });
    } else {
      result = this.combatResolverService.resolveFlee({
        playerLuck: stats.effective.luck,
        enemy,
      });
    }

    if (result.outcome === "player-win") {
      const loot = enemy.loot ?? [];

      let xpGained = 0;
      if (loot.includes("exp")) {
        const region = this.worldZonesService.getRegionLabelByColumn(cell.x, mapSize);
        xpGained = this.xpByRegion(region);
      }

      const goldGained = loot.includes("gold") ? 2 * cell.x : 0;

      result = {
        ...result,
        ...(xpGained > 0 ? { xpGained } : {}),
        ...(goldGained > 0 ? { goldGained } : {}),
      };
    }

    const resolvedCombat: CombatState = { ...combatState, phase: "result", result };
    this.pendingCombat.set(resolvedCombat);
    await this.waitForResultDismissal();

    const commitInput: CommitCombatResultInput = {
      gameId, player, cell, enemy, result, worldState, mapSize,
    };
    await this.explorationActionService.commitCombatResult(commitInput);
    await this.explorationActionService.closeCombat(gameId);
    this.pendingCombat.set(null);

    const playerDefeated = result.outcome === "player-loss" && result.damage > 0;
    const playerFled = result.outcome === "flee" || result.outcome === "flee-lucky";
    return !playerDefeated && !playerFled;
  }

  private waitForCombatAction(): Promise<"fight" | "flee"> {
    return new Promise((resolve) => {
      this.combatActionResolver = resolve;
    });
  }

  private waitForResultDismissal(): Promise<void> {
    return new Promise((resolve) => {
      this.combatResultDismissResolver = resolve;
    });
  }

  private getSortedEvents(cell: MapCell): PlacedExplorationCard[] {
    return [...(cell.explorationEvents ?? [])].sort((a, b) => a.order - b.order);
  }

  private generateCombatId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `combat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private xpByRegion(region: RegionLabel): number {
    if (region === "II") return 2;
    if (region === "III") return 3;
    return 1;
  }
}
