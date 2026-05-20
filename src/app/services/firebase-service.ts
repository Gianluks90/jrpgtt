import { Injectable, signal } from "@angular/core";
import { initializeApp } from "firebase/app";
import { doc, Firestore, getFirestore, onSnapshot } from "firebase/firestore";
import { FIREBASE_CONFIG } from "../environment/firebase.config";
import { getAuth } from "firebase/auth";
import { UserData } from "../models/UserData";

@Injectable({
  providedIn: "root",
})
export class FirebaseService {
  public user = signal<UserData | null>(null);
  public database: Firestore;

  constructor() {
    const app = initializeApp(FIREBASE_CONFIG);
    this.database = getFirestore(app);

    getAuth(app).onAuthStateChanged(async user => {
      if (user) {
        await this.getUserSnapshotByUid(user.uid);
      } else {
        this.user.set(null);
      }
    });
  }

  private async getUserSnapshotByUid(uid: string): Promise<void> {
    const docRef = doc(this.database, "users", uid);
    onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) {
        this.user.set(null);
        return;
      }

      const userData = docSnap.data() as UserData;
      this.user.set(userData);
    });
  }
}
