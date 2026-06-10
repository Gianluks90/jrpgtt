import { Component, inject } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { SoundService } from "@services/ui/sound-service";

@Component({
  selector: "sound-toggle-button",
  imports: [TranslationPipe],
  templateUrl: "./sound-toggle-button.html",
  styleUrl: "./sound-toggle-button.scss",
})
export class SoundToggleButton {
  private readonly soundService = inject(SoundService);
  public readonly isEnabled = this.soundService.isEnabled;

  public toggleSound(): void {
    this.soundService.toggleEnabled();
  }
}
