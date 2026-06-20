import { Routes } from '@angular/router';
import { authGuard, landingGuard, lobbyStatusGuard, mapStatusGuard } from './guards/auth-guard';

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
        canActivate: [authGuard, lobbyStatusGuard],
        loadComponent: () => import('./pages/lobby-page/lobby-page').then(m => m.LobbyPage)
    },
    {
        title: 'Game Page - Map',
        path: 'game/:gameId/map',
        canActivate: [authGuard, mapStatusGuard],
        loadComponent: () => import('./pages/map-page/map-page').then(m => m.MapPage)
    },
    {
        title: 'Admin',
        path: 'admin',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/admin-page/admin-page').then(m => m.AdminPage)
    },
    {
        path: '**',
        redirectTo: '/home'
    }
];
