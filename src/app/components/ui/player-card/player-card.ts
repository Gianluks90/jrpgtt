import { Component, computed, input } from "@angular/core";
import { Player } from "../../../models/Player";

@Component({
  selector: "app-player-card",
  imports: [],
  templateUrl: "./player-card.html",
  styleUrl: "./player-card.scss",
})
export class PlayerCard {
  public player = input.required<Player>();
  public highlighted = input(false);

  public hpPercent = computed<number>(() => {
    const currentPlayer = this.player();
    const current = currentPlayer.parameters.hp.current;
    const max = currentPlayer.parameters.hp.max ?? currentPlayer.parameters.hp.base;
    if (max <= 0) return 0;

    const raw = (current / max) * 100;
    return Math.max(0, Math.min(100, raw));
  });
}
