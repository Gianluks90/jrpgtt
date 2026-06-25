export type ChaosEffectType = "apply-status" | "steal-coins" | "drain-mp";

export interface ChaosEffectDefinition {
  id: string;
  weight: number;
  label: string;
  labelKey?: string;
  effectType: ChaosEffectType;
  statusKey?: string;
  durationTurns?: number;
  amount?: number;
}

export interface ChaosEffectsConfig {
  effects: ChaosEffectDefinition[];
}

export interface ChaosEffectDialogRow {
  id: string;
  weightLabel: string;
  effectLabel: string;
}
