import { Component, input, output } from "@angular/core";
import { BiomeType } from "../../../models/MapCell";
import { Player } from "../../../models/Player";

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
  public biome = input<BiomeType | null>(null);
  public players = input<Player[]>([]);

  public envTopWidth = input("0px");
  public envRightWidth = input("0px");
  public envBottomWidth = input("0px");
  public envLeftWidth = input("0px");

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
}
