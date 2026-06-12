import { Component, computed, input, output, signal } from "@angular/core";
import { CommandPanelAction, CommandsPanel } from "../../ui/commands-panel/commands-panel";
import { IconButton } from "../../ui/icon-button/icon-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DEFAULT_SPELLBOOK_CAPACITY } from "../../../consts/player/spellbook-config";

@Component({
  selector: "app-map-utilities-panel",
  standalone: true,
  imports: [CommandsPanel, IconButton, TranslationPipe],
  templateUrl: "./map-utilities-panel.html",
  styleUrl: "./map-utilities-panel.scss",
})
export class MapUtilitiesPanel {
  constructor(private translationService: TranslationService) {}

  public commandActions = input<CommandPanelAction[]>([]);
  public spellActions = input<CommandPanelAction[]>([]);
  public spellCount = input<number>(0);
  public spellCapacity = input<number>(DEFAULT_SPELLBOOK_CAPACITY);

  public commandActionRequested = output<string>();
  public spellActionRequested = output<string>();

  private expandedPanel = signal<"commands" | "spells">("commands");

  public collapsedCommandsSummary = computed<string>(() => {
    const labels = this.commandActions().map((action) => action.label.trim()).filter((label) => label.length > 0);
    return this.buildCollapsedSummary(labels, "map.commands.none", "no commands");
  });

  public collapsedSpellsSummary = computed<string>(() => {
    const labels = this.spellActions().map((action) => action.label.trim()).filter((label) => label.length > 0);
    return this.buildCollapsedSummary(labels, "map.spells.none", "no spells");
  });

  public isCommandsExpanded(): boolean {
    return this.expandedPanel() === "commands";
  }

  public isSpellsExpanded(): boolean {
    return this.expandedPanel() === "spells";
  }

  public onCommandsPanelToggle(): void {
    this.expandedPanel.set("commands");
  }

  public onSpellsPanelToggle(): void {
    this.expandedPanel.set("spells");
  }

  public onCommandActionRequested(actionId: string): void {
    this.commandActionRequested.emit(actionId);
  }

  public onSpellActionRequested(actionId: string): void {
    this.spellActionRequested.emit(actionId);
  }

  private buildCollapsedSummary(labels: string[], emptyKey: string, emptyFallback: string): string {
    if (labels.length === 0) {
      return this.translationService.tOrFallback(emptyKey, emptyFallback);
    }

    const visible = labels.slice(0, 2);
    const hiddenCount = Math.max(0, labels.length - visible.length);
    if (hiddenCount <= 0) {
      return visible.join(", ");
    }

    return `${visible.join(", ")} +${hiddenCount}`;
  }
}