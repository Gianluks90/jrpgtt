import { Component, inject, input, OnDestroy, output } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { CdkMenu, CdkMenuTrigger } from "@angular/cdk/menu";
import { TextButton } from "../text-button/text-button";
import { WorldStatePanel } from "../../core/world-state-panel/world-state-panel";
import { WorldState } from "@models/world/WorldState";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { SidebarService } from "@services/ui/sidebar-service";

@Component({
  selector: "app-map-mobile-controls",
  imports: [TextButton, WorldStatePanel, CdkMenu, CdkMenuTrigger, NgTemplateOutlet],
  templateUrl: "./map-mobile-controls.html",
  styleUrl: "./map-mobile-controls.scss",
})
export class MapMobileControls implements OnDestroy {
  private sidebarService = inject(SidebarService);

  private readonly worldSidebarKey = "map-world-sidebar";
  private readonly rightSidebarKey = "map-right-sidebar";

  public worldState = input<WorldState | null>(null);
  public players = input<Player[]>([]);
  public currentUserId = input("");
  public mapCellsById = input<Record<string, MapCell>>({});
  public mapSize = input(10);
  public environmentByCellId = input<Record<string, string[]>>({});

  public backHome = output<void>();

  public ngOnDestroy(): void {
    this.sidebarService.closeMany([this.worldSidebarKey, this.rightSidebarKey]);
  }

  public onHomeClicked(trigger: CdkMenuTrigger): void {
    trigger.close();
    this.sidebarService.closeMany([this.worldSidebarKey, this.rightSidebarKey]);
    this.backHome.emit();
  }

  public openWorldSidebar(trigger: CdkMenuTrigger): void {
    trigger.close();
    this.sidebarService.openExclusive(this.worldSidebarKey, [this.worldSidebarKey, this.rightSidebarKey]);
  }

  public openRightSidebar(trigger: CdkMenuTrigger): void {
    trigger.close();
    this.sidebarService.openExclusive(this.rightSidebarKey, [this.worldSidebarKey, this.rightSidebarKey]);
  }

  public closeWorldSidebar(): void {
    this.sidebarService.close(this.worldSidebarKey);
  }

  public closeRightSidebar(): void {
    this.sidebarService.close(this.rightSidebarKey);
  }

  public isWorldSidebarOpen(): boolean {
    return this.sidebarService.isOpen(this.worldSidebarKey);
  }

  public isRightSidebarOpen(): boolean {
    return this.sidebarService.isOpen(this.rightSidebarKey);
  }
}
