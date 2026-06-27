import { Component, computed, inject } from "@angular/core";
import { ExplorationEventService, PlaceMarketItem, PlaceResultState, StrangerWishChoice } from "@services/exploration/exploration-event-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { ExplorationActionService } from "@services/exploration/exploration-action-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { MapPageStateService } from "@services/map/map-page-state-service";
import { TranslationService } from "@services/shared/translation-service";
import { PlacedExplorationCard } from "@models/exploration/ExplorationCard";
import { ExplorationCardDef } from "@models/catalog/ExplorationCardCatalog";
import { TextButton } from "../text-button/text-button";
import { ItemCard, ItemCardLabel, ItemCardUses, ItemCardValue } from "../item-card/item-card";

const CARD_TYPE_LABELS: Record<PlacedExplorationCard["type"], string> = {
  enemy:    "Nemico",
  event:    "Evento",
  place:    "Luogo",
  stranger: "Straniero",
  follower: "Seguace",
  item:     "Oggetto",
  amulet:   "Amuleto",
};

const CARD_TYPE_CTA: Record<PlacedExplorationCard["type"], string> = {
  enemy:    "Affronta",
  event:    "Leggi",
  place:    "Visita",
  stranger: "Parla",
  follower: "Arruola",
  item:     "Raccogli",
  amulet:   "Prendi",
};

interface ItemCardData {
  name: string;
  description: string;
  labels: ItemCardLabel[];
  uses: ItemCardUses | null;
  value: ItemCardValue | null;
}

interface SessionCardEntry {
  placed: PlacedExplorationCard;
  def: ExplorationCardDef | null;
  name: string;
  description: string;
  typeLabel: string;
  cta: string;
  itemCard: ItemCardData | null;
}

@Component({
  selector: "app-exploration-phase-overlay",
  imports: [TextButton, ItemCard],
  templateUrl: "./exploration-phase-overlay.html",
  styleUrl: "./exploration-phase-overlay.scss",
})
export class ExplorationPhaseOverlay {
  private readonly explorationEventService = inject(ExplorationEventService);
  private readonly explorationCatalogService = inject(ExplorationCatalogService);
  private readonly explorationActionService = inject(ExplorationActionService);
  private readonly followerCatalogService = inject(FollowerCatalogService);
  private readonly itemCatalogService = inject(ItemCatalogService);
  private readonly mapPageState = inject(MapPageStateService);
  private readonly translationService = inject(TranslationService);

  private readonly session = computed(() => this.explorationEventService.pendingExplorationSession());
  private readonly combatActive = computed(() => !!this.explorationEventService.pendingCombat());

  public readonly visible = computed(() => !!this.session() && !this.combatActive());

  private readonly myPlayer = computed(() => {
    const uid = this.mapPageState.currentUserId();
    return this.mapPageState.players().find((p) => p.id === uid) ?? null;
  });

  public readonly vitals = computed(() => {
    const p = this.myPlayer();
    if (!p) return null;
    return {
      hp: p.parameters?.hp?.current ?? 0,
      hpMax: p.parameters?.hp?.max ?? p.parameters?.hp?.base ?? 0,
      mp: p.parameters?.mp?.current ?? 0,
      mpMax: p.parameters?.mp?.max ?? p.parameters?.mp?.base ?? 0,
      money: p.inventory?.money ?? 0,
    };
  });

  public readonly cardEntries = computed<SessionCardEntry[]>(() => {
    const session = this.session();
    if (!session) return [];
    return [...session.cards]
      .sort((a, b) => a.order - b.order)
      .map((placed) => {
        const def = this.explorationCatalogService.getCardDef(placed.cardId);
        return {
          placed,
          def,
          name: this.resolveName(placed, def),
          description: this.resolveDescription(placed, def),
          typeLabel: CARD_TYPE_LABELS[placed.type] ?? placed.type,
          cta: this.resolveCta(placed),
          itemCard: this.resolveItemCard(placed),
        };
      });
  });

