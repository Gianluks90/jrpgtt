import { Injectable } from "@angular/core";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";
import { CommandPanelAction } from "../components/ui/commands-panel/commands-panel";
import { ResourceLabel } from "../models/Resource";
import { TimeOfDay } from "../models/WorldState";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { getDoctorCostPerUnit, isDoctorActionId } from "../consts/safe-place-actions";

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
  public buildActionCard(actionId: string, context: ActionCardContext): CommandPanelAction | null {
    const { isBusy, hasMoney, isMyTurn, hasMovedThisTurn, sanctuaryLabel, player, cell, timeOfDay } = context;
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    const worldTurn = context.worldTurn ?? 0;
    const actionAlreadyUsed = actionsUsed[actionId] === worldTurn;
    const hp = this.getHpState(player);
    const currentMoney = Math.max(0, Math.floor(Number(player.inventory?.money ?? 0)));
    const commonDisabled = !isMyTurn || !hasMovedThisTurn || isBusy || actionAlreadyUsed;

    if (actionId === "activate-sanctuary") {
      return {
        id: "activate-sanctuary",
        label: "Activate",
        description: `Donate 5 coins to activate ${sanctuaryLabel ?? "the shrine"}, gain 2 XP and attune to its element.`,
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || !hasMoney || actionAlreadyUsed,
        pending: false,
      };
    }

    if (actionId === "donate-sanctuary") {
      const canDonate = !!player.attunedElement && player.attunedElement !== cell.sanctuaryElement;
      return {
        id: "donate-sanctuary",
        label: "Donate",
        description: `Donate 5 coins to shift your attunement to ${sanctuaryLabel ?? "the shrine"}.`,
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || !hasMoney || !canDonate || actionAlreadyUsed,
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
        label: "Pray",
        description: "Recover 5% HP, or 15% on lucky prayer.",
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || !canPray || !hasMissingHp || actionAlreadyUsed,
        pending: false,
      };
    }

    if (actionId === "cell-gather") {
      const availableResources = context.biomeResourceLabels ?? [];
      const foodQty = (player.inventory?.resources ?? []).find((resource) => resource.label === "food")?.quantity ?? 0;
      return {
        id: "cell-gather",
        label: "Gather",
        description: "Spend 1 food to gather 1 biome resource and end your turn.",
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || availableResources.length === 0 || foodQty < 1 || actionAlreadyUsed || context.hasPendingResourcePickup === true,
        pending: false,
      };
    }

    if (actionId === "consume-ration") {
      const foodQty = (player.inventory?.resources ?? []).find((resource) => resource.label === "food")?.quantity ?? 0;
      const hasNutrition = (player.statuses ?? []).some((status) => status.key === "nutrition" && status.durationTurns > 0);
      return {
        id: "consume-ration",
        label: "Consume ration",
        description: "Spend 1 food to gain Nutrition until end of turn and ignore hostile desert damage.",
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || foodQty < 1 || hasNutrition || actionAlreadyUsed,
        pending: false,
      };
    }

    if (isDoctorActionId(actionId)) {
      const costPerUnit = getDoctorCostPerUnit(actionId, timeOfDay);
      const label = actionId === "capital-doctor" ? "Doctor" : "Healer";
      const descriptionTarget = actionId === "capital-doctor" ? "Capital" : "City";

      return {
        id: actionId,
        label,
        description: `${descriptionTarget}: restore 5% HP per treatment. Cost ${costPerUnit} coins each (${timeOfDay}), then end turn.`,
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < costPerUnit,
        pending: false,
      };
    }

    if (actionId === "capital-inn") {
      const isNight = timeOfDay === "night";
      return {
        id: "capital-inn",
        label: "Inn",
        description: "Capital: restore 50% HP, spend 10 coins and end turn (day only).",
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < 10 || isNight,
        pending: false,
      };
    }

    if (actionId === "village-craftsman") {
      const hasTradableResources = this.hasTradableResources(player);
      return {
        id: "village-craftsman",
        label: "Craftsman",
        description: "Village: exchange resources 1:1, then end turn.",
        disabled: commonDisabled || !hasTradableResources,
        pending: false,
      };
    }

    if (actionId === "camp-gatherer") {
      const hasCapacity = this.hasFreeCapacityFor(player, 2);
      return {
        id: "camp-gatherer",
        label: "Gatherer",
        description: "Camp: gain 1 timber and 1 minerals, then end turn.",
        disabled: commonDisabled || !hasCapacity,
        pending: false,
      };
    }

    if (actionId === "camp-hunter") {
      const hasCapacity = this.hasFreeCapacityFor(player, 2);
      return {
        id: "camp-hunter",
        label: "Hunter",
        description: "Camp: gain 1 food and 1 cloth, then end turn.",
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

  private hasFreeCapacityFor(player: Player, neededAmount: number): boolean {
    const resources = player.inventory?.resources ?? [];
    const total = resources.reduce((sum, resource) => {
      return sum + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }, 0);

    const configuredCapacity = player.inventory?.resourceCapacity;
    const capacity = typeof configuredCapacity === "number" && Number.isFinite(configuredCapacity)
      ? Math.max(1, Math.floor(configuredCapacity))
      : DEFAULT_RESOURCE_INVENTORY_CAPACITY;

    return total + neededAmount <= capacity;
  }
}
