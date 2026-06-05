import { Component, computed, input } from "@angular/core";
import { SanctuaryElement } from "../../../models/MapCell";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "../../../services/translation-service";

@Component({
  selector: "app-attunement-indicator",
  imports: [TranslationPipe],
  templateUrl: "./attunement-indicator.html",
  styleUrl: "./attunement-indicator.scss",
  standalone: true,
})
export class AttunementIndicator {
  constructor(private translationService: TranslationService) {}

  public element = input<SanctuaryElement | null>(null);

  public label = computed<string>(() => {
    const element = this.element();
    if (element === "water") return this.translationService.tOrFallback("map.elements.water", "Water");
    if (element === "fire") return this.translationService.tOrFallback("map.elements.fire", "Fire");
    if (element === "wind") return this.translationService.tOrFallback("map.elements.wind", "Wind");
    if (element === "earth") return this.translationService.tOrFallback("map.elements.earth", "Earth");
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
