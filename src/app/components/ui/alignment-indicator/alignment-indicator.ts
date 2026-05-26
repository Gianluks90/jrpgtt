import { Component, computed, input } from "@angular/core";
import { PlayerAlignment } from "../../../models/Player";

@Component({
  selector: "app-alignment-indicator",
  templateUrl: "./alignment-indicator.html",
  styleUrl: "./alignment-indicator.scss",
  standalone: true,
})
export class AlignmentIndicator {
  public alignment = input<PlayerAlignment | null>(null);

  public label = computed<string>(() => {
    const alignment = this.alignment();
    if (alignment === "good") return "Good";
    if (alignment === "evil") return "Evil";
    return "Neutral";
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
