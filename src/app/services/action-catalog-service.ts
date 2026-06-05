import { Injectable } from "@angular/core";
import { DEFAULT_ACTIONS_CATALOG_CONFIG } from "../consts/actions-catalog-default";
import {
  ActionCatalogLogDefinition,
  ActionCatalogEntry,
  ActionFlowDialogDefinition,
  ActionCatalogFlowDefinition,
  ActionCatalogI18nKeys,
  ActionCatalogUiDefinition,
  ActionDialogType,
  ActionDescriptionParams,
  ActionFlowHandler,
  ActionFlowTrigger,
  ActionSanctuaryDialogMode,
  ActionValidatorKey,
  ActionsCatalogConfig,
} from "../models/ActionCatalog";
import { TranslationService } from "./translation-service";

@Injectable({
  providedIn: "root",
})
export class ActionCatalogService {
  private readonly actionsConfigUrl = "/configs/actions.config.json";
  private hasLoadedRemoteConfig = false;
  private actionsById = this.toMap(DEFAULT_ACTIONS_CATALOG_CONFIG.actions);

  constructor(private translationService: TranslationService) {}

  public getAction(actionId: string): ActionCatalogEntry | null {
    return this.actionsById[actionId] ?? null;
  }

  public getFlow(actionId: string): ActionCatalogFlowDefinition | null {
    return this.getAction(actionId)?.flow ?? null;
  }

  public hasValidator(actionId: string, validator: ActionValidatorKey): boolean {
    const validators = this.getAction(actionId)?.flow.validators ?? [];
    return validators.includes(validator);
  }

  public getDialog(actionId: string): ActionFlowDialogDefinition | null {
    return this.getAction(actionId)?.flow.dialog ?? null;
  }

  public getLogSourceLabel(actionId: string, fallback: string): string {
    const sourceLabel = this.getAction(actionId)?.log?.sourceLabel;
    if (typeof sourceLabel === "string" && sourceLabel.trim().length > 0) {
      return sourceLabel;
    }

    return fallback;
  }

  public getLabel(actionId: string, fallback: string): string {
    const action = this.getAction(actionId);
    const configured = action?.ui.label;
    const resolvedFallback = typeof configured === "string" && configured.trim().length > 0 ? configured : fallback;

    const labelKey = action?.ui.i18n?.labelKey;
    if (typeof labelKey === "string" && labelKey.trim().length > 0) {
      return this.translationService.tOrFallback(labelKey, resolvedFallback);
    }

    if (typeof configured === "string" && configured.trim().length > 0) {
      return configured;
    }

    return fallback;
  }

  public getDescription(actionId: string, fallbackTemplate: string, params: ActionDescriptionParams = {}): string {
    const action = this.getAction(actionId);
    const configuredTemplate = action?.ui.descriptionTemplate;
    const resolvedFallback = typeof configuredTemplate === "string" && configuredTemplate.trim().length > 0
      ? configuredTemplate
      : fallbackTemplate;

    const descriptionKey = action?.ui.i18n?.descriptionKey;
    const template = typeof descriptionKey === "string" && descriptionKey.trim().length > 0
      ? this.translationService.tOrFallback(descriptionKey, resolvedFallback)
      : resolvedFallback;

    return this.interpolateTemplate(template, params);
  }

  public getWarning(actionId: string, params: ActionDescriptionParams = {}): string | null {
    const action = this.getAction(actionId);
    const configuredTemplate = action?.ui.warningTemplate;
    if (typeof configuredTemplate !== "string" || !configuredTemplate.trim()) {
      return null;
    }

    const warningKey = action?.ui.i18n?.warningKey;
    const template = typeof warningKey === "string" && warningKey.trim().length > 0
      ? this.translationService.tOrFallback(warningKey, configuredTemplate)
      : configuredTemplate;

    return this.interpolateTemplate(template, params);
  }

  public getI18nKeys(actionId: string): ActionCatalogI18nKeys | null {
    return this.getAction(actionId)?.ui.i18n ?? null;
  }

  public async loadConfig(): Promise<void> {
    if (this.hasLoadedRemoteConfig) {
      return;
    }

    const response = await fetch(this.actionsConfigUrl, {
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load action catalog configuration");
    }

    const raw = await response.json() as unknown;
    const parsed = this.parseConfig(raw);
    this.actionsById = this.toMap(parsed.actions);
    this.hasLoadedRemoteConfig = true;
  }

  private parseConfig(raw: unknown): ActionsCatalogConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid action catalog configuration: root object is missing");
    }

