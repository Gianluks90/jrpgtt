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
import { ItemCatalogService } from "./item-catalog-service";
import { FollowerCatalogService } from "./follower-catalog-service";

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
    private itemCatalogService: ItemCatalogService,
    private followerCatalogService: FollowerCatalogService,
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
        moneyCost: 5,
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
        moneyCost: 5,
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

    if (actionId === "chop-tree") {
      const hasAxeAction = this.hasInventoryAction(player, "chop-tree");
      const isForestBiome = context.biome === "forest";
      if (!hasAxeAction || !isForestBiome) {
        return null;
      }

      return {
        id: "chop-tree",
        label: this.actionCatalogService.getLabel(actionId, "Chop wood"),
        description: this.actionCatalogService.getDescription(actionId, "Use your axe in a forest to gain 1 timber and end your turn."),
        disabled: commonDisabled,
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

    if (actionId === "feed-horse") {
      const foodQty = (player.inventory?.resources ?? []).find((resource) => resource.label === "food")?.quantity ?? 0;
      return {
        id: "feed-horse",
        label: this.actionCatalogService.getLabel(actionId, "Feed horse"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Spend 1 food before moving to gain +1 movement range this turn.",
        ),
        disabled: commonDisabled || context.hasMovedThisTurn || foodQty < 1,
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
        moneyCost: null,
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
        moneyCost: null,
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
        moneyCost: enchantressCost,
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
        moneyCost: mysticCost,
        disabled: commonDisabled || currentMoney < mysticCost,
        pending: false,
      };
    }

    if (actionId === "city-merchant") {
      return {
        id: "city-merchant",
        label: this.actionCatalogService.getLabel(actionId, "Merchant"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Visit the City Merchant. Buy or sell items from a configurable stock. Buying ends your turn.",
        ),
        moneyCost: null,
        disabled: commonDisabled,
        pending: false,
      };
    }

    if (actionId === "academy-merchant") {
      return {
        id: "academy-merchant",
        label: this.actionCatalogService.getLabel(actionId, "Arcane Merchant"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Visit the Academy Merchant. Buy magical stock and sell only magical items. Buying ends your turn.",
        ),
        moneyCost: null,
        disabled: commonDisabled,
        pending: false,
      };
    }

    if (actionId === "capital-inn") {
      const isNight = timeOfDay === "night";
      const innCost = 10;
      return {
        id: "capital-inn",
        label: this.actionCatalogService.getLabel(actionId, "Inn"),
        description: this.actionCatalogService.getDescription(actionId, "Capital: restore 50% HP, spend 10 coins and end turn (day only)."),
        moneyCost: innCost,
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < innCost || isNight,
        pending: false,
      };
    }

    if (actionId === "castle-rest") {
      const restCost = 10;
      return {
        id: "castle-rest",
        label: this.actionCatalogService.getLabel(actionId, "Rest"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Castle: restore 50% HP, spend 10 coins and end turn (day and night).",
        ),
        moneyCost: restCost,
        disabled: commonDisabled || hp.missing <= 0 || currentMoney < restCost,
        pending: false,
      };
    }

    if (actionId === "castle-trainer") {
      const trainingCost = Math.max(1, Math.floor(Number(player.level ?? 1))) * 3;
      return {
        id: "castle-trainer",
        label: this.actionCatalogService.getLabel(actionId, "Trainer"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Train Strength at the Castle. Cost {trainingCost} coins (3 x level), gain +1 permanent STR, end your turn and skip your next one.",
          { trainingCost },
        ),
        moneyCost: trainingCost,
        disabled: commonDisabled || currentMoney < trainingCost,
        pending: false,
      };
    }

    if (actionId === "academy-trainer") {
      const trainingCost = Math.max(1, Math.floor(Number(player.level ?? 1))) * 3;
      return {
        id: "academy-trainer",
        label: this.actionCatalogService.getLabel(actionId, "Trainer"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Train Magic at the Academy. Cost {trainingCost} coins (3 x level), gain +1 permanent MAG, end your turn and skip your next one.",
          { trainingCost },
        ),
        moneyCost: trainingCost,
        disabled: commonDisabled || currentMoney < trainingCost,
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

    if (actionId === "graveyard-resurrect") {
      const hasDeadFollower = this.getDeadFollowersCount(player) > 0;
      return {
        id: "graveyard-resurrect",
        label: this.actionCatalogService.getLabel(actionId, "Resurrect"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Attempt to resurrect a dead follower from your discard pile through a luck check.",
        ),
        disabled: commonDisabled || !hasDeadFollower,
        pending: false,
      };
    }

    if (actionId === "temple-send-devotee") {
      const eligibleFollowers = this.getEligibleTempleFollowersCount(player);
      const alignment = player.alignment ?? "neutral";
      return {
        id: "temple-send-devotee",
        label: this.actionCatalogService.getLabel(actionId, "Send devotee"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Leave an eligible follower at the Temple. Become good, gain 2 XP and end turn.",
        ),
        disabled: commonDisabled || alignment === "good" || eligibleFollowers <= 0,
        pending: false,
      };
    }

    if (actionId === "altar-sacrifice") {
      const eligibleFollowers = this.getEligibleAltarFollowersCount(player);
      const alignment = player.alignment ?? "neutral";
      return {
        id: "altar-sacrifice",
        label: this.actionCatalogService.getLabel(actionId, "Sacrifice"),
        description: this.actionCatalogService.getDescription(
          actionId,
          "Sacrifice an eligible follower at the Altar. Become evil, gain 2 XP and end turn.",
        ),
        disabled: commonDisabled || alignment === "evil" || eligibleFollowers <= 0,
        pending: false,
      };
    }

    if (actionId === "eliminate-zombie") {
      const hasZombie = this.hasActiveZombie(player);
      return {
        id: "eliminate-zombie",
        label: this.actionCatalogService.getLabel(actionId, "Eliminate zombie"),
        description: this.actionCatalogService.getDescription(actionId, "Kill your zombie companion and end turn."),
        disabled: commonDisabled || !hasZombie,
        pending: false,
      };
    }

    // fallback for unknown actions
    return null;
  }

  private getDeadFollowersCount(player: Player): number {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
      return entry.state === "discarded" && entry.discardReason === "dead";
    }).length;
  }

  private getEligibleTempleFollowersCount(player: Player): number {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.state === "discarded") return false;
      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;

      const allyDefinition = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      const category = String(entry.categoryOverride ?? allyDefinition?.category ?? "").trim().toLowerCase();
      if (!category) return false;
      return category !== "animal" && category !== "spirit" && category !== "undead";
    }).length;
  }

  private getEligibleAltarFollowersCount(player: Player): number {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.state === "discarded") return false;
      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;

      const allyDefinition = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      const category = String(entry.categoryOverride ?? allyDefinition?.category ?? "").trim().toLowerCase();
      return category !== "undead";
    }).length;
  }

  private hasActiveZombie(player: Player): boolean {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.state === "discarded") return false;
      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;
      return String(entry.followerId ?? "").trim() === "zombie";
    });
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

  private hasInventoryAction(player: Player, actionId: string): boolean {
    const inventoryItems = player.inventory?.items ?? [];
    return inventoryItems.some((entry) => {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      return Array.isArray(item?.actions) && item.actions.includes(actionId);
    });
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
