import { Component, computed, input } from "@angular/core";
import { PlayerComputedStats } from "../../../models/PlayerComputedStats";
import { Player } from "../../../models/Player";
import { UiTooltip } from "../tooltip/tooltip";

interface ActiveEffectRow {
  key: string;
  isBonus: boolean;
  label: string;
  iconUrl: string;
}

@Component({
  selector: "app-player-card",
  imports: [UiTooltip],
  templateUrl: "./player-card.html",
  styleUrl: "./player-card.scss",
})
export class PlayerCard {
  public player = input.required<Player>();
  public computedStats = input<PlayerComputedStats | null>(null);
  public highlighted = input(false);

  public hpPercent = computed<number>(() => {
    const currentPlayer = this.player();
    const current = currentPlayer.parameters.hp.current;
    const max = currentPlayer.parameters.hp.max ?? currentPlayer.parameters.hp.base;
    if (max <= 0) return 0;

    const raw = (current / max) * 100;
    return Math.max(0, Math.min(100, raw));
  });

  public strengthValue = computed<number>(() => {
    return this.computedStats()?.effective.strength ?? this.player().parameters.strength.current;
  });

  public magicValue = computed<number>(() => {
    return this.computedStats()?.effective.magic ?? this.player().parameters.magic.current;
  });

  public luckValue = computed<number>(() => {
    return this.computedStats()?.effective.luck ?? this.player().parameters.luck.current;
  });

  public strengthDelta = computed<number>(() => {
    return this.computedStats()?.delta.strength ?? 0;
  });

  public magicDelta = computed<number>(() => {
    return this.computedStats()?.delta.magic ?? 0;
  });

  public luckDelta = computed<number>(() => {
    return this.computedStats()?.delta.luck ?? 0;
  });

  public activeEffects = computed<ActiveEffectRow[]>(() => {
    const deltas = this.computedStats()?.appliedDeltas ?? [];
    return deltas.map((delta, index) => {
      const amount = Math.abs(delta.amount);
      const sign = delta.amount >= 0 ? "+" : "-";
      return {
        key: `${delta.source}-${delta.characteristic}-${index}`,
        isBonus: delta.amount >= 0,
        label: `${sign}${amount} ${this.characteristicLabel(delta.characteristic)} - ${delta.reason}`,
        iconUrl: delta.amount >= 0 ? "/tooltip-icons/bonus-icon.svg" : "/tooltip-icons/malus-icon.svg",
      };
    });
  });

  public hasActiveEffects = computed<boolean>(() => {
    return this.activeEffects().length > 0;
  });

  public deltaLabel(delta: number): string {
    if (delta > 0) return `+${delta}`;
    return `${delta}`;
  }

  public deltaClass(delta: number): string {
    if (delta > 0) return "boosted";
    if (delta < 0) return "reduced";
    return "neutral";
  }

  private characteristicLabel(characteristic: "strength" | "magic" | "luck"): string {
    if (characteristic === "strength") return "STR";
    if (characteristic === "magic") return "MAG";
    return "LCK";
  }
}
