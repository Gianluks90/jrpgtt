import { Component, inject, input, signal } from "@angular/core";
import { TextButton } from "../text-button/text-button";
import { IconButton } from "../icon-button/icon-button";
import { SidebarService } from "../../../services/sidebar-service";

@Component({
  selector: "sidebar-wrapper",
  imports: [TextButton, IconButton],
  templateUrl: "./sidebar-wrapper.html",
  styleUrl: "./sidebar-wrapper.scss",
})
export class SidebarWrapper {
  private sidebarService = inject(SidebarService);

  public iconUrl = input.required<string>();
  public text = input<string>("");
  public side = input<"left" | "right">("right");
  public panelCoveragePercent = input(90);
  public fullWidthTrigger = input(false);
  public hideTrigger = input(false);
  public sidebarKey = input<string | null>(null);
  public disabled = input(false);
  public ariaLabel = input("Open sidebar");

  private localIsOpen = signal(false);

  public isOpen(): boolean {
    const key = this.sidebarKey();
    if (key) return this.sidebarService.isOpen(key);
    return this.localIsOpen();
  }

  public toggle(): void {
    if (this.disabled()) return;

    const key = this.sidebarKey();
    if (key) {
      this.sidebarService.toggle(key);
      return;
    }

    this.localIsOpen.update((open) => !open);
  }

  public close(): void {
    const key = this.sidebarKey();
    if (key) {
      this.sidebarService.close(key);
      return;
    }

    this.localIsOpen.set(false);
  }

  public onPanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
