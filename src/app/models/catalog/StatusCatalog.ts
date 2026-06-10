export interface StatusI18nKeys {
  labelKey?: string;
  descriptionKey?: string;
}

export interface StatusStatModifiers {
  strength?: number;
  magic?: number;
  luck?: number;
}

export interface StatusEffectsDefinition {
  turnEndHpPercentDelta?: number;
  skipTurns?: number;
  disableMpNaturalRegen?: boolean;
  disableSpellCasting?: boolean;
  luckBonusMultiplier?: number;
  setPrimaryStatsTo?: number;
  disableHpRecovery?: boolean;
  disableMpRecovery?: boolean;
  disableItemUse?: boolean;
  statModifiers?: StatusStatModifiers;
}

export interface StatusDefinition {
  key: string;
  label: string;
  description: string;
  defaultDurationTurns: number;
  iconUrl?: string;
  i18n?: StatusI18nKeys;
  effects?: StatusEffectsDefinition;
  effectKey?: string;
}

export interface StatusesCatalogConfig {
  statuses: StatusDefinition[];
}
