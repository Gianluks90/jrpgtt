export type ModifiablePlayerCharacteristic = "strength" | "magic" | "luck";

export interface PlayerCharacteristicDelta {
  characteristic: ModifiablePlayerCharacteristic;
  amount: number;
  source: string;
  reason: string;
}

export interface PlayerComputedStats {
  effective: Record<ModifiablePlayerCharacteristic, number>;
  delta: Record<ModifiablePlayerCharacteristic, number>;
  appliedDeltas: PlayerCharacteristicDelta[];
}
