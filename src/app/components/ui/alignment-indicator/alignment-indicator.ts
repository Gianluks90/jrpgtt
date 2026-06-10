import { Component, computed, input } from "@angular/core";
import { PlayerAlignment } from "@models/player/Player";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";

@Component({
  selector: "app-alignment-indicator",
  imports: [TranslationPipe],
  templateUrl: "./alignment-indicator.html",
  styleUrl: "./alignment-indicator.scss",
  standalone: true,
})
export class AlignmentIndicator {
  constructor(private translationService: TranslationService) {}

  public alignment = input<PlayerAlignment | null>(null);

  public label = computed<string>(() => {
    const alignment = this.alignment();
    if (alignment === "good") return this.translationService.tOrFallback("lobby.alignment.good", "Good");
    if (alignment === "evil") return this.translationService.tOrFallback("lobby.alignment.evil", "Evil");
    return this.translationService.tOrFallback("lobby.alignment.neutral", "Neutral");
  });

  public iconUrl = computed<string>(() => {
    const alignment = this.alignment();
    if (alignment === "good") return "/alignment-icons/good-icon.svg";
    if (alignment === "evil") return "/alignment-icons/evil-icon.svg";
    return "/alignment-icons/neutral-icon.svg";
  });

  public alignmentClass = computed<string>(() => {
    const alignment = this.alignment();
    if (alignment === "good") return "good";
    if (alignment === "evil") return "evil";
    return "neutral";
  });
}
