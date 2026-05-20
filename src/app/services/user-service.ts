import { Injectable } from "@angular/core";
import { FirebaseService } from "./firebase-service";
import { doc, setDoc } from "firebase/firestore";

@Injectable({
  providedIn: "root",
})
export class UserService {
  constructor(private firebaseService: FirebaseService) {}

  public async updateUserData(data: any): Promise<void> {
    const docRef = doc(this.firebaseService.database, "users", data.uid);
    return await setDoc(docRef, data, { merge: true });
  }
}
