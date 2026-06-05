import { Component, input } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";

@Component({
  selector: "app-money-counter",
  imports: [TranslationPipe],
  templateUrl: "./money-counter.html",
  styleUrl: "./money-counter.scss",
  standalone: true,
})
export class MoneyCounter {
  public money = input(0);
}
