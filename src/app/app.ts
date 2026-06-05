import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  constructor(private soundService: SoundService) {
    this.soundService.initialize();

    effect(() => {
      document.documentElement.lang = this.translationService.language();
    });
  }
}
