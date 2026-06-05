import { Injectable, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { firstValueFrom, take } from "rxjs";
import {
  DIALOGS_CONFIG,
  DOCTOR_HEAL_DIALOG_CONFIG,
  ENCHANTRESS_DIALOG_CONFIG,
  FAST_TRAVEL_DIALOG_CONFIG,
  MERCHANT_DIALOG_CONFIG,
  RESOURCE_INVENTORY_DIALOG_CONFIG,
  RESOURCE_EXCHANGE_DIALOG_CONFIG,
} from "../consts/dialog-configs";
import { GameEventsLogDialog } from "../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { MapService } from "./map-service";
import { ActionExecutorService } from "./action-executor-service";
import { PlayerProgressionService } from "./player-progression-service";
import { BiomeType, MapCell, SanctuaryElement } from "../models/MapCell";
import { Player } from "../models/Player";
import { WorldState } from "../models/WorldState";
import { MapGridPanelCell } from "../components/core/map-grid-panel/map-grid-panel";
import {
  ResourceInventoryDialog,
  ResourceInventoryDialogResult,
} from "../components/dialogs/action-dialogs/resource-inventory-dialog/resource-inventory-dialog";
import { ResourceLabel } from "../models/Resource";
import {
  SanctuaryActionDialog,
  SanctuaryActionDialogData,
  SanctuaryActionDialogResult,
} from "../components/dialogs/action-dialogs/sanctuary-action-dialog/sanctuary-action-dialog";
import {
  DoctorHealDialog,
  DoctorHealDialogData,
  DoctorHealDialogResult,
} from "../components/dialogs/action-dialogs/doctor-heal-dialog/doctor-heal-dialog";
import {
  ResourceExchangeDialog,
  ResourceExchangeDialogData,
  ResourceExchangeDialogResult,
} from "../components/dialogs/action-dialogs/resource-exchange-dialog/resource-exchange-dialog";
import {
  EnchantressDialog,
  EnchantressDialogData,
} from "../components/dialogs/action-dialogs/enchantress-dialog/enchantress-dialog";
import {
  MysticDialog,
  MysticDialogData,
} from "../components/dialogs/action-dialogs/mystic-dialog/mystic-dialog";
import {
  MerchantDialog,
  MerchantDialogData,
} from "../components/dialogs/action-dialogs/merchant-dialog/merchant-dialog";
import {
  FastTravelDialog,
  FastTravelDialogData,
  FastTravelDialogResult,
} from "../components/dialogs/action-dialogs/fast-travel-dialog/fast-travel-dialog";
import {
  FollowerSelectDialog,
  FollowerSelectDialogData,
} from "../components/dialogs/action-dialogs/follower-select-dialog/follower-select-dialog";
import {
  GraveyardResurrectResultDialog,
  GraveyardResurrectResultDialogData,
} from "../components/dialogs/action-dialogs/graveyard-resurrect-result-dialog/graveyard-resurrect-result-dialog";
import {
  ActionCatalogFlowDefinition,
  ActionFlowDialogDefinition,
  ActionFlowHandler,
} from "../models/ActionCatalog";
import { DialogResponse } from "../models/DialogResponse";
import { EventLog } from "../models/EventLog";
import { isDoctorActionId, SafePlaceDoctorActionId } from "../consts/safe-place-actions";
import { ActionCatalogService } from "./action-catalog-service";
import { EnchantressRewardsConfigService } from "./enchantress-rewards-config-service";
import { ItemCatalogService } from "./item-catalog-service";
import { FollowerCatalogService } from "./follower-catalog-service";
import { MerchantCatalogService } from "./merchant-catalog-service";
import { MerchantTradeOffersService } from "./merchant-trade-offers-service";
import { MysticRewardsConfigService } from "./mystic-rewards-config-service";
import { SafePlaceFastTravelService } from "./safe-place-fast-travel-service";
import { GraveyardResurrectRewardsConfigService } from "./graveyard-resurrect-rewards-config-service";
import {
  GenericConfirmDialog,
  GenericConfirmDialogData,
} from "../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { WorldEventRegionTransitionService } from "./world-event-region-transition-service";
import { LocationInfoDialog } from "../components/dialogs/location-info-dialog/location-info-dialog";
import { SanctuaryTilesConfigEntry, TilesConfig } from "../models/TilesConfig";
import { DiscardPileDialog } from "../components/dialogs/discard-pile-dialog/discard-pile-dialog";
import { DiscardPileEntry } from "../models/DiscardPile";
import { TranslationService } from "./translation-service";

interface HandleCommandActionInput {
  actionId: string;
  gameId: string;
  myPlayer: Player | null;
  isMyTurn: boolean;
  canEndTurn: boolean;
  worldState: WorldState | null;
  mapCellsById: Record<string, MapCell>;
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
    private merchantCatalogService: MerchantCatalogService,
    private merchantTradeOffersService: MerchantTradeOffersService,
    private mysticRewardsConfigService: MysticRewardsConfigService,
    private safePlaceFastTravelService: SafePlaceFastTravelService,
    private graveyardResurrectRewardsConfigService: GraveyardResurrectRewardsConfigService,
    private worldEventRegionTransitionService: WorldEventRegionTransitionService,
    private translationService: TranslationService,
  ) {}

  public resetUiState(): void {
    this.pendingActionId.set(null);
    this.inventoryDialogOpen.set(false);
    this.isOpeningLevelUp.set(false);
  }

  public openLogsDialog(logs: EventLog[]): void {
    this.dialog.open(GameEventsLogDialog, {
      ...DIALOGS_CONFIG,
      data: {
        logs,
      },
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
      await this.mapService.movePlayer(gameId, myPlayer.id, cell.x, cell.y);
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
      const options = this.buildDeadFollowerSelectionOptions(player);
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

    window.alert(`Action '${input.actionId}' is not implemented yet.`);
  }

  private resolveSanctuaryFlowConfig(
    handler: ActionFlowHandler,
    dialog: ActionFlowDialogDefinition | undefined,
  ): { mode: SanctuaryActionDialogData["mode"] | null; requiredActive: boolean } | null {
    const defaultMode: SanctuaryActionDialogData["mode"] | null = handler === "sanctuary-activate"
      ? "activate"
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
      const confirmed = await this.openSanctuaryActionDialog({
        mode: options.mode,
        sanctuaryElement: cell.sanctuaryElement,
        playerMoney: player.inventory?.money ?? 0,
      });
      if (!confirmed) return;
    }

    await this.runNamedAction(options.actionId, async () => {
      await options.execute(player);
    }, options.errorMessage);
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
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmSanctuaryActionResponse(response);
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
      ...ENCHANTRESS_DIALOG_CONFIG,
      data,
    });

    await firstValueFrom(dialogRef.closed.pipe(take(1)));
  }

  private async openMysticDialog(data: MysticDialogData): Promise<void> {
    const dialogRef = this.dialog.open(MysticDialog, {
      ...ENCHANTRESS_DIALOG_CONFIG,
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

  private async openGenericConfirmDialog(data: GenericConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(GenericConfirmDialog, {
      ...DIALOGS_CONFIG,
      data,
    });

    const response = await firstValueFrom(dialogRef.closed.pipe(take(1)));
    return this.isConfirmResult(response);
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

  private isConfirmSanctuaryActionResponse(response: unknown): response is DialogResponse<SanctuaryActionDialogResult> {
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

  private buildDeadFollowerSelectionOptions(player: Player): FollowerSelectDialogData["options"] {
    const followers = Array.isArray(player.followers) ? player.followers : [];
    return followers
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
        return entry.state === "discarded" && entry.discardReason === "dead";
      })
      .map((entry) => {
        const follower = this.followerCatalogService.getCachedFollowerById(entry.followerId);
        const localizedFollowerName = follower
          ? this.followerCatalogService.getLocalizedName(follower)
          : entry.followerId;
        const followerName = String(entry.nameOverride ?? localizedFollowerName);
        const category = String(entry.categoryOverride ?? follower?.category ?? "unknown").toLowerCase();
        const hpMax = Math.max(1, Math.floor(Number(follower?.maxHp ?? 1)));
        return {
          key: entry.followerId,
          label: followerName,
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
      scopes: Array<"always" | "fight-only" | "day-only" | "night-only">;
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
        ? "STR"
        : modifier.parameter === "magic"
          ? "MAG"
          : "LCK";

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