  public readonly resolvedIds = computed(() => new Set(this.session()?.resolvedInstanceIds ?? []));

  public readonly nextActiveInstanceId = computed<string | null>(() => {
    const resolved = this.resolvedIds();
    const entry = this.cardEntries().find((e) => !resolved.has(e.placed.instanceId));
    return entry?.placed.instanceId ?? null;
  });

  public readonly activeEntry = computed<SessionCardEntry | null>(() => {
    const activeId = this.nextActiveInstanceId();
    if (!activeId) return null;
    return this.cardEntries().find((e) => e.placed.instanceId === activeId) ?? null;
  });

  public readonly allResolved = computed(() => {
    const session = this.session();
    if (!session || session.cards.length === 0) return false;
    return session.cards.every((c) => this.resolvedIds().has(c.instanceId));
  });

  public readonly pendingStrangerOffer = computed(() => this.explorationEventService.pendingStrangerOffer());
  public readonly pendingPlaceResult = computed(() => this.explorationEventService.pendingPlaceResult());
  public readonly pendingMarketState = computed(() => this.explorationEventService.pendingMarketState());

  public readonly followerCombatSkipEntry = computed<{ followerId: string; followerName: string } | null>(() => {
    const player = this.myPlayer();
    const worldState = this.mapPageState.worldState();
    const activeEntry = this.activeEntry();
    if (!player || !worldState || activeEntry?.placed.type !== "enemy") return null;

    const sessionCellId = worldState.activeExplorationSession?.cellId;
    if (!sessionCellId) return null;
    const cell = this.mapPageState.mapCellsById()[sessionCellId];
    const biome = cell?.biome;
    if (!biome) return null;

    const worldTurn = worldState.currentTurn ?? 0;
    const actionsUsed = player.actionsUsedThisTurn ?? {};

    for (const entry of player.followers ?? []) {
      if (!entry || entry.state === "discarded") continue;
      const def = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      if (!def?.combatSkipBiomes?.includes(biome)) continue;
      const actionKey = `follower-combat-skip-${entry.followerId}`;
      if (actionsUsed[actionKey] === worldTurn) continue;
      return { followerId: entry.followerId, followerName: def.name };
    }
    return null;
  });

  public readonly canUseCrystalBall = computed(() => {
    const player = this.myPlayer();
    if (!player) return false;
    const hasCrystalBall = (player.inventory?.items ?? []).some(e => e.itemId === "B-IT-013");
    if (!hasCrystalBall) return false;
    const worldTurn = this.mapPageState.worldState()?.currentTurn ?? 0;
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    return actionsUsed["crystal-ball-skip"] !== worldTurn;
  });

  public isHermit(placed: PlacedExplorationCard): boolean {
    return placed.type === "stranger" && placed.cardId === "B-ST-007";
  }

  public isResolved(instanceId: string): boolean {
    return this.resolvedIds().has(instanceId);
  }

  public isActive(instanceId: string): boolean {
    return this.nextActiveInstanceId() === instanceId;
  }

  public onCardAction(_entry: SessionCardEntry): void {
    this.explorationEventService.submitCardAction();
  }

  public onStrangerOffer(accepted: boolean): void {
    this.explorationEventService.submitStrangerOffer(accepted);
  }

  public onStrangerWishChoice(choice: StrangerWishChoice): void {
    this.explorationEventService.submitStrangerWishChoice(choice);
  }

  public onStrangerSpellTeacher(accepted: boolean): void {
    this.explorationEventService.submitStrangerSpellTeacher(accepted);
  }

  public onSubmitPlaceResult(): void {
    this.explorationEventService.submitPlaceResult();
  }

  public onMarketBuy(item: PlaceMarketItem): void {
    void this.explorationEventService.placeMarketBuy(item.tradableId);
  }

  public onMarketClose(): void {
    this.explorationEventService.submitMarketClose();
  }

