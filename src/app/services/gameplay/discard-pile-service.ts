import { Injectable } from "@angular/core";
import { collection, doc, getDocs, orderBy, query } from "firebase/firestore";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";
import { FirebaseService } from "@services/app/firebase-service";

@Injectable({
  providedIn: "root",
})
export class DiscardPileService {
  constructor(private firebaseService: FirebaseService) {}

  public async getDiscardPileEntries(gameId: string): Promise<DiscardPileEntry[]> {
    const normalizedGameId = String(gameId ?? "").trim();
    if (!normalizedGameId) {
      return [];
    }

    const runtimeWorldStateRef = doc(this.firebaseService.database, "games", normalizedGameId, "runtime", "worldState");
    const discardCollectionRef = collection(runtimeWorldStateRef, "discardPile");
    const discardQuery = query(discardCollectionRef, orderBy("discardSeq", "desc"));
    const snapshot = await getDocs(discardQuery);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<DiscardPileEntry, "id">;
      return {
        id: docSnap.id,
        ...data,
      } as DiscardPileEntry;
    });
  }
}
