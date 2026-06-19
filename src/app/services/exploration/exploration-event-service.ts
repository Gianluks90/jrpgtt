import { Injectable, signal } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { PlacedEnemyCard, PlacedExplorationCard } from "@models/exploration/ExplorationCard";
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { CombatResolverService } from "@services/gameplay/combat-resolver-service";
import { ExplorationActionService, CommitCombatResultInput } from "@services/exploration/exploration-action-service";
import { PlayerStatsModifierService } from "@services/player/player-stats-modifier-service";
import { WorldZonesService } from "@services/map/world-zones-service";
import { RegionLabel } from "@models/world/WorldZone";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { TimeOfDay } from "@models/world/WorldState";

export interface CombatEquipmentOption {
  itemId: string;
  name: string;
  nameKey: string;
  bonus: number;
  parameter: "strength" | "magic";
}

export interface PendingCombatEquipment {
  weapons: CombatEquipmentOption[];
  armors: CombatEquipmentOption[];
}

export interface CombatHydrationContext {
  getPlayer: () => Player | null;
  getCell: (cellId: string) => MapCell | null;
  getWorldState: () => WorldState | null;
  mapSize: number;
}

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
  public readonly pendingEquipmentOptions = signal<PendingCombatEquipment | null>(null);
  public readonly explorationFlowActive = signal(false);

  private combatActionResolver: ((action: "fight" | "flee") => void) | null = null;
  private combatResultDismissResolver: (() => void) | null = null;
  private equipmentSelectionResolver: ((bonus: number) => void) | null = null;

  constructor(
    private combatResolverService: CombatResolverService,
    private explorationActionService: ExplorationActionService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private worldZonesService: WorldZonesService,
    private itemCatalogService: ItemCatalogService,
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

  /** Called by the combat dialog when the player confirms equipment selection. */
  public submitEquipmentSelection(bonus: number): void {
    this.equipmentSelectionResolver?.(bonus);
    this.equipmentSelectionResolver = null;
  }

  /** Called by the combat dialog when the player dismisses the result screen. */
  public dismissCombatResult(): void {
    this.combatResultDismissResolver?.();
    this.combatResultDismissResolver = null;
  }

  /**
   * Restores combat state after a page refresh.
   * Called from the map page when worldState.activeCombat is found for the current player.
   */
  public hydrateFromActiveCombat(
    gameId: string,
    activeCombat: CombatState,
    context: CombatHydrationContext,
  ): void {
    if (this.pendingCombat() !== null) return;

    this.pendingCombat.set(activeCombat);
    this.explorationFlowActive.set(true);

    if (activeCombat.phase === "result" && activeCombat.result) {
      void this.waitForResultDismissal().then(async () => {
        await this.explorationActionService.closeCombat(gameId);
        this.pendingCombat.set(null);
        this.explorationFlowActive.set(false);
      });
      return;
    }

    if (activeCombat.phase === "setup" && activeCombat.playerSnapshot) {
      void (async () => {
        const playerForEquipment = context.getPlayer();
        let equipmentBonus = 0;
        if (playerForEquipment) {
          const eligible = this.computeEligibleEquipment(
            playerForEquipment,
            activeCombat.enemy.combatStat,
            activeCombat.timeOfDay ?? "day",
          );
          if (eligible.weapons.length > 0 || eligible.armors.length > 0) {
            this.pendingEquipmentOptions.set(eligible);
            equipmentBonus = await this.waitForEquipmentSelection();
            this.pendingEquipmentOptions.set(null);
          }
        }

        const action = await this.waitForCombatAction();
        const snapshot = activeCombat.playerSnapshot!;
        let result: CombatResult;

        if (action === "fight") {
          result = this.combatResolverService.resolveFight({
            playerCombatStat: snapshot.statValue,
            playerLuck: snapshot.luck,
            playerElement: snapshot.element,
            quadrantElement: activeCombat.quadrantElement,
            enemy: activeCombat.enemy,
            timeOfDay: activeCombat.timeOfDay ?? "day",
            playerEquipmentBonus: equipmentBonus,
          });

          if (result.outcome === "player-win") {
            const cell = context.getCell(activeCombat.cellId);
            if (cell) {
              const loot = activeCombat.enemy.loot ?? [];
              let xpGained = 0;
              if (loot.includes("exp")) {
                const region = this.worldZonesService.getRegionLabelByColumn(cell.x, context.mapSize);
                xpGained = this.xpByRegion(region);
              }
              const goldGained = loot.includes("gold") ? 2 * cell.x : 0;
              result = {
                ...result,
                ...(xpGained > 0 ? { xpGained } : {}),
                ...(goldGained > 0 ? { goldGained } : {}),
              };
            }
          }
        } else {
          result = this.combatResolverService.resolveFlee({
            playerLuck: snapshot.luck,
            enemy: activeCombat.enemy,
          });
        }

        const resolvedCombat: CombatState = { ...activeCombat, phase: "result", result };
        this.pendingCombat.set(resolvedCombat);

        await this.waitForResultDismissal();

        const player = context.getPlayer();
        const cell = context.getCell(activeCombat.cellId);
        const worldState = context.getWorldState();

        if (player && cell && worldState) {
          const commitInput: CommitCombatResultInput = {
            gameId,
            player,
            cell,
            enemy: activeCombat.enemy,
            result,
            worldState,
            mapSize: context.mapSize,
          };
          await this.explorationActionService.commitCombatResult(commitInput);
        }

        await this.explorationActionService.closeCombat(gameId);
        this.pendingCombat.set(null);
        this.explorationFlowActive.set(false);
      })();
    }
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

    const quadrantId = this.worldZonesService.getQuadrantIdByCoordinate(cell.x, cell.y, mapSize);
    const quadrantElement = worldState.sanctuaryInfluenceByQuadrant?.[quadrantId] ?? undefined;
    const timeOfDay = worldState.timeOfDay ?? "day";

    const stats = this.playerStatsModifierService.computeStats({
      player, currentCell: cell, worldState, mapSize,
    });
    const playerCombatStatValue = enemy.combatStat === "strength"
      ? stats.effective.strength
      : stats.effective.magic;

    const eligible = this.computeEligibleEquipment(player, enemy.combatStat, timeOfDay);
    const hasEquipment = eligible.weapons.length > 0 || eligible.armors.length > 0;
    if (hasEquipment) {
      this.pendingEquipmentOptions.set(eligible);
    }

    const combatState: CombatState = {
      combatId: this.generateCombatId(),
      attackingPlayerId: player.id,
      cellId: `${cell.x}_${cell.y}`,
      enemy,
      phase: "setup",
      startedAtMs: Date.now(),
      timeOfDay,
      ...(quadrantElement ? { quadrantElement } : {}),
      playerSnapshot: {
        name: player.name,
        level: player.level,
        strength: stats.effective.strength,
        magic: stats.effective.magic,
        combatStat: enemy.combatStat,
        statValue: playerCombatStatValue,
        luck: stats.effective.luck,
        ...(player.attunedElement ? { element: player.attunedElement } : {}),
        hp: player.parameters.hp.current,
        maxHp: player.parameters.hp.max ?? player.parameters.hp.base,
        mp: player.parameters.mp.current,
        maxMp: player.parameters.mp.max ?? player.parameters.mp.base,
      },
    };

    await this.explorationActionService.openCombat(gameId, combatState);
    this.pendingCombat.set(combatState);

    let equipmentBonus = 0;
    if (hasEquipment) {
      equipmentBonus = await this.waitForEquipmentSelection();
      this.pendingEquipmentOptions.set(null);
    }

    const action = await this.waitForCombatAction();

    let result;
    if (action === "fight") {
      result = this.combatResolverService.resolveFight({
        playerCombatStat: playerCombatStatValue,
        playerLuck: stats.effective.luck,
        playerElement: player.attunedElement,
        quadrantElement,
        enemy,
        timeOfDay,
        playerEquipmentBonus: equipmentBonus,
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

  private waitForEquipmentSelection(): Promise<number> {
    return new Promise((resolve) => {
      this.equipmentSelectionResolver = resolve;
    });
  }

  private waitForResultDismissal(): Promise<void> {
    return new Promise((resolve) => {
      this.combatResultDismissResolver = resolve;
    });
  }

  private computeEligibleEquipment(
    player: Player,
    combatStat: "strength" | "magic",
    timeOfDay: TimeOfDay,
  ): PendingCombatEquipment {
    const fightScope = combatStat === "strength" ? "fight-only" : "magic-fight-only";
    const weapons: CombatEquipmentOption[] = [];
    const armors: CombatEquipmentOption[] = [];

    for (const entry of player.inventory?.items ?? []) {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      if (!item) continue;
      if (item.category !== "weapon" && item.category !== "armor") continue;

      const matchingModifiers = (item.parameterModifiers ?? []).filter((mod) => {
        if (!mod.scopes.includes(fightScope)) return false;
        if (mod.parameter !== combatStat) return false;
        if (mod.scopes.includes("day-only") && timeOfDay !== "day") return false;
        if (mod.scopes.includes("night-only") && timeOfDay !== "night") return false;
        return true;
      });

      if (matchingModifiers.length === 0) continue;

      const bonus = matchingModifiers.reduce((sum, mod) => sum + mod.amount, 0);
      const option: CombatEquipmentOption = {
        itemId: item.id,
        name: item.name,
        nameKey: item.nameKey ?? "",
        bonus,
        parameter: combatStat,
      };

      if (item.category === "weapon") weapons.push(option);
      else armors.push(option);
    }

    return { weapons, armors };
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
