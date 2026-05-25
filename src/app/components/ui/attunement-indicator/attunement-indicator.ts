import { Component, computed, input } from "@angular/core";
import { SanctuaryElement } from "../../../models/MapCell";

@Component({
  selector: "app-attunement-indicator",
  templateUrl: "./attunement-indicator.html",
  styleUrl: "./attunement-indicator.scss",
  standalone: true,
})
export class AttunementIndicator {
  public element = input<SanctuaryElement | null>(null);

  public label = computed<string>(() => {
    const element = this.element();
    if (element === "water") return "Water";
    if (element === "fire") return "Fire";
    if (element === "wind") return "Wind";
    if (element === "earth") return "Earth";
    return "-";
  });

  public iconUrl = computed<string | null>(() => {
    const element = this.element();
    if (element === "water") return "/map-icons/shrine-water-tile-icon.svg";
    if (element === "fire") return "/map-icons/shrine-fire-tile-icon.svg";
    if (element === "wind") return "/map-icons/shrine-wind-tile-icon.svg";
    if (element === "earth") return "/map-icons/shrine-earth-tile-icon.svg";
    return null;
  });

  public elementClass = computed<string>(() => {
    const element = this.element();
    if (element === "water") return "water";
    if (element === "fire") return "fire";
    if (element === "wind") return "wind";
    if (element === "earth") return "earth";
    return "none";
  });
}
