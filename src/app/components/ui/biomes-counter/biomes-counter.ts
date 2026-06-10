import { Component, input, output } from "@angular/core";
import { BiomeType, MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";

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
  public specialCounterHoverChanged = output<boolean>();

  public countBiome(biome: BiomeType): number {
    return Object.values(this.mapCellsById()).reduce((total, cell) => {
      if (!cell || cell.isSpecial === true) {
        return total;
      }

      const effectiveBiome = cell.worldEventBiomeOverride ?? cell.biome;
      return total + (effectiveBiome === biome ? 1 : 0);
    }, 0);
  }

  public countSpecialLocations(): number {
    return Object.values(this.mapCellsById()).reduce((total, cell) => {
      if (!cell) {
        return total;
      }

      return total + (cell.isSpecial === true && !!cell.discoveredBy ? 1 : 0);
    }, 0);
  }

  public onSpecialCounterEnter(): void {
    this.specialCounterHoverChanged.emit(true);
  }

  public onSpecialCounterLeave(): void {
    this.specialCounterHoverChanged.emit(false);
  }
}