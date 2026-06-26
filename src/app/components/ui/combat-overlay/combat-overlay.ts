import { NgClass } from "@angular/common";
import { Component, OnDestroy, computed, effect, inject, signal } from "@angular/core";
import { ExplorationEventService, PendingCombatEquipment, CombatEquipmentOption, CombatSpellOption } from "@services/exploration/exploration-event-service";
import { SoundService } from "@services/ui/sound-service";
import { TranslationService } from "@services/shared/translation-service";
import { CombatOutcome, CombatResult, CombatState } from "@models/exploration/CombatState";
import { ExplorationElement } from "@models/exploration/ExplorationCard";
import { SanctuaryElement } from "@models/world/MapCell";
import { MapPageStateService } from "@services/map/map-page-state-service";
import { LuckCheckResult } from "@models/ui/LuckCheckResult";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TextButton } from "../text-button/text-button";
import { LuckIndicator } from "../luck-indicator/luck-indicator";

type CombatUiPhase = "idle" | "rolling" | "dice-revealed" | "totals-revealed" | "results";
type CombatAction = "fight" | "flee" | "dismissed" | null;

export interface CombatResultItem {
  id: string;
  type: "outcome" | "damage" | "xp" | "gold";
  outcome?: CombatOutcome;
  isTie?: boolean;
  autoWin?: boolean;
  critical?: boolean;
  value?: number;
}

const ELEMENT_CHAIN: ExplorationElement[] = ["fire", "earth", "wind", "water"];
const LUCK_ANIM_MS = 1200;
const DICE_REVEAL_MS = 2000;

function elementBeats(a: ExplorationElement, b: ExplorationElement): boolean {
  const ai = ELEMENT_CHAIN.indexOf(a);
  const bi = ELEMENT_CHAIN.indexOf(b);
  if (ai === -1 || bi === -1) return false;
  return (ai + 1) % ELEMENT_CHAIN.length === bi;
}

function computeElementMod(
  ownElement: SanctuaryElement | undefined,
  opponentElement: ExplorationElement | undefined,
  quadrantElement: SanctuaryElement | undefined,
): number {
  let mod = 0;
  if (ownElement && opponentElement) {
    if (elementBeats(ownElement, opponentElement)) mod += 1;
    else if (elementBeats(opponentElement, ownElement)) mod -= 1;
  }
  if (quadrantElement && ownElement === quadrantElement) mod += 1;
  return mod;
}

@Component({
  selector: "app-combat-overlay",
  imports: [NgClass, TranslationPipe, TextButton, LuckIndicator],
  templateUrl: "./combat-overlay.html",
  styleUrl: "./combat-overlay.scss",
})
export class CombatOverlay implements OnDestroy {
  private readonly explorationEventService = inject(ExplorationEventService);
  private readonly soundService = inject(SoundService);
  private readonly translationService = inject(TranslationService);
  private readonly mapPageState = inject(MapPageStateService);

  private readonly uiPhase = signal<CombatUiPhase>("idle");
  private readonly combatAction = signal<CombatAction>(null);
  private readonly revealedResultsCount = signal(0);
  private readonly equipmentSelectionVisible = signal(false);
  public readonly selectedWeaponId = signal<string | null>(null);
  public readonly selectedArmorId = signal<string | null>(null);
  public readonly confirmedWeaponLabel = signal<string | null>(null);
  public readonly confirmedArmorLabel = signal<string | null>(null);
  private readonly confirmedEquipmentBonus = signal<number>(0);

  public readonly spellDialogVisible = signal(false);
  public readonly selectedSpellId = signal<string | null>(null);
  public readonly confirmedSpellLabel = signal<string | null>(null);
  private readonly confirmedSpellBonus = signal<number>(0);

  private timer1: ReturnType<typeof setTimeout> | null = null;
  private timer2: ReturnType<typeof setTimeout> | null = null;
  private resultTimers: ReturnType<typeof setTimeout>[] = [];
  private equipmentRevealTimer: ReturnType<typeof setTimeout> | null = null;
  private activeCombatId: string | null = null;

