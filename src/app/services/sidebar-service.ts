import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class SidebarService {
  private openStates = signal<Record<string, boolean>>({});

  public isOpen(key: string): boolean {
    return this.openStates()[key] === true;
  }

  public open(key: string): void {
    this.openStates.update((state) => ({ ...state, [key]: true }));
  }

  public close(key: string): void {
    this.openStates.update((state) => ({ ...state, [key]: false }));
  }

  public toggle(key: string): void {
    this.openStates.update((state) => ({ ...state, [key]: !state[key] }));
  }

  public closeMany(keys: string[]): void {
    this.openStates.update((state) => {
      const next = { ...state };
      for (const key of keys) {
        next[key] = false;
      }
      return next;
    });
  }

  public openExclusive(keyToOpen: string, relatedKeys: string[]): void {
    this.openStates.update((state) => {
      const next = { ...state };
      for (const key of relatedKeys) {
        next[key] = false;
      }
      next[keyToOpen] = true;
      return next;
    });
  }
}
