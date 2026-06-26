import { Injectable, signal } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { EnemyLoot, PlacedExplorationCard, PlacedEnemyCard } from "@models/exploration/ExplorationCard";
import { ActionExecutorService } from "@services/gameplay/action-executor-service";
import { MapCellSelectionService } from "@services/map/map-cell-selection-service";
import { FirebaseService } from "@services/app/firebase-service";
import { MerchantStockConfigService } from "@services/catalog/merchant-stock-config-service";
import { collection, getDocs } from "firebase/firestore";
import { PlaceCardDef } from "@models/catalog/ExplorationCardCatalog";

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
import { ItemEffectCatalogService } from "@services/catalog/item-effect-catalog-service";
import { CombatStatBonusVsEnemyCategoryEffectDefinition, ReduceCombatDamageOnFortuneCheckEffectDefinition } from "@models/catalog/ItemEffectCatalog";
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

export type StrangerWishChoice = "coins" | "xp" | "stat" | "teleport";

export interface PlaceResultState {
  resultType: string;
  params: Record<string, unknown>;
}

export interface PlaceMarketItem {
  tradableId: string;
  name: string;
  price: number;
  stockLeft: number;
  stockKey: string;
}

export interface PlaceMarketState {
  items: PlaceMarketItem[];
  playerMoney: number;
  cell: { x: number; y: number };
}

export interface StrangerOfferState {
  dialogType: import("@models/catalog/ExplorationCardCatalog").StrangerDialogType;
  params: Record<string, unknown>;
  playerMoney: number;
  playerHp: number;
  playerMaxHp: number;
  playerAlignment?: string;
  exploredCells?: { x: number; y: number; cellId: string }[];
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
  public readonly pendingPlaceResult = signal<PlaceResultState | null>(null);
  public readonly pendingMarketState = signal<PlaceMarketState | null>(null);

  private combatActionResolver: ((action: "fight" | "flee" | "exorcise-spirit") => void) | null = null;
  private combatResultDismissResolver: (() => void) | null = null;
  private equipmentSelectionResolver: ((bonus: number) => void) | null = null;
  private currentSpellBonus = 0;
  private cardActionResolver: (() => void) | null = null;
  private explorationSessionCloseResolver: (() => void) | null = null;
  private strangerOfferResolver: ((accepted: boolean) => void) | null = null;
  private strangerWishChoiceResolver: ((choice: StrangerWishChoice) => void) | null = null;
  private strangerSpellTeacherResolver: ((accepted: boolean) => void) | null = null;
  private placeResultResolver: (() => void) | null = null;
  private marketCloseResolver: (() => void) | null = null;
  private currentSessionInput: HandleCellArrivalInput | null = null;

  public get sessionGameId(): string | null { return this.currentSessionInput?.gameId ?? null; }

