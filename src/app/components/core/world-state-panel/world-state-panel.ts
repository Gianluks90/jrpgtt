import { Component, computed, input } from "@angular/core";
import { Player } from "../../../models/Player";
import { MapCell } from "../../../models/MapCell";
import { WorldState } from "../../../models/WorldState";

@Component({
  selector: "app-world-state-panel",
  imports: [],
  templateUrl: "./world-state-panel.html",
  styleUrl: "./world-state-panel.scss",
})
export class WorldStatePanel {
  public worldState = input<WorldState | null>(null);
  public players = input<Player[]>([]);
  public mapCellsById = input<Record<string, MapCell>>({});
  public mapSize = input(10);
  public totalSpecialCells = input(4);

  public showTitle = input(false);
  public title = input("World");
  public mobileSidebarTitle = input(false);

  public activePlayerLabel = computed<string>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return "-";

    const active = this.players().find((player) => player.id === activePlayerId) ?? null;
    if (active?.name?.trim()) return active.name.trim();
    return activePlayerId.slice(0, 6);
  });

  public currentRound = computed<number>(() => {
    const turn = this.worldState()?.currentTurn ?? 0;
    const playersCount = this.players().length;

    if (turn <= 0 || playersCount <= 0) return 0;
    return Math.ceil(turn / playersCount);
  });

  public discoveredTilesLabel = computed<string>(() => {
    const discovered = Object.keys(this.mapCellsById()).length;
    const size = this.mapSize();
    const total = size > 0 ? size * size : 0;
    if (total <= 0) return `${discovered}/0`;

    const clampedDiscovered = Math.min(discovered, total);
    return `${clampedDiscovered}/${total}`;
  });

  public activeSpecialCellsLabel = computed<string>(() => {
    const specialCells = Object.values(this.mapCellsById()).filter((cell) => cell.isSpecial === true && cell.active === true).length;
    const totalSpecial = Math.max(0, this.totalSpecialCells());
    const clampedSpecial = Math.min(specialCells, totalSpecial);
    return `${clampedSpecial}/${totalSpecial}`;
  });

  public worldSummaryEntries = computed<Array<{ label: string; value: string; isActivePlayer: boolean }>>(() => {
    const turn = this.worldState()?.currentTurn ?? 0;
    const round = this.currentRound();
    const discovered = this.discoveredTilesLabel();
    const activeShrines = this.activeSpecialCellsLabel();
    const worldEvent = this.worldState()?.worldEvent;
    const worldEventLabel = worldEvent?.emitted === true
      ? (worldEvent.title?.trim() || "-")
      : "-";
    const activePlayer = this.activePlayerLabel();

    return [
      { label: "Turn", value: String(turn), isActivePlayer: false },
      { label: "Round", value: String(round), isActivePlayer: false },
      { label: "Discovered", value: discovered, isActivePlayer: false },
      { label: "Active shrines", value: activeShrines, isActivePlayer: false },
      { label: "World event", value: worldEventLabel, isActivePlayer: false },
      { label: "Active player", value: activePlayer, isActivePlayer: true },
    ];
  });
}
