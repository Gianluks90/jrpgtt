import { Routes } from '@angular/router';
import { authGuard, landingGuard } from './guards/auth-guard';

export const routes: Routes = [
    {
        title: 'Landing Page',
        path: '',
        canActivate: [landingGuard],
        loadComponent: () => import('./pages/landing-page/landing-page').then(m => m.LandingPage)
    },
    {
        title: 'Home Page',
        path: 'home',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage)
    },
    {
        title: 'Game Page - Lobby',
        path: 'game/:gameId/lobby',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/lobby-page/lobby-page').then(m => m.LobbyPage)
    },
    {
        path: '**',
        redirectTo: '/home'
    }
];
