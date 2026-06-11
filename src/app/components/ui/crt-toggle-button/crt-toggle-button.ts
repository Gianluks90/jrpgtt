import { Component, inject } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { CrtOverlayService } from "@services/ui/crt-overlay-service";

@Component({
  selector: "crt-toggle-button",
  imports: [TranslationPipe],
  templateUrl: "./crt-toggle-button.html",
  styleUrl: "./crt-toggle-button.scss",
})
export class CrtToggleButton {
  private readonly crtOverlayService = inject(CrtOverlayService);
  public readonly isEnabled = this.crtOverlayService.isEnabled;

  public toggleCrtOverlay(): void {
    this.crtOverlayService.toggleEnabled();
  }
}