import { Component, input, output } from "@angular/core";
import { IconButton } from "../icon-button/icon-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";

@Component({
  selector: "app-map-log-panel",
  standalone: true,
  imports: [IconButton, TranslationPipe],
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
