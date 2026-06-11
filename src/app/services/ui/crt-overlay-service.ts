import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class CrtOverlayService {
  private readonly storageKey = "jrpgtt:crtOverlayEnabled";
  private initialized = false;
  public readonly isEnabled = signal(true);

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.restoreEnabledState();
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled.set(enabled);

    try {
      localStorage.setItem(this.storageKey, enabled ? "1" : "0");
    } catch {
      // Ignore storage errors and keep runtime state only.
    }
  }

  public toggleEnabled(): void {
    this.setEnabled(!this.isEnabled());
  }

  private restoreEnabledState(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored === "0") {
        this.isEnabled.set(false);
        return;
      }
      if (stored === "1") {
        this.isEnabled.set(true);
      }
    } catch {
      // Ignore storage errors and use runtime default.
    }
  }
}