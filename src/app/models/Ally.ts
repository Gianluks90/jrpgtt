export type AllyState = "active" | "discarded";

export type AllyDiscardReason = "dead" | "released" | "lost" | "stolen";

export interface PlayerAllyEntry {
  allyId: string;
  hpCurrent: number;
  state?: AllyState;
  discardReason?: AllyDiscardReason;
  discardedAtTurn?: number;
}
