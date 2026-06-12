import { Injectable } from "@angular/core";
import { CommandPanelAction } from "../../components/ui/commands-panel/commands-panel";
import { ActionRegistryService } from "@services/gameplay/action-registry-service";
import { MapCell, SanctuaryElement } from "@models/world/MapCell";
import { Player } from "@models/player/Player";
import { TilesConfig } from "@models/world/TilesConfig";
import { ResourceLabel } from "@models/world/Resource";
import { WorldState } from "@models/world/WorldState";
import { LandmarksService } from "@services/map/landmarks-service";
import { ActionCatalogService } from "@services/catalog/action-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { TranslationService } from "@services/shared/translation-service";
import { SpellCatalogService } from "@services/catalog/spell-catalog-service";
import { PlayerSpellEntry } from "@models/player/Spellbook";

interface BuildCommandActionsInput {
  player: Player | null;
  mapCellsById: Record<string, MapCell>;
  tilesConfig: TilesConfig | null;
  biomeResourcesByBiome: Record<string, ResourceLabel[]>;
  worldState: WorldState | null;
  isMyTurn: boolean;
  hasMovedOnCurrentTurn: boolean;
  canEndTurn: boolean;
  pendingActionId: string | null;
}

@Injectable({
  providedIn: "root",
})
export class MapPageActionsService {
  private readonly sanctuaryActivationMpCost = 3;
  private readonly sanctuaryDonationCost = 5;

  constructor(
    private actionRegistry: ActionRegistryService,
    private landmarksService: LandmarksService,
    private actionCatalogService: ActionCatalogService,
    private itemCatalogService: ItemCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private translationService: TranslationService,
    private spellCatalogService: SpellCatalogService,
  ) {}

  public buildCommandActions(input: BuildCommandActionsInput): CommandPanelAction[] {
    const actions: CommandPanelAction[] = [];
    const endTurnReason = input.player?.pendingResourcePickup
      ? this.translationService.tOrFallback(
        "mapPage.endTurn.reason.pendingResourcePickup",
        "Resolve pending resource pickup before ending your turn.",
      )
      : input.hasMovedOnCurrentTurn
        ? this.translationService.tOrFallback(
          "mapPage.endTurn.reason.passControl",
          "Pass control to the next player.",
        )
        : this.translationService.tOrFallback(
          "mapPage.endTurn.reason.moveBeforeEnd",
          "Move at least once before ending your turn.",
        );

    actions.push({
      id: "end-turn",
      label: this.actionCatalogService.getLabel("end-turn", "End turn"),
      description: this.actionCatalogService.getDescription("end-turn", endTurnReason, {
        reason: endTurnReason,
      }),
      disabled: !input.canEndTurn,
      pending: input.pendingActionId === "end-turn",
    });

    return [...actions, ...this.collectPositionActions(input)];
  }

  public buildSpellActions(input: BuildCommandActionsInput): CommandPanelAction[] {
    const player = input.player;
    if (!player) {
      return [];
    }

    const worldTurn = Math.max(0, Math.floor(Number(input.worldState?.currentTurn ?? 0)));
    const isBusy = input.pendingActionId !== null;
    const currentMp = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
    const magicValue = Math.max(0, Math.floor(Number(player.parameters?.magic?.current ?? player.parameters?.magic?.base ?? 0)));
    const knownSpells = this.normalizePlayerSpellEntries(player.spellbook?.spells);

    return knownSpells
      .map((entry) => {
        const spell = this.spellCatalogService.getSpell(entry.spellId);
        if (!spell) {
          return null;
        }

        const scalar = this.spellCatalogService.computeEffectScalar(spell, magicValue);
        const description = this.spellCatalogService.getLocalizedDescription(spell)
          .replaceAll("{range}", String(scalar))
          .replaceAll("{healing}", String(scalar))
          .replaceAll("{duration}", String(scalar));

        const blockedUntilTurn = Math.max(0, Math.floor(Number(entry.blockedUntilTurn ?? 0)));
        const isCoolingDown = blockedUntilTurn > worldTurn;
        const cooldownTurnsLeft = isCoolingDown ? blockedUntilTurn - worldTurn : 0;

        let warning: string | undefined;
        if (!input.isMyTurn && spell.timing === "my-turn") {
          warning = this.translationService.tOrFallback("map.spells.warning.notMyTurn", "Available only during your turn.");
        } else if (isCoolingDown) {
          warning = this.translationService.tOrFallback("map.spells.warning.cooldown", "On cooldown for {turns} more turns.", {
            turns: cooldownTurnsLeft,
          });
        } else if (currentMp < spell.mpCost) {
          warning = this.translationService.tOrFallback("map.spells.warning.notEnoughMp", "Not enough MP.");
        }

        const disabled = isBusy
          || (spell.timing === "my-turn" && !input.isMyTurn)
          || isCoolingDown
          || currentMp < spell.mpCost
          || !!player.pendingResourcePickup;

        return {
          id: spell.id,
          label: this.spellCatalogService.getLocalizedName(spell),
          description,
          warning,
          magicCost: spell.mpCost,
          disabled,
          pending: input.pendingActionId === spell.id,
        } as CommandPanelAction;
      })
      .filter((action): action is CommandPanelAction => action !== null);
  }

