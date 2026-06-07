import { Component, computed, ElementRef, input, signal, viewChild } from "@angular/core";
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
  public placement = input<"cursor" | "trigger">("cursor");

  private readonly fallbackId = `tooltip-${++tooltipSequence}`;
  private readonly mouseX = signal(0);
  private readonly mouseY = signal(0);
  private readonly tooltipPanelRef = viewChild<ElementRef<HTMLElement>>("tooltipPanel");
  private readonly tooltipTriggerRef = viewChild<ElementRef<HTMLElement>>("tooltipTrigger");

  constructor(private tooltipVisibilityService: TooltipVisibilityService) {}

  public isVisible = computed<boolean>(() => {
    if (this.disabled()) return false;
    return this.tooltipVisibilityService.isVisible(this.effectiveId());
  });

  public onMouseEnter(event: MouseEvent): void {
    if (this.disabled()) return;
    this.tooltipVisibilityService.show(this.effectiveId());

    if (this.placement() === "trigger") {
      this.positionNearTrigger();
      return;
    }

    this.onMouseMove(event);
  }

  public onMouseMove(event: MouseEvent): void {
    if (this.placement() === "trigger") return;

    const offset = 14;
    const viewportPadding = 8;
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;

    let nextLeft = event.clientX + offset;
    if (nextLeft > viewportWidth - viewportPadding - 220) {
      nextLeft = event.clientX - offset - 220;
    }
    nextLeft = Math.max(
      viewportPadding,
      Math.min(nextLeft, viewportWidth - viewportPadding),
    );

    let nextTop = event.clientY + offset;
    if (nextTop > viewportHeight - viewportPadding - 120) {
      nextTop = event.clientY - offset - 120;
    }
    nextTop = Math.max(
      viewportPadding,
      Math.min(nextTop, viewportHeight - viewportPadding),
    );

    this.mouseX.set(nextLeft);
    this.mouseY.set(nextTop);

    requestAnimationFrame(() => {
      this.clampPanelToViewport(viewportPadding);
    });
  }

  public onMouseLeave(): void {
    this.tooltipVisibilityService.hide(this.effectiveId());
  }

  public panelLeft = computed<number>(() => this.mouseX());
  public panelTop = computed<number>(() => this.mouseY());

  private positionNearTrigger(): void {
    const triggerEl = this.tooltipTriggerRef()?.nativeElement;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const offset = 10;
    this.mouseX.set(rect.right + offset);
    this.mouseY.set(rect.top);

    requestAnimationFrame(() => {
      this.clampPanelToViewport(8);
    });
  }

  private clampPanelToViewport(viewportPadding: number): void {
    const panelEl = this.tooltipPanelRef()?.nativeElement;
    if (!panelEl) return;

    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    const rect = panelEl.getBoundingClientRect();

    let deltaX = 0;
    if (rect.right > viewportWidth - viewportPadding) {
      deltaX = (viewportWidth - viewportPadding) - rect.right;
    } else if (rect.left < viewportPadding) {
      deltaX = viewportPadding - rect.left;
    }

    let deltaY = 0;
    if (rect.bottom > viewportHeight - viewportPadding) {
      deltaY = (viewportHeight - viewportPadding) - rect.bottom;
    } else if (rect.top < viewportPadding) {
      deltaY = viewportPadding - rect.top;
    }

    if (deltaX !== 0) {
      this.mouseX.set(this.mouseX() + deltaX);
    }

    if (deltaY !== 0) {
      this.mouseY.set(this.mouseY() + deltaY);
    }
  }

  private effectiveId(): string {
    return this.tooltipId() ?? this.fallbackId;
  }
}