  public readonly combat = computed<CombatState | null>(() => this.explorationEventService.pendingCombat());

  private readonly myPlayer = computed(() => {
    const uid = this.mapPageState.currentUserId();
    return this.mapPageState.players().find((p) => p.id === uid) ?? null;
  });

  public readonly canExorciseSpirit = computed(() => {
    const combat = this.combat();
    const player = this.myPlayer();
    if (!combat || combat.phase !== "setup" || !player) return false;
    const isSpirit = (combat.enemy.categories ?? []).includes("spirit");
    const hasHolySymbol = (player.inventory?.items ?? []).some(e => e.itemId === "B-IT-009");
    return isSpirit && hasHolySymbol;
  });
  public readonly equipmentOptions = computed<PendingCombatEquipment | null>(() => this.explorationEventService.pendingEquipmentOptions());
  public readonly showEquipmentSelection = computed(() => this.equipmentSelectionVisible() && !!this.equipmentOptions());
  public readonly spellOptions = computed<CombatSpellOption[] | null>(() => this.explorationEventService.pendingSpellOptions());
  public readonly hasEligibleSpells = computed(() => (this.spellOptions()?.length ?? 0) > 0);
  public readonly showSpellDialog = computed(() => this.spellDialogVisible() && this.hasEligibleSpells());

  public readonly selectedEquipmentBonus = computed(() => {
    const options = this.equipmentOptions();
    if (!options) return 0;
    let bonus = 0;
    const wId = this.selectedWeaponId();
    const aId = this.selectedArmorId();
    if (wId) {
      const opt = options.weapons.find((w) => w.itemId === wId);
      if (opt) bonus += opt.bonus;
    }
    if (aId) {
      const opt = options.armors.find((a) => a.itemId === aId);
      if (opt) bonus += opt.bonus;
    }
    return bonus;
  });

  private readonly activeEquipmentBonus = computed(() =>
    this.equipmentOptions() ? this.selectedEquipmentBonus() : this.confirmedEquipmentBonus()
  );

  private readonly activeSpellBonus = computed(() => this.confirmedSpellBonus());

  constructor() {
    effect(() => {
      const combatId = this.combat()?.combatId ?? null;
      if (combatId !== null && combatId !== this.activeCombatId) {
        this.soundService.playFightLoop();
      }
      this.activeCombatId = combatId;
    });

    effect(() => {
      const options = this.equipmentOptions();
      if (options) {
        this.equipmentRevealTimer = setTimeout(() => {
          this.equipmentSelectionVisible.set(true);
        }, 1400);
      } else {
        if (this.equipmentRevealTimer !== null) {
          clearTimeout(this.equipmentRevealTimer);
          this.equipmentRevealTimer = null;
        }
        this.equipmentSelectionVisible.set(false);
        this.selectedWeaponId.set(null);
        this.selectedArmorId.set(null);
      }
    });
  }

  public itemLabel(opt: CombatEquipmentOption): string {
    if (opt.nameKey) {
      return this.translationService.tOrFallback(opt.nameKey, opt.name);
    }
    return opt.name;
  }

  public selectWeapon(id: string | null): void {
    this.selectedWeaponId.set(id);
  }

  public selectArmor(id: string | null): void {
    this.selectedArmorId.set(id);
  }

  public openSpellDialog(): void {
    this.spellDialogVisible.set(true);
  }

  public closeSpellDialog(): void {
    this.spellDialogVisible.set(false);
    this.selectedSpellId.set(null);
  }

  public selectSpell(id: string | null): void {
    this.selectedSpellId.set(id);
  }

  public castSpell(): void {
    const spells = this.spellOptions();
    const id = this.selectedSpellId();
    if (id && spells) {
      const opt = spells.find((s) => s.itemId === id);
      if (opt) {
        const label = opt.nameKey
          ? this.translationService.tOrFallback(opt.nameKey, opt.name)
          : opt.name;
        this.confirmedSpellLabel.set(label);
        this.confirmedSpellBonus.set(opt.bonus);
        this.explorationEventService.submitSpellBonus(opt.bonus);
      }
    }
    this.spellDialogVisible.set(false);
    this.selectedSpellId.set(null);
  }

