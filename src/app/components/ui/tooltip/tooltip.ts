import { Component, computed, input, signal } from "@angular/core";
import { TooltipVisibilityService } from "../../../services/tooltip-visibility-service";

let tooltipSequence = 0;

@Component({
  selector: "app-ui-tooltip",
  standalone: true,
  templateUrl: "./tooltip.html",
  styleUrl: "./tooltip.scss",
})
export class UiTooltip {
  public tooltipId = input<string | null>(null);
  public title = input("Details");
  public disabled = input(false);

  private readonly fallbackId = `tooltip-${++tooltipSequence}`;
  private readonly mouseX = signal(0);
  private readonly mouseY = signal(0);

  constructor(private tooltipVisibilityService: TooltipVisibilityService) {}

  public isVisible = computed<boolean>(() => {
    if (this.disabled()) return false;
    return this.tooltipVisibilityService.isVisible(this.effectiveId());
  });

  public onMouseEnter(): void {
    if (this.disabled()) return;
    this.tooltipVisibilityService.show(this.effectiveId());
  }

  public onMouseMove(event: MouseEvent): void {
    const offset = 14;
    const estimatedPanelWidth = 280;
    const estimatedPanelHeight = 220;
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;

    const rawLeft = event.clientX + offset;
    const rawTop = event.clientY + offset;

    const nextLeft = Math.max(8, Math.min(rawLeft, viewportWidth - estimatedPanelWidth - 8));
    const nextTop = Math.max(8, Math.min(rawTop, viewportHeight - estimatedPanelHeight - 8));

    this.mouseX.set(nextLeft);
    this.mouseY.set(nextTop);
  }

  public onMouseLeave(): void {
    this.tooltipVisibilityService.hide(this.effectiveId());
  }

  public panelLeft = computed<number>(() => this.mouseX());
  public panelTop = computed<number>(() => this.mouseY());

  private effectiveId(): string {
    return this.tooltipId() ?? this.fallbackId;
  }
}