    const typedRoot = raw as { actions?: unknown };
    if (!Array.isArray(typedRoot.actions) || typedRoot.actions.length === 0) {
      throw new Error("Invalid action catalog configuration: actions array is missing");
    }

    const actions = typedRoot.actions.map((rawAction, index) => this.parseAction(rawAction, index));
    return { actions };
  }

  private parseAction(raw: unknown, index: number): ActionCatalogEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action at index ${index} is invalid`);
    }

    const typed = raw as {
      id?: unknown;
      ui?: unknown;
      flow?: unknown;
      log?: unknown;
    };

    if (typeof typed.id !== "string" || !typed.id.trim()) {
      throw new Error(`Invalid action catalog configuration: action at index ${index} has invalid id`);
    }

    return {
      id: typed.id,
      ui: this.parseUi(typed.ui, typed.id),
      flow: this.parseFlow(typed.flow, typed.id),
      log: this.parseLog(typed.log, typed.id),
    };
  }

  private parseLog(raw: unknown, actionId: string): ActionCatalogLogDefinition | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid log section`);
    }

    const typed = raw as {
      sourceLabel?: unknown;
    };

    if (typeof typed.sourceLabel !== "undefined" && typeof typed.sourceLabel !== "string") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid log.sourceLabel`);
    }

    return {
      sourceLabel: typed.sourceLabel,
    };
  }

  private parseUi(raw: unknown, actionId: string): ActionCatalogUiDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui section`);
    }

    const typed = raw as {
      label?: unknown;
      descriptionTemplate?: unknown;
      warningTemplate?: unknown;
      i18n?: unknown;
    };

    if (typeof typed.label !== "string" || !typed.label.trim()) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.label`);
    }

    if (typeof typed.descriptionTemplate !== "string" || !typed.descriptionTemplate.trim()) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.descriptionTemplate`);
    }

    if (typeof typed.warningTemplate !== "undefined" && typeof typed.warningTemplate !== "string") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.warningTemplate`);
    }

    return {
      label: typed.label,
      descriptionTemplate: typed.descriptionTemplate,
      warningTemplate: typed.warningTemplate,
      i18n: this.parseI18n(typed.i18n, actionId),
    };
  }

  private parseI18n(raw: unknown, actionId: string): ActionCatalogI18nKeys | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.i18n section`);
    }

    const typed = raw as {
      labelKey?: unknown;
      descriptionKey?: unknown;
      warningKey?: unknown;
    };

    if (typeof typed.labelKey !== "undefined" && typeof typed.labelKey !== "string") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.i18n.labelKey`);
    }

    if (typeof typed.descriptionKey !== "undefined" && typeof typed.descriptionKey !== "string") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.i18n.descriptionKey`);
    }

    if (typeof typed.warningKey !== "undefined" && typeof typed.warningKey !== "string") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid ui.i18n.warningKey`);
    }

    return {
      labelKey: typed.labelKey,
      descriptionKey: typed.descriptionKey,
      warningKey: typed.warningKey,
    };
  }

  private parseFlow(raw: unknown, actionId: string): ActionCatalogFlowDefinition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow section`);
    }

    const typed = raw as {
      handler?: unknown;
      errorMessage?: unknown;
      trigger?: unknown;
      validators?: unknown;
      dialog?: unknown;
      requiresMyTurn?: unknown;
      requiresCanEndTurn?: unknown;
    };

    if (!this.isFlowHandler(typed.handler)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.handler`);
    }

    if (typeof typed.errorMessage !== "string" || !typed.errorMessage.trim()) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.errorMessage`);
    }

    if (typeof typed.trigger !== "undefined" && !this.isFlowTrigger(typed.trigger)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.trigger`);
    }

    const validators = this.parseValidators(typed.validators, actionId);
    const dialog = this.parseDialog(typed.dialog, actionId);

    if (typeof typed.requiresMyTurn !== "undefined" && typeof typed.requiresMyTurn !== "boolean") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.requiresMyTurn`);
    }

    if (typeof typed.requiresCanEndTurn !== "undefined" && typeof typed.requiresCanEndTurn !== "boolean") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.requiresCanEndTurn`);
    }

    return {
      handler: typed.handler,
      errorMessage: typed.errorMessage,
      trigger: typed.trigger,
      validators,
      dialog,
      requiresMyTurn: typed.requiresMyTurn,
      requiresCanEndTurn: typed.requiresCanEndTurn,
    };
  }

  private parseValidators(raw: unknown, actionId: string): ActionValidatorKey[] | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.validators`);
    }

    return raw.map((value, index) => {
      if (!this.isValidatorKey(value)) {
        throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid validator at index ${index}`);
      }

      return value;
    });
  }

  private parseDialog(raw: unknown, actionId: string): ActionFlowDialogDefinition | undefined {
    if (typeof raw === "undefined") {
      return undefined;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.dialog`);
    }

    const typed = raw as {
      type?: unknown;
      sanctuaryMode?: unknown;
      requiredActive?: unknown;
      stockConfigUrl?: unknown;
    };

    if (!this.isDialogType(typed.type)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.dialog.type`);
    }

    if (typeof typed.sanctuaryMode !== "undefined" && !this.isSanctuaryDialogMode(typed.sanctuaryMode)) {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.dialog.sanctuaryMode`);
    }

    if (typeof typed.requiredActive !== "undefined" && typeof typed.requiredActive !== "boolean") {
      throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.dialog.requiredActive`);
    }

    if (typeof typed.stockConfigUrl !== "undefined") {
      if (typeof typed.stockConfigUrl !== "string" || !typed.stockConfigUrl.trim()) {
        throw new Error(`Invalid action catalog configuration: action '${actionId}' has invalid flow.dialog.stockConfigUrl`);
      }
    }

    return {
      type: typed.type,
      sanctuaryMode: typed.sanctuaryMode,
      requiredActive: typed.requiredActive,
      stockConfigUrl: typed.stockConfigUrl,
    };
  }

  private toMap(actions: ActionCatalogEntry[]): Record<string, ActionCatalogEntry> {
    const mapped: Record<string, ActionCatalogEntry> = {};

    for (const action of actions) {
      if (mapped[action.id]) {
        throw new Error(`Invalid action catalog configuration: duplicate action id '${action.id}'`);
      }

      mapped[action.id] = action;
    }

    return mapped;
  }

  private interpolateTemplate(template: string, params: ActionDescriptionParams): string {
    return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_match, token: string) => {
      const value = params[token];
      if (typeof value === "undefined" || value === null) {
        return `{${token}}`;
      }

      return String(value);
    });
  }

  private isFlowHandler(value: unknown): value is ActionFlowHandler {
    return value === "end-turn"
      || value === "sanctuary-activate"
      || value === "sanctuary-donate"
      || value === "sanctuary-pray"
      || value === "biome-cell-gather"
      || value === "biome-chop-tree"
      || value === "biome-consume-ration"
      || value === "follower-feed-horse"
      || value === "landmark-rest"
      || value === "landmark-trainer"
      || value === "safe-place-doctor"
      || value === "safe-place-enchantress"
      || value === "safe-place-mystic"
      || value === "safe-place-merchant"
      || value === "safe-place-inn"
      || value === "safe-place-resource-exchange"
      || value === "safe-place-wait"
      || value === "safe-place-fast-travel"
      || value === "safe-place-camp-gatherer"
        || value === "safe-place-camp-hunter"
        || value === "graveyard-resurrect"
        || value === "temple-send-devotee"
        || value === "altar-sacrifice"
        || value === "follower-eliminate-zombie";
  }

  private isFlowTrigger(value: unknown): value is ActionFlowTrigger {
    return value === "command-panel";
  }

  private isValidatorKey(value: unknown): value is ActionValidatorKey {
    return value === "my-turn"
      || value === "moved-this-turn"
      || value === "not-busy"
      || value === "action-not-used";
  }

  private isDialogType(value: unknown): value is ActionDialogType {
    return value === "none"
      || value === "sanctuary-action"
      || value === "doctor-heal"
      || value === "resource-exchange"
        || value === "safe-place-fast-travel"
        || value === "merchant-trade";
  }

  private isSanctuaryDialogMode(value: unknown): value is ActionSanctuaryDialogMode {
    return value === "activate" || value === "donate";
  }
}