  public onConclude(): void {
    this.explorationEventService.submitExplorationClose();
  }

  public onFollowerCombatSkip(entry: SessionCardEntry): void {
    const player = this.myPlayer();
    const worldState = this.mapPageState.worldState();
    const gameId = this.explorationEventService.sessionGameId;
    const skipEntry = this.followerCombatSkipEntry();
    if (!player || !worldState || !gameId || !skipEntry) return;

    const sessionCellId = worldState.activeExplorationSession?.cellId;
    if (!sessionCellId) return;
    const cell = this.mapPageState.mapCellsById()[sessionCellId];
    if (!cell) return;

    void this.explorationActionService.followerCombatSkip({
      gameId,
      player,
      cell,
      cardInstanceId: entry.placed.instanceId,
      followerId: skipEntry.followerId,
      worldState,
    });
  }

  public onCrystalBallSkip(entry: SessionCardEntry): void {
    const player = this.myPlayer();
    const worldState = this.mapPageState.worldState();
    const gameId = this.explorationEventService.sessionGameId;
    if (!player || !worldState || !gameId) return;

    const sessionCellId = worldState.activeExplorationSession?.cellId;
    if (!sessionCellId) return;
    const cell = this.mapPageState.mapCellsById()[sessionCellId];
    if (!cell) return;

    void this.explorationActionService.crystalBallSkipCard({
      gameId,
      player,
      cell,
      cardInstanceId: entry.placed.instanceId,
      worldState,
    });
  }

  public resolvePlaceResultText(result: PlaceResultState): string {
    const p = result.params;
    switch (result.resultType) {
      case "fountain-damage":    return `Hai bevuto dalla fonte e hai subito ${p["damage"]} danni. (${p["usesLeft"]} usi rimanenti)`;
      case "fountain-stat-boost": return `Hai bevuto dalla fonte: +${p["amount"]} ${p["stat"]} permanente! (${p["usesLeft"]} usi rimanenti)`;
      case "fountain-hp-boost":  return `Hai bevuto dalla fonte: Max PF aumentato del 5%! (${p["usesLeft"]} usi rimanenti)`;
      case "fountain-exhausted": return `La ${p["placeName"] ?? "Fonte"} si è esaurita dopo 3 usi ed è scomparsa.`;
      case "portal-teleport":    return `Sei stato teletrasportato a: ${p["destination"]}.`;
      case "portal-no-destination": return "Il Portale non ha trovato nessuna destinazione scoperta.";
      case "maze-lost":          return "Ti sei perso nel Labirinto. Salterai il prossimo turno.";
      case "maze-escape":        return "Sei riuscito a uscire dal Labirinto. Fine turno.";
      case "cave-damage":        return `Hai esplorato la Caverna e subito ${p["damage"]} danni.`;
      case "cave-nothing":       return "Hai esplorato la Caverna: non hai trovato nulla.";
      case "cave-coins":         return `Hai esplorato la Caverna e trovato ${p["amount"]} monete.`;
      case "cave-xp":            return "Hai esplorato la Caverna e guadagnato 1 XP.";
      case "chapel-nothing":     return "Hai pregato al Tempietto, ma nulla è accaduto.";
      case "chapel-fortune":     return "Il Tempietto ti benedice: Fortuna per 2 turni.";
      case "chapel-coins":       return "Il Tempietto ti dona 5 monete.";
      case "chapel-heal":        return `Il Tempietto ti cura: recuperati ${p["healedHp"]} PF.`;
      case "chapel-spell":       return "Il Tempietto ti rivela un incantesimo casuale.";
      case "chapel-spell-full":  return "Il Tempietto voleva rivelarti un incantesimo, ma il libro è pieno.";
      case "chapel-spell-empty": return "Il Tempietto voleva rivelarti un incantesimo, ma il mazzo è vuoto.";
      case "chapel-teleport":    return "Il Tempietto ti benedice: al prossimo turno potrai teletrasportarti.";
      default: return "Risolto.";
    }
  }

