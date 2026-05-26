import { Component, input, output } from "@angular/core";
import { IconButton } from "../icon-button/icon-button";

@Component({
  selector: "app-map-log-panel",
  standalone: true,
  imports: [IconButton],
  templateUrl: "./map-log-panel.html",
  styleUrl: "./map-log-panel.scss",
})
export class MapLogPanel {
  public latestMessage = input("-");

  public openLogsRequested = output<void>();

  public onOpenLogs(): void {
    this.openLogsRequested.emit();
  }
}
