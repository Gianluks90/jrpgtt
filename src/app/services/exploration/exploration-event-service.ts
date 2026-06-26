import { Injectable, signal } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { EnemyLoot, PlacedEnemyCard, PlacedExplorationCard } from "@models/exploration/ExplorationCard";

export interface ExplorationPhaseSession {
  cards: PlacedExplorationCard[];
  resolvedInstanceIds: string[];
}
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { CombatResolverService } from "@services/gameplay/combat-resolver-service";
import { ExplorationActionService, CommitCombatResultInput } from "@services/exploration/exploration-action-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
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

export interface CombatSpellOption {
  itemId: string;
  name: string;
  nameKey: string;
  description: string;
  descriptionKey?: string;
  bonus: number;
  parameter: "strength" | "magic";
}

export interface StrangerOfferState {
  dialogType: import("@models/catalog/ExplorationCardCatalog").StrangerDialogType;
  params: Record<string, unknown>;
  playerMoney: number;
  playerHp: number;
  playerMaxHp: number;
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
  public readonly pendingSpellOptions = signal<CombatSpellOption[] | null>(null);
  public readonly explorationFlowActive = signal(false);
  public readonly pendingExplorationSession = signal<ExplorationPhaseSession | null>(null);
  public readonly pendingStrangerOffer = signal<StrangerOfferState | null>(null);

  private combatActionResolver: ((action: "fight" | "flee") => void) | null = null;
  private combatResultDismissResolver: (() => void) | null = null;
  private equipmentSelectionResolver: ((bonus: number) => void) | null = null;
  private currentSpellBonus = 0;
  private cardActionResolver: (() => void) | null = null;
  private explorationSessionCloseResolver: (() => void) | null = null;
  private strangerOfferResolver: ((accepted: boolean) => void) | null = null;
  private currentSessionInput: HandleCellArrivalInput | null = null;

  public get sessionGameId(): string | null { return this.currentSessionInput?.gameId ?? null; }

  constructor(
    private combatResolverService: CombatResolverService,
    private explorationActionService: ExplorationActionService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private worldZonesService: WorldZonesService,
    private itemCatalogService: ItemCatalogService,
    private explorationCatalogService: ExplorationCatalogService,
  ) {}

