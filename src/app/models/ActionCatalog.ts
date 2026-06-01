export type ActionFlowHandler =
  | "end-turn"
  | "sanctuary-activate"
  | "sanctuary-donate"
  | "sanctuary-pray"
  | "biome-cell-gather"
  | "biome-consume-ration"
  | "safe-place-doctor"
  | "safe-place-enchantress"
  | "safe-place-inn"
  | "safe-place-resource-exchange"
  | "safe-place-wait"
  | "safe-place-fast-travel"
  | "safe-place-camp-gatherer"
  | "safe-place-camp-hunter";

export type ActionFlowTrigger = "command-panel";

export type ActionDialogType = "none" | "sanctuary-action" | "doctor-heal" | "resource-exchange" | "safe-place-fast-travel";

export type ActionSanctuaryDialogMode = "activate" | "donate";

export type ActionValidatorKey =
  | "my-turn"
  | "moved-this-turn"
  | "not-busy"
  | "action-not-used";

export interface ActionCatalogI18nKeys {
  labelKey?: string;
  descriptionKey?: string;
  warningKey?: string;
}

export interface ActionCatalogUiDefinition {
  label: string;
  descriptionTemplate: string;
  warningTemplate?: string;
  i18n?: ActionCatalogI18nKeys;
}

export interface ActionCatalogLogDefinition {
  sourceLabel?: string;
}

export interface ActionFlowDialogDefinition {
  type: ActionDialogType;
  sanctuaryMode?: ActionSanctuaryDialogMode;
  requiredActive?: boolean;
}

export interface ActionCatalogFlowDefinition {
  handler: ActionFlowHandler;
  errorMessage: string;
  trigger?: ActionFlowTrigger;
  validators?: ActionValidatorKey[];
  dialog?: ActionFlowDialogDefinition;
  requiresMyTurn?: boolean;
  requiresCanEndTurn?: boolean;
}

export interface ActionCatalogEntry {
  id: string;
  ui: ActionCatalogUiDefinition;
  flow: ActionCatalogFlowDefinition;
  log?: ActionCatalogLogDefinition;
}

export interface ActionsCatalogConfig {
  actions: ActionCatalogEntry[];
}

export type ActionDescriptionParams = Record<string, string | number | boolean | null | undefined>;