  private collectPositionActions(input: BuildCommandActionsInput): CommandPanelAction[] {
    const player = input.player;
    if (!player) return [];

    const cell = input.mapCellsById[this.cellId(player.location.x, player.location.y)] ?? null;
    if (!cell) return [];

    const isBusy = input.pendingActionId !== null;
    const hasMoney = (player.inventory?.money ?? 0) >= this.sanctuaryDonationCost;
    const hasMagic = (player.parameters?.mp?.current ?? 0) >= this.sanctuaryActivationMpCost;
    const worldTurn = input.worldState?.currentTurn ?? 0;
    const isSanctuaryCell = cell.specialType === "sanctuary" && !!cell.sanctuaryElement;
    const landmarkActionIds = this.getConfiguredLandmarkActionIds(cell);
    const configuredActionIds = isSanctuaryCell
      ? this.getConfiguredSanctuaryActionIds(cell, input.tilesConfig)
      : landmarkActionIds.length > 0
        ? landmarkActionIds
        : this.getConfiguredBiomeActionIds(cell, input.tilesConfig);
    const inventoryActionIds = this.getInventoryActionIds(player);
    const allyActionIds = this.getFollowerActionIds(player);
    const actionIds = [...new Set([...configuredActionIds, ...inventoryActionIds, ...allyActionIds])];
    const biomeResources = cell.biome ? (input.biomeResourcesByBiome[cell.biome] ?? []) : [];
    const sanctuaryLabel = isSanctuaryCell && cell.sanctuaryElement
      ? this.sanctuaryElementToLabel(cell.sanctuaryElement)
      : undefined;

    return actionIds
      .map((actionId) => {
        const card = this.actionRegistry.buildActionCard(actionId, {
          isBusy,
          hasMoney,
          hasMagic,
          isMyTurn: input.isMyTurn,
          hasMovedThisTurn: input.hasMovedOnCurrentTurn,
          sanctuaryLabel,
          player,
          cell,
          worldTurn,
          timeOfDay: input.worldState?.timeOfDay ?? "day",
          biome: cell.biome,
          biomeResourceLabels: biomeResources,
          hasPendingResourcePickup: !!player.pendingResourcePickup,
        });

        if (!card) return null;

        return {
          ...card,
          pending: input.pendingActionId === card.id,
        } as CommandPanelAction;
      })
      .filter((action) => action !== null) as CommandPanelAction[];
  }

  private getConfiguredLandmarkActionIds(cell: MapCell): string[] {
    return this.landmarksService.getLandmarkActionIdsForCell(cell);
  }

  private getConfiguredBiomeActionIds(cell: MapCell, tilesConfig: TilesConfig | null): string[] {
    if (cell.isSpecial === true || !cell.biome) {
      return [];
    }

    if (!tilesConfig) {
      return [];
    }

    return tilesConfig.biomes[cell.biome]?.actions ?? [];
  }

  private getConfiguredSanctuaryActionIds(cell: MapCell, tilesConfig: TilesConfig | null): string[] {
    if (!cell.sanctuaryElement) {
      return [];
    }

    const fallbackActionIds = cell.active === true
      ? ["sanctuary"]
      : ["activate-sanctuary"];

    if (!tilesConfig) {
      return fallbackActionIds;
    }

    const sanctuaryConfig = tilesConfig.specialTiles.sanctuaries[cell.sanctuaryElement];
    if (!sanctuaryConfig?.actions) {
      return fallbackActionIds;
    }

    return cell.active === true ? sanctuaryConfig.actions.active : sanctuaryConfig.actions.inactive;
  }

  private getInventoryActionIds(player: Player): string[] {
    const inventoryItems = player.inventory?.items ?? [];
    const actionIds: string[] = [];

    inventoryItems.forEach((entry) => {
      const item = this.itemCatalogService.getCachedItemById(entry.itemId);
      if (!item?.actions?.length) {
        return;
      }

      item.actions.forEach((actionId) => {
        if (typeof actionId === "string" && actionId.trim().length > 0) {
          actionIds.push(actionId);
        }
      });
    });

    return actionIds;
  }

  private getFollowerActionIds(player: Player): string[] {
    const actionIds: string[] = [];
    const followers = Array.isArray(player.followers) ? player.followers : [];

    followers.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.state === "discarded") return;
      if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return;

      const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
      if (!follower?.actions?.length) {
        return;
      }

      follower.actions.forEach((actionId) => {
        if (typeof actionId === "string" && actionId.trim().length > 0) {
          actionIds.push(actionId);
        }
      });
    });

    return actionIds;
  }

  private sanctuaryElementToLabel(element: SanctuaryElement): string {
    if (element === "water") {
      return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
    }

    if (element === "fire") {
      return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
    }

    if (element === "wind") {
      return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
    }

    return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private normalizePlayerSpellEntries(rawEntries: unknown): PlayerSpellEntry[] {
    if (!Array.isArray(rawEntries)) {
      return [];
    }

    const normalized: PlayerSpellEntry[] = [];
    const seen = new Set<string>();

    rawEntries.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const typedEntry = entry as PlayerSpellEntry;
      if (typeof typedEntry.spellId !== "string" || typedEntry.spellId.trim().length === 0) {
        return;
      }

      const spellId = typedEntry.spellId.trim();
      if (seen.has(spellId)) {
        return;
      }

      normalized.push({
        spellId,
        ...(typeof typedEntry.source === "string" ? { source: typedEntry.source } : {}),
        ...(typeof typedEntry.blockedUntilTurn === "number" ? { blockedUntilTurn: Math.max(0, Math.floor(typedEntry.blockedUntilTurn)) } : {}),
        ...(typeof typedEntry.occupiesSlot === "boolean" ? { occupiesSlot: typedEntry.occupiesSlot } : {}),
        ...(typeof typedEntry.grantedBySanctuaryElement === "string" ? { grantedBySanctuaryElement: typedEntry.grantedBySanctuaryElement } : {}),
      });

      seen.add(spellId);
    });

    return normalized;
  }
}
