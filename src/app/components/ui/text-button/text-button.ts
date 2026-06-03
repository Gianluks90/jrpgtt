import { Component, input, output } from "@angular/core";

@Component({
  selector: "text-button",
  imports: [],
  templateUrl: "./text-button.html",
  styleUrl: "./text-button.scss",
})
export class TextButton {
  public text = input.required<string>();
  public iconUrl = input<string>();
  public disabled = input(false);
  public fullWidth = input(false);
  public compact = input(false);
  public clicked = output<void>();

  public handleClick() {
    if (this.disabled()) return;
    this.clicked.emit();
  }
}
