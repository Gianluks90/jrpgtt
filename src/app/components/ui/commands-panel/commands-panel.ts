import { Component, input, output } from "@angular/core";

export interface CommandPanelAction {
  id: string;
  label: string;
  description?: string;
  warning?: string;
  moneyCost?: number | null;
  disabled?: boolean;
  pending?: boolean;
}

@Component({
  selector: "app-commands-panel",
  standalone: true,
  templateUrl: "./commands-panel.html",
  styleUrl: "./commands-panel.scss",
})
export class CommandsPanel {
  public actions = input<CommandPanelAction[]>([]);

  public actionRequested = output<string>();

  public onActionClick(action: CommandPanelAction): void {
    if (action.disabled || action.pending) return;
    this.actionRequested.emit(action.id);
  }
}