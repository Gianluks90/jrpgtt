import { Component, input } from "@angular/core";
import { LuckCheckResult } from "../../../models/LuckCheckResult";
import { LuckIndicator } from "../luck-indicator/luck-indicator";

@Component({
  selector: "dialog-wrapper",
  imports: [LuckIndicator],
  templateUrl: "./dialog-wrapper.html",
  styleUrl: "./dialog-wrapper.scss",
})
export class DialogWrapper {
  public title = input.required<string>();
  public hideActions = input<boolean>(false);
  public luckResult = input<LuckCheckResult | null | undefined>(undefined);
  public luckAnimateFirstResult = input<boolean>(false);
}
