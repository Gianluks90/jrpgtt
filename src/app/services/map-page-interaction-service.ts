import { Injectable, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { firstValueFrom, take } from "rxjs";
import {
  DIALOGS_CONFIG,
  DOCTOR_HEAL_DIALOG_CONFIG,
  ENCHANTRESS_DIALOG_CONFIG,
  FAST_TRAVEL_DIALOG_CONFIG,
  MERCHANT_DIALOG_CONFIG,
  RESOURCE_EXCHANGE_DIALOG_CONFIG,
} from "../consts/dialog-configs";
import { GameEventsLogDialog } from "../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { MapService } from "./map-service";
import { ActionExecutorService } from "./action-executor-service";
import { PlayerProgressionService } from "./player-progression-service";
import { MapCell, SanctuaryElement } from "../models/MapCell";
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
import { MerchantCatalogService } from "./merchant-catalog-service";
import { MerchantTradeOffersService } from "./merchant-trade-offers-service";
import { MysticRewardsConfigService } from "./mystic-rewards-config-service";
import { SafePlaceFastTravelService } from "./safe-place-fast-travel-service";
import {
  GenericConfirmDialog,
  GenericConfirmDialogData,
} from "../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { WorldEventRegionTransitionService } from "./world-event-region-transition-service";

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
    private merchantCatalogService: MerchantCatalogService,
    private merchantTradeOffersService: MerchantTradeOffersService,
    private mysticRewardsConfigService: MysticRewardsConfigService,
    private safePlaceFastTravelService: SafePlaceFastTravelService,
    private worldEventRegionTransitionService: WorldEventRegionTransitionService,
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
        title: "Entering Region II",
        message: "Crossing this border may trigger a world event. Do you want to proceed?",
        confirmText: "Proceed",
        cancelText: "Stay",
      });
      if (!confirmed) return;
    }

    try {
      await this.mapService.movePlayer(gameId, myPlayer.id, cell.x, cell.y);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while moving player");
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
        this.merchantCatalogService.loadConfig(),
      ]);
      const merchant = await this.merchantCatalogService.getMerchantByLandmarkId(currentCell.landmarkId);
      if (!merchant) {
        window.alert("No merchant configured for this landmark.");
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
      });

      const sellOffers = this.merchantTradeOffersService.buildSellOffers({
        merchant,
        inventoryItems: this.normalizeInventoryItems(player.inventory?.items),
      });

      await this.openMerchantDialog({
        merchantLabel: merchant.label,
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
      window.alert(error instanceof Error ? error.message : "Error while applying level-up choice");
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
        ...DIALOGS_CONFIG,
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
      window.alert(error instanceof Error ? error.message : "Error while managing resources");
    } finally {
      this.inventoryDialogOpen.set(false);
    }
  }

  private async runNamedAction(actionId: string, task: () => Promise<void>, fallbackErrorMessage: string): Promise<boolean> {
    this.pendingActionId.set(actionId);
    try {
      await task();
      return true;
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : fallbackErrorMessage);
      return false;
    } finally {
      this.pendingActionId.set(null);
    }
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

  private isResourceLabel(value: unknown): value is ResourceLabel {
    return value === "food" || value === "timber" || value === "minerals" || value === "cloth";
  }

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}
