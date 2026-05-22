import { Component, input } from "@angular/core";

@Component({
  selector: "app-money-counter",
  templateUrl: "./money-counter.html",
  styleUrl: "./money-counter.scss",
  standalone: true,
})
export class MoneyCounter {
  public money = input(0);
}
