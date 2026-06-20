import { Component, computed, inject } from "@angular/core";
import { ExplorationEventService } from "@services/exploration/exploration-event-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { MapPageStateService } from "@services/map/map-page-state-service";
import { PlacedExplorationCard } from "@models/exploration/ExplorationCard";
import { ExplorationCardDef } from "@models/catalog/ExplorationCardCatalog";
import { TextButton } from "../text-button/text-button";

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

interface SessionCardEntry {
  placed: PlacedExplorationCard;
  def: ExplorationCardDef | null;
  name: string;
  description: string;
  typeLabel: string;
  cta: string;
}

@Component({
  selector: "app-exploration-phase-overlay",
  imports: [TextButton],
  templateUrl: "./exploration-phase-overlay.html",
  styleUrl: "./exploration-phase-overlay.scss",
})
export class ExplorationPhaseOverlay {
  private readonly explorationEventService = inject(ExplorationEventService);
  private readonly explorationCatalogService = inject(ExplorationCatalogService);
  private readonly mapPageState = inject(MapPageStateService);

  private readonly session = computed(() => this.explorationEventService.pendingExplorationSession());
  private readonly combatActive = computed(() => !!this.explorationEventService.pendingCombat());

  public readonly visible = computed(() => !!this.session() && !this.combatActive());

  public readonly myPlayer = computed(() => {
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

  public onConclude(): void {
    this.explorationEventService.submitExplorationClose();
  }

  private resolveName(placed: PlacedExplorationCard, def: ExplorationCardDef | null): string {
    if (placed.type === "enemy") return placed.name;
    return def?.name ?? placed.cardId;
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
