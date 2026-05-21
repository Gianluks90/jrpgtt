import { Component, input } from "@angular/core";

@Component({
  selector: "dialog-wrapper",
  imports: [],
  templateUrl: "./dialog-wrapper.html",
  styleUrl: "./dialog-wrapper.scss",
})
export class DialogWrapper {
  public title = input.required<string>();
  public hideActions = input<boolean>(false);
}
