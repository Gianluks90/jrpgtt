import { inject, Injectable, Injector } from "@angular/core";
import { BreakpointObserver } from "@angular/cdk/layout";
import { toSignal } from "@angular/core/rxjs-interop";
import { map } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class BreakpointService {
  private injector = inject(Injector);
  private breakpointObserver = inject(BreakpointObserver);

  public readonly isMobile = toSignal(
    this.breakpointObserver
      .observe("(max-width: 768px)")
      .pipe(map((state) => state.matches)),
    { initialValue: false, injector: this.injector }
  );
}