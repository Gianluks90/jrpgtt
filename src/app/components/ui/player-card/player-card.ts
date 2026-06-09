import { Component, computed, input } from "@angular/core";
import { PlayerComputedStats } from "../../../models/PlayerComputedStats";
import { Player } from "../../../models/Player";
import { UiTooltip } from "../tooltip/tooltip";
import { StatusCatalogService } from "../../../services/status-catalog-service";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TranslationService } from "../../../services/translation-service";

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
  imports: [UiTooltip, TranslationPipe],
  templateUrl: "./player-card.html",
  styleUrl: "./player-card.scss",
})
export class PlayerCard {
  constructor(
    private statusCatalogService: StatusCatalogService,
    private translationService: TranslationService,
  ) {}

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
      const localizedReason = this.localizeDeltaReason(delta.reason);
      return {
        key: `${delta.source}-${delta.characteristic}-${index}`,
        isBonus: delta.amount >= 0,
        label: `${sign}${amount} ${this.characteristicLabel(delta.characteristic)} - ${localizedReason}`,
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
        const localizedLabel = this.statusCatalogService.getLocalizedLabel(
          key,
          String(catalogStatus?.label ?? status.label ?? key),
        );
        const localizedDescription = this.statusCatalogService.getLocalizedDescription(
          key,
          String(catalogStatus?.description ?? status.description ?? ""),
        );
        const label = localizedLabel || String(status.label ?? catalogStatus?.label ?? key);
        const description = localizedDescription || String(status.description ?? catalogStatus?.description ?? "");

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
    if (turns === 1) {
      return this.translationService.tOrFallback("playerCard.turnLeft.one", "1 turn left", { turns });
    }

    return this.translationService.tOrFallback("playerCard.turnLeft.many", "{turns} turns left", { turns });
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
    if (characteristic === "strength") {
      return this.translationService.tOrFallback("playerCard.stats.strengthAbbr", "STR");
    }

    if (characteristic === "magic") {
      return this.translationService.tOrFallback("playerCard.stats.magicAbbr", "MAG");
    }

    return this.translationService.tOrFallback("playerCard.stats.luckAbbr", "LCK");
  }

  private localizeDeltaReason(reason: string): string {
    const normalizedReason = String(reason ?? "").trim();
    if (!normalizedReason) {
      return this.translationService.tOrFallback("playerCard.effectReasons.generic", "Modifier");
    }

    if (normalizedReason === "Status modifier") {
      return this.translationService.tOrFallback("playerCard.effectReasons.statusModifier", "Status modifier");
    }

    if (normalizedReason === "Aligned with landmark ethos") {
      return this.translationService.tOrFallback("playerCard.effectReasons.alignedLandmark", "Aligned with landmark ethos");
    }

    if (normalizedReason === "Opposed to landmark ethos") {
      return this.translationService.tOrFallback("playerCard.effectReasons.opposedLandmark", "Opposed to landmark ethos");
    }

    if (normalizedReason === "Attuned sanctuary influence in current quadrant") {
      return this.translationService.tOrFallback(
        "playerCard.effectReasons.sanctuaryQuadrantInfluence",
        "Attuned sanctuary influence in current quadrant",
      );
    }

    const biomeConditionMatch = normalizedReason.match(/^Biome condition \((.+)\)$/i);
    if (biomeConditionMatch) {
      const conditionId = biomeConditionMatch[1];
      const conditionLabel = this.translationService.tOrFallback(
        `map.cellInspector.conditionLabel.${conditionId}`,
        conditionId,
      );
      return this.translationService.tOrFallback(
        "playerCard.effectReasons.biomeCondition",
        "Biome condition ({condition})",
        { condition: conditionLabel },
      );
    }

    const followerModifierMatch = normalizedReason.match(/^(.+)\smodifier$/i);
    if (followerModifierMatch) {
      return this.translationService.tOrFallback(
        "playerCard.effectReasons.followerModifier",
        "{name} modifier",
        { name: followerModifierMatch[1] },
      );
    }

    const followerStatusMatch = normalizedReason.match(/^(.+)\sstatus\s\((.+)\)$/i);
    if (followerStatusMatch) {
      const followerName = followerStatusMatch[1];
      const statusKey = followerStatusMatch[2];
      const localizedStatus = this.statusCatalogService.getLocalizedLabel(statusKey, statusKey);
      return this.translationService.tOrFallback(
        "playerCard.effectReasons.followerStatus",
        "{name} status ({status})",
        {
          name: followerName,
          status: localizedStatus,
        },
      );
    }

    return normalizedReason;
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