  public spellDescription(opt: CombatSpellOption): string {
    if (opt.descriptionKey) {
      return this.translationService.tOrFallback(opt.descriptionKey, opt.description);
    }
    return opt.description;
  }

  public confirmEquipment(): void {
    const options = this.equipmentOptions();
    const wId = this.selectedWeaponId();
    const aId = this.selectedArmorId();
    if (wId && options) {
      const opt = options.weapons.find((w) => w.itemId === wId);
      this.confirmedWeaponLabel.set(opt ? this.itemLabel(opt) : null);
    } else {
      this.confirmedWeaponLabel.set(null);
    }
    if (aId && options) {
      const opt = options.armors.find((a) => a.itemId === aId);
      this.confirmedArmorLabel.set(opt ? this.itemLabel(opt) : null);
    } else {
      this.confirmedArmorLabel.set(null);
    }
    const bonus = this.selectedEquipmentBonus();
    this.confirmedEquipmentBonus.set(bonus);
    this.explorationEventService.submitEquipmentSelection(bonus);
  }
  public readonly currentUiPhase = computed(() => this.uiPhase());
  public readonly fleeMode = computed(() => this.combatAction() === "flee");

  public readonly showAnimatedView = computed(() => {
    const c = this.combat();
    if (!c) return false;
    const phase = this.uiPhase();
    if (phase === "results") return false;
    return c.phase === "setup" || phase !== "idle";
  });

  public readonly showResultsPhase = computed(() =>
    this.uiPhase() === "results" && !!this.combat()?.result
  );

  // Reconnect fallback: result exists but animation never ran (page refresh).
  // Suppressed when combatAction is 'dismissed' to avoid flashing after Concludi.
  public readonly showFallbackResult = computed(() => {
    const c = this.combat();
    if (!c?.result) return false;
    return c.phase === "result" && this.uiPhase() === "idle" && this.combatAction() === null;
  });

  public get result(): CombatResult | null {
    return this.combat()?.result ?? null;
  }

  public readonly fleeMaxDamage = computed(() => {
    const state = this.combat();
    if (!state) return 0;
    const stat = state.enemy.combatStat === "strength" ? state.enemy.strength : state.enemy.magic;
    return Math.ceil(stat / 2);
  });

  public readonly resultItems = computed<CombatResultItem[]>(() => {
    const r = this.combat()?.result;
    if (!r) return [];
    const items: CombatResultItem[] = [];
    const isTie = r.outcome === "player-loss" && r.damage === 0;
    items.push({ id: "outcome", type: "outcome", outcome: r.outcome, isTie, autoWin: r.autoWin, critical: r.playerRoll.critical });
    const playerTookDamage = (r.outcome === "player-loss" || r.outcome === "flee") && r.damage > 0;
    if (playerTookDamage) items.push({ id: "damage", type: "damage", value: r.damage });
    if ((r.xpGained ?? 0) > 0) items.push({ id: "xp", type: "xp", value: r.xpGained });
    if ((r.goldGained ?? 0) > 0) items.push({ id: "gold", type: "gold", value: r.goldGained });
    return items;
  });

  public readonly visibleResultItems = computed(() =>
    this.resultItems().slice(0, this.revealedResultsCount())
  );

  public readonly concludiEnabled = computed(() => {
    const items = this.resultItems();
    return items.length > 0 && this.revealedResultsCount() >= items.length;
  });

  public readonly playerLuckResult = computed<LuckCheckResult | null>(() => {
    if (this.uiPhase() === "idle") return null;
    const r = this.combat()?.result?.playerRoll;
    if (!r) return null;
    return this.buildLuckCheckResult(r.luckRoll, r.luckBonus);
  });

