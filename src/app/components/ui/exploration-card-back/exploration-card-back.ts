import { Component, input } from "@angular/core";

export type ExplorationCardBackSize = "map-cell";
export type ExplorationCardBackVariant = "deck" | "discard";

@Component({
  selector: "app-exploration-card-back",
  imports: [],
  templateUrl: "./exploration-card-back.html",
  styleUrl: "./exploration-card-back.scss",
})
export class ExplorationCardBack {
  public size = input<ExplorationCardBackSize>("map-cell");
  public variant = input<ExplorationCardBackVariant>("deck");
}
