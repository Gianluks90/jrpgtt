import { Component, computed, inject } from "@angular/core";
import { ExplorationEventService } from "@services/exploration/exploration-event-service";
import { CombatResult, CombatState } from "@models/exploration/CombatState";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TextButton } from "../text-button/text-button";

@Component({
  selector: "app-combat-overlay",
  imports: [TranslationPipe, TextButton],
  templateUrl: "./combat-overlay.html",
  styleUrl: "./combat-overlay.scss",
})
export class CombatOverlay {
  private readonly explorationEventService = inject(ExplorationEventService);

  public readonly combat = computed<CombatState | null>(() => this.explorationEventService.pendingCombat());

  public get result(): CombatResult | null {
    return this.combat()?.result ?? null;
  }

  public fight(): void {
    this.explorationEventService.submitCombatAction("fight");
  }

  public flee(): void {
    this.explorationEventService.submitCombatAction("flee");
  }

  public dismiss(): void {
    this.explorationEventService.dismissCombatResult();
  }
}
