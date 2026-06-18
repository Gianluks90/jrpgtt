import { Timestamp } from "firebase/firestore";

export type CardEntityKind = "follower" | "item" | "spell" | "tile" | "event" | "exploration" | (string & {});

export interface CardEntityRef {
  kind: CardEntityKind;
  cardId: string;
  name?: string;
  payload?: Record<string, unknown>;
}

export interface DiscardPileEntry {
  id: string;
  card: CardEntityRef;
  source: "player" | "map" | "world" | "system" | (string & {});
  ownerPlayerId?: string;
  turn: number;
  discardedAt: Timestamp;
  discardSeq: number;
  reason?: "dead" | (string & {});
  batchId?: string;
  recoveredAt?: Timestamp;
}
