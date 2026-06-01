import { Component, computed, input } from "@angular/core";
import { PlayerComputedStats } from "../../../models/PlayerComputedStats";
import { Player } from "../../../models/Player";
import { UiTooltip } from "../tooltip/tooltip";
import { StatusCatalogService } from "../../../services/status-catalog-service";

interface ActiveEffectRow {
  key: string;
  isBonus: boolean;
  label: string;
  iconUrl: string;
}

interface ActiveStatusRow {
  key: string;
  label: string;
  description: string;
  durationTurns: number;
  iconUrl: string;
}

@Component({
  selector: "app-player-card",
  imports: [UiTooltip],
  templateUrl: "./player-card.html",
  styleUrl: "./player-card.scss",
})
export class PlayerCard {
  constructor(private statusCatalogService: StatusCatalogService) {}

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

  public activeStatuses = computed<ActiveStatusRow[]>(() => {
    const statuses = this.player().statuses ?? [];
    return statuses
      .filter((status) => {
        if (!status || typeof status !== "object") return false;
        if (typeof status.key !== "string" || !status.key.trim()) return false;
        if (typeof status.durationTurns !== "number" || !Number.isFinite(status.durationTurns)) return false;
        return status.durationTurns > 0;
      })
      .map((status) => {
        const key = String(status.key);
        const catalogStatus = this.statusCatalogService.getCachedStatus(key);
        const iconUrl = catalogStatus?.iconUrl ?? "";
        const label = String(status.label ?? catalogStatus?.label ?? key);
        const description = String(status.description ?? catalogStatus?.description ?? "");

        return {
          key,
          label,
          description,
          durationTurns: Math.max(1, Math.floor(Number(status.durationTurns))),
          iconUrl,
        };
      })
      .filter((status) => status.iconUrl.trim().length > 0);
  });

  public visibleStatusIcons = computed<ActiveStatusRow[]>(() => {
    return this.activeStatuses().slice(0, 2);
  });

  public hasOverflowStatuses = computed<boolean>(() => {
    return this.activeStatuses().length > 2;
  });

  public hasVisibleStatuses = computed<boolean>(() => {
    return this.activeStatuses().length > 0;
  });

  public statusTurnsLabel(durationTurns: number): string {
    const turns = Math.max(1, Math.floor(Number(durationTurns ?? 1)));
    return turns === 1 ? "1 turn left" : `${turns} turns left`;
  }

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

  public mpPercent = computed<number>(() => {
    const currentPlayer = this.player();
    const current = currentPlayer.parameters.mp.current;
    const max = currentPlayer.parameters.mp.max ?? currentPlayer.parameters.mp.base;
    if (max <= 0) return 0;
    const raw = (current / max) * 100;
    return Math.max(0, Math.min(100, raw));
  });
}
