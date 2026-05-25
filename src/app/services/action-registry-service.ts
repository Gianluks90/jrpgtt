import { Injectable } from "@angular/core";
import { Player } from "../models/Player";
import { BiomeType, MapCell } from "../models/MapCell";
import { CommandPanelAction } from "../components/ui/commands-panel/commands-panel";
import { ResourceLabel } from "../models/Resource";

export interface ActionCardContext {
  isBusy: boolean;
  hasMoney: boolean;
  isMyTurn: boolean;
  hasMovedThisTurn: boolean;
  sanctuaryLabel?: string;
  player: Player;
  cell: MapCell;
  worldTurn: number;
  biome?: BiomeType;
  biomeResourceLabels?: ResourceLabel[];
}

@Injectable({ providedIn: "root" })
export class ActionRegistryService {
  public buildActionCard(actionId: string, context: ActionCardContext): CommandPanelAction | null {
    const { isBusy, hasMoney, isMyTurn, hasMovedThisTurn, sanctuaryLabel, player, cell } = context;
    const actionsUsed = player.actionsUsedThisTurn ?? {};
    const worldTurn = context.worldTurn ?? 0;
    const actionAlreadyUsed = actionsUsed[actionId] === worldTurn;

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
      return {
        id: "cell-gather",
        label: "Gather",
        description: "Attempt a lucky gather. On success, collect 1 resource and end your turn.",
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || availableResources.length === 0 || actionAlreadyUsed,
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

    // fallback for unknown actions
    return null;
  }
}
