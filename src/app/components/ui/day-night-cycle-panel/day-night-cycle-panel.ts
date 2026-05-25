import { Component, computed, input } from "@angular/core";
import { DAY_NIGHT_ROUNDS_PER_TOGGLE } from "../../../consts/day-night-cycle";
import { TimeOfDay, WorldState } from "../../../models/WorldState";

@Component({
  selector: "app-day-night-cycle-panel",
  templateUrl: "./day-night-cycle-panel.html",
  styleUrl: "./day-night-cycle-panel.scss",
  standalone: true,
})
export class DayNightCyclePanel {
  public worldState = input<WorldState | null>(null);

  public title = computed<string>(() => {
    const rounds = Math.max(1, Math.floor(DAY_NIGHT_ROUNDS_PER_TOGGLE));
    if (rounds === 1) return "Time";
    return `Time (${rounds} rounds)`;
  });

  public timeOfDay = computed<TimeOfDay>(() => {
    return this.worldState()?.timeOfDay ?? "day";
  });

  public label = computed<string>(() => this.timeOfDay());
}
