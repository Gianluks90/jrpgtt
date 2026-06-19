import { Component, computed, input, output, signal } from "@angular/core";
import { ItemDefinition } from "@models/catalog/ItemCatalog";
import { PlayerFollowerEntry } from "@models/player/Follower";
import { InventoryItemEntry } from "@models/player/Inventory";
import { Player } from "@models/player/Player";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../../../consts/gameplay/inventory-config";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { TranslationService } from "@services/shared/translation-service";
import { AlignmentIndicator } from "../../ui/alignment-indicator/alignment-indicator";
import { AttunementIndicator } from "../../ui/attunement-indicator/attunement-indicator";
import { IconButton } from "../../ui/icon-button/icon-button";
import { MoneyCounter } from "../../ui/money-counter/money-counter";
import { ResourceCounter } from "../../ui/resource-counter/resource-counter";

@Component({
  selector: "app-map-player-utilities-panel",
  standalone: true,
  imports: [
    AlignmentIndicator,
    AttunementIndicator,
    IconButton,
    MoneyCounter,
    ResourceCounter,
    TranslationPipe,
  ],
  templateUrl: "./map-player-utilities-panel.html",
  styleUrl: "./map-player-utilities-panel.scss",
})
export class MapPlayerUtilitiesPanel {
  constructor(
    private itemCatalogService: ItemCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private translationService: TranslationService,
  ) {}

  public player = input<Player | null>(null);

  public resourcePanelClicked = output<void>();

  private utilitiesExpandedPanel = signal<"inventory" | "followers">("inventory");

  public resourceCount = computed<number>(() => {
    const resources = this.player()?.inventory?.resources ?? [];
    return resources.reduce((total, resource) => {
      return total + Math.max(0, Math.floor(Number(resource.quantity ?? 0)));
    }, 0);
  });

