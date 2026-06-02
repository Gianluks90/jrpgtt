import { Injectable } from "@angular/core";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";
import { CommandPanelAction } from "../components/ui/commands-panel/commands-panel";
import { ResourceLabel } from "../models/Resource";
import { TimeOfDay } from "../models/WorldState";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { getDoctorCostPerUnit, isDoctorActionId } from "../consts/safe-place-actions";
import { ActionCatalogService } from "./action-catalog-service";
import { BiomeConditionCatalogService } from "./biome-condition-catalog-service";

export interface ActionCardContext {
  isBusy: boolean;
  hasMoney: boolean;
  isMyTurn: boolean;
  hasMovedThisTurn: boolean;
  sanctuaryLabel?: string;
  player: Player;
  cell: MapCell;
  worldTurn: number;
  timeOfDay: TimeOfDay;
  biome?: BiomeType;
  biomeResourceLabels?: ResourceLabel[];
  hasPendingResourcePickup?: boolean;
}

@Injectable({ providedIn: "root" })
export class ActionRegistryService {
  constructor(
    private actionCatalogService: ActionCatalogService,
    private biomeConditionCatalogService: BiomeConditionCatalogService,
  ) {}

  public buildActionCard(actionId: string, context: ActionCardContext): CommandPanelAction | null {
    const { isBusy, hasMoney, isMyTurn, hasMovedThisTurn, sanctuaryLabel, player, cell, timeOfDay } = context;
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    const worldTurn = context.worldTurn ?? 0;
    const actionAlreadyUsed = actionsUsed[actionId] === worldTurn;
    const hp = this.getHpState(player);
    const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
    const commonDisabled = this.isCommonValidatorDisabled(actionId, context, actionAlreadyUsed);

    if (actionId === "activate-sanctuary") {
      return {
        id: "activate-sanctuary",
        label: this.actionCatalogService.getLabel(actionId, "Activate"),
        description: this.actionCatalogService.getDescription(
          actionId,
          `Donate 5 coins to activate ${sanctuaryLabel ?? "the shrine"}, gain 2 XP and attune to its element.`,
          {
            sanctuaryLabel: sanctuaryLabel ?? "the shrine",
          },
        ),
        disabled: commonDisabled || !hasMoney,
        pending: false,
      };
    }

    if (actionId === "donate-sanctuary") {
      const canDonate = !!player.attunedElement && player.attunedElement !== cell.sanctuaryElement;
      return {
        id: "donate-sanctuary",
        label: this.actionCatalogService.getLabel(actionId, "Donate"),
        description: this.actionCatalogService.getDescription(
          actionId,
          `Donate 5 coins to shift your attunement to ${sanctuaryLabel ?? "the shrine"}.`,
          {
            sanctuaryLabel: sanctuaryLabel ?? "the shrine",
          },
        ),
        disabled: commonDisabled || !hasMoney || !canDonate,
        pending: false,
      };
    }

    if (actionId === "pray-sanctuary") {
      const canPray = !!player.attunedElement && player.attunedElement === cell.sanctuaryElement;
      const hpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current)));
      const hpMax = Math.max(
        1,
        Math.floor(Number(typeof player.parameters.hp.max === "number" ? player.parameters.hp.max : player.parameters.hp.base)),
      );
      const hasMissingHp = hpCurrent < hpMax;
      return {
        id: "pray-sanctuary",
        label: this.actionCatalogService.getLabel(actionId, "Pray"),
        description: this.actionCatalogService.getDescription(actionId, "Recover 5% HP, or 15% on lucky prayer."),
        disabled: commonDisabled || !canPray || !hasMissingHp,
        pending: false,
      };
    }

    if (actionId === "cell-gather") {
      const availableResources = context.biomeResourceLabels ?? [];
      const foodQty = (player.inventory?.resources ?? []).find((resource) => resource.label === "food")?.quantity ?? 0;
      return {
        id: "cell-gather",
        label: this.actionCatalogService.getLabel(actionId, "Gather"),
        description: this.actionCatalogService.getDescription(actionId, "Spend 1 food to gather 1 biome resource and end your turn."),
        disabled: commonDisabled || availableResources.length === 0 || foodQty < 1 || context.hasPendingResourcePickup === true,
        pending: false,
      };
    }

    if (actionId === "consume-ration") {
      const foodQty = (player.inventory?.resources ?? []).find((resource) => resource.label === "food")?.quantity ?? 0;
      const hostileEnvironmentCondition = this.biomeConditionCatalogService.getCachedCondition("hostile-environment");
      const protectionStatusKey = hostileEnvironmentCondition?.effect?.blockedByStatusKey;
      const hasProtectionStatus = typeof protectionStatusKey === "string"
        && (player.statuses ?? []).some((status) => status.key === protectionStatusKey && status.durationTurns > 0);
      return {
        id: "consume-ration",
        label: this.actionCatalogService.getLabel(actionId, "Consume ration"),
        description: this.actionCatalogService.getDescription(actionId, "Spend 1 food to gain Nutrition until end of turn and ignore hostile desert damage."),
        disabled: commonDisabled || foodQty < 1 || hasProtectionStatus,
        pending: false,
      };
    }

    if (actionId === "safe-place-wait") {
      return {
        id: "safe-place-wait",
        label: this.actionCatalogService.getLabel(actionId, "Wait"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Safe place: simulate movement on your current cell and end the turn without cost.",
        ),
        disabled: commonDisabled,
        pending: false,
      };
    }

    if (actionId === "fast-travel") {
      return {
        id: "fast-travel",
        label: this.actionCatalogService.getLabel(actionId, "Fast travel"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Safe place: travel to a discovered safe place. Cost 1 coin per orthogonal cell (max 15), then end turn and skip your next turn.",
        ),
        disabled: commonDisabled,
        pending: false,
      };
    }

    if (isDoctorActionId(actionId)) {
      const costPerUnit = getDoctorCostPerUnit(actionId, timeOfDay);
      const descriptionTarget = actionId === "capital-doctor" ? "Capital" : "City";
      const fallbackLabel = actionId === "capital-doctor" ? "Doctor" : "Healer";

      return {
        id: actionId,
        label: this.actionCatalogService.getLabel(actionId, fallbackLabel),
        description: this.actionCatalogService.getDescription(
          actionId,
          `${descriptionTarget}: restore 5% HP per treatment. Cost ${costPerUnit} coins each (${timeOfDay}), then end turn.`,
          {
            costPerUnit,
            timeOfDay,
          },
        ),
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < costPerUnit,
        pending: false,
      };
    }

    if (actionId === "capital-enchantress") {
      const enchantressCost = 5;
      return {
        id: "capital-enchantress",
        label: this.actionCatalogService.getLabel(actionId, "Enchantress"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Consult the Capital Enchantress for 5 coins. Draw your fate from a luck check, then end your turn.",
        ),
        disabled: commonDisabled || currentMoney < enchantressCost,
        pending: false,
      };
    }

    if (actionId === "city-mystic") {
      const mysticCost = 5;
      return {
        id: "city-mystic",
        label: this.actionCatalogService.getLabel(actionId, "Mystic"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Consult the City Mystic for 5 coins. Draw your fate from a luck check, then end your turn.",
        ),
        disabled: commonDisabled || currentMoney < mysticCost,
        pending: false,
      };
    }

    if (actionId === "capital-inn") {
      const isNight = timeOfDay === "night";
      return {
        id: "capital-inn",
        label: this.actionCatalogService.getLabel(actionId, "Inn"),
        description: this.actionCatalogService.getDescription(actionId, "Capital: restore 50% HP, spend 10 coins and end turn (day only)."),
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < 10 || isNight,
        pending: false,
      };
    }

    if (actionId === "village-craftsman") {
      const hasTradableResources = this.hasTradableResources(player);
      return {
        id: "village-craftsman",
        label: this.actionCatalogService.getLabel(actionId, "Craftsman"),
        description: this.actionCatalogService.getDescription(actionId, "Village: exchange resources 1:1, then end turn."),
        disabled: commonDisabled || !hasTradableResources,
        pending: false,
      };
    }

    if (actionId === "camp-gatherer") {
      const requiredSlots = 2;
      const availableSlots = this.getFreeResourceSlots(player);
      const hasCapacity = availableSlots >= requiredSlots;
      const capacityWarning = !commonDisabled && !hasCapacity
        ? this.actionCatalogService.getWarning(actionId, {
          requiredSlots,
          availableSlots,
        }) ?? undefined
        : undefined;
      return {
        id: "camp-gatherer",
        label: this.actionCatalogService.getLabel(actionId, "Gatherer"),
        description: this.actionCatalogService.getDescription(actionId, "Camp: gain 1 timber and 1 minerals, then end turn."),
        warning: capacityWarning,
        disabled: commonDisabled || !hasCapacity,
        pending: false,
      };
    }

    if (actionId === "camp-hunter") {
      const requiredSlots = 2;
      const availableSlots = this.getFreeResourceSlots(player);
      const hasCapacity = availableSlots >= requiredSlots;
      const capacityWarning = !commonDisabled && !hasCapacity
        ? this.actionCatalogService.getWarning(actionId, {
          requiredSlots,
          availableSlots,
        }) ?? undefined
        : undefined;
      return {
        id: "camp-hunter",
        label: this.actionCatalogService.getLabel(actionId, "Hunter"),
        description: this.actionCatalogService.getDescription(actionId, "Camp: gain 1 food and 1 cloth, then end turn."),
        warning: capacityWarning,
        disabled: commonDisabled || !hasCapacity,
        pending: false,
      };
    }

    // fallback for unknown actions
    return null;
  }

  private getHpState(player: Player): { current: number; max: number; missing: number } {
    const current = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));
    const max = Math.max(
      1,
      Math.floor(Number(
        typeof player.parameters.hp.max === "number"
          ? player.parameters.hp.max
          : player.parameters.hp.base,
      )),
    );

    return {
      current,
      max,
      missing: Math.max(0, max - current),
    };
  }

  private hasTradableResources(player: Player): boolean {
    const resources = player.inventory?.resources ?? [];
    return resources.some((resource) => Math.max(0, Math.floor(Number(resource.quantity ?? 0))) > 0);
  }

  private getFreeResourceSlots(player: Player): number {
    const resources = player.inventory?.resources ?? [];
    const total = resources.reduce((sum, resource) => {
      return sum + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }, 0);

    const configuredCapacity = player.inventory?.resourceCapacity;
    const capacity = typeof configuredCapacity === "number" && Number.isFinite(configuredCapacity)
      ? Math.max(1, Math.floor(configuredCapacity))
      : DEFAULT_RESOURCE_INVENTORY_CAPACITY;

    return Math.max(0, capacity - total);
  }

  private isCommonValidatorDisabled(
    actionId: string,
    context: ActionCardContext,
    actionAlreadyUsed: boolean,
  ): boolean {
    const requiresMyTurn = this.actionCatalogService.hasValidator(actionId, "my-turn");
    const requiresMovedThisTurn = this.actionCatalogService.hasValidator(actionId, "moved-this-turn");
    const requiresNotBusy = this.actionCatalogService.hasValidator(actionId, "not-busy");
    const requiresActionNotUsed = this.actionCatalogService.hasValidator(actionId, "action-not-used");

    return (requiresMyTurn && !context.isMyTurn)
      || (requiresMovedThisTurn && !context.hasMovedThisTurn)
      || (requiresNotBusy && context.isBusy)
      || (requiresActionNotUsed && actionAlreadyUsed);
  }
}
