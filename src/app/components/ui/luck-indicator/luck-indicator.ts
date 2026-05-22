import { Component, computed, input } from "@angular/core";
import { LuckCheckResult } from "../../../models/LuckCheckResult";

@Component({
  selector: "app-luck-indicator",
  templateUrl: "./luck-indicator.html",
  styleUrl: "./luck-indicator.scss",
  standalone: true,
})
export class LuckIndicator {
  public result = input<LuckCheckResult | null>(null);

  public statusLabel = computed(() => {
    const result = this.result();
    if (!result) return "-";
    if (result.success) return "Yes!";
    if (result.nearSuccess) return "Near";
    return "Nope";
  });

  public statusClass = computed(() => {
    const result = this.result();
    if (!result) return "neutral";
    if (result.success) return "success";
    if (result.nearSuccess) return "near";
    return "fail";
  });
}
