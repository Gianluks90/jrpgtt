import { Timestamp } from "firebase/firestore";

export type EventLogCode =
  | "system.info"
  | "player.move"
  | "player.discoverBiome"
  | "player.discoverEnvironment"
  | "player.expandEnvironment"
  | "player.enterSanctuary"
  | "player.discoverLandmark"
  | "player.gainExperience"
  | "player.endTurn"
  | "player.activateSanctuary"
  | "player.donateSanctuary"
  | "player.praySanctuary"
  | "player.cellGather"
  | "player.consumeRation"
  | "player.safePlaceWait"
  | "player.fastTravelBooked"
  | "player.hostileEnvironmentDamage"
  | "player.regeneratingWatersHealing"
  | "player.discardResource"
  | "player.pendingPickupCancelled"
  | "player.swapResource"
  | "player.resolvePendingPickup";

export interface EventLog {
  id: string;
  playerId: string;
  playerName: string;
  code: EventLogCode | (string & {});
  args: Record<string, unknown>;
  message: string;
  createdAt: Timestamp;
}
