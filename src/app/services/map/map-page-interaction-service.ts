import { Injectable, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { firstValueFrom, take } from "rxjs";
import {
  DIALOGS_CONFIG,
  DOCTOR_HEAL_DIALOG_CONFIG,
  ENCHANTRESS_DIALOG_CONFIG,
  FAST_TRAVEL_DIALOG_CONFIG,
  ITEM_SWAP_DIALOG_CONFIG,
  MERCHANT_DIALOG_CONFIG,
  RESOURCE_INVENTORY_DIALOG_CONFIG,
  RESOURCE_EXCHANGE_DIALOG_CONFIG,
  SPELL_CAST_DIALOG_CONFIG,
  VARIABLE_REWARD_DIALOG_CONFIG,
} from "../../consts/ui/dialog-configs";
import {
  SpellCastConfirmDialog,
  SpellCastConfirmDialogData,
} from "../../components/dialogs/action-dialogs/spell-cast-confirm-dialog/spell-cast-confirm-dialog";
import {
  PlayerSelectDialog,
  PlayerSelectDialogData,
  PlayerSelectDialogResult,
} from "../../components/dialogs/action-dialogs/player-select-dialog/player-select-dialog";
import {
  SpellSelectDialog,
  SpellSelectDialogData,
  SpellSelectDialogResult,
} from "../../components/dialogs/action-dialogs/spell-select-dialog/spell-select-dialog";
import {
  SelfSelectDialog,
  SelfSelectDialogData,
  SelfSelectDialogResult,
} from "../../components/dialogs/action-dialogs/self-select-dialog/self-select-dialog";
import { GameEventsLogDialog } from "../../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { MapService } from "@services/map/map-service";
import { ActionExecutorService } from "@services/gameplay/action-executor-service";
import { PlayerProgressionService } from "@services/player/player-progression-service";
import { BiomeType, MapCell, SanctuaryElement } from "@models/world/MapCell";
import { Player } from "@models/player/Player";
import { WorldState } from "@models/world/WorldState";
import { MapGridPanelCell } from "../../components/core/map-grid-panel/map-grid-panel";
import {
  ResourceInventoryDialog,
  ResourceInventoryDialogResult,
} from "../../components/dialogs/action-dialogs/resource-inventory-dialog/resource-inventory-dialog";
import { ResourceLabel } from "@models/world/Resource";
import {
  SanctuaryActionDialog,
  SanctuaryActionDialogData,
} from "../../components/dialogs/action-dialogs/sanctuary-action-dialog/sanctuary-action-dialog";
import {
  DoctorHealDialog,
  DoctorHealDialogData,
  DoctorHealDialogResult,
} from "../../components/dialogs/action-dialogs/doctor-heal-dialog/doctor-heal-dialog";
import {
  ResourceExchangeDialog,
  ResourceExchangeDialogData,
  ResourceExchangeDialogResult,
} from "../../components/dialogs/action-dialogs/resource-exchange-dialog/resource-exchange-dialog";
import {
  EnchantressDialog,
  EnchantressDialogData,
} from "../../components/dialogs/action-dialogs/enchantress-dialog/enchantress-dialog";
import {
  MysticDialog,
  MysticDialogData,
} from "../../components/dialogs/action-dialogs/mystic-dialog/mystic-dialog";
import {
  MerchantDialog,
  MerchantDialogData,
} from "../../components/dialogs/action-dialogs/merchant-dialog/merchant-dialog";
import {
  FastTravelDialog,
  FastTravelDialogData,
  FastTravelDialogResult,
} from "../../components/dialogs/action-dialogs/fast-travel-dialog/fast-travel-dialog";
import {
  FollowerSelectDialog,
  FollowerSelectDialogData,
} from "../../components/dialogs/action-dialogs/follower-select-dialog/follower-select-dialog";
import {
  GraveyardResurrectResultDialog,
  GraveyardResurrectResultDialogData,
} from "../../components/dialogs/action-dialogs/graveyard-resurrect-result-dialog/graveyard-resurrect-result-dialog";
import {
  ActionCatalogFlowDefinition,
  ActionFlowDialogDefinition,
  ActionFlowHandler,
} from "@models/catalog/ActionCatalog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { EventLog } from "@models/ui/EventLog";
import { isDoctorActionId, SafePlaceDoctorActionId } from "../../consts/gameplay/safe-place-actions";
import { ActionCatalogService } from "@services/catalog/action-catalog-service";
import { EnchantressRewardsConfigService } from "@services/catalog/enchantress-rewards-config-service";
import { AcademySpellUpgradeConfigService } from "@services/catalog/academy-spell-upgrade-config-service";
import {
  AcademySpellUpgraderDialog,
  AcademySpellUpgraderDialogData,
} from "../../components/dialogs/action-dialogs/academy-spell-upgrader-dialog/academy-spell-upgrader-dialog";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { FollowerUpgradeService } from "@services/catalog/follower-upgrade-service";
import { MerchantCatalogService } from "@services/catalog/merchant-catalog-service";
import { MerchantTradeOffersService } from "@services/player/merchant-trade-offers-service";
import { MysticRewardsConfigService } from "@services/catalog/mystic-rewards-config-service";
import { SafePlaceFastTravelService } from "@services/map/safe-place-fast-travel-service";
import { GraveyardResurrectRewardsConfigService } from "@services/catalog/graveyard-resurrect-rewards-config-service";
import {
  GenericConfirmDialog,
  GenericConfirmDialogData,
} from "../../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { WorldEventRegionTransitionService } from "@services/map/world-event-region-transition-service";
import { ExplorationEventService } from "@services/exploration/exploration-event-service";
import { LocationInfoDialog } from "../../components/dialogs/location-info-dialog/location-info-dialog";
import { SanctuaryTilesConfigEntry, TilesConfig } from "@models/world/TilesConfig";
import { DiscardPileDialog } from "../../components/dialogs/discard-pile-dialog/discard-pile-dialog";
import { DiscardPileEntry } from "@models/runtime/DiscardPile";
import { TranslationService } from "@services/shared/translation-service";
import {
  ItemSwapDialog,
  ItemSwapDialogData,
  ItemSwapDialogResult,
} from "../../components/dialogs/action-dialogs/item-swap-dialog/item-swap-dialog";
import { ActionRegistryService } from "@services/gameplay/action-registry-service";
import { CommandPanelAction } from "../../components/ui/commands-panel/commands-panel";
import { SpellCatalogService } from "@services/catalog/spell-catalog-service";
import { MapCellSelectionService } from "@services/map/map-cell-selection-service";
import { EnvironmentService } from "@services/map/environment-service";
import { SpellTeleportTargetOption } from "../../components/dialogs/action-dialogs/spell-teleport-dialog/spell-teleport-dialog";
import {
  WorldEventHelpDialog,
  WorldEventHelpDialogData,
  WorldEventHelpDialogRow,
  WorldEventHelpBiome,
} from "../../components/dialogs/world-event-help-dialog/world-event-help-dialog";
import {
  ChaosDialog,
  ChaosDialogData,
} from "../../components/dialogs/action-dialogs/chaos-dialog/chaos-dialog";
import { ChaosEffectsConfigService } from "@services/catalog/chaos-effects-config-service";

interface HandleCommandActionInput {
  actionId: string;
  gameId: string;
  myPlayer: Player | null;
  isMyTurn: boolean;
  canEndTurn: boolean;
  worldState: WorldState | null;
  mapCellsById: Record<string, MapCell>;
}

interface HandleSpellActionInput {
  spellId: string;
  gameId: string;
  myPlayer: Player | null;
  isMyTurn: boolean;
  worldState: WorldState | null;
  mapCellsById: Record<string, MapCell>;
  mapSize: number;
  allPlayers: Player[];
}

@Injectable({
  providedIn: "root",
})
export class MapPageInteractionService {
  public pendingActionId = signal<string | null>(null);
  public inventoryDialogOpen = signal(false);
  public isOpeningLevelUp = signal(false);

  constructor(
    private dialog: Dialog,
    private mapService: MapService,
    private actionExecutorService: ActionExecutorService,
    private playerProgressionService: PlayerProgressionService,
    private actionCatalogService: ActionCatalogService,
    private enchantressRewardsConfigService: EnchantressRewardsConfigService,
    private itemCatalogService: ItemCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private followerUpgradeService: FollowerUpgradeService,
    private merchantCatalogService: MerchantCatalogService,
    private merchantTradeOffersService: MerchantTradeOffersService,
    private mysticRewardsConfigService: MysticRewardsConfigService,
    private safePlaceFastTravelService: SafePlaceFastTravelService,
    private graveyardResurrectRewardsConfigService: GraveyardResurrectRewardsConfigService,
    private worldEventRegionTransitionService: WorldEventRegionTransitionService,
    private translationService: TranslationService,
    private actionRegistryService: ActionRegistryService,
    private spellCatalogService: SpellCatalogService,
    private explorationEventService: ExplorationEventService,
    private academySpellUpgradeConfigService: AcademySpellUpgradeConfigService,
    private cellSelectionService: MapCellSelectionService,
    private environmentService: EnvironmentService,
    private chaosEffectsConfigService: ChaosEffectsConfigService,
  ) {}

  public resetUiState(): void {
    this.pendingActionId.set(null);
    this.inventoryDialogOpen.set(false);
    this.isOpeningLevelUp.set(false);
  }

  public async acknowledgeRequiredActionNotification(gameId: string, player: Player | null): Promise<void> {
    if (!gameId || !player) return;

    try {
      await this.actionExecutorService.acknowledgeRequiredActionNotification(gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to confirm required action notification");
    }
  }

  public async forceContinueRequiredActionNotification(gameId: string, player: Player | null): Promise<void> {
    if (!gameId || !player) return;

    try {
      await this.actionExecutorService.forceContinueRequiredActionNotification(gameId, {
        id: player.id,
        name: player.name,
      });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to force continue required action notification");
    }
  }

  public async clearRequiredActionNotification(gameId: string, notificationId: string): Promise<void> {
    if (!gameId || !notificationId.trim()) return;

    try {
      await this.actionExecutorService.clearRequiredActionNotification(gameId, notificationId);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to clear required action notification");
    }
  }

  public async counterSpell(gameId: string, player: Player | null): Promise<void> {
    if (!gameId || !player) return;

    try {
      await this.actionExecutorService.counterSpell(gameId, { id: player.id, name: player.name });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while countering spell.");
    }
  }

  public async acceptPendingSpellEffect(gameId: string, player: Player | null): Promise<void> {
    if (!gameId || !player) return;

    try {
      await this.actionExecutorService.acceptPendingSpellEffect(gameId, { id: player.id, name: player.name });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while accepting spell effect.");
    }
  }

  public openLogsDialog(logs: EventLog[]): void {
    this.dialog.open(GameEventsLogDialog, {
      ...DIALOGS_CONFIG,
      data: {
        logs,
      },
    }).closed.pipe(take(1)).subscribe();
  }

  public openWorldEventHelpDialog(input: {
    worldState: WorldState | null;
    mapCellsById: Record<string, MapCell>;
  }): void {
    const worldEvent = input.worldState?.worldEvent;
    const eventTriggered = worldEvent?.emitted === true;
    const flow = worldEvent?.flow;
    const driverBiomeLabel = worldEvent?.driverBiome
      ? this.translationService.tOrFallback(`map.biomes.${worldEvent.driverBiome}`, worldEvent.driverBiome)
      : "-";
    const targetBiomeLabel = worldEvent?.targetBiome
      ? this.translationService.tOrFallback(`map.biomes.${worldEvent.targetBiome}`, worldEvent.targetBiome)
      : "-";
    const pendingMutations = flow?.pendingMutationsByCellId ?? {};
    const appliedMutations = flow?.appliedMutationsByCellId ?? {};
    const sourceMutations = Object.keys(pendingMutations).length > 0 ? pendingMutations : appliedMutations;

    const rows: WorldEventHelpDialogRow[] = Object.entries(sourceMutations)
      .map(([cellId, mutation]) => {
        const [xRaw, yRaw] = cellId.split("_");
        const x = Math.max(0, Math.floor(Number(xRaw ?? 0)));
        const y = Math.max(0, Math.floor(Number(yRaw ?? 0)));
        const mapCell = input.mapCellsById[cellId] ?? null;

        const originalBiome = (mutation.worldEventOriginalBiome ?? mapCell?.worldEventOriginalBiome ?? mapCell?.biome ?? mutation.biome) as WorldEventHelpBiome;
        const mutatedBiome = mutation.biome as WorldEventHelpBiome;

        const changes: string[] = [];
        if (originalBiome !== mutatedBiome) {
          changes.push(this.translationService.tOrFallback(
            "dialogs.worldEventHelp.change.biomeOverride",
            "Biome overridden: {fromBiome} -> {toBiome}",
            {
              fromBiome: this.translationService.tOrFallback(`map.biomes.${originalBiome}`, originalBiome),
              toBiome: this.translationService.tOrFallback(`map.biomes.${mutatedBiome}`, mutatedBiome),
            },
          ));
        }

        const conditionIds = Array.isArray(mutation.worldEventConditionIds)
          ? mutation.worldEventConditionIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          : [];
        if (conditionIds.length > 0) {
          const conditionLabels = conditionIds
            .map((conditionId) => this.translationService.tOrFallback(
              `map.cellInspector.conditionLabel.${conditionId}`,
              conditionId,
            ))
            .join(", ");
          changes.push(this.translationService.tOrFallback(
            "dialogs.worldEventHelp.change.conditions",
            "Applied conditions: {conditions}",
            { conditions: conditionLabels },
          ));
        }

        const enemyBonus = Math.max(0, Math.floor(Number(mutation.worldEventEnemyLevelBonus ?? 0)));
        if (enemyBonus > 0) {
          changes.push(this.translationService.tOrFallback(
            "dialogs.worldEventHelp.change.enemyLevel",
            "Enemy level bonus: +{amount}",
            { amount: enemyBonus },
          ));
        }

        return {
          x,
          y,
          cellLabel: this.translationService.tOrFallback(
            "dialogs.worldEventHelp.cellLabel",
            "Cell ({x}, {y})",
            { x: x + 1, y: y + 1 },
          ),
          originalBiome,
          originalBiomeLabel: this.translationService.tOrFallback(`map.biomes.${originalBiome}`, originalBiome),
          mutatedBiome,
          mutatedBiomeLabel: this.translationService.tOrFallback(`map.biomes.${mutatedBiome}`, mutatedBiome),
          changes,
        };
      })
      .sort((left, right) => {
        if (left.y !== right.y) {
          return left.y - right.y;
        }
        return left.x - right.x;
      })
      .map(({ x: _x, y: _y, ...row }) => row);

    const data: WorldEventHelpDialogData = {
      title: this.translationService.tOrFallback("dialogs.worldEventHelp.title", "World Event Details"),
      subtitle: eventTriggered && worldEvent?.driverBiome && worldEvent?.targetBiome
        ? this.translationService.tOrFallback(
          "dialogs.worldEventHelp.subtitle",
          "The world event has concluded with the following results. The most widespread biome on the map was {target}, influenced by the energy of {driver}. In the list below you can see each change that was applied.",
          { driver: driverBiomeLabel, target: targetBiomeLabel },
        )
        : "",
      waitingMessage: eventTriggered
        ? this.translationService.tOrFallback("dialogs.worldEventHelp.noChanges", "No mutations are currently available.")
        : this.translationService.tOrFallback(
          "dialogs.worldEventHelp.waiting",
          "World event not triggered yet. Waiting for someone to enter Region II.",
        ),
      noRowsMessage: this.translationService.tOrFallback("dialogs.worldEventHelp.noChanges", "No changes detected."),
      changesTitle: this.translationService.tOrFallback("dialogs.worldEventHelp.changesTitle", "Changes:"),
      closeLabel: this.translationService.tOrFallback("dialogs.common.close", "Close"),
      rows,
    };

    this.dialog.open(WorldEventHelpDialog, {
      ...DIALOGS_CONFIG,
      maxWidth: "760px",
      data,
    }).closed.pipe(take(1)).subscribe();
  }

  public openLocationInfoDialog(input: {
    title: string;
    inspectedCell: MapGridPanelCell | null;
    activePlayer: Player | null;
    worldState: WorldState | null;
    players: Player[];
    mapCellsById: Record<string, MapCell>;
    mapSize: number;
    tilesConfig: TilesConfig | null;
    environmentByCellId: Record<string, string[]>;
    biomeResourcesByBiome: Partial<Record<BiomeType, ResourceLabel[]>>;
    sanctuaryStylesByElement: Partial<Record<SanctuaryElement, SanctuaryTilesConfigEntry>>;
  }): void {
    this.dialog.open(LocationInfoDialog, {
      ...DIALOGS_CONFIG,
      data: {
        title: input.title,
        inspectedCell: input.inspectedCell,
        activePlayer: input.activePlayer,
        worldState: input.worldState,
        players: input.players,
        mapCellsById: input.mapCellsById,
        mapSize: input.mapSize,
        tilesConfig: input.tilesConfig,
        environmentByCellId: input.environmentByCellId,
        biomeResourcesByBiome: input.biomeResourcesByBiome,
        sanctuaryStylesByElement: input.sanctuaryStylesByElement,
      },
    }).closed.pipe(take(1)).subscribe();
  }

  public openDiscardPileDialog(entries: DiscardPileEntry[]): void {
    this.dialog.open(DiscardPileDialog, {
      ...DIALOGS_CONFIG,
      data: {
        entries,
      },
    }).closed.pipe(take(1)).subscribe();
  }

  public async handleCellClick(input: {
    gameId: string;
    cell: MapGridPanelCell;
    myPlayer: Player | null;
    isMyTurn: boolean;
    movableCellIds: Set<string>;
    worldState: WorldState | null;
    mapSize: number;
  }): Promise<void> {
    const { gameId, cell, myPlayer, isMyTurn, movableCellIds } = input;
    if (!myPlayer || !isMyTurn || this.pendingActionId() !== null) return;
    if (!movableCellIds.has(cell.id)) return;

    const requiresCrossingConfirm = this.worldEventRegionTransitionService.shouldConfirmCrossingFromRegionIToII({
      player: myPlayer,
      targetX: cell.x,
      mapSize: input.mapSize,
      worldState: input.worldState,
    });

    if (requiresCrossingConfirm) {
      const confirmed = await this.openGenericConfirmDialog({
        title: this.translationService.tOrFallback("map.interaction.regionCrossing.title", "Entering Region II"),
        message: this.translationService.tOrFallback(
          "map.interaction.regionCrossing.message",
          "Crossing this border may trigger a world event. Do you want to proceed?",
        ),
        confirmText: this.translationService.tOrFallback("map.interaction.regionCrossing.confirm", "Proceed"),
        cancelText: this.translationService.tOrFallback("map.interaction.regionCrossing.cancel", "Stay"),
      });
      if (!confirmed) return;
    }

    try {
      const landedCell = await this.mapService.movePlayer(gameId, myPlayer.id, cell.x, cell.y);
      if (
        landedCell
        && input.worldState
        && (landedCell.explorationEvents?.length ?? 0) > 0
      ) {
        await this.explorationEventService.handleCellArrival({
          gameId,
          player: myPlayer,
          cell: landedCell,
          worldState: input.worldState,
          mapSize: input.mapSize,
        });
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("map.interaction.errors.movePlayer", "Error while moving player"));
    }
  }

  public async handleCommandAction(input: HandleCommandActionInput): Promise<void> {
    const flow = this.actionCatalogService.getFlow(input.actionId);
    if (!flow) {
      window.alert(`Action '${input.actionId}' is not implemented yet.`);
      return;
    }

    const trigger = flow.trigger ?? "command-panel";
    if (trigger !== "command-panel") {
      window.alert(`Action '${input.actionId}' is not configured for command panel trigger.`);
      return;
    }

    if (flow.requiresMyTurn && (!input.myPlayer || !input.isMyTurn)) {
      return;
    }

    if (flow.requiresCanEndTurn && !input.canEndTurn) {
      return;
    }

    await this.executeCommandActionFlow(flow, input);
  }

  public async handleSpellAction(input: HandleSpellActionInput): Promise<void> {
    const player = input.myPlayer;
    if (!player || !input.isMyTurn) {
      return;
    }

    if (this.pendingActionId() !== null) {
      return;
    }

    await this.spellCatalogService.loadConfig();
    const spell = this.spellCatalogService.getSpell(input.spellId);
    if (!spell) {
      window.alert(this.translationService.tOrFallback("map.spells.errors.notFound", "Spell not found."));
      return;
    }

    const playerSpellEntry = (player.spellbook?.spells ?? []).find((entry) => entry.spellId === spell.id);
    if (!playerSpellEntry) {
      window.alert(this.translationService.tOrFallback("map.spells.errors.notKnown", "You do not know this spell."));
      return;
    }

    const worldTurn = Math.max(0, Math.floor(Number(input.worldState?.currentTurn ?? 0)));
    if (Math.max(0, Math.floor(Number(playerSpellEntry.blockedUntilTurn ?? 0))) > worldTurn) {
      window.alert(this.translationService.tOrFallback("map.spells.errors.cooldown", "This spell is on cooldown."));
      return;
    }

    const mpCurrent = Math.max(0, Math.floor(Number(player.parameters?.mp?.current ?? 0)));
    if (mpCurrent < spell.mpCost) {
      window.alert(this.translationService.tOrFallback("map.spells.errors.notEnoughMp", "Not enough MP to cast this spell."));
      return;
    }

    let target: { x: number; y: number } | null = null;
    if (spell.effect.type === "teleport-explored-orthogonal") {
      const teleportOptions = this.buildSpellTeleportOptions({
        player,
        mapCellsById: input.mapCellsById,
        mapSize: input.mapSize,
        spellId: spell.id,
      });

      if (teleportOptions.length === 0) {
        window.alert(this.translationService.tOrFallback(
          "map.spells.errors.noTeleportTargets",
          "No valid explored target is available for this spell.",
        ));
        return;
      }

      const selectableCellIds = new Set(teleportOptions.map((opt) => opt.cellId));
      const prompt = this.translationService.tOrFallback("map.cellSelection.promptTeleport", "Select a cell to teleport to");
      const selectedCell = await this.openCellSelection(selectableCellIds, prompt, true);
      if (!selectedCell) {
        return;
      }
      target = selectedCell;
    } else {
      const mpMax = Math.max(0, Math.floor(Number(
        typeof player.parameters?.mp?.max === "number" ? player.parameters.mp.max : (player.parameters?.mp?.base ?? 0),
      )));
      const longDescription = this.spellCatalogService.getLocalizedLongDescription(spell);
      const confirmed = await this.openSpellCastConfirmDialog({
        spellId: spell.id,
        spellName: this.spellCatalogService.getLocalizedName(spell),
        description: this.spellCatalogService.getLocalizedDescription(spell),
        ...(longDescription ? { longDescription } : {}),
        mpCost: spell.mpCost,
        mpCurrent,
        mpMax,
        consumableOnCast: spell.consumableOnCast === true,
      });
      if (!confirmed) {
        return;
      }

      if (this.spellCatalogService.needsCellSelection(spell)) {
        const magicValue = Math.max(0, Math.floor(Number(player.parameters.magic.current ?? player.parameters.magic.base ?? 0)));
        const range = this.spellCatalogService.computeEffectScalar(spell, magicValue);
        const candidateIds = this.environmentService.buildOrthogonalRangeTargetIds(
          player.location.x,
          player.location.y,
          range,
          input.mapSize,
        );

        const selectableCellIds = new Set<string>();
        candidateIds.forEach((cellId) => {
          const cell = input.mapCellsById[cellId];
          if (spell.effect.type === "reveal-cell") {
            if (cell && cell.biome && cell.discoveredBy) return;
            selectableCellIds.add(cellId);
          } else if (spell.effect.type === "remove-local-event") {
            if (!cell || !cell.biome) return;
            if (!cell.explorationEvents || cell.explorationEvents.length === 0) return;
            selectableCellIds.add(cellId);
          }
        });

        if (selectableCellIds.size === 0) {
          window.alert(this.translationService.tOrFallback("map.spells.errors.noCellTargets", "No valid cells available for this spell."));
          return;
        }

        const prompt = spell.effect.type === "reveal-cell"
          ? this.translationService.tOrFallback("map.cellSelection.promptReveal", "Select a cell to reveal")
          : this.translationService.tOrFallback("map.cellSelection.promptDestroy", "Select a cell to remove its event");

        const selectedCell = await this.openCellSelection(selectableCellIds, prompt, true);
        if (!selectedCell) {
          return;
        }
        target = selectedCell;
      }
    }

    let targetPlayerId: string | null = null;
    if (this.spellCatalogService.needsPlayerTarget(spell)) {
      const otherPlayers = input.allPlayers.filter((p) => p.id !== player.id);
      if (otherPlayers.length === 0) {
        window.alert(this.translationService.tOrFallback("map.spells.errors.noTargets", "No valid targets available."));
        return;
      }
      const selectedTarget = await this.openPlayerSelectDialog({
        spellName: this.spellCatalogService.getLocalizedName(spell),
        players: otherPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })),
      });
      if (!selectedTarget) {
        return;
      }
      targetPlayerId = selectedTarget.playerId;
    }

    let selectedSpellId: string | null = null;
    if (this.spellCatalogService.needsSpellSelectionFromTarget(spell)) {
      const targetPlayer = input.allPlayers.find((p) => p.id === targetPlayerId);
      const targetSpells = (targetPlayer?.spellbook?.spells ?? [])
        .map((entry) => this.spellCatalogService.getSpell(entry.spellId))
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (targetSpells.length === 0) {
        window.alert(this.translationService.tOrFallback("map.spells.errors.noTargetSpells", "Target has no spells."));
        return;
      }
      const isChoosing = spell.effect.type === "copy-chosen-spell";
      const spellSelected = await this.openSpellSelectDialog({
        title: this.translationService.tOrFallback(
          isChoosing ? "dialogs.spellSelect.titleCopy" : "dialogs.spellSelect.titleForget",
          isChoosing ? "Choose a spell to copy" : "Choose a spell to remove",
        ),
        confirmText: this.translationService.tOrFallback(
          isChoosing ? "dialogs.spellSelect.confirmCopy" : "dialogs.spellSelect.confirmForget",
          isChoosing ? "Copy" : "Remove",
        ),
        options: targetSpells.map((s) => ({
          spellId: s.id,
          name: this.spellCatalogService.getLocalizedName(s),
          mpCost: s.mpCost,
        })),
      });
      if (!spellSelected) {
        return;
      }
      selectedSpellId = spellSelected.spellId;
    }

    let selectedKey: string | null = null;
    if (this.spellCatalogService.needsSelfItemSelection(spell)) {
      const ownItems = (player.inventory?.items ?? [])
        .map((entry) => this.itemCatalogService.getCachedItemById(entry.itemId))
        .filter((item): item is NonNullable<typeof item> => item !== null);
      if (ownItems.length === 0) {
        window.alert(this.translationService.tOrFallback("map.spells.errors.noItems", "You have no items to alchemize."));
        return;
      }
      const itemSelected = await this.openSelfSelectDialog({
        title: this.translationService.tOrFallback("dialogs.selfSelect.titleAlchemy", "Choose an item to alchemize"),
        confirmText: this.translationService.tOrFallback("dialogs.selfSelect.confirmAlchemy", "Alchemize"),
        options: ownItems.map((item) => ({
          key: item.id,
          label: this.itemCatalogService.getLocalizedName(item),
          sublabel: `${item.purchaseValue} monete`,
        })),
      });
      if (!itemSelected) {
        return;
      }
      selectedKey = itemSelected.key;
    }

    if (this.spellCatalogService.needsSelfResourceSelection(spell)) {
      const resources: ResourceLabel[] = ["timber", "food", "minerals", "cloth"];
      const ownResources = (player.inventory?.resources ?? [])
        .filter((r) => r.quantity > 0 && resources.includes(r.label));
      if (ownResources.length === 0) {
        window.alert(this.translationService.tOrFallback("map.spells.errors.noResources", "You have no resources to transmute."));
        return;
      }
      const resourceSelected = await this.openSelfSelectDialog({
        title: this.translationService.tOrFallback("dialogs.selfSelect.titleTransmute", "Choose a resource to transmute"),
        confirmText: this.translationService.tOrFallback("dialogs.selfSelect.confirmTransmute", "Transmute"),
        options: ownResources.map((r) => ({
          key: r.label,
          label: this.translationService.tOrFallback(`resources.${r.label}`, r.label),
          sublabel: `×${r.quantity}`,
        })),
      });
      if (!resourceSelected) {
        return;
      }
      selectedKey = resourceSelected.key;
    }

    if (this.spellCatalogService.needsElementSelection(spell)) {
      const elements: SanctuaryElement[] = ["fire", "water", "wind", "earth"];
      const elementSelected = await this.openSelfSelectDialog({
        title: this.translationService.tOrFallback("dialogs.selfSelect.titleElement", "Choose an element"),
        confirmText: this.translationService.tOrFallback("dialogs.selfSelect.confirmElement", "Attune"),
        options: elements.map((el) => ({
          key: el,
          label: this.translationService.tOrFallback(`sanctuaries.elements.${el}`, el),
        })),
      });
      if (!elementSelected) {
        return;
      }
      selectedKey = elementSelected.key;
    }

    if (this.spellCatalogService.needsChaosEffectPreview(spell)) {
      const effectsTable = await this.chaosEffectsConfigService.buildDialogRows();
      const targetPlayer = input.allPlayers.find((p) => p.id === targetPlayerId);
      await this.openChaosDialog({
        spellName: this.spellCatalogService.getLocalizedName(spell),
        targetPlayerName: targetPlayer?.name ?? "",
        effectsTable,
        onCast: async () => {
          await this.actionExecutorService.castSpell(input.gameId, {
            id: player.id,
            name: player.name,
          }, { spellId: spell.id, targetPlayerId });
        },
      });
      return;
    }

    await this.runNamedAction(spell.id, async () => {
      await this.actionExecutorService.castSpell(input.gameId, {
        id: player.id,
        name: player.name,
      }, {
        spellId: spell.id,
        target,
        targetPlayerId,
        selectedSpellId,
        selectedKey,
      });
    }, this.translationService.tOrFallback("map.spells.errors.cast", "Error while casting spell."));
  }

  private buildSpellTeleportOptions(input: {
    player: Player;
    mapCellsById: Record<string, MapCell>;
    mapSize: number;
    spellId: string;
  }): SpellTeleportTargetOption[] {
    const spell = this.spellCatalogService.getSpell(input.spellId);
    if (!spell || spell.effect.type !== "teleport-explored-orthogonal") {
      return [];
    }

    const magicValue = Math.max(
      0,
      Math.floor(Number(input.player.parameters.magic.current ?? input.player.parameters.magic.base ?? 0)),
    );
    const range = this.spellCatalogService.computeEffectScalar(spell, magicValue);

    const options: SpellTeleportTargetOption[] = [];
    Object.entries(input.mapCellsById).forEach(([cellId, cell]) => {
      if (!cell || typeof cell !== "object") {
        return;
      }

      if (cell.x === input.player.location.x && cell.y === input.player.location.y) {
        return;
      }

      const inBounds = cell.x >= 0 && cell.y >= 0 && cell.x < input.mapSize && cell.y < input.mapSize;
      if (!inBounds) {
        return;
      }

      const distance = Math.abs(cell.x - input.player.location.x) + Math.abs(cell.y - input.player.location.y);
      if (distance <= 0 || distance > range) {
        return;
      }

      const biomeLabel = this.translationService.tOrFallback(`map.biomes.${cell.biome}`, cell.biome);
      options.push({
        cellId,
        x: cell.x,
        y: cell.y,
        biomeLabel,
      });
    });

    return options;
  }

  private async openSpellCastConfirmDialog(data: SpellCastConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(SpellCastConfirmDialog, {
      ...SPELL_CAST_DIALOG_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmResult(response);
  }

  private async openPlayerSelectDialog(data: PlayerSelectDialogData): Promise<PlayerSelectDialogResult | null> {
    const dialogRef = this.dialog.open(PlayerSelectDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    if (!this.isConfirmResult(response) || !response.data) {
      return null;
    }
    return response.data as PlayerSelectDialogResult;
  }

  private async openSpellSelectDialog(data: SpellSelectDialogData): Promise<SpellSelectDialogResult | null> {
    const dialogRef = this.dialog.open(SpellSelectDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    if (!this.isConfirmResult(response) || !response.data) {
      return null;
    }
    return response.data as SpellSelectDialogResult;
  }

  private async openSelfSelectDialog(data: SelfSelectDialogData): Promise<SelfSelectDialogResult | null> {
    const dialogRef = this.dialog.open(SelfSelectDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    if (!this.isConfirmResult(response) || !response.data) {
      return null;
    }
    return response.data as SelfSelectDialogResult;
  }

  private openCellSelection(
    selectableCellIds: Set<string>,
    prompt: string,
    withCancel = true,
  ): Promise<{ x: number; y: number } | null> {
    return this.cellSelectionService.openCellSelection(selectableCellIds, prompt, withCancel);
  }

  public async handlePendingTeleport(input: {
    gameId: string;
    myPlayer: Player;
    mapCellsById: Record<string, MapCell>;
  }): Promise<void> {
    const { gameId, myPlayer, mapCellsById } = input;

    const selectableCellIds = new Set<string>(
      Object.keys(mapCellsById).filter((id) => id !== `${myPlayer.location.x}_${myPlayer.location.y}`),
    );

    const prompt = this.translationService.tOrFallback(
      "map.interaction.pendingTeleport.prompt",
      "Scegli la casella di destinazione (Benedizione del Tempietto)",
    );

    const selected = await this.openCellSelection(selectableCellIds, prompt, false);
    if (!selected) return;

    try {
      await this.actionExecutorService.placeChapelUseTeleport(gameId, myPlayer, selected.x, selected.y);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Teleport error");
    }
  }

  private async executeCommandActionFlow(
    flow: ActionCatalogFlowDefinition,
    input: HandleCommandActionInput,
  ): Promise<void> {
    const handler: ActionFlowHandler = flow.handler;
    const errorMessage = flow.errorMessage;
    const player = input.myPlayer;

    if (handler === "end-turn") {
      if (!player || !input.canEndTurn) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.endTurn(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "sanctuary-activate") {
      const sanctuaryFlow = this.resolveSanctuaryFlowConfig(handler, flow.dialog);
      if (!sanctuaryFlow) {
        window.alert(`Action '${input.actionId}' has an invalid sanctuary dialog configuration.`);
        return;
      }

      await this.runSanctuaryAction({
        gameId: input.gameId,
        myPlayer: player,
        isMyTurn: input.isMyTurn,
        mapCellsById: input.mapCellsById,
        actionId: input.actionId,
        mode: sanctuaryFlow.mode,
        requiredActive: sanctuaryFlow.requiredActive,
        errorMessage,
        execute: async (resolvedPlayer) => {
          await this.actionExecutorService.activateSanctuary(input.gameId, {
            id: resolvedPlayer.id,
            name: resolvedPlayer.name,
          });
        },
      });
      return;
    }

    if (handler === "sanctuary-open") {
      const sanctuaryFlow = this.resolveSanctuaryFlowConfig(handler, flow.dialog);
      if (!sanctuaryFlow) {
        window.alert(`Action '${input.actionId}' has an invalid sanctuary dialog configuration.`);
        return;
      }

      await this.runSanctuaryMenuAction({
        gameId: input.gameId,
        myPlayer: player,
        isMyTurn: input.isMyTurn,
        worldState: input.worldState,
        mapCellsById: input.mapCellsById,
        actionId: input.actionId,
        mode: sanctuaryFlow.mode,
        requiredActive: sanctuaryFlow.requiredActive,
        errorMessage,
      });
      return;
    }

    if (handler === "sanctuary-donate") {
      const sanctuaryFlow = this.resolveSanctuaryFlowConfig(handler, flow.dialog);
      if (!sanctuaryFlow) {
        window.alert(`Action '${input.actionId}' has an invalid sanctuary dialog configuration.`);
        return;
      }

      await this.runSanctuaryAction({
        gameId: input.gameId,
        myPlayer: player,
        isMyTurn: input.isMyTurn,
        mapCellsById: input.mapCellsById,
        actionId: input.actionId,
        mode: sanctuaryFlow.mode,
        requiredActive: sanctuaryFlow.requiredActive,
        errorMessage,
        execute: async (resolvedPlayer) => {
          await this.actionExecutorService.donateAtSanctuary(input.gameId, {
            id: resolvedPlayer.id,
            name: resolvedPlayer.name,
          });
        },
      });
      return;
    }

    if (handler === "sanctuary-pray") {
      const sanctuaryFlow = this.resolveSanctuaryFlowConfig(handler, flow.dialog);
      if (!sanctuaryFlow) {
        window.alert(`Action '${input.actionId}' has an invalid sanctuary dialog configuration.`);
        return;
      }

      await this.runSanctuaryAction({
        gameId: input.gameId,
        myPlayer: player,
        isMyTurn: input.isMyTurn,
        mapCellsById: input.mapCellsById,
        actionId: input.actionId,
        mode: sanctuaryFlow.mode,
        requiredActive: sanctuaryFlow.requiredActive,
        errorMessage,
        execute: async (resolvedPlayer) => {
          await this.actionExecutorService.prayAtSanctuary(input.gameId, {
            id: resolvedPlayer.id,
            name: resolvedPlayer.name,
          });
        },
      });
      return;
    }

    if (handler === "biome-cell-gather") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.cellGather(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "biome-chop-tree") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.chopTree(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "biome-consume-ration") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.consumeRation(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "follower-feed-horse") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.feedHorse(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "follower-guide-pathfind") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.guidePathfind(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "safe-place-doctor") {
      if (!player) return;

      const dialogType = flow.dialog?.type ?? "doctor-heal";
      if (dialogType !== "doctor-heal") {
        window.alert(`Action '${input.actionId}' has an invalid doctor dialog configuration.`);
        return;
      }

      if (!isDoctorActionId(input.actionId)) {
        window.alert(`Action '${input.actionId}' has an invalid doctor flow mapping.`);
        return;
      }

      await this.runDoctorHealAction({
        gameId: input.gameId,
        myPlayer: player,
        worldState: input.worldState,
        isMyTurn: input.isMyTurn,
        actionId: input.actionId,
        errorMessage,
      });
      return;
    }

    if (handler === "safe-place-enchantress") {
      if (!player) return;

      const rewardsTable = await this.enchantressRewardsConfigService.buildDialogRows();

      await this.openEnchantressDialog({
        playerMoney: player.inventory?.money ?? 0,
        requiredCost: 5,
        rewardsTable,
        onPay: async () => {
          return await this.actionExecutorService.capitalEnchantress(input.gameId, {
            id: player.id,
            name: player.name,
          });
        },
      });
      return;
    }

    if (handler === "safe-place-mystic") {
      if (!player) return;

      const rewardsTable = await this.mysticRewardsConfigService.buildDialogRows();

      await this.openMysticDialog({
        playerMoney: player.inventory?.money ?? 0,
        requiredCost: 5,
        rewardsTable,
        onPay: async () => {
          return await this.actionExecutorService.cityMystic(input.gameId, {
            id: player.id,
            name: player.name,
          });
        },
      });
      return;
    }

    if (handler === "academy-spell-upgrader") {
      if (!player) return;

      await this.spellCatalogService.loadConfig();
      const upgradePairs = await this.academySpellUpgradeConfigService.loadConfig();
      const playerSpells = player.spellbook?.spells ?? [];
      const playerMoney = player.inventory?.money ?? 0;

      const options = upgradePairs
        .filter((pair) =>
          playerSpells.some((e) => e.spellId === pair.from) &&
          !playerSpells.some((e) => e.spellId === pair.to),
        )
        .map((pair) => {
          const fromSpell = this.spellCatalogService.getSpell(pair.from);
          const toSpell = this.spellCatalogService.getSpell(pair.to);
          return {
            fromSpellId: pair.from,
            fromSpellName: fromSpell ? this.spellCatalogService.getLocalizedName(fromSpell) : pair.from,
            toSpellId: pair.to,
            toSpellName: toSpell ? this.spellCatalogService.getLocalizedName(toSpell) : pair.to,
            cost: pair.cost,
            canAfford: playerMoney >= pair.cost,
          };
        });

      if (options.length === 0) {
        await this.openGenericConfirmDialog({
          title: this.translationService.tOrFallback("dialogs.academySpellUpgrader.title", "Spell Master"),
          message: this.translationService.tOrFallback("dialogs.academySpellUpgrader.noOptions", "You have no spells eligible for upgrading."),
          confirmText: this.translationService.tOrFallback("dialogs.common.close", "Close"),
        });
        return;
      }

      await this.openAcademySpellUpgraderDialog({
        options,
        onUpgrade: async (fromSpellId) =>
          this.actionExecutorService.academySpellUpgrade(input.gameId, { id: player.id, name: player.name }, fromSpellId),
      });
      return;
    }

    if (handler === "safe-place-merchant") {
      if (!player) return;

      const dialogType = flow.dialog?.type ?? "merchant-trade";
      if (dialogType !== "merchant-trade") {
        window.alert(`Action '${input.actionId}' has an invalid merchant dialog configuration.`);
        return;
      }

      const currentCell = input.mapCellsById[this.cellId(player.location.x, player.location.y)] ?? null;
      if (!currentCell || currentCell.specialType !== "landmark" || !currentCell.landmarkId) {
        return;
      }

      await Promise.all([
        this.itemCatalogService.loadConfig(),
        this.followerCatalogService.loadConfig(),
        this.merchantCatalogService.loadConfig(),
      ]);
      const merchant = await this.merchantCatalogService.getMerchantByLandmarkId(currentCell.landmarkId);
      if (!merchant) {
        window.alert(this.translationService.tOrFallback(
          "map.interaction.errors.noMerchantForLandmark",
          "No merchant configured for this landmark.",
        ));
        return;
      }

      const stockConfigUrl = flow.dialog?.stockConfigUrl;
      const stockEntries = await this.merchantTradeOffersService.resolveStockEntries({
        merchant,
        stockConfigUrl,
      });

      const stockMap = {
        ...this.merchantTradeOffersService.buildStockMap({
          stockEntries,
          persistedStockByItemId: currentCell.merchantStockByItemId ?? {},
        }),
      };

      const buyOffers = this.merchantTradeOffersService.buildBuyOffers({
        stockEntries,
        stockMap,
        playerAlignment: player.alignment,
        playerFollowers: player.followers,
      });

      const sellOffers = this.merchantTradeOffersService.buildSellOffers({
        merchant,
        inventoryItems: this.normalizeInventoryItems(player.inventory?.items),
      });

      await this.openMerchantDialog({
        merchantLabel: this.translationService.tOrFallback(`dialogs.merchant.names.${merchant.id}`, merchant.label),
        playerMoney: player.inventory?.money ?? 0,
        buyOffers,
        sellOffers,
        onConfirm: async (operations) => {
          return await this.actionExecutorService.safePlaceMerchantCheckout(input.gameId, {
            id: player.id,
            name: player.name,
          }, {
            actionId: input.actionId,
            merchantId: merchant.id,
            stockConfigUrl,
            operations,
          });
        },
      });
      return;
    }

    if (handler === "safe-place-inn") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.capitalInn(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "landmark-rest") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.landmarkRest(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          actionId: input.actionId,
        });
      }, errorMessage);
      return;
    }

    if (handler === "landmark-trainer") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.landmarkTrainer(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          actionId: input.actionId,
        });
      }, errorMessage);
      return;
    }

    if (handler === "safe-place-resource-exchange") {
      if (!player) return;

      const dialogType = flow.dialog?.type ?? "resource-exchange";
      if (dialogType !== "resource-exchange") {
        window.alert(`Action '${input.actionId}' has an invalid resource exchange dialog configuration.`);
        return;
      }

      const result = await this.openResourceExchangeDialog({
        resources: player.inventory?.resources ?? [],
      });

      if (!result) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.villageCraftsmanExchange(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          giveLabel: result.giveLabel,
          receiveLabel: result.receiveLabel,
          amount: result.amount,
        });
      }, errorMessage);
      return;
    }

    if (handler === "safe-place-wait") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.waitAtSafePlace(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "safe-place-fast-travel") {
      if (!player) return;

      const dialogType = flow.dialog?.type ?? "safe-place-fast-travel";
      if (dialogType !== "safe-place-fast-travel") {
        window.alert(`Action '${input.actionId}' has an invalid fast travel dialog configuration.`);
        return;
      }

      const originCell = input.mapCellsById[this.cellId(player.location.x, player.location.y)] ?? null;
      if (!this.safePlaceFastTravelService.isSafePlaceCell(originCell)) {
        return;
      }

      const routes = this.safePlaceFastTravelService.buildRoutes(originCell, input.mapCellsById);
      const dialogResult = await this.openFastTravelDialog({
        originName: this.safePlaceFastTravelService.getSafePlaceName(originCell),
        originX: originCell.x,
        originY: originCell.y,
        playerMoney: player.inventory?.money ?? 0,
        routes,
      });
      if (!dialogResult) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.fastTravelAtSafePlace(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          destinationX: dialogResult.destinationX,
          destinationY: dialogResult.destinationY,
        });
      }, errorMessage);

      return;
    }

    if (handler === "safe-place-camp-gatherer") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.campGatherer(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "safe-place-camp-hunter") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.campHunter(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "graveyard-resurrect") {
      if (!player) return;

      const outcomePreviewRows = await this.loadGraveyardOutcomePreviewRows();
      const options = await this.buildDeadFollowerSelectionOptions(input.gameId);
      if (options.length === 0) {
        window.alert(this.translationService.tOrFallback(
          "map.interaction.errors.noDeadFollowerForResurrection",
          "No dead follower is available for resurrection.",
        ));
        return;
      }

      const selectedFollowerId = await this.openFollowerSelectionDialog({
        title: this.translationService.tOrFallback("map.interaction.graveyard.title", "Graveyard Resurrection"),
        message: this.translationService.tOrFallback(
          "map.interaction.graveyard.message",
          "Choose which dead follower you want to call back from the discard pile.",
        ),
        confirmText: this.translationService.tOrFallback(
          "map.interaction.graveyard.confirm",
          "Attempt resurrection",
        ),
        options,
        outcomePreviewTitle: this.translationService.tOrFallback(
          "map.interaction.graveyard.outcomePreviewTitle",
          "Luck check outcomes (1-100)",
        ),
        outcomePreviewRows,
      });
      if (!selectedFollowerId) return;

      const outcome = await this.runNamedAction(input.actionId, async () => {
        return this.actionExecutorService.graveyardResurrect(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          followerId: selectedFollowerId,
        });
      }, errorMessage);

      if (!outcome) {
        return;
      }

      const selectedOption = options.find((option) => option.key === selectedFollowerId) ?? null;
      await this.openGraveyardResurrectResultDialog({
        selectedFollowerLabel: selectedOption?.label ?? selectedFollowerId,
        rewardId: outcome.rewardId,
        rewardLabel: outcome.rewardLabel,
        displayTotal: outcome.displayTotal,
        rolledTotal: outcome.rolledTotal,
        rewardsTable: outcomePreviewRows,
      });
      return;
    }

    if (handler === "temple-send-devotee") {
      if (!player) return;

      const options = this.buildTempleDevoteeSelectionOptions(player);
      if (options.length === 0) {
        window.alert(this.translationService.tOrFallback(
          "map.interaction.errors.noTempleFollower",
          "No eligible follower is available for temple devotion.",
        ));
        return;
      }

      const selectedFollowerId = await this.openFollowerSelectionDialog({
        title: this.translationService.tOrFallback("map.interaction.temple.title", "Temple Devotion"),
        message: this.translationService.tOrFallback(
          "map.interaction.temple.message",
          "Choose an follower to leave at the Temple. Animals, spirits and undead are not allowed.",
        ),
        confirmText: this.translationService.tOrFallback("map.interaction.temple.confirm", "Send devotee"),
        options,
      });
      if (!selectedFollowerId) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.templeSendDevotee(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          followerId: selectedFollowerId,
        });
      }, errorMessage);
      return;
    }

    if (handler === "altar-sacrifice") {
      if (!player) return;

      const options = this.buildAltarSacrificeSelectionOptions(player);
      if (options.length === 0) {
        window.alert(this.translationService.tOrFallback(
          "map.interaction.errors.noAltarFollower",
          "No eligible follower is available for altar sacrifice.",
        ));
        return;
      }

      const selectedFollowerId = await this.openFollowerSelectionDialog({
        title: this.translationService.tOrFallback("map.interaction.altar.title", "Altar Sacrifice"),
        message: this.translationService.tOrFallback(
          "map.interaction.altar.message",
          "Choose an follower to sacrifice at the Altar. Undead cannot be sacrificed.",
        ),
        confirmText: this.translationService.tOrFallback("map.interaction.altar.confirm", "Sacrifice follower"),
        options,
      });
      if (!selectedFollowerId) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.altarSacrifice(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          followerId: selectedFollowerId,
        });
      }, errorMessage);
      return;
    }

    if (handler === "elemental-ritual") {
      if (!player) return;

      const options = this.buildElementalRitualSelectionOptions(player);
      if (options.length === 0) {
        window.alert(this.translationService.tOrFallback(
          "map.interaction.errors.noElementalRitualFollower",
          "No eligible follower is available for the elemental ritual.",
        ));
        return;
      }

      const selectedFollowerId = await this.openFollowerSelectionDialog({
        title: this.translationService.tOrFallback("map.interaction.elementalRitual.title", "Elemental Ritual"),
        message: this.translationService.tOrFallback(
          "map.interaction.elementalRitual.message",
          "Choose a follower to transform. They will gain +1 STR, +1 MAG and at least 10 HP.",
        ),
        confirmText: this.translationService.tOrFallback("map.interaction.elementalRitual.confirm", "Perform ritual"),
        options,
      });
      if (!selectedFollowerId) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.elementalRitual(input.gameId, {
          id: player.id,
          name: player.name,
        }, {
          followerId: selectedFollowerId,
        });
      }, errorMessage);
      return;
    }

    if (handler === "follower-eliminate-zombie") {
      if (!player) return;

      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.eliminateZombie(input.gameId, {
          id: player.id,
          name: player.name,
        });
      }, errorMessage);
      return;
    }

    if (handler === "follower-dismiss-poltergeist") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.dismissFollower(input.gameId, { id: player.id, name: player.name }, "dismiss-poltergeist", "B-FO-014", 1);
      }, errorMessage);
      return;
    }

    if (handler === "follower-dismiss-banshee") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.dismissFollower(input.gameId, { id: player.id, name: player.name }, "dismiss-banshee", "B-FO-015", 1);
      }, errorMessage);
      return;
    }

    if (handler === "follower-dismiss-megera") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.dismissFollower(input.gameId, { id: player.id, name: player.name }, "dismiss-megera", "B-FO-016", 0);
      }, errorMessage);
      return;
    }

    if (handler === "follower-alchimista-heal") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.alchimistaHeal(input.gameId, { id: player.id, name: player.name });
      }, errorMessage);
      return;
    }

    if (handler === "follower-alchimista-mana") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.alchimistaMana(input.gameId, { id: player.id, name: player.name });
      }, errorMessage);
      return;
    }

    if (handler === "follower-hire-mercenary") {
      if (!player) return;
      await this.runNamedAction(input.actionId, async () => {
        await this.actionExecutorService.hireMercenary(input.gameId, { id: player.id, name: player.name });
        this.explorationEventService.notifyMercenaryHired();
      }, errorMessage);
      return;
    }

    window.alert(`Action '${input.actionId}' is not implemented yet.`);
  }

  private resolveSanctuaryFlowConfig(
    handler: ActionFlowHandler,
    dialog: ActionFlowDialogDefinition | undefined,
  ): { mode: SanctuaryActionDialogData["mode"] | null; requiredActive: boolean } | null {
    const defaultMode: SanctuaryActionDialogData["mode"] | null = handler === "sanctuary-activate"
      ? "activate"
      : handler === "sanctuary-open"
        ? "actions"
      : handler === "sanctuary-donate"
        ? "donate"
        : null;

    const defaultRequiredActive = handler !== "sanctuary-activate";

    if (!dialog || dialog.type === "none") {
      return {
        mode: defaultMode,
        requiredActive: defaultRequiredActive,
      };
    }

    if (dialog.type !== "sanctuary-action") {
      return null;
    }

    return {
      mode: dialog.sanctuaryMode ?? defaultMode,
      requiredActive: typeof dialog.requiredActive === "boolean" ? dialog.requiredActive : defaultRequiredActive,
    };
  }

  public async openLevelUpDialog(input: {
    gameId: string;
    player: Player | null;
    canOpen: boolean;
  }): Promise<void> {
    if (!input.player || !input.canOpen) return;

    this.isOpeningLevelUp.set(true);
    try {
      await this.playerProgressionService.applyNextPendingLevelUp(input.gameId, input.player.id, input.player);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("map.interaction.errors.levelUp", "Error while applying level-up choice"));
    } finally {
      this.isOpeningLevelUp.set(false);
    }
  }

  public async openResourceInventoryDialog(input: {
    mode: "manage" | "pending";
    gameId: string;
    player: Player | null;
    maxCapacity: number;
  }): Promise<void> {
    const player = input.player;
    if (!player || this.inventoryDialogOpen()) return;

    const pendingResource = player.pendingResourcePickup?.resource ?? null;
    if (input.mode === "pending" && !pendingResource) {
      return;
    }

    this.inventoryDialogOpen.set(true);
    try {
      const dialogRef = this.dialog.open(ResourceInventoryDialog, {
        ...RESOURCE_INVENTORY_DIALOG_CONFIG,
        data: {
          resources: player.inventory?.resources ?? [],
          maxCapacity: input.maxCapacity,
          pendingResource: input.mode === "pending" ? pendingResource : null,
        },
      });

      const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
      const result = this.asResourceInventoryResult(response);

      if (input.mode === "pending") {
        await this.applyPendingInventoryDialogResult(input.gameId, player, result);
        return;
      }

      if (result?.type === "discard") {
        await this.actionExecutorService.discardResource(input.gameId, {
          id: player.id,
          name: player.name,
        }, result.resourceLabel);
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("map.interaction.errors.manageResources", "Error while managing resources"));
    } finally {
      this.inventoryDialogOpen.set(false);
    }
  }

  public async openItemSwapDialog(input: {
    gameId: string;
    player: Player;
    dialogData: ItemSwapDialogData;
  }): Promise<void> {
    if (this.inventoryDialogOpen()) return;
    this.inventoryDialogOpen.set(true);
    try {
      const dialogRef = this.dialog.open<DialogResponse<ItemSwapDialogResult>>(ItemSwapDialog, {
        ...ITEM_SWAP_DIALOG_CONFIG,
        data: input.dialogData,
      });

      const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
      const result = this.asItemSwapResult(response);

      if (!result || result.type === "discard-new") {
        await this.actionExecutorService.resolvePendingItemPickup(input.gameId, {
          id: input.player.id,
          name: input.player.name,
        }, { keepNew: false });
        return;
      }

      await this.actionExecutorService.resolvePendingItemPickup(input.gameId, {
        id: input.player.id,
        name: input.player.name,
      }, { keepNew: true, discardItemId: result.discardItemId });
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("map.interaction.errors.itemSwap", "Error while resolving item pickup"));
    } finally {
      this.inventoryDialogOpen.set(false);
    }
  }

  private asItemSwapResult(response: unknown): ItemSwapDialogResult | null {
    if (typeof response !== "object" || response === null || !("data" in response)) return null;
    const data = (response as { data: unknown }).data;
    if (typeof data !== "object" || data === null || !("type" in data)) return null;
    const typed = data as { type: unknown; discardItemId?: unknown };
    if (typed.type === "discard-new") return { type: "discard-new" };
    if (typed.type === "keep-new" && typeof typed.discardItemId === "string") {
      return { type: "keep-new", discardItemId: typed.discardItemId };
    }
    return null;
  }

  public async confirmLeaveGameToHome(): Promise<boolean> {
    return this.openGenericConfirmDialog({
      title: this.translationService.tOrFallback("map.interaction.leaveGame.title", "Leave game?"),
      message: this.translationService.tOrFallback(
        "map.interaction.leaveGame.message",
        "You are about to leave the game. You can rejoin at any time, but if other players keep playing you will not witness their turns. They can also vote to skip your turn. Let them know if you are unavailable now.",
      ),
      confirmText: this.translationService.tOrFallback("map.interaction.leaveGame.confirm", "Leave"),
      cancelText: this.translationService.tOrFallback("map.interaction.leaveGame.cancel", "Stay"),
    });
  }

  private async runNamedAction<T>(
    actionId: string,
    task: () => Promise<T>,
    fallbackErrorMessage: string,
  ): Promise<T | null> {
    this.pendingActionId.set(actionId);
    try {
      return await task();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : fallbackErrorMessage);
      return null;
    } finally {
      this.pendingActionId.set(null);
    }
  }

  private async openGraveyardResurrectResultDialog(data: GraveyardResurrectResultDialogData): Promise<void> {
    const dialogRef = this.dialog.open(GraveyardResurrectResultDialog, {
      ...ENCHANTRESS_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async runSanctuaryAction(options: {
    gameId: string;
    myPlayer: Player | null;
    isMyTurn: boolean;
    mapCellsById: Record<string, MapCell>;
    actionId: string;
    mode: SanctuaryActionDialogData["mode"] | null;
    requiredActive: boolean;
    errorMessage: string;
    execute: (player: Player) => Promise<void>;
  }): Promise<void> {
    const player = options.myPlayer;
    const cell = this.getCurrentSanctuaryCell(player, options.mapCellsById);
    if (!player || !cell || !cell.sanctuaryElement || !options.isMyTurn) return;

    const isStateMismatch = options.requiredActive ? cell.active !== true : cell.active === true;
    if (isStateMismatch) return;

    if (options.mode) {
      const rewardSpell = options.mode === "activate"
        ? this.spellCatalogService.getSanctuaryRewardSpell(cell.sanctuaryElement)
        : null;
      const confirmed = await this.openSanctuaryActionDialog({
        mode: options.mode,
        sanctuaryElement: cell.sanctuaryElement,
        sanctuaryActive: cell.active === true,
        playerMoney: player.inventory?.money ?? 0,
        playerMpCurrent: player.parameters?.mp?.current ?? 0,
        playerMpMax: player.parameters?.mp?.max ?? player.parameters?.mp?.base ?? 1,
        rewardSpellName: rewardSpell ? this.spellCatalogService.getLocalizedName(rewardSpell) : undefined,
      });
      if (!confirmed) return;
    }

    await this.runNamedAction(options.actionId, async () => {
      await options.execute(player);
    }, options.errorMessage);
  }

  private async runSanctuaryMenuAction(options: {
    gameId: string;
    myPlayer: Player | null;
    isMyTurn: boolean;
    worldState: WorldState | null;
    mapCellsById: Record<string, MapCell>;
    actionId: string;
    mode: SanctuaryActionDialogData["mode"] | null;
    requiredActive: boolean;
    errorMessage: string;
  }): Promise<void> {
    const player = options.myPlayer;
    const cell = this.getCurrentSanctuaryCell(player, options.mapCellsById);
    if (!player || !cell || !cell.sanctuaryElement || !options.isMyTurn) return;

    const isStateMismatch = options.requiredActive ? cell.active !== true : cell.active === true;
    if (isStateMismatch) return;

    if (options.mode !== "actions") return;

    const sanctuaryActions = this.buildSanctuaryDialogActions(player, cell, options.worldState);
    const selectedActionId = await this.openSanctuaryActionsDialog({
      mode: "actions",
      sanctuaryElement: cell.sanctuaryElement,
      sanctuaryActive: cell.active === true,
      playerMoney: player.inventory?.money ?? 0,
      playerMpCurrent: player.parameters?.mp?.current ?? 0,
      playerMpMax: player.parameters?.mp?.max ?? player.parameters?.mp?.base ?? 1,
      sanctuaryActions,
    });

    if (!selectedActionId) return;

    const executor = selectedActionId === "donate-sanctuary"
      ? async () => {
        await this.actionExecutorService.donateAtSanctuary(options.gameId, {
          id: player.id,
          name: player.name,
        });
      }
      : selectedActionId === "pray-sanctuary"
        ? async () => {
          await this.actionExecutorService.prayAtSanctuary(options.gameId, {
            id: player.id,
            name: player.name,
          });
        }
        : null;

    if (!executor) return;

    await this.runNamedAction(selectedActionId, executor, options.errorMessage);
  }

  private buildSanctuaryDialogActions(
    player: Player,
    cell: MapCell,
    worldState: WorldState | null,
  ): CommandPanelAction[] {
    const sanctuaryLabel = this.sanctuaryElementToLabel(cell.sanctuaryElement);
    const hasMoney = (player.inventory?.money ?? 0) >= 5;
    const hasMagic = (player.parameters?.mp?.current ?? 0) >= 2;
    const worldTurn = worldState?.currentTurn ?? 0;

    const donate = this.actionRegistryService.buildActionCard("donate-sanctuary", {
      isBusy: false,
      hasMoney,
      hasMagic,
      isMyTurn: true,
      hasMovedThisTurn: true,
      sanctuaryLabel,
      player,
      cell,
      worldTurn,
      timeOfDay: worldState?.timeOfDay ?? "day",
      biome: cell.biome,
    });

    const pray = this.actionRegistryService.buildActionCard("pray-sanctuary", {
      isBusy: false,
      hasMoney,
      hasMagic,
      isMyTurn: true,
      hasMovedThisTurn: true,
      sanctuaryLabel,
      player,
      cell,
      worldTurn,
      timeOfDay: worldState?.timeOfDay ?? "day",
      biome: cell.biome,
    });

    return [donate, pray].filter((action): action is CommandPanelAction => !!action);
  }

  private async runDoctorHealAction(options: {
    gameId: string;
    myPlayer: Player | null;
    worldState: WorldState | null;
    isMyTurn: boolean;
    actionId: SafePlaceDoctorActionId;
    errorMessage: string;
  }): Promise<void> {
    const player = options.myPlayer;
    if (!player || !options.isMyTurn) return;

    const hpCurrent = Math.max(0, Math.floor(Number(player.parameters.hp.current ?? 0)));
    const hpMax = Math.max(
      1,
      Math.floor(Number(
        typeof player.parameters.hp.max === "number"
          ? player.parameters.hp.max
          : player.parameters.hp.base,
      )),
    );

    const dialogResult = await this.openDoctorHealDialog({
      actionId: options.actionId,
      timeOfDay: options.worldState?.timeOfDay ?? "day",
      playerMoney: player.inventory?.money ?? 0,
      hpCurrent,
      hpMax,
    });

    if (!dialogResult) return;

    await this.runNamedAction(options.actionId, async () => {
      await this.actionExecutorService.healAtSafePlace(options.gameId, {
        id: player.id,
        name: player.name,
      }, {
        actionId: options.actionId,
        units: dialogResult.units,
      });
    }, options.errorMessage);
  }

  private getCurrentSanctuaryCell(player: Player | null, mapCellsById: Record<string, MapCell>): MapCell | null {
    if (!player) return null;

    const cellId = this.cellId(player.location.x, player.location.y);
    const cell = mapCellsById[cellId] ?? null;
    if (!cell || cell.isSpecial !== true || cell.specialType !== "sanctuary") {
      return null;
    }

    return cell;
  }

  private async openSanctuaryActionDialog(data: SanctuaryActionDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(SanctuaryActionDialog, {
      ...DIALOGS_CONFIG,
      width: "92%",
      maxWidth: "920px",
      maxHeight: "72vh",
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmSanctuaryActionResponse(response);
  }

  private async openSanctuaryActionsDialog(data: SanctuaryActionDialogData): Promise<string | null> {
    const dialogRef = this.dialog.open(SanctuaryActionDialog, {
      ...DIALOGS_CONFIG,
      width: "92%",
      maxWidth: "920px",
      maxHeight: "72vh",
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    if (!this.isConfirmResult(response) || !response.data || typeof response.data !== "object") {
      return null;
    }

    const actionId = (response.data as { actionId?: unknown }).actionId;
    if (typeof actionId !== "string" || !actionId.trim()) {
      return null;
    }

    return actionId;
  }

  private sanctuaryElementToLabel(element?: SanctuaryElement): string {
    if (element === "water") {
      return this.translationService.tOrFallback("map.cells.sanctuary.water", "Water Shrine");
    }
    if (element === "fire") {
      return this.translationService.tOrFallback("map.cells.sanctuary.fire", "Fire Shrine");
    }
    if (element === "wind") {
      return this.translationService.tOrFallback("map.cells.sanctuary.wind", "Wind Shrine");
    }
    if (element === "earth") {
      return this.translationService.tOrFallback("map.cells.sanctuary.earth", "Earth Shrine");
    }
    return this.translationService.tOrFallback("map.cells.sanctuary.generic", "Elemental Shrine");
  }

  private async openDoctorHealDialog(data: DoctorHealDialogData): Promise<DoctorHealDialogResult | null> {
    const dialogRef = this.dialog.open(DoctorHealDialog, {
      ...DOCTOR_HEAL_DIALOG_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.asDoctorHealDialogResult(response);
  }

  private async openResourceExchangeDialog(data: ResourceExchangeDialogData): Promise<ResourceExchangeDialogResult | null> {
    const dialogRef = this.dialog.open(ResourceExchangeDialog, {
      ...RESOURCE_EXCHANGE_DIALOG_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.asResourceExchangeDialogResult(response);
  }

  private async openFastTravelDialog(data: FastTravelDialogData): Promise<FastTravelDialogResult | null> {
    const dialogRef = this.dialog.open(FastTravelDialog, {
      ...FAST_TRAVEL_DIALOG_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.asFastTravelDialogResult(response);
  }

  private async openEnchantressDialog(data: EnchantressDialogData): Promise<void> {
    const dialogRef = this.dialog.open(EnchantressDialog, {
      ...VARIABLE_REWARD_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openMysticDialog(data: MysticDialogData): Promise<void> {
    const dialogRef = this.dialog.open(MysticDialog, {
      ...VARIABLE_REWARD_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openMerchantDialog(data: MerchantDialogData): Promise<void> {
    const dialogRef = this.dialog.open(MerchantDialog, {
      ...MERCHANT_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openChaosDialog(data: ChaosDialogData): Promise<void> {
    const dialogRef = this.dialog.open(ChaosDialog, {
      ...VARIABLE_REWARD_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openGenericConfirmDialog(data: GenericConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(GenericConfirmDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmResult(response);
  }

  private async openAcademySpellUpgraderDialog(data: AcademySpellUpgraderDialogData): Promise<void> {
    const dialogRef = this.dialog.open(AcademySpellUpgraderDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openFollowerSelectionDialog(data: FollowerSelectDialogData): Promise<string | null> {
    const dialogRef = this.dialog.open(FollowerSelectDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.asSelectedFollowerId(response);
  }

  private isConfirmResult(response: unknown): response is DialogResponse {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    return response.result === "confirm";
  }

  private isConfirmSanctuaryActionResponse(response: unknown): response is DialogResponse {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    return response.result === "confirm";
  }

  private asDoctorHealDialogResult(response: unknown): DoctorHealDialogResult | null {
    if (typeof response !== "object" || response === null) {
      return null;
    }

    const typed = response as { result?: unknown; data?: unknown };
    if (typed.result !== "confirm" || !typed.data || typeof typed.data !== "object") {
      return null;
    }

    const data = typed.data as { units?: unknown };
    const units = Math.max(0, Math.floor(Number(data.units ?? 0)));
    if (!Number.isFinite(units) || units <= 0) {
      return null;
    }

    return { units };
  }

  private asResourceExchangeDialogResult(response: unknown): ResourceExchangeDialogResult | null {
    if (typeof response !== "object" || response === null) {
      return null;
    }

    const typed = response as { result?: unknown; data?: unknown };
    if (typed.result !== "confirm" || !typed.data || typeof typed.data !== "object") {
      return null;
    }

    const data = typed.data as {
      giveLabel?: unknown;
      receiveLabel?: unknown;
      amount?: unknown;
    };

    if (!this.isResourceLabel(data.giveLabel) || !this.isResourceLabel(data.receiveLabel)) {
      return null;
    }

    const amount = Math.max(0, Math.floor(Number(data.amount ?? 0)));
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return {
      giveLabel: data.giveLabel,
      receiveLabel: data.receiveLabel,
      amount,
    };
  }

  private asFastTravelDialogResult(response: unknown): FastTravelDialogResult | null {
    if (typeof response !== "object" || response === null) {
      return null;
    }

    const typed = response as { result?: unknown; data?: unknown };
    if (typed.result !== "confirm" || !typed.data || typeof typed.data !== "object") {
      return null;
    }

    const data = typed.data as {
      destinationX?: unknown;
      destinationY?: unknown;
      destinationName?: unknown;
      cost?: unknown;
    };

    const destinationX = Number(data.destinationX);
    const destinationY = Number(data.destinationY);
    const cost = Number(data.cost);

    if (!Number.isFinite(destinationX) || !Number.isFinite(destinationY) || !Number.isFinite(cost)) {
      return null;
    }

    return {
      destinationX: Math.max(0, Math.floor(destinationX)),
      destinationY: Math.max(0, Math.floor(destinationY)),
      destinationName: typeof data.destinationName === "string" ? data.destinationName : "Safe place",
      cost: Math.max(0, Math.floor(cost)),
    };
  }

  private asSelectedFollowerId(response: unknown): string | null {
    if (typeof response !== "object" || response === null) {
      return null;
    }

    const typed = response as { result?: unknown; data?: unknown };
    if (typed.result !== "confirm" || !typed.data || typeof typed.data !== "object") {
      return null;
    }

    const selectedFollowerId = (typed.data as { selectedKey?: unknown }).selectedKey;
    if (typeof selectedFollowerId !== "string" || !selectedFollowerId.trim()) {
      return null;
    }

    return selectedFollowerId.trim();
  }

  private async applyPendingInventoryDialogResult(
    gameId: string,
    player: Player,
    result: ResourceInventoryDialogResult | null,
  ): Promise<void> {
    if (!player.pendingResourcePickup) return;

    if (!result || result.type === "close" || result.type === "cancel-collect") {
      await this.actionExecutorService.resolvePendingResourcePickup(gameId, {
        id: player.id,
        name: player.name,
      }, {
        collect: false,
      });
      return;
    }

    if (result.type === "swap-and-collect") {
      await this.actionExecutorService.resolvePendingResourcePickup(gameId, {
        id: player.id,
        name: player.name,
      }, {
        collect: true,
        discardResourceLabel: result.resourceLabel,
      });
    }
  }

  private asResourceInventoryResult(response: unknown): ResourceInventoryDialogResult | null {
    if (typeof response !== "object" || response === null || !("data" in response)) {
      return null;
    }

    const data = (response as { data?: unknown }).data;
    if (!data || typeof data !== "object") {
      return null;
    }

    const typed = data as { type?: unknown; resourceLabel?: unknown };
    if (typed.type === "discard" && typeof typed.resourceLabel === "string") {
      return {
        type: "discard",
        resourceLabel: typed.resourceLabel as ResourceLabel,
      };
    }

    if (typed.type === "swap-and-collect" && typeof typed.resourceLabel === "string") {
      return {
        type: "swap-and-collect",
        resourceLabel: typed.resourceLabel as ResourceLabel,
      };
    }

    if (typed.type === "cancel-collect") {
      return { type: "cancel-collect" };
    }

    if (typed.type === "close") {
      return { type: "close" };
    }

    return null;
  }

  private normalizeInventoryItems(rawItems: unknown): Array<{ itemId: string }> {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const items: Array<{ itemId: string }> = [];
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

      items.push({ itemId: itemId.trim() });
    });

    return items;
  }

  private async buildDeadFollowerSelectionOptions(gameId: string): Promise<FollowerSelectDialogData["options"]> {
    const deadFollowers = await this.actionExecutorService.getDeadFollowersFromDiscardPile(gameId);
    return deadFollowers.map(({ followerId }) => {
      const follower = this.followerCatalogService.getCachedFollowerById(followerId);
      const localizedFollowerName = follower
        ? this.followerCatalogService.getLocalizedName(follower)
        : followerId;
      const category = String(follower?.category ?? "unknown").toLowerCase();
      const hpMax = Math.max(1, Math.floor(Number(follower?.maxHp ?? 1)));
      return {
        key: followerId,
        label: localizedFollowerName,
        description: (follower
          ? this.followerCatalogService.getLocalizedDescription(follower).trim()
          : "") || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
        hpCurrent: 0,
        hpMax,
        labels: this.buildFollowerSelectionLabels(category, follower?.parameterModifiers ?? []),
      };
    });
  }

  private buildTempleDevoteeSelectionOptions(player: Player): FollowerSelectDialogData["options"] {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
        if (entry.state === "discarded") return false;
        if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;

        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const category = String(entry.categoryOverride ?? follower?.category ?? "").trim().toLowerCase();
        return category !== "animal" && category !== "spirit" && category !== "undead";
      })
      .map((entry) => {
        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const localizedFollowerName = follower
          ? this.followerCatalogService.getLocalizedName(follower)
          : entry.followerId;
        const followerName = String(entry.nameOverride ?? localizedFollowerName);
        const category = String(entry.categoryOverride ?? follower?.category ?? "unknown").toLowerCase();
        const hpMax = Math.max(1, Math.floor(Number(follower?.maxHp ?? 1)));
        const hpCurrent = Math.max(0, Math.min(hpMax, Math.floor(Number(entry.hpCurrent ?? 0))));
        return {
          key: entry.followerId,
          label: followerName,
          description: (follower
            ? this.followerCatalogService.getLocalizedDescription(follower).trim()
            : "") || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
          hpCurrent,
          hpMax,
          labels: this.buildFollowerSelectionLabels(category, follower?.parameterModifiers ?? []),
        };
      });
  }

  private buildAltarSacrificeSelectionOptions(player: Player): FollowerSelectDialogData["options"] {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
        if (entry.state === "discarded") return false;
        if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;

        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const category = String(entry.categoryOverride ?? follower?.category ?? "").trim().toLowerCase();
        return category !== "undead";
      })
      .map((entry) => {
        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const localizedFollowerName = follower
          ? this.followerCatalogService.getLocalizedName(follower)
          : entry.followerId;
        const followerName = String(entry.nameOverride ?? localizedFollowerName);
        const category = String(entry.categoryOverride ?? follower?.category ?? "unknown").toLowerCase();
        const hpMax = Math.max(1, Math.floor(Number(follower?.maxHp ?? 1)));
        const hpCurrent = Math.max(0, Math.min(hpMax, Math.floor(Number(entry.hpCurrent ?? 0))));
        return {
          key: entry.followerId,
          label: followerName,
          description: (follower
            ? this.followerCatalogService.getLocalizedDescription(follower).trim()
            : "") || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
          hpCurrent,
          hpMax,
          labels: this.buildFollowerSelectionLabels(category, follower?.parameterModifiers ?? []),
        };
      });
  }

  private buildElementalRitualSelectionOptions(player: Player): FollowerSelectDialogData["options"] {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
        if (entry.state === "discarded") return false;
        if (Math.max(0, Math.floor(Number(entry.hpCurrent ?? 0))) <= 0) return false;
        return true;
      })
      .map((entry) => {
        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const baseName = follower ? this.followerCatalogService.getLocalizedName(follower) : entry.followerId;
        const upgradeSuffix = (entry.upgrades ?? [])
          .map((id) => this.followerUpgradeService.getLocalizedNameSuffix(id))
          .filter((s) => s.length > 0)
          .join(" ");
        const followerName = upgradeSuffix
          ? `${entry.nameOverride ?? baseName} ${upgradeSuffix}`
          : String(entry.nameOverride ?? baseName);
        const category = String(entry.categoryOverride ?? follower?.category ?? "unknown").toLowerCase();
        const hpMax = Math.max(1, Math.floor(Number(follower?.maxHp ?? 1)));
        const hpCurrent = Math.max(0, Math.min(hpMax, Math.floor(Number(entry.hpCurrent ?? 0))));
        const allModifiers = [
          ...(follower?.parameterModifiers ?? []),
          ...this.followerUpgradeService.resolveParameterModifiers(entry.upgrades),
        ];
        return {
          key: entry.followerId,
          label: followerName,
          description: (follower
            ? this.followerCatalogService.getLocalizedDescription(follower).trim()
            : "") || this.translationService.tOrFallback("map.common.noDescription", "No description available."),
          hpCurrent,
          hpMax,
          labels: this.buildFollowerSelectionLabels(category, allModifiers),
        };
      });
  }

  private async loadGraveyardOutcomePreviewRows(): Promise<NonNullable<FollowerSelectDialogData["outcomePreviewRows"]>> {
    try {
      return await this.graveyardResurrectRewardsConfigService.buildDialogRows();
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private buildFollowerSelectionLabels(
    category: string,
    modifiers: Array<{
      parameter: "strength" | "magic" | "luck";
      amount: number;
      scopes: Array<"always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only">;
    }>,
  ): Array<{ text: string; tone: "neutral" | "positive" | "negative" }> {
    const labels: Array<{ text: string; tone: "neutral" | "positive" | "negative" }> = [
      { text: category, tone: "neutral" },
    ];

    const scopeLabels = new Set<string>();
    modifiers.forEach((modifier) => {
      const scopes = modifier.scopes ?? [];
      scopes.forEach((scope) => {
        if (scope === "always") return;
        if (scope === "fight-only") {
          scopeLabels.add("fight only");
          return;
        }
        if (scope === "magic-fight-only") {
          scopeLabels.add("magic fight only");
          return;
        }
        if (scope === "day-only") {
          scopeLabels.add("day only");
          return;
        }
        scopeLabels.add("night only");
      });
    });

    scopeLabels.forEach((scopeLabel) => {
      labels.push({
        text: scopeLabel,
        tone: "neutral",
      });
    });

    modifiers.forEach((modifier) => {
      const amount = Number(modifier.amount ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        return;
      }

      const sign = amount >= 0 ? "+" : "";
      const parameterLabel = modifier.parameter === "strength"
        ? this.translationService.tOrFallback("playerCard.stats.strengthAbbr", "FRZ")
        : modifier.parameter === "magic"
          ? this.translationService.tOrFallback("playerCard.stats.magicAbbr", "MAG")
          : this.translationService.tOrFallback("playerCard.stats.luckAbbr", "FOR");

      labels.push({
        text: `${sign}${amount} ${parameterLabel}`,
        tone: amount >= 0 ? "positive" : "negative",
      });
    });

    return labels;
  }

  private isResourceLabel(value: unknown): value is ResourceLabel {
    return value === "food" || value === "timber" || value === "minerals" || value === "cloth";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}
