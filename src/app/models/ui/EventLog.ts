import { Timestamp } from "firebase/firestore";

export type EventLogCode =
  | "system.info"
  | "player.move"
  | "player.discoverBiome"
  | "player.worldEventTriggered"
  | "player.worldEventMutationSummary"
  | "player.discoverEnvironment"
  | "player.expandEnvironment"
  | "player.enterSanctuary"
  | "player.discoverLandmark"
  | "player.reachLandmark"
  | "player.gainExperience"
  | "player.endTurn"
  | "player.activateSanctuary"
  | "player.donateSanctuary"
  | "player.praySanctuary"
  | "player.cellGather"
  | "player.chopTree"
  | "player.consumeRation"
  | "player.safePlaceWait"
  | "player.capitalEnchantress"
  | "player.cityMystic"
  | "player.merchantBuy"
  | "player.merchantSell"
  | "player.fastTravelBooked"
  | "player.hostileEnvironmentDamage"
  | "player.regeneratingWatersHealing"
  | "player.followerHostileEnvironmentDamage"
  | "player.followerRegeneratingWatersHealing"
  | "player.discardResource"
  | "player.pendingPickupCancelled"
  | "player.swapResource"
  | "player.resolvePendingPickup"
  | "player.castSpellDiagonal"
  | "player.combatResult";

export interface EventLog {
  id: string;
  playerId: string;
  playerName: string;
  code: EventLogCode | (string & {});
  args: Record<string, unknown>;
  message: string;
  createdAt: Timestamp;
}
