import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { getAuth } from "firebase/auth";

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const auth = getAuth();

  return getCurrentUser(auth).then(user => {
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

  return getCurrentUser(auth).then(user => {
    if (user) return router.createUrlTree(["/home"]);
    return true;
  }).catch(error => {
    console.error("Error checking auth state:", error);
    return true;
  });
};

function getCurrentUser(auth: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      unsubscribe(); // Unsubscribe immediately to avoid memory leaks
      resolve(user);
    }, reject);
  });
}
