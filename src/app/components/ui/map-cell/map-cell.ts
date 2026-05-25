import { Component, input, output } from "@angular/core";
import { BiomeType } from "../../../models/MapCell";
import { Player } from "../../../models/Player";
import { SanctuaryTilesConfigEntry } from "../../../models/TilesConfig";

@Component({
  selector: "map-cell",
  imports: [],
  templateUrl: "./map-cell.html",
  styleUrl: "./map-cell.scss",
})
export class MapCellComponent {
  public revealed = input(false);
  public special = input(false);
  public movable = input(false);
  public hoveredEnvironment = input(false);
  public dangerOverlayLevel = input<0 | 1 | 2>(0, { alias: "dangerOverlayLevel" });
  public biome = input<BiomeType | null>(null);
  public sanctuaryStyle = input<SanctuaryTilesConfigEntry | null>(null);
  public players = input<Player[]>([]);
  public activePlayerId = input<string | null>(null);

  public envTopWidth = input("0px");
  public envRightWidth = input("0px");
  public envBottomWidth = input("0px");
  public envLeftWidth = input("0px");
  public hoverIntentProgress = input(0);

  public cellClicked = output<void>();
  public cellEntered = output<void>();
  public cellLeft = output<void>();

  public onClick(): void {
    this.cellClicked.emit();
  }

  public onMouseEnter(): void {
    this.cellEntered.emit();
  }

  public onMouseLeave(): void {
    this.cellLeft.emit();
  }

  public markerColor(): string {
    const players = this.players();
    if (players.length === 0) return "#ffffff";

    const activePlayerId = this.activePlayerId();
    if (activePlayerId) {
      const activeInCell = players.find((player) => player.id === activePlayerId);
      if (activeInCell) return activeInCell.color;
    }

    return players[0].color;
  }

  public extraPlayersCount(): number {
    return Math.max(0, this.players().length - 1);
  }
}
