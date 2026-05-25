import { Component, computed, input } from "@angular/core";
import { Player } from "../../../models/Player";
import { BiomeType, MapCell } from "../../../models/MapCell";
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
  public currentUserId = input("");
  public mapCellsById = input<Record<string, MapCell>>({});
  public mapSize = input(10);
  public totalSpecialCells = input(4);

  public showTitle = input(false);
  public title = input("World");
  public mobileSidebarTitle = input(false);

  public biomeOrderLeft: BiomeType[] = ["plains", "forest", "mountain"];
  public biomeOrderRight: BiomeType[] = ["water", "desert", "ruins"];

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

  public revealedSpecialCellsLabel = computed<string>(() => {
    const specialCells = Object.values(this.mapCellsById()).filter((cell) => cell.isSpecial === true).length;
    const totalSpecial = Math.max(0, this.totalSpecialCells());
    const clampedSpecial = Math.min(specialCells, totalSpecial);
    return `${clampedSpecial}/${totalSpecial}`;
  });

  public biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }

}
