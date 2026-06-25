import { Component, input } from "@angular/core";

export type SpellCardBackSize = "map-cell";

@Component({
  selector: "app-spell-card-back",
  imports: [],
  templateUrl: "./spell-card-back.html",
  styleUrl: "./spell-card-back.scss",
})
export class SpellCardBack {
  public size = input<SpellCardBackSize>("map-cell");
}
