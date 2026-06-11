import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SoundService } from "@services/ui/sound-service";
import { TranslationService } from "@services/shared/translation-service";
import { CrtOverlayService } from "@services/ui/crt-overlay-service";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('jrpgtt');
  private readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly crtOverlayService = inject(CrtOverlayService);

  constructor(private soundService: SoundService) {
    this.soundService.initialize();
    this.crtOverlayService.initialize();
    this.soundService.syncBackgroundForUrl(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const navigation = event as NavigationEnd;
        this.soundService.syncBackgroundForUrl(navigation.urlAfterRedirects || navigation.url);
      });

    effect(() => {
      document.documentElement.lang = this.translationService.language();
    });

    effect(() => {
      document.body.classList.toggle("crt-overlay-enabled", this.crtOverlayService.isEnabled());
    });
  }
}