  /**
   * Entry point: resolves all exploration events on the cell in priority order.
   * Called by MapPageInteractionService after a player arrives at a cell with events.
   */
  public async handleCellArrival(input: HandleCellArrivalInput): Promise<void> {
    const events = this.getSortedEvents(input.cell);
    if (!events.length) return;

    await this.explorationCatalogService.loadConfig();
    this.explorationFlowActive.set(true);
    this.currentSessionInput = input;

    const cellId = `${input.cell.x}_${input.cell.y}`;
    await this.explorationActionService.openExplorationSession(input.gameId, input.player.id, cellId);

    this.pendingExplorationSession.set({ cards: events, resolvedInstanceIds: [] });

    try {
      await this.resolveEventsInOrder(input, events);
    } finally {
      this.pendingExplorationSession.set(null);
      this.currentSessionInput = null;
      await this.explorationActionService.closeExplorationSession(input.gameId);
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

  /** Called by the combat dialog when the player casts a spell during idle phase. */
  public submitSpellBonus(bonus: number): void {
    this.currentSpellBonus = bonus;
  }

  /** Called by the combat dialog when the player dismisses the result screen. */
  public dismissCombatResult(): void {
    this.combatResultDismissResolver?.();
    this.combatResultDismissResolver = null;
  }

  /** Called by the exploration phase overlay when the player triggers a card CTA. */
  public submitCardAction(): void {
    this.cardActionResolver?.();
    this.cardActionResolver = null;
  }

  /** Called by the exploration phase overlay when the player closes the session. */
  public submitExplorationClose(): void {
    this.explorationSessionCloseResolver?.();
    this.explorationSessionCloseResolver = null;
  }

  /** Called by the exploration phase overlay when the player accepts/declines a stranger offer. */
  public submitStrangerOffer(accepted: boolean): void {
    this.strangerOfferResolver?.(accepted);
    this.strangerOfferResolver = null;
  }

  /**
   * Restores exploration session after a page refresh.
   * Called from the map page when worldState.activeExplorationSession is found for the current player.
   */
  public hydrateFromActiveExplorationSession(
    gameId: string,
    session: import("@models/world/WorldState").ExplorationSessionState,
    context: CombatHydrationContext,
  ): void {
    if (this.pendingExplorationSession() !== null || this.explorationFlowActive()) return;

    const player = context.getPlayer();
    if (!player || player.id !== session.playerId) return;

    const cellId = session.cellId;
    const [xStr, yStr] = cellId.split("_");
    const cell = context.getCell(cellId);
    const worldState = context.getWorldState();

    if (!cell || !worldState) return;

    this.explorationFlowActive.set(true);

    void (async () => {
      await this.explorationCatalogService.loadConfig();

      const allEvents = this.getSortedEvents(cell);
      if (!allEvents.length) {
        await this.explorationActionService.closeExplorationSession(gameId);
        this.explorationFlowActive.set(false);
        return;
      }

      const resolved = new Set(session.resolvedInstanceIds ?? []);
      const remaining = allEvents.filter((e) => !resolved.has(e.instanceId));

      if (!remaining.length) {
        await this.explorationActionService.closeExplorationSession(gameId);
        this.explorationFlowActive.set(false);
        return;
      }

      this.pendingExplorationSession.set({ cards: allEvents, resolvedInstanceIds: [...resolved] });

      const input: HandleCellArrivalInput = {
        gameId,
        player,
        cell,
        worldState,
        mapSize: context.mapSize,
      };
      this.currentSessionInput = input;

      try {
        await this.resolveEventsInOrder(input, remaining);
      } finally {
        this.pendingExplorationSession.set(null);
        this.currentSessionInput = null;
        await this.explorationActionService.closeExplorationSession(gameId);
        this.explorationFlowActive.set(false);
      }
    })();
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

        if (playerForEquipment) {
          const eligibleSpellsH = this.computeEligibleSpells(
            playerForEquipment,
            activeCombat.enemy.combatStat,
            activeCombat.timeOfDay ?? "day",
          );
          if (eligibleSpellsH.length > 0) {
            this.pendingSpellOptions.set(eligibleSpellsH);
          }
        }
        this.currentSpellBonus = 0;

        const action = await this.waitForCombatAction();
        const totalBonusH = equipmentBonus + this.currentSpellBonus;
        this.currentSpellBonus = 0;
        this.pendingSpellOptions.set(null);

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
            playerEquipmentBonus: totalBonusH,
          });

          if (result.outcome === "player-win") {
            const cell = context.getCell(activeCombat.cellId);
            if (cell) {
              const wonLoot = this.rollLoot(activeCombat.enemy.loot ?? [], snapshot.luck);
              let xpGained = 0;
              if (wonLoot.includes("exp")) {
                const region = this.worldZonesService.getRegionLabelByColumn(cell.x, context.mapSize);
                xpGained = this.xpByRegion(region);
              }
              const goldGained = wonLoot.includes("gold") ? 2 * cell.x : 0;
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
      // Wait for the player to click the CTA for this card in the dialog
      await this.waitForCardAction();

      if (event.type === "enemy") {
        const continueChain = await this.resolveCombatEvent(input, event);
        this.markCardResolved(event.instanceId);
        if (!continueChain) {
          // Fled or defeated — session ends immediately, remaining cards stay on cell
          return;
        }
      } else if (event.type === "item" || event.type === "amulet") {
        await this.resolveItemCard(input, event);
        this.markCardResolved(event.instanceId);
      } else if (event.type === "follower") {
        await this.resolveFollowerCard(input, event);
        this.markCardResolved(event.instanceId);
      } else if (event.type === "event") {
        await this.resolveEventCard(input, event);
        this.markCardResolved(event.instanceId);
      } else if (event.type === "place") {
        // Place stays on the cell — nothing to commit, card is persistent
        this.markCardResolved(event.instanceId);
      } else if (event.type === "stranger") {
        await this.resolveStrangerCard(input, event);
        this.markCardResolved(event.instanceId);
      }
    }

    // All cards processed — wait for the player to explicitly close the session
    await this.waitForExplorationSessionClose();
  }

  private async resolveItemCard(
    input: HandleCellArrivalInput,
    card: PlacedExplorationCard & { type: "item" | "amulet" },
  ): Promise<void> {
    await this.explorationActionService.pickupItemCard({
      gameId: input.gameId,
      player: input.player,
      cell: input.cell,
      card: card as Parameters<typeof this.explorationActionService.pickupItemCard>[0]["card"],
    });
  }

  private async resolveFollowerCard(
    input: HandleCellArrivalInput,
    card: PlacedExplorationCard & { type: "follower" },
  ): Promise<void> {
    await this.explorationActionService.pickupFollowerCard({
      gameId: input.gameId,
      player: input.player,
      cell: input.cell,
      card: card as Parameters<typeof this.explorationActionService.pickupFollowerCard>[0]["card"],
    });
  }

  private async resolveEventCard(
    input: HandleCellArrivalInput,
    card: PlacedExplorationCard & { type: "event" },
  ): Promise<void> {
    const def = this.explorationCatalogService.getEventDef(card.cardId);
    await this.explorationActionService.applyEventEffect({
      gameId: input.gameId,
      player: input.player,
      cell: input.cell,
      worldState: input.worldState,
      card: card as Parameters<typeof this.explorationActionService.applyEventEffect>[0]["card"],
      effect: def?.effect,
      mapSize: input.mapSize,
    });
  }

  private markCardResolved(instanceId: string): void {
    const session = this.pendingExplorationSession();
    if (!session) return;
    this.pendingExplorationSession.set({
      ...session,
      resolvedInstanceIds: [...session.resolvedInstanceIds, instanceId],
    });
  }

  private waitForCardAction(): Promise<void> {
    return new Promise((resolve) => {
      this.cardActionResolver = resolve;
    });
  }

  private waitForExplorationSessionClose(): Promise<void> {
    return new Promise((resolve) => {
      this.explorationSessionCloseResolver = resolve;
    });
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

    const eligibleSpells = this.computeEligibleSpells(player, enemy.combatStat, timeOfDay);
    if (eligibleSpells.length > 0) {
      this.pendingSpellOptions.set(eligibleSpells);
    }
    this.currentSpellBonus = 0;

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
    const totalBonus = equipmentBonus + this.currentSpellBonus;
    this.currentSpellBonus = 0;
    this.pendingSpellOptions.set(null);

    let result;
    if (action === "fight") {
      result = this.combatResolverService.resolveFight({
        playerCombatStat: playerCombatStatValue,
        playerLuck: stats.effective.luck,
        playerElement: player.attunedElement,
        quadrantElement,
        enemy,
        timeOfDay,
        playerEquipmentBonus: totalBonus,
      });
    } else {
      result = this.combatResolverService.resolveFlee({
        playerLuck: stats.effective.luck,
        enemy,
      });
    }

    if (result.outcome === "player-win") {
      const wonLoot = this.rollLoot(enemy.loot ?? [], stats.effective.luck);

      let xpGained = 0;
      if (wonLoot.includes("exp")) {
        const region = this.worldZonesService.getRegionLabelByColumn(cell.x, mapSize);
        xpGained = this.xpByRegion(region);
      }

      const goldGained = wonLoot.includes("gold") ? 2 * cell.x : 0;

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

  private async resolveStrangerCard(
    input: HandleCellArrivalInput,
    event: PlacedExplorationCard & { type: "stranger" },
  ): Promise<void> {
    const strangerDef = this.explorationCatalogService.getStrangerDef(event.cardId);

    if (strangerDef?.dialogType === "healer") {
      const healAmount = Math.max(0, Math.floor(Number(strangerDef.dialogParams?.["healAmount"] ?? 0)));
      const cost = Math.max(0, Math.floor(Number(strangerDef.dialogParams?.["cost"] ?? 0)));
      const p = input.player;
      this.pendingStrangerOffer.set({
        dialogType: "healer",
        params: strangerDef.dialogParams ?? {},
        playerMoney: Math.floor(Number(p.inventory?.money ?? 0)),
        playerHp: Math.floor(Number(p.parameters?.hp?.current ?? 0)),
        playerMaxHp: Math.floor(Number(p.parameters?.hp?.max ?? p.parameters?.hp?.base ?? 1)),
      });

      const accepted = await this.waitForStrangerOffer();
      this.pendingStrangerOffer.set(null);

      if (accepted) {
        try {
          await this.explorationActionService.applyHealerOffer({
            gameId: input.gameId,
            player: input.player,
            cell: input.cell,
            worldState: input.worldState,
            instanceId: event.instanceId,
            cardId: event.cardId,
            expansion: event.expansion,
            healAmount,
            cost,
          });
        } catch (e) {
          console.error("applyHealerOffer failed, continuing session", e);
        }
      } else if (!event.persistent) {
        try {
          await this.explorationActionService.removeStrangerCard(
            input.gameId, input.player, input.cell, event.instanceId,
            input.worldState, event.cardId, event.expansion,
          );
        } catch (e) {
          console.error("removeStrangerCard (healer decline) failed, continuing session", e);
        }
      }
      return;
    }

    // Generic stranger — no interactive dialog, just remove
    if (!event.persistent) {
      try {
        await this.explorationActionService.removeStrangerCard(
          input.gameId, input.player, input.cell, event.instanceId,
          input.worldState, event.cardId, event.expansion,
        );
      } catch (e) {
        console.error("removeStrangerCard failed, continuing session", e);
      }
    }
  }

  private waitForStrangerOffer(): Promise<boolean> {
    return new Promise((resolve) => {
      this.strangerOfferResolver = resolve;
    });
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

  private computeEligibleSpells(
    player: Player,
    combatStat: "strength" | "magic",
    timeOfDay: TimeOfDay,
  ): CombatSpellOption[] {
    const fightScope = combatStat === "strength" ? "fight-only" : "magic-fight-only";
    const spells: CombatSpellOption[] = [];

    for (const entry of player.inventory?.items ?? []) {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      if (!item || item.category !== "magic") continue;

      const matchingModifiers = (item.parameterModifiers ?? []).filter((mod) => {
        if (!mod.scopes.includes(fightScope)) return false;
        if (mod.scopes.includes("day-only") && timeOfDay !== "day") return false;
        if (mod.scopes.includes("night-only") && timeOfDay !== "night") return false;
        return true;
      });

      if (matchingModifiers.length === 0) continue;

      const bonus = matchingModifiers.reduce((sum, mod) => sum + mod.amount, 0);
      spells.push({
        itemId: item.id,
        name: item.name,
        nameKey: item.nameKey ?? "",
        description: item.description,
        ...(item.descriptionKey ? { descriptionKey: item.descriptionKey } : {}),
        bonus,
        parameter: combatStat,
      });
    }

    return spells;
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

  private rollLoot(tokens: EnemyLoot, luck: number): string[] {
    const luckBonus = luck * 0.03;
    const won: string[] = [];
    for (const token of tokens) {
      const { type, dropRate } = typeof token === "string"
        ? { type: token, dropRate: 1.0 }
        : token;
      if (Math.random() < Math.min(dropRate + luckBonus, 0.97)) {
        won.push(type);
      }
    }
    return won;
  }

  private xpByRegion(region: RegionLabel): number {
    if (region === "II") return 2;
    if (region === "III") return 3;
    return 1;
  }
}