  public resourceCapacity = computed<number>(() => {
    const configured = this.player()?.inventory?.resourceCapacity;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured));
    }

    return DEFAULT_RESOURCE_INVENTORY_CAPACITY;
  });

  public visibleInventoryItems = computed<Array<{
    itemId: string;
    name: string;
    sellValue: number | null;
    description: string;
    occupiesSpace: boolean;
    uses: {
      current: number;
      max: number;
      slots: boolean[];
    } | null;
    labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }>;
  }>>(() => {
    const items = this.normalizeInventoryItems(this.player()?.inventory?.items);
    return items.map((entry) => {
      const definition = this.itemCatalogService.getCachedItemById(entry.itemId);
      const sellValue = definition ? this.itemCatalogService.getSellValue(definition) : 0;
      const labels = definition ? this.buildInventoryLabels(definition) : [];
      const uses = definition ? this.buildInventoryUses(entry, definition) : null;
      return {
        itemId: entry.itemId,
        name: definition ? this.itemCatalogService.getLocalizedName(definition) : entry.itemId,
        sellValue: sellValue > 0 ? sellValue : null,
        description: (definition ? this.itemCatalogService.getLocalizedDescription(definition).trim() : "")
          || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
        occupiesSpace: definition?.occupiesSpace === true,
        uses,
        labels,
      };
    });
  });

  public visibleInventoryOccupiedSlots = computed<number>(() => {
    return this.visibleInventoryItems().reduce((total, item) => {
      return total + (item.occupiesSpace ? 1 : 0);
    }, 0);
  });

  public visibleInventoryCapacity = computed<number>(() => {
    const configured = this.player()?.inventory?.itemCapacity;
    const followersBonus = this.getFollowersItemCapacityBonus(this.player()?.followers);
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.max(1, Math.floor(configured)) + followersBonus;
    }

    return 4 + followersBonus;
  });

  public visibleFollowers = computed<Array<{
    followerId: string;
    name: string;
    description: string;
    hpCurrent: number;
    hpMax: number;
    hpPercent: number;
    labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }>;
  }>>(() => {
    const followers = this.normalizePlayerFollowers(this.player()?.followers);
    return followers
      .filter((entry) => entry.state !== "discarded")
      .map((entry) => {
        const definition = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const hpMax = typeof definition?.maxHp === "number" ? Math.max(1, Math.floor(definition.maxHp)) : 1;
        const hpCurrent = Math.max(0, Math.min(hpMax, Math.floor(Number(entry.hpCurrent ?? 0))));
        return {
          followerId: entry.followerId,
          name: entry.nameOverride ?? (definition ? this.followerCatalogService.getLocalizedName(definition) : entry.followerId),
          description: (definition ? this.followerCatalogService.getLocalizedDescription(definition).trim() : "")
            || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
          hpCurrent,
          hpMax,
          hpPercent: Math.max(0, Math.min(100, Math.floor((hpCurrent / hpMax) * 100))),
          labels: [
            ...(definition ? this.buildFollowerLabels(definition.parameterModifiers ?? []) : []),
          ],
        };
      });
  });

  public discardedFollowersCount = computed<number>(() => {
    return this.normalizePlayerFollowers(this.player()?.followers)
      .filter((entry) => entry.state === "discarded")
      .length;
  });

  public collapsedInventorySummary = computed<string>(() => {
    const names = this.visibleInventoryItems().map((item) => item.name.trim()).filter((name) => name.length > 0);
    if (names.length === 0) {
      return this.translationService.tOrFallback("map.inventory.none", "no items");
    }

    return names.join(", ");
  });

  public collapsedFollowersSummary = computed<string>(() => {
    const names = this.visibleFollowers().map((follower) => follower.name.trim()).filter((name) => name.length > 0);
    if (names.length === 0) {
      return this.translationService.tOrFallback("map.followers.none", "no followers");
    }

    return names.join(", ");
  });

  public isInventoryExpanded(): boolean {
    return this.utilitiesExpandedPanel() === "inventory";
  }

  public isFollowersExpanded(): boolean {
    return this.utilitiesExpandedPanel() === "followers";
  }

  public onInventoryPanelToggle(): void {
    this.utilitiesExpandedPanel.set("inventory");
  }

  public onFollowersPanelToggle(): void {
    this.utilitiesExpandedPanel.set("followers");
  }

  public onResourcePanelClicked(): void {
    this.resourcePanelClicked.emit();
  }

  private normalizeInventoryItems(rawItems: unknown): InventoryItemEntry[] {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const items: InventoryItemEntry[] = [];
    rawItems.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        items.push({ itemId: entry.trim() });
        return;
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const itemId = (entry as { itemId?: unknown }).itemId;
      if (typeof itemId !== "string" || !itemId.trim()) {
        return;
      }

      const rawCurrentCharges = (entry as { currentCharges?: unknown }).currentCharges;
      const currentCharges = typeof rawCurrentCharges === "number" && Number.isFinite(rawCurrentCharges)
        ? Math.max(0, Math.floor(rawCurrentCharges))
        : undefined;

      items.push({
        itemId: itemId.trim(),
        ...(typeof currentCharges === "number" ? { currentCharges } : {}),
      });
    });

    return items;
  }

  private normalizePlayerFollowers(rawFollowers: unknown): PlayerFollowerEntry[] {
    if (!Array.isArray(rawFollowers)) {
      return [];
    }

    const followers: PlayerFollowerEntry[] = [];
    rawFollowers.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const followerId = (entry as { followerId?: unknown }).followerId;
      if (typeof followerId !== "string" || !followerId.trim()) {
        return;
      }

      const hpCurrent = Math.max(0, Math.floor(Number((entry as { hpCurrent?: unknown }).hpCurrent ?? 0)));
      const state = (entry as { state?: unknown }).state === "discarded" ? "discarded" : "active";

      const rawNameOverride = (entry as { nameOverride?: unknown }).nameOverride;
      const nameOverride = typeof rawNameOverride === "string" && rawNameOverride.trim().length > 0
        ? rawNameOverride.trim()
        : undefined;

      const rawCategoryOverride = (entry as { categoryOverride?: unknown }).categoryOverride;
      const categoryOverride = typeof rawCategoryOverride === "string" && rawCategoryOverride.trim().length > 0
        ? rawCategoryOverride.trim().toLowerCase()
        : undefined;

      followers.push({
        followerId: followerId.trim(),
        hpCurrent,
        state,
        ...(nameOverride ? { nameOverride } : {}),
        ...(categoryOverride ? { categoryOverride } : {}),
      });
    });

    return followers;
  }

  private buildInventoryLabels(item: ItemDefinition): Array<{
    text: string;
    tone: "neutral" | "positive" | "negative";
  }> {
    const labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }> = [];

    if (item.occupiesSpace !== true) {
      labels.push({
        text: this.translationService.tOrFallback("map.labels.little", "little"),
        tone: "neutral",
      });
    }

    const scopeLabels = this.buildModifierScopeLabels(item.parameterModifiers ?? []);
    scopeLabels.forEach((scopeLabel) => {
      labels.push({
        text: scopeLabel,
        tone: "neutral",
      });
    });

    const parameterModifiers = item.parameterModifiers ?? [];
    parameterModifiers.forEach((modifier) => {
      const sign = modifier.amount >= 0 ? "+" : "";
      const parameterLabel = modifier.parameter === "strength"
        ? this.translationService.tOrFallback("playerCard.stats.strengthAbbr", "FRZ")
        : modifier.parameter === "magic"
          ? this.translationService.tOrFallback("playerCard.stats.magicAbbr", "MAG")
          : this.translationService.tOrFallback("playerCard.stats.luckAbbr", "FOR");
      labels.push({
        text: `${sign}${modifier.amount} ${parameterLabel}`,
        tone: modifier.amount >= 0 ? "positive" : "negative",
      });
    });

    return labels;
  }

  private buildInventoryUses(entry: InventoryItemEntry, item: ItemDefinition): {
    current: number;
    max: number;
    slots: boolean[];
  } | null {
    const maxCharges = typeof item.maxCharges === "number" && Number.isFinite(item.maxCharges)
      ? Math.max(1, Math.floor(item.maxCharges))
      : null;
    if (!maxCharges) {
      return null;
    }

    const rawCurrentCharges = Number(entry.currentCharges);
    const currentCharges = Number.isFinite(rawCurrentCharges)
      ? Math.max(0, Math.min(maxCharges, Math.floor(rawCurrentCharges)))
      : maxCharges;

    return {
      current: currentCharges,
      max: maxCharges,
      slots: Array.from({ length: maxCharges }, (_value, index) => index < currentCharges),
    };
  }

  private buildFollowerLabels(modifiers: Array<{
    parameter: "strength" | "magic" | "luck";
    amount: number;
    scopes: Array<"always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only">;
  }>): Array<{
    text: string;
    tone: "neutral" | "positive" | "negative";
  }> {
    const labels: Array<{
      text: string;
      tone: "neutral" | "positive" | "negative";
    }> = [];

    const scopeLabels = this.buildModifierScopeLabels(modifiers);
    scopeLabels.forEach((scopeLabel) => {
      labels.push({
        text: scopeLabel,
        tone: "neutral",
      });
    });

    modifiers.forEach((modifier) => {
      const sign = modifier.amount >= 0 ? "+" : "";
      const parameterLabel = modifier.parameter === "strength"
        ? this.translationService.tOrFallback("playerCard.stats.strengthAbbr", "FRZ")
        : modifier.parameter === "magic"
          ? this.translationService.tOrFallback("playerCard.stats.magicAbbr", "MAG")
          : this.translationService.tOrFallback("playerCard.stats.luckAbbr", "FOR");

      labels.push({
        text: `${sign}${modifier.amount} ${parameterLabel}`,
        tone: modifier.amount >= 0 ? "positive" : "negative",
      });
    });

    return labels;
  }

  private buildModifierScopeLabels(modifiers: Array<{
    scopes: Array<"always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only">;
  }>): string[] {
    const labels = new Set<string>();

    modifiers.forEach((modifier) => {
      const scopes = modifier.scopes ?? [];
      scopes.forEach((scope) => {
        if (scope === "always") return;
        if (scope === "fight-only") {
          labels.add(this.translationService.tOrFallback("map.labels.fightOnly", "fight only"));
          return;
        }
        if (scope === "day-only") {
          labels.add(this.translationService.tOrFallback("map.labels.dayOnly", "day only"));
          return;
        }
        labels.add(this.translationService.tOrFallback("map.labels.nightOnly", "night only"));
      });
    });

    return Array.from(labels);
  }

  private getFollowersItemCapacityBonus(rawFollowers: unknown): number {
    const followers = this.normalizePlayerFollowers(rawFollowers);
    return followers.reduce((total, entry) => {
      if (entry.state === "discarded") {
        return total;
      }

      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) {
        return total;
      }

      const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      if (!follower) {
        return total;
      }

      const itemCapacityBonus = Number(follower.itemCapacityBonus ?? 0);
      if (!Number.isFinite(itemCapacityBonus)) {
        return total;
      }

      return total + Math.max(0, Math.floor(itemCapacityBonus));
    }, 0);
  }
}
