import { Injectable, signal } from "@angular/core";

export interface MapCellSelectionState {
  selectableCellIds: Set<string>;
  prompt: string;
  onSelect: (x: number, y: number) => void;
  onCancel: (() => void) | null;
}

@Injectable({ providedIn: "root" })
export class MapCellSelectionService {
  private readonly _state = signal<MapCellSelectionState | null>(null);
  public readonly state = this._state.asReadonly();

  public openCellSelection(
    selectableCellIds: Set<string>,
    prompt: string,
    withCancel = true,
  ): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
      this._state.set({
        selectableCellIds,
        prompt,
        onSelect: (x: number, y: number) => {
          this._state.set(null);
          resolve({ x, y });
        },
        onCancel: withCancel
          ? () => {
              this._state.set(null);
              resolve(null);
            }
          : null,
      });
    });
  }

  public handleCellClick(x: number, y: number): boolean {
    const state = this._state();
    if (!state) return false;
    if (state.selectableCellIds.has(`${x}_${y}`)) {
      state.onSelect(x, y);
      return true;
    }
    return false;
  }

  public cancel(): void {
    this._state()?.onCancel?.();
  }
}
