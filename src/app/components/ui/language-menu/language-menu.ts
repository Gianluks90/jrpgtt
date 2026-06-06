import { CdkMenu, CdkMenuTrigger } from "@angular/cdk/menu";
import { Component, inject } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { LanguageCode, TranslationService } from "../../../services/translation-service";
import { TextButton } from "../text-button/text-button";

@Component({
  selector: "language-menu",
  imports: [TextButton, TranslationPipe, CdkMenu, CdkMenuTrigger],
  templateUrl: "./language-menu.html",
  styleUrl: "./language-menu.scss",
})
export class LanguageMenu {
  private readonly translationService = inject(TranslationService);
  public readonly language = this.translationService.language;

  public async setLanguage(language: LanguageCode, trigger?: CdkMenuTrigger): Promise<void> {
    await this.translationService.setLanguage(language);
    trigger?.close();
  }
}
