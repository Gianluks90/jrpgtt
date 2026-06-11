import { DialogRef } from "@angular/cdk/dialog";
import { Component, inject } from "@angular/core";
import { DialogResponse } from "@models/ui/DialogResponse";
import { CrtOverlayService } from "@services/ui/crt-overlay-service";
import { SoundService } from "@services/ui/sound-service";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

@Component({
  selector: "app-map-settings-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./map-settings-dialog.html",
  styleUrl: "./map-settings-dialog.scss",
})
export class MapSettingsDialog {
  private readonly dialogRef = inject(DialogRef<DialogResponse<never>>);
  private readonly soundService = inject(SoundService);
  private readonly crtOverlayService = inject(CrtOverlayService);

  public readonly isSoundEnabled = this.soundService.isEnabled;
  public readonly isCrtEnabled = this.crtOverlayService.isEnabled;

  public toggleSound(): void {
    this.soundService.toggleEnabled();
  }

  public toggleCrt(): void {
    this.crtOverlayService.toggleEnabled();
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }
}