  public readonly enemyLuckResult = computed<LuckCheckResult | null>(() => {
    if (this.uiPhase() === "idle") return null;
    const r = this.combat()?.result?.enemyRoll;
    if (!r) return null;
    return this.buildLuckCheckResult(r.luckRoll, r.luckBonus);
  });

  public readonly playerElementMod = computed(() => {
    const state = this.combat();
    if (!state?.playerSnapshot) return 0;
    return computeElementMod(state.playerSnapshot.element, state.enemy.element, state.quadrantElement);
  });

  public readonly enemyElementMod = computed(() => {
    const state = this.combat();
    if (!state) return 0;
    return computeElementMod(state.enemy.element, state.playerSnapshot?.element, state.quadrantElement);
  });

  public readonly enemyTimeMod = computed(() => {
    const state = this.combat();
    if (!state || state.enemy.time === "both") return 0;
    return state.enemy.time === (state.timeOfDay ?? "day") ? 1 : -1;
  });

  public readonly playerPreRollTotal = computed(() => {
    const state = this.combat();
    if (!state?.playerSnapshot) return 0;
    if (this.fleeMode()) return state.playerSnapshot.luck;
    return state.playerSnapshot.statValue + this.playerElementMod() + this.activeEquipmentBonus() + this.activeSpellBonus();
  });

  public readonly enemyPreRollTotal = computed(() => {
    const state = this.combat();
    if (!state) return 0;
    if (this.fleeMode()) return state.enemy.luck;
    const stat = state.enemy.combatStat === "strength" ? state.enemy.strength : state.enemy.magic;
    return stat + this.enemyElementMod() + this.enemyTimeMod();
  });

  public readonly playerLuckBonus = computed(() => this.combat()?.result?.playerRoll.luckBonus ?? 0);
  public readonly enemyLuckBonus = computed(() => this.combat()?.result?.enemyRoll.luckBonus ?? 0);
  public readonly playerFinalTotal = computed(() => this.combat()?.result?.playerRoll.total ?? 0);
  public readonly enemyFinalTotal = computed(() => this.combat()?.result?.enemyRoll.total ?? 0);

  public readonly playerWon = computed(() => {
    const r = this.combat()?.result;
    return !!r && r.playerRoll.total > r.enemyRoll.total;
  });

  public readonly enemyWon = computed(() => {
    const r = this.combat()?.result;
    return !!r && r.enemyRoll.total > r.playerRoll.total;
  });

  // Element mod shown on ALL three player stat boxes; equipment bonus only on active combat stat
  public readonly playerStrengthDelta = computed(() => {
    const snap = this.combat()?.playerSnapshot;
    if (!snap) return 0;
    const eqBonus = snap.combatStat === "strength" ? this.activeEquipmentBonus() : 0;
    const spellBonus = snap.combatStat === "strength" ? this.activeSpellBonus() : 0;
    return this.playerElementMod() + eqBonus + spellBonus;
  });

  public readonly playerMagicDelta = computed(() => {
    const snap = this.combat()?.playerSnapshot;
    if (!snap) return 0;
    const eqBonus = snap.combatStat === "magic" ? this.activeEquipmentBonus() : 0;
    const spellBonus = snap.combatStat === "magic" ? this.activeSpellBonus() : 0;
    return this.playerElementMod() + eqBonus + spellBonus;
  });

  public readonly playerLuckDelta = computed(() => {
    if (!this.combat()?.playerSnapshot) return 0;
    return this.playerElementMod();
  });

  public readonly enemyStrengthDelta = computed(() => {
    const state = this.combat();
    if (!state) return 0;
    return this.enemyTimeMod() + (state.enemy.combatStat === "strength" ? this.enemyElementMod() : 0);
  });

  public readonly enemyMagicDelta = computed(() => {
    const state = this.combat();
    if (!state) return 0;
    return this.enemyTimeMod() + (state.enemy.combatStat === "magic" ? this.enemyElementMod() : 0);
  });

  public readonly enemyLuckDelta = computed(() => this.enemyTimeMod());

