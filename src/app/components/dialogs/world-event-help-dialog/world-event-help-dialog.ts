import { Component, Inject } from "@angular/core";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";
import { DialogResponse } from "@models/ui/DialogResponse";

export type WorldEventHelpBiome = "plains" | "forest" | "mountain" | "water" | "desert" | "ruins";

export interface WorldEventHelpDialogRow {
  cellLabel: string;
  originalBiome: WorldEventHelpBiome;
  originalBiomeLabel: string;
  mutatedBiome: WorldEventHelpBiome;
  mutatedBiomeLabel: string;
  changes: string[];
}

export interface WorldEventHelpDialogData {
  title: string;
  subtitle: string;
  waitingMessage: string;
  noRowsMessage: string;
  changesTitle: string;
  closeLabel: string;
  rows: WorldEventHelpDialogRow[];
}

@Component({
  selector: "app-world-event-help-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton],
  templateUrl: "./world-event-help-dialog.html",
  styleUrl: "./world-event-help-dialog.scss",
})
export class WorldEventHelpDialog {
  public readonly title: string;
  public readonly subtitle: string;
  public readonly waitingMessage: string;
  public readonly noRowsMessage: string;
  public readonly changesTitle: string;
  public readonly closeLabel: string;
  public readonly rows: WorldEventHelpDialogRow[];

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    @Inject(DIALOG_DATA) data: WorldEventHelpDialogData,
  ) {
    this.title = data.title;
    this.subtitle = data.subtitle;
    this.waitingMessage = data.waitingMessage;
    this.noRowsMessage = data.noRowsMessage;
    this.changesTitle = data.changesTitle;
    this.closeLabel = data.closeLabel;
    this.rows = data.rows;
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }
}
