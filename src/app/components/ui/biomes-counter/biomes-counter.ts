import { Component, input } from "@angular/core";
import { BiomeType, MapCell } from "../../../models/MapCell";
import { WorldState } from "../../../models/WorldState";

@Component({
  selector: "app-biomes-counter",
  templateUrl: "./biomes-counter.html",
  styleUrl: "./biomes-counter.scss",
  standalone: true,
})
export class BiomesCounter {
  public worldState = input<WorldState | null>(null);
  public mapCellsById = input<Record<string, MapCell>>({});
  public biomeOrder: BiomeType[] = ["plains", "forest", "mountain", "water", "desert", "ruins"];

  public countBiome(biome: BiomeType): number {
    return Object.values(this.mapCellsById()).reduce((total, cell) => {
      if (!cell || cell.isSpecial === true) {
        return total;
      }

      const effectiveBiome = cell.worldEventBiomeOverride ?? cell.biome;
      return total + (effectiveBiome === biome ? 1 : 0);
    }, 0);
  }
}