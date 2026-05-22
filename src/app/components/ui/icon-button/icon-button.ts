import { Component, input, output } from "@angular/core";

@Component({
  selector: "icon-button",
  imports: [],
  templateUrl: "./icon-button.html",
  styleUrl: "./icon-button.scss",
})
export class IconButton {
  public iconUrl = input.required<string>();
  public disabled = input(false);
  public ariaLabel = input("Icon button");
  public clicked = output<void>();

  public handleClick(): void {
    if (this.disabled()) return;
    this.clicked.emit();
  }
}
