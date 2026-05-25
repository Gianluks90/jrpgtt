import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject } from "@angular/core";
import { EventLog } from "../../../models/EventLog";
import { DialogResponse } from "../../../models/DialogResponse";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

export interface GameEventsLogDialogData {
  logs: EventLog[];
}

@Component({
  selector: "app-game-events-log-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton],
  templateUrl: "./game-events-log-dialog.html",
  styleUrl: "./game-events-log-dialog.scss",
})
export class GameEventsLogDialog {
  public logs: EventLog[];

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    @Inject(DIALOG_DATA) data: GameEventsLogDialogData,
  ) {
    this.logs = Array.isArray(data?.logs) ? data.logs : [];
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  public formatTimestamp(log: EventLog): string {
    const date = log.createdAt.toDate();
    return new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  }
}
