import { Component, input, signal } from "@angular/core";
import { TextButton } from "../text-button/text-button";
import { IconButton } from "../icon-button/icon-button";

@Component({
  selector: "sidebar-wrapper",
  imports: [TextButton, IconButton],
  templateUrl: "./sidebar-wrapper.html",
  styleUrl: "./sidebar-wrapper.scss",
})
export class SidebarWrapper {
  public iconUrl = input.required<string>();
  public text = input<string>("");
  public side = input<"left" | "right">("right");
  public panelCoveragePercent = input(90);
  public fullWidthTrigger = input(false);
  public hideTrigger = input(false);
  public disabled = input(false);
  public ariaLabel = input("Open sidebar");

  public isOpen = signal(false);

  public toggle(): void {
    if (this.disabled()) return;
    this.isOpen.update((open) => !open);
  }

  public close(): void {
    this.isOpen.set(false);
  }

  public onPanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
