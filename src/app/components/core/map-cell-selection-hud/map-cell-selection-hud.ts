import { Component, input, output } from "@angular/core";
import { TextButton } from "../../ui/text-button/text-button";
import { TranslationPipe } from "../../../pipes/translation-pipe";

@Component({
  selector: "app-map-cell-selection-hud",
  standalone: true,
  imports: [TextButton, TranslationPipe],
  templateUrl: "./map-cell-selection-hud.html",
  styleUrl: "./map-cell-selection-hud.scss",
})
export class MapCellSelectionHud {
  public prompt = input.required<string>();
  public withCancel = input<boolean>(true);

  public cancelRequested = output<void>();

  public onCancel(): void {
    this.cancelRequested.emit();
  }
}
