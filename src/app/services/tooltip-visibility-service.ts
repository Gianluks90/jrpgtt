import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class TooltipVisibilityService {
  private readonly visibleById = signal<Record<string, boolean>>({});

  public show(id: string): void {
    if (!id) return;
    this.visibleById.update((current) => ({
      ...current,
      [id]: true,
    }));
  }

  public hide(id: string): void {
    if (!id) return;
    this.visibleById.update((current) => ({
      ...current,
      [id]: false,
    }));
  }

  public isVisible(id: string): boolean {
    if (!id) return false;
    return this.visibleById()[id] === true;
  }
}
