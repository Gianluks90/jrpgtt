import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { getAuth, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FirebaseService } from "../services/firebase-service";
import { Game } from "../models/Game";

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const auth = getAuth();

  return resolveCurrentUser(auth).then(user => {
    if (user) return true;
    return router.createUrlTree(["/"]);
  }).catch(error => {
    console.error("Error checking auth state:", error);
    return router.createUrlTree(["/"]);
  });
};

export const landingGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const auth = getAuth();

  return resolveCurrentUser(auth).then(user => {
    if (user) return router.createUrlTree(["/home"]);
    return true;
  }).catch(error => {
    console.error("Error checking auth state:", error);
    return true;
  });
};

export const lobbyStatusGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const firebaseService = inject(FirebaseService);
  const gameId = route.paramMap.get("gameId");

  if (!gameId) {
    return router.createUrlTree(["/home"]);
  }

  const gameRef = doc(firebaseService.database, "games", gameId);
  const gameSnap = await getDoc(gameRef);

  if (!gameSnap.exists()) {
    return router.createUrlTree(["/home"]);
  }

  const game = gameSnap.data() as Game;
  if (game.status === "waiting") {
    return true;
  }

  return router.createUrlTree(["/game", gameId, "map"]);
};

export const mapStatusGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const firebaseService = inject(FirebaseService);
  const gameId = route.paramMap.get("gameId");

  if (!gameId) {
    return router.createUrlTree(["/home"]);
  }

  const gameRef = doc(firebaseService.database, "games", gameId);
  const gameSnap = await getDoc(gameRef);

  if (!gameSnap.exists()) {
    return router.createUrlTree(["/home"]);
  }

  const game = gameSnap.data() as Game;
  if (game.status === "waiting") {
    return router.createUrlTree(["/game", gameId, "lobby"]);
  }

  return true;
};

function getCurrentUser(auth: ReturnType<typeof getAuth>): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe(); // Unsubscribe immediately to avoid memory leaks
      resolve(user);
    }, reject);
  });
}

async function resolveCurrentUser(auth: ReturnType<typeof getAuth>): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
    return auth.currentUser;
  }

  return getCurrentUser(auth);
}
