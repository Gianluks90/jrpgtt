export type FollowerState = "active" | "discarded";

export type FollowerDiscardReason = "dead" | "released" | "lost" | "stolen";

export interface PlayerFollowerEntry {
  followerId: string;
  hpCurrent: number;
  nameOverride?: string;
  categoryOverride?: string;
  state?: FollowerState;
  discardReason?: FollowerDiscardReason;
  discardedAtTurn?: number;
}