  public ngOnDestroy(): void {
    this.clearAllTimers();
    if (this.equipmentRevealTimer !== null) {
      clearTimeout(this.equipmentRevealTimer);
      this.equipmentRevealTimer = null;
    }
  }

  public fight(): void {
    this.clearAllTimers();
    this.combatAction.set("fight");
    this.uiPhase.set("rolling");
    this.explorationEventService.submitCombatAction("fight");
    this.scheduleRollAnimation();
  }

  public flee(): void {
    this.clearAllTimers();
    this.combatAction.set("flee");
    this.uiPhase.set("rolling");
    this.explorationEventService.submitCombatAction("flee");
    this.scheduleRollAnimation();
  }

  public exorcise(): void {
    this.clearAllTimers();
    this.combatAction.set("dismissed");
    this.explorationEventService.submitCombatAction("exorcise-spirit");
  }

  public continueToResults(): void {
    this.clearAllTimers();
    this.uiPhase.set("results");
    this.scheduleResultsReveal();
  }

  public dismiss(): void {
    this.clearAllTimers();
    this.uiPhase.set("idle");
    this.combatAction.set("dismissed");
    this.revealedResultsCount.set(0);
    this.confirmedWeaponLabel.set(null);
    this.confirmedArmorLabel.set(null);
    this.confirmedEquipmentBonus.set(0);
    this.confirmedSpellLabel.set(null);
    this.confirmedSpellBonus.set(0);
    this.spellDialogVisible.set(false);
    this.soundService.fadeOutFightAndStop();
    this.explorationEventService.dismissCombatResult();
  }

  public deltaSign(delta: number): string {
    return delta > 0 ? "+" : "";
  }

  public modIcon(mod: number): string {
    return mod >= 0 ? "/tooltip-icons/bonus-icon.svg" : "/tooltip-icons/malus-icon.svg";
  }

  public outcomeClass(item: CombatResultItem): string {
    if (item.isTie) return "outcome-tie";
    switch (item.outcome) {
      case "player-win": return "outcome-win";
      case "player-loss": return "outcome-loss";
      case "flee-lucky": return "outcome-flee-success";
      case "flee": return "outcome-flee-damage";
      default: return "";
    }
  }

  public outcomeTransKey(item: CombatResultItem): string {
    if (item.isTie) return "combat.outcome.tie";
    switch (item.outcome) {
      case "player-win": return "combat.outcome.win";
      case "player-loss": return "combat.outcome.loss";
      case "flee-lucky": return "combat.outcome.fleeLucky";
      case "flee": return "combat.outcome.flee";
      default: return "";
    }
  }

  private scheduleRollAnimation(): void {
    this.timer1 = setTimeout(() => {
      this.uiPhase.set("dice-revealed");
      this.timer2 = setTimeout(() => {
        this.uiPhase.set("totals-revealed");
      }, DICE_REVEAL_MS);
    }, LUCK_ANIM_MS);
  }

  private scheduleResultsReveal(): void {
    // Outcome (index 0) shown immediately; loot/damage items stagger from index 1
    this.revealedResultsCount.set(1);
    const items = this.resultItems();
    this.resultTimers = items.slice(1).map((_, i) =>
      setTimeout(() => this.revealedResultsCount.set(i + 2), (i + 1) * 1000)
    );
  }

  private clearAllTimers(): void {
    if (this.timer1 !== null) { clearTimeout(this.timer1); this.timer1 = null; }
    if (this.timer2 !== null) { clearTimeout(this.timer2); this.timer2 = null; }
    this.resultTimers.forEach(clearTimeout);
    this.resultTimers = [];
  }

  // Maps combat roll to LuckCheckResult. total = raw 1-100; threshold = 100 → only 100 = critical.
  private buildLuckCheckResult(roll: number, bonus: number): LuckCheckResult {
    return { roll, luckBonus: bonus, total: roll, threshold: 100, success: roll === 100, nearSuccess: false };
  }
}
