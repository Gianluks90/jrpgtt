import { Injectable } from "@angular/core";
import { DAY_NIGHT_ROUNDS_PER_TOGGLE } from "../consts/day-night-cycle";
import { WorldState } from "../models/WorldState";

@Injectable({
  providedIn: "root",
})
export class TurnService {
  public advanceTurn(worldState: WorldState): void {
    const order = worldState.turnOrder ?? [];
    if (order.length === 0) {
      worldState.currentTurn += 1;
      return;
    }

    const currentIndex = worldState.activePlayerId ? order.indexOf(worldState.activePlayerId) : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;

    if (nextIndex === 0) {
      worldState.currentTurn += 1;
      this.toggleTimeOnRoundChange(worldState);
    }

    worldState.activePlayerId = order[nextIndex];
  }

  private toggleTimeOnRoundChange(worldState: WorldState): void {
    const roundsPerToggle = Math.max(1, Math.floor(DAY_NIGHT_ROUNDS_PER_TOGGLE));
    const transitionsSinceStart = Math.max(0, worldState.currentTurn - 1);
    const shouldToggle = transitionsSinceStart % roundsPerToggle === 0;
    if (!shouldToggle) return;

    const currentTime = worldState.timeOfDay ?? "day";
    worldState.timeOfDay = currentTime === "day" ? "night" : "day";
  }
}
