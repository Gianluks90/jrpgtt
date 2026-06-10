import { Component, input, output } from "@angular/core";

@Component({
  selector: "rulebook-button",
  imports: [],
  templateUrl: "./rulebook-button.html",
  styleUrl: "./rulebook-button.scss",
})
export class RulebookButton {
  public ariaLabel = input.required<string>();
  public iconUrl = input("./icons/book_2_20dp_E3E3E3_FILL0_wght400_GRAD0_opsz20.svg");
  public clicked = output<void>();

  public onClick(): void {
    this.clicked.emit();
  }
}