  public resolveWishStatLabel(stat: unknown): string {
    if (stat === "strength") return "Forza";
    if (stat === "magic") return "Magia";
    if (stat === "mp") return "PM";
    return String(stat ?? "");
  }

  private resolveItemCard(placed: PlacedExplorationCard): ItemCardData | null {
    const itemId = placed.type === "item" ? placed.itemId
      : placed.type === "amulet" ? placed.amuletId
      : null;
    if (!itemId) return null;
    const def = this.itemCatalogService.getCachedItemById(itemId);
    if (!def) return null;

    const labels: ItemCardLabel[] = [];
    if (!def.occupiesSpace) {
      labels.push({ text: this.translationService.tOrFallback("map.labels.little", "little"), tone: "neutral" });
    }
    const scopesSeen = new Set<string>();
    for (const mod of def.parameterModifiers ?? []) {
      for (const scope of mod.scopes ?? []) {
        if (scope === "always" || scopesSeen.has(scope)) continue;
        scopesSeen.add(scope);
        const text = scope === "fight-only"
          ? this.translationService.tOrFallback("map.labels.fightOnly", "fight only")
          : scope === "day-only"
            ? this.translationService.tOrFallback("map.labels.dayOnly", "day only")
            : this.translationService.tOrFallback("map.labels.nightOnly", "night only");
        labels.push({ text, tone: "neutral" });
      }
    }
    for (const mod of def.parameterModifiers ?? []) {
      const sign = mod.amount >= 0 ? "+" : "";
      const param = mod.parameter === "strength"
        ? this.translationService.tOrFallback("playerCard.stats.strengthAbbr", "FRZ")
        : mod.parameter === "magic"
          ? this.translationService.tOrFallback("playerCard.stats.magicAbbr", "MAG")
          : this.translationService.tOrFallback("playerCard.stats.luckAbbr", "FOR");
      labels.push({ text: `${sign}${mod.amount} ${param}`, tone: mod.amount >= 0 ? "positive" : "negative" });
    }

    const maxCharges = typeof def.maxCharges === "number" ? Math.max(1, Math.floor(def.maxCharges)) : null;
    const uses: ItemCardUses | null = maxCharges
      ? { current: maxCharges, max: maxCharges, slots: Array.from({ length: maxCharges }, () => true) }
      : null;

    const sellAmt = this.itemCatalogService.getSellValue(def);
    const value: ItemCardValue | null = sellAmt > 0 ? { amount: sellAmt, tone: "value" } : null;

    return {
      name: this.itemCatalogService.getLocalizedName(def),
      description: this.itemCatalogService.getLocalizedDescription(def).trim()
        || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
      labels,
      uses,
      value,
    };
  }

  private resolveName(placed: PlacedExplorationCard, def: ExplorationCardDef | null): string {
    if (placed.type === "enemy") return placed.name;
    if (placed.type === "item") {
      const itemDef = this.itemCatalogService.getCachedItemById(placed.itemId);
      if (itemDef) return this.itemCatalogService.getLocalizedName(itemDef);
    }
    if (placed.type === "amulet") {
      const amuletDef = this.itemCatalogService.getCachedItemById(placed.amuletId);
      if (amuletDef) return this.itemCatalogService.getLocalizedName(amuletDef);
    }
    return def?.name ?? this.translationService.tOrFallback("common.unknownCard", "Unknown card");
  }

  private resolveDescription(placed: PlacedExplorationCard, def: ExplorationCardDef | null): string {
    if (!def) return "";
    return def.description;
  }

  private resolveCta(placed: PlacedExplorationCard): string {
    if (placed.type === "follower" && placed.forced) return "Arruola (obbligatorio)";
    return CARD_TYPE_CTA[placed.type] ?? "Risolvi";
  }
}
