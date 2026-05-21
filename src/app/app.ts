import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirebaseService } from './services/firebase-service';
import { APP_VERSION } from './consts/app-version';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('jrpgtt');
  public readonly appVersion = APP_VERSION;
  constructor(private firebaseService: FirebaseService) {
  }
}
