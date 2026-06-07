import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SoundService } from './services/sound-service';
import { TranslationService } from './services/translation-service';

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

  constructor(private soundService: SoundService) {
    this.soundService.initialize();
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
  }
}
