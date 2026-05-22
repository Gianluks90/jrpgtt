import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeApp, getApps } from 'firebase/app';
import { FIREBASE_CONFIG } from './app/environment/firebase.config';

if (getApps().length === 0) {
  initializeApp(FIREBASE_CONFIG);
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