  constructor(
    private combatResolverService: CombatResolverService,
    private explorationActionService: ExplorationActionService,
    private playerStatsModifierService: PlayerStatsModifierService,
    private worldZonesService: WorldZonesService,
    private itemCatalogService: ItemCatalogService,
    private itemEffectCatalogService: ItemEffectCatalogService,
    private explorationCatalogService: ExplorationCatalogService,
    private actionExecutorService: ActionExecutorService,
    private cellSelectionService: MapCellSelectionService,
    private firebaseService: FirebaseService,
    private merchantStockConfigService: MerchantStockConfigService,
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
  public submitCombatAction(action: "fight" | "flee" | "exorcise-spirit"): void {
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

  public submitStrangerWishChoice(choice: StrangerWishChoice): void {
    this.strangerWishChoiceResolver?.(choice);
    this.strangerWishChoiceResolver = null;
    this.pendingStrangerOffer.set(null);
  }

  public submitStrangerSpellTeacher(accepted: boolean): void {
    this.strangerSpellTeacherResolver?.(accepted);
    this.strangerSpellTeacherResolver = null;
    this.pendingStrangerOffer.set(null);
  }

  public submitPlaceResult(): void {
    this.placeResultResolver?.();
    this.placeResultResolver = null;
    this.pendingPlaceResult.set(null);
  }

  public async placeMarketBuy(tradableId: string): Promise<void> {
    const input = this.currentSessionInput;
    const market = this.pendingMarketState();
    if (!input || !market) return;

    const item = market.items.find((i) => i.tradableId === tradableId);
    if (!item || item.stockLeft <= 0 || market.playerMoney < item.price) return;

    await this.actionExecutorService.placeMarketBuy(
      input.gameId,
      input.player,
      market.cell,
      tradableId,
      item.price,
      item.stockKey,
    );

    this.pendingMarketState.update((s) => s ? {
      ...s,
      playerMoney: s.playerMoney - item.price,
      items: s.items.map((i) => i.tradableId === tradableId ? { ...i, stockLeft: i.stockLeft - 1 } : i),
    } : null);
  }

  public submitMarketClose(): void {
    this.marketCloseResolver?.();
    this.marketCloseResolver = null;
    this.pendingMarketState.set(null);
  }

  public notifyMercenaryHired(): void {
    const current = this.pendingCombat();
    if (current) this.pendingCombat.set({ ...current, mercenaryHired: true });
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
            activeCombat.enemy,
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
        const mercenaryBonus = (this.pendingCombat()?.mercenaryHired && activeCombat.enemy.combatStat === "strength") ? 2 : 0;
        const totalBonusH = equipmentBonus + this.currentSpellBonus + mercenaryBonus;
        this.currentSpellBonus = 0;
        this.pendingSpellOptions.set(null);

        // Holy Symbol (B-IT-009): exorcise spirit enemy — skip combat, gain exp
        if (action === "exorcise-spirit") {
          const exorcisePlayer = context.getPlayer();
          const exorciseCell = context.getCell(activeCombat.cellId);
          const exorciseWorldState = context.getWorldState();
          if (exorcisePlayer && exorciseCell && exorciseWorldState) {
            const region = this.worldZonesService.getRegionLabelByColumn(exorciseCell.x, context.mapSize);
            const xpGained = this.xpByRegion(region);
            await this.explorationActionService.exorciseSpiritEnemy({
              gameId,
              player: exorcisePlayer,
              cell: exorciseCell,
              enemy: activeCombat.enemy,
              worldState: exorciseWorldState,
              xpGained,
            });
          }
          await this.explorationActionService.closeCombat(gameId);
          this.pendingCombat.set(null);
          return;
        }

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
            hasCrestOfCourage: (playerForEquipment?.inventory?.items ?? []).some(e => e.itemId === "B-IT-012"),
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
        const continueSession = await this.resolvePlaceCard(input, event);
        this.markCardResolved(event.instanceId);
        if (!continueSession) return;
      } else if (event.type === "stranger") {
        const continueSession = await this.resolveStrangerCard(input, event);
        this.markCardResolved(event.instanceId);
        if (!continueSession) return;
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

    const eligible = this.computeEligibleEquipment(player, enemy.combatStat, timeOfDay, enemy);
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
    const mercenaryBonus = (this.pendingCombat()?.mercenaryHired && enemy.combatStat === "strength") ? 2 : 0;
    const totalBonus = equipmentBonus + this.currentSpellBonus + mercenaryBonus;
    this.currentSpellBonus = 0;
    this.pendingSpellOptions.set(null);

    const hasCrestOfCourage = (player.inventory?.items ?? []).some(e => e.itemId === "B-IT-012");

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
        hasCrestOfCourage,
      });

      // Armor: fortune checks reduce damage on strength-combat loss
      if (result.outcome === "player-loss" && result.damage > 0) {
        const armorReduction = this.computeArmorDamageReduction(player, enemy.combatStat);
        if (armorReduction > 0) {
          result = { ...result, damage: Math.max(0, result.damage - armorReduction) };
        }
      }
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

  /** Returns false if the exploration session should end immediately (e.g. teleport wish). */
  private async resolveStrangerCard(
    input: HandleCellArrivalInput,
    event: PlacedExplorationCard & { type: "stranger" },
  ): Promise<boolean> {
    const strangerDef = this.explorationCatalogService.getStrangerDef(event.cardId);
    const { gameId, player, cell, worldState } = input;
    const actor = { id: player.id, name: player.name };

    // ── Legacy healer (kept for B-ST-001 compatibility) ──────────────────────
    if (strangerDef?.dialogType === "healer") {
      const healAmount = Math.max(0, Math.floor(Number(strangerDef.dialogParams?.["healAmount"] ?? 0)));
      const cost = Math.max(0, Math.floor(Number(strangerDef.dialogParams?.["cost"] ?? 0)));
      this.pendingStrangerOffer.set({
        dialogType: "healer",
        params: strangerDef.dialogParams ?? {},
        playerMoney: Math.floor(Number(player.inventory?.money ?? 0)),
        playerHp: Math.floor(Number(player.parameters?.hp?.current ?? 0)),
        playerMaxHp: Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)),
      });
      const accepted = await this.waitForStrangerOffer();
      this.pendingStrangerOffer.set(null);
      if (accepted) {
        try {
          await this.explorationActionService.applyHealerOffer({ gameId, player, cell, worldState, instanceId: event.instanceId, cardId: event.cardId, expansion: event.expansion, healAmount, cost });
        } catch (e) { console.error("applyHealerOffer failed", e); }
      } else if (!event.persistent) {
        try { await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion); } catch (e) { console.error("removeStrangerCard failed", e); }
      }
      return true;
    }

    // ── Guaritrice: auto-heal 5% HP ──────────────────────────────────────────
    if (strangerDef?.dialogType === "healer-percent") {
      const healPercent = Math.max(1, Math.floor(Number(strangerDef.dialogParams?.["healPercent"] ?? 5)));
      try {
        await this.actionExecutorService.strangerHealPercent(gameId, actor, healPercent);
      } catch (e) { console.error("strangerHealPercent failed", e); }
      return true;
    }

    // ── Strega: free enchantress ──────────────────────────────────────────────
    if (strangerDef?.dialogType === "enchantress") {
      this.pendingStrangerOffer.set({
        dialogType: "enchantress",
        params: {},
        playerMoney: Math.floor(Number(player.inventory?.money ?? 0)),
        playerHp: Math.floor(Number(player.parameters?.hp?.current ?? 0)),
        playerMaxHp: Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)),
      });
      const accepted = await this.waitForStrangerOffer();
      this.pendingStrangerOffer.set(null);
      if (accepted) {
        try {
          await this.actionExecutorService.strangerEnchantress(gameId, actor);
          await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
        } catch (e) { console.error("strangerEnchantress failed", e); }
      }
      return true;
    }

    // ── Wish strangers (Fantasma/Incantatore/Fata) ────────────────────────────
    if (strangerDef?.dialogType === "wish") {
      const requiredAlignment = strangerDef.dialogParams?.["alignment"] as string | undefined;
      const playerAlignment = player.alignment ?? "neutral";
      if (requiredAlignment && playerAlignment !== requiredAlignment) {
        return true; // wrong alignment — card stays, session continues
      }

      this.pendingStrangerOffer.set({
        dialogType: "wish",
        params: strangerDef.dialogParams ?? {},
        playerMoney: Math.floor(Number(player.inventory?.money ?? 0)),
        playerHp: Math.floor(Number(player.parameters?.hp?.current ?? 0)),
        playerMaxHp: Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)),
        playerAlignment,
      });

      const choice = await this.waitForWishChoice();
      this.pendingStrangerOffer.set(null);

      const amount = Math.max(1, Math.floor(Number(strangerDef.dialogParams?.["amount"] ?? 3)));
      const stat = (strangerDef.dialogParams?.["wishStat"] as "strength" | "magic" | "mp") ?? "strength";

      try {
        if (choice === "coins") {
          await this.actionExecutorService.strangerWishCoins(gameId, actor, amount);
          await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
        } else if (choice === "xp") {
          await this.actionExecutorService.strangerWishXp(gameId, actor, amount);
          await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
        } else if (choice === "stat") {
          await this.actionExecutorService.strangerWishStatPermanent(gameId, actor, stat);
          await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
        } else if (choice === "teleport") {
          // Close overlay so the map is visible for cell selection
          this.pendingExplorationSession.set(null);

          const explored = await this.loadExploredCellIds(gameId);
          const selected = await this.cellSelectionService.openCellSelection(
            explored,
            "Scegli una cella già esplorata per teletrasportarti",
            false,
          );
          if (selected) {
            await this.actionExecutorService.strangerWishTeleport(gameId, actor, selected.x, selected.y);
            await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
          }
          return false; // end exploration session (remaining cards ignored)
        }
      } catch (e) { console.error("strangerWish failed", e); }
      return true;
    }

    // ── Eremita ───────────────────────────────────────────────────────────────
    if (strangerDef?.dialogType === "hermit") {
      try {
        if (event.hermitMoved) {
          await this.explorationActionService.strangerHermitGiveItem(gameId, player, cell, event.instanceId, event.cardId, event.expansion);
        } else {
          await this.explorationActionService.strangerHermitMove(gameId, player, cell, event.instanceId, input.mapSize);
        }
      } catch (e) { console.error("hermit action failed", e); }
      return true;
    }

    // ── Illusionista / Stregone ───────────────────────────────────────────────
    if (strangerDef?.dialogType === "spell-teacher") {
      const requiredAlignment = strangerDef.dialogParams?.["alignment"] as string | undefined;
      const playerAlignment = player.alignment ?? "neutral";
      if (requiredAlignment && playerAlignment !== requiredAlignment) {
        return true; // wrong alignment — card stays
      }

      const cost = Math.max(0, Math.floor(Number(strangerDef.dialogParams?.["cost"] ?? 0)));
      const playerMoney = Math.floor(Number(player.inventory?.money ?? 0));

      this.pendingStrangerOffer.set({
        dialogType: "spell-teacher",
        params: { cost, sourceName: strangerDef.name ?? event.cardId },
        playerMoney,
        playerHp: Math.floor(Number(player.parameters?.hp?.current ?? 0)),
        playerMaxHp: Math.floor(Number(player.parameters?.hp?.max ?? player.parameters?.hp?.base ?? 1)),
      });

      const accepted = await this.waitForSpellTeacherOffer();
      this.pendingStrangerOffer.set(null);

      if (accepted) {
        try {
          await this.actionExecutorService.strangerSpellTeacher(gameId, actor, cost, strangerDef.name ?? event.cardId);
        } catch (e) { console.error("strangerSpellTeacher failed", e); }
      }
      return true;
    }

    // ── Generic / unknown — just remove if not persistent ────────────────────
    if (!event.persistent) {
      try {
        await this.explorationActionService.removeStrangerCard(gameId, player, cell, event.instanceId, worldState, event.cardId, event.expansion);
      } catch (e) { console.error("removeStrangerCard failed", e); }
    }
    return true;
  }

  private waitForWishChoice(): Promise<StrangerWishChoice> {
    return new Promise((resolve) => {
      this.strangerWishChoiceResolver = resolve;
    });
  }

  private waitForSpellTeacherOffer(): Promise<boolean> {
    return new Promise((resolve) => {
      this.strangerSpellTeacherResolver = resolve;
    });
  }

  private async loadExploredCellIds(gameId: string): Promise<Set<string>> {
    const snap = await getDocs(collection(this.firebaseService.database, "games", gameId, "mapCells"));
    const ids = new Set<string>();
    snap.docs.forEach((d) => {
      const c = d.data() as MapCell;
      if (c.biome && typeof c.revealedAtTurn === "number") ids.add(`${c.x}_${c.y}`);
    });
    return ids;
  }

  private waitForStrangerOffer(): Promise<boolean> {
    return new Promise((resolve) => {
      this.strangerOfferResolver = resolve;
    });
  }

  private waitForCombatAction(): Promise<"fight" | "flee" | "exorcise-spirit"> {
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
    enemy?: PlacedEnemyCard,
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

      let bonus = matchingModifiers.reduce((sum, mod) => sum + mod.amount, 0);

      // Category-based bonus (e.g. Holy Lance +3 vs Dragon)
      if (enemy) {
        for (const effectId of item.effects ?? []) {
          const effect = this.itemEffectCatalogService.getCachedEffect(effectId);
          if (effect?.type !== "combat-stat-bonus-vs-enemy-category") continue;
          const typed = effect as CombatStatBonusVsEnemyCategoryEffectDefinition;
          if (typed.combatStat !== combatStat) continue;
          if ((enemy.categories ?? []).includes(typed.categoryFilter)) {
            bonus += typed.bonus;
          }
        }
      }

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

  private computeArmorDamageReduction(player: Player, combatStat: "strength" | "magic"): number {
    if (combatStat !== "strength") return 0;
    let reduction = 0;
    for (const entry of player.inventory?.items ?? []) {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      for (const effectId of item?.effects ?? []) {
        const effect = this.itemEffectCatalogService.getCachedEffect(effectId);
        if (effect?.type !== "reduce-combat-damage-on-fortune-check") continue;
        const typed = effect as ReduceCombatDamageOnFortuneCheckEffectDefinition;
        if (typed.combatStatFilter && typed.combatStatFilter !== combatStat) continue;
        const roll = Math.floor(Math.random() * 100) + 1;
        if (roll >= typed.luckThreshold) reduction += typed.reduction;
      }
    }
    return reduction;
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

  private async resolvePlaceCard(
    input: HandleCellArrivalInput,
    event: PlacedExplorationCard & { type: "place" },
  ): Promise<boolean> {
    const def = this.explorationCatalogService.getCardDef(event.cardId) as PlaceCardDef | null;
    const dialogType = def?.dialogType ?? "swamp";

    if (dialogType === "swamp") {
      // Passive — no interaction. Turn service handles poison.
      return true;
    }

    if (dialogType === "fountain") {
      const params = def?.dialogParams ?? {};
      const stat = String(params["stat"] ?? "magic") as "magic" | "strength" | "hp";
      const statAmount = Number(params["statAmount"] ?? 1);
      const initialUses = Number(params["initialUses"] ?? 3);
      const luckThreshold = Number(params["luckThreshold"] ?? 70);
      const placeName = def?.name ?? "Fonte";

      const outcome = await this.actionExecutorService.placeFountainDrink(
        input.gameId, input.player,
        { x: input.cell.x, y: input.cell.y },
        event.instanceId,
        { stat, statAmount, initialUses, luckThreshold },
        placeName,
      );

      const resultType = outcome.result === "damage" ? "fountain-damage" : stat === "hp" ? "fountain-hp-boost" : "fountain-stat-boost";
      this.pendingPlaceResult.set({ resultType, params: { ...outcome, stat, placeName } });
      await this.waitForPlaceResult();
      return true;
    }

    if (dialogType === "market") {
      const stockConfigUrl = String(def?.dialogParams?.["stockConfigUrl"] ?? "");
      if (!stockConfigUrl) return true;

      const stockConfig = await this.merchantStockConfigService.loadConfig(stockConfigUrl);
      const cellStock = (input.cell as unknown as Record<string, unknown>)["merchantStockByItemId"] as Record<string, number> | undefined ?? {};

      const items: PlaceMarketItem[] = stockConfig.stock
        .filter((e) => e.kind === "item")
        .map((e) => {
          const stockKey = `item:${e.tradableId}`;
          const stockLeft = typeof cellStock[stockKey] === "number"
            ? cellStock[stockKey]
            : e.stock;
          const itemDef = this.itemCatalogService.getCachedItemById(e.tradableId);
          return {
            tradableId: e.tradableId,
            name: itemDef ? this.itemCatalogService.getLocalizedName(itemDef) : e.tradableId,
            price: e.purchaseValue ?? 0,
            stockLeft,
            stockKey,
          };
        });

      this.pendingMarketState.set({
        items,
        playerMoney: Math.max(0, Math.floor(Number(input.player.inventory?.money ?? 0))),
        cell: { x: input.cell.x, y: input.cell.y },
      });
      await this.waitForMarketClose();
      return true;
    }

    if (dialogType === "portal") {
      const result = await this.actionExecutorService.placePortalTeleport(input.gameId, input.player);
      if (result) {
        this.pendingPlaceResult.set({ resultType: "portal-teleport", params: { destination: result.destinationName } });
        await this.waitForPlaceResult();
        this.pendingExplorationSession.set(null);
        return false;
      }
      this.pendingPlaceResult.set({ resultType: "portal-no-destination", params: {} });
      await this.waitForPlaceResult();
      return true;
    }

    if (dialogType === "maze") {
      const mazeResult = await this.actionExecutorService.placeMazeLuck(input.gameId, input.player);
      this.pendingPlaceResult.set({ resultType: `maze-${mazeResult}`, params: {} });
      await this.waitForPlaceResult();
      return true;
    }

    if (dialogType === "cave") {
      const caveResult = await this.actionExecutorService.placeCaveLuck(input.gameId, input.player);
      this.pendingPlaceResult.set({ resultType: `cave-${caveResult}`, params: {} });
      await this.waitForPlaceResult();
      return true;
    }

    if (dialogType === "chapel") {
      const chapelResult = await this.actionExecutorService.placeChapelLuck(input.gameId, input.player);
      this.pendingPlaceResult.set({ resultType: `chapel-${chapelResult}`, params: {} });
      await this.waitForPlaceResult();
      return true;
    }

    return true;
  }

  private waitForPlaceResult(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.placeResultResolver = resolve;
    });
  }

  private waitForMarketClose(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.marketCloseResolver = resolve;
    });
  }
}
