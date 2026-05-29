import { Injectable } from "@angular/core";
import { CommandPanelAction } from "../components/ui/commands-panel/commands-panel";
import { ActionRegistryService } from "./action-registry-service";
import { MapCell, SanctuaryElement } from "../models/MapCell";
import { Player } from "../models/Player";
import { TilesConfig } from "../models/TilesConfig";
import { ResourceLabel } from "../models/Resource";
import { WorldState } from "../models/WorldState";
import { LandmarksService } from "./landmarks-service";
import { ActionCatalogService } from "./action-catalog-service";

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
  private readonly sanctuaryDonationCost = 5;

  constructor(
    private actionRegistry: ActionRegistryService,
    private landmarksService: LandmarksService,
    private actionCatalogService: ActionCatalogService,
  ) {}

  public buildCommandActions(input: BuildCommandActionsInput): CommandPanelAction[] {
    const actions: CommandPanelAction[] = [];
    const endTurnReason = input.player?.pendingResourcePickup
      ? "Resolve pending resource pickup before ending your turn."
      : input.hasMovedOnCurrentTurn
        ? "Pass control to the next player."
        : "Move at least once before ending your turn.";

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

  private collectPositionActions(input: BuildCommandActionsInput): CommandPanelAction[] {
    const player = input.player;
    if (!player) return [];

    const cell = input.mapCellsById[this.cellId(player.location.x, player.location.y)] ?? null;
    if (!cell) return [];

    const isBusy = input.pendingActionId !== null;
    const hasMoney = (player.inventory?.money ?? 0) >= this.sanctuaryDonationCost;
    const worldTurn = input.worldState?.currentTurn ?? 0;
    const isSanctuaryCell = cell.isSpecial === true && cell.specialType === "sanctuary" && !!cell.sanctuaryElement;
    const isSafeLandmarkCell = cell.isSpecial === true && cell.specialType === "landmark" && cell.landmarkCategory === "safe";
    const actionIds = isSanctuaryCell
      ? this.getConfiguredSanctuaryActionIds(cell, input.tilesConfig)
      : isSafeLandmarkCell
        ? this.getConfiguredSafeLandmarkActionIds(cell)
        : this.getConfiguredBiomeActionIds(cell, input.tilesConfig);
    const biomeResources = cell.biome ? (input.biomeResourcesByBiome[cell.biome] ?? []) : [];
    const sanctuaryLabel = isSanctuaryCell && cell.sanctuaryElement
      ? this.sanctuaryElementToLabel(cell.sanctuaryElement)
      : undefined;

    return actionIds
      .map((actionId) => {
        const card = this.actionRegistry.buildActionCard(actionId, {
          isBusy,
          hasMoney,
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

  private getConfiguredSafeLandmarkActionIds(cell: MapCell): string[] {
    if (cell.specialType !== "landmark" || cell.landmarkCategory !== "safe" || !cell.landmarkId) {
      return [];
    }

    return this.landmarksService.getSafePlaceActionIds(cell.landmarkId);
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
      ? ["donate-sanctuary", "pray-sanctuary"]
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

  private sanctuaryElementToLabel(element: SanctuaryElement): string {
    if (element === "water") return "Water Shrine";
    if (element === "fire") return "Fire Shrine";
    if (element === "wind") return "Wind Shrine";
    return "Earth Shrine";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}
