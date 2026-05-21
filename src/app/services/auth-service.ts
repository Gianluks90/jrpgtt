import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { deleteUser, getAuth, GoogleAuthProvider, signInWithPopup, User } from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { FirebaseService } from "./_index";
import { UserData } from "../models/UserData";
import { GameService } from "./game-service";
import { PlayerService } from "./player-service";

@Injectable({
  providedIn: "root",
})
export class AuthService {

  constructor(private router: Router, private firebaseService: FirebaseService, private gameService: GameService, private playerService: PlayerService) { }

  public async login(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const auth = getAuth();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      await this.ensureUserDocumentExists(user);
      await this.router.navigate(["/home"]);
      console.log("Login successful:", user);
    } catch (error) {
      console.error("Error during login:", error);
    }
  }

  public async logout(): Promise<void> {
    await getAuth().signOut();
    this.gameService.clearGameSession();
    this.playerService.clearPlayerSession();
    await this.router.navigate(['/']);
  };

  private async createUserDocument(user: User): Promise<void> {
    const docRef = doc(this.firebaseService.database, "users", user.uid);
    const userData: UserData = {
      uid: user.uid,
      email: user.email || "",
      nickname: user.displayName || "",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
    return await setDoc(docRef, userData);
  }

  private async ensureUserDocumentExists(user: User): Promise<void> {
    const docRef = doc(this.firebaseService.database, "users", user.uid);
    const userDoc = await getDoc(docRef);

    if (userDoc.exists()) return;

    await this.createUserDocument(user);
  }

  public async destroyUser(): Promise<void> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) return;
    deleteUser(user).then(() => {
      this.gameService.clearGameSession();
      this.playerService.clearPlayerSession();
      this.deleteUserDocument(user.uid).then(() => {
        this.router.navigate(['/']);
      })
    }).catch((error) => {
      console.error('Error deleting user:', error);
    });
  }

  private async deleteUserDocument(uid: string): Promise<void> {
    const docRef = doc(this.firebaseService.database, "users", uid);
    return await deleteDoc(docRef);
  }
}
