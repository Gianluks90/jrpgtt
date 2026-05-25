import { Component, input } from "@angular/core";
import { BiomeType } from "../../../models/MapCell";
import { WorldState } from "../../../models/WorldState";

@Component({
  selector: "app-biomes-counter",
  templateUrl: "./biomes-counter.html",
  styleUrl: "./biomes-counter.scss",
  standalone: true,
})
export class BiomesCounter {
  public worldState = input<WorldState | null>(null);
  public biomeOrder: BiomeType[] = ["plains", "forest", "mountain", "water", "desert", "ruins"];
}