import { Injectable, signal } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { firstValueFrom, take } from "rxjs";
import { DIALOGS_CONFIG } from "../consts/dialog-configs";
import { GameEventsLogDialog } from "../components/dialogs/game-events-log-dialog/game-events-log-dialog";
import { MapService } from "./map-service";
import { ActionExecutorService } from "./action-executor-service";
import { PlayerProgressionService } from "./player-progression-service";
import { MapCell, SanctuaryElement } from "../models/MapCell";
import { Player } from "../models/Player";
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
import { DialogResponse } from "../models/DialogResponse";
import { EventLog } from "../models/EventLog";

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
  }): Promise<void> {
    const { gameId, cell, myPlayer, isMyTurn, movableCellIds } = input;
    if (!myPlayer || !isMyTurn || this.pendingActionId() !== null) return;
    if (!movableCellIds.has(cell.id)) return;

    try {
      await this.mapService.movePlayer(gameId, myPlayer.id, cell.x, cell.y);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Error while moving player");
    }
  }

  public async handleCommandAction(input: {
    actionId: string;
    gameId: string;
    myPlayer: Player | null;
    isMyTurn: boolean;
    canEndTurn: boolean;
    mapCellsById: Record<string, MapCell>;
  }): Promise<void> {
    const handlers: Record<string, () => Promise<void>> = {
      "end-turn": async () => {
        if (!input.myPlayer || !input.canEndTurn) return;
        await this.runNamedAction("end-turn", async () => {
          await this.actionExecutorService.endTurn(input.gameId, {
            id: input.myPlayer!.id,
            name: input.myPlayer!.name,
          });
        }, "Error while ending turn");
      },
      "activate-sanctuary": async () => {
        await this.runSanctuaryAction({
          gameId: input.gameId,
          myPlayer: input.myPlayer,
          isMyTurn: input.isMyTurn,
          mapCellsById: input.mapCellsById,
          actionId: "activate-sanctuary",
          mode: "activate",
          requiredActive: false,
          errorMessage: "Error while activating sanctuary",
          execute: async (player) => {
            await this.actionExecutorService.activateSanctuary(input.gameId, {
              id: player.id,
              name: player.name,
            });
          },
        });
      },
      "donate-sanctuary": async () => {
        await this.runSanctuaryAction({
          gameId: input.gameId,
          myPlayer: input.myPlayer,
          isMyTurn: input.isMyTurn,
          mapCellsById: input.mapCellsById,
          actionId: "donate-sanctuary",
          mode: "donate",
          requiredActive: true,
          errorMessage: "Error while donating at sanctuary",
          execute: async (player) => {
            await this.actionExecutorService.donateAtSanctuary(input.gameId, {
              id: player.id,
              name: player.name,
            });
          },
        });
      },
      "pray-sanctuary": async () => {
        await this.runSanctuaryAction({
          gameId: input.gameId,
          myPlayer: input.myPlayer,
          isMyTurn: input.isMyTurn,
          mapCellsById: input.mapCellsById,
          actionId: "pray-sanctuary",
          mode: null,
          requiredActive: true,
          errorMessage: "Error while praying at sanctuary",
          execute: async (player) => {
            await this.actionExecutorService.prayAtSanctuary(input.gameId, {
              id: player.id,
              name: player.name,
            });
          },
        });
      },
      "cell-gather": async () => {
        if (!input.myPlayer || !input.isMyTurn) return;
        await this.runNamedAction("cell-gather", async () => {
          await this.actionExecutorService.cellGather(input.gameId, {
            id: input.myPlayer!.id,
            name: input.myPlayer!.name,
          });
        }, "Error while gathering resources");
      },
      "consume-ration": async () => {
        if (!input.myPlayer || !input.isMyTurn) return;
        await this.runNamedAction("consume-ration", async () => {
          await this.actionExecutorService.consumeRation(input.gameId, {
            id: input.myPlayer!.id,
            name: input.myPlayer!.name,
          });
        }, "Error while consuming ration");
      },
    };

    const handler = handlers[input.actionId];
    if (!handler) {
      window.alert(`Action '${input.actionId}' is not implemented yet.`);
      return;
    }

    await handler();
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

  private async runNamedAction(actionId: string, task: () => Promise<void>, fallbackErrorMessage: string): Promise<void> {
    this.pendingActionId.set(actionId);
    try {
      await task();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : fallbackErrorMessage);
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

  private isConfirmSanctuaryActionResponse(response: unknown): response is DialogResponse<SanctuaryActionDialogResult> {
    if (typeof response !== "object" || response === null) return false;
    if (!("result" in response)) return false;
    return response.result === "confirm";
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

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }
}
