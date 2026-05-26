import { Injectable } from "@angular/core";
import { MapCell, SanctuaryElement } from "../models/MapCell";
import { Player, PlayerAlignment } from "../models/Player";
import { PlayerCharacteristicDelta, PlayerComputedStats } from "../models/PlayerComputedStats";
import { WorldState } from "../models/WorldState";
import { QuadrantId } from "../models/WorldZone";
import { WorldZonesService } from "./world-zones-service";

interface PlayerStatsContext {
  player: Player;
  currentCell: MapCell | null;
  worldState: WorldState | null;
  mapSize: number;
}

@Injectable({
  providedIn: "root",
})
export class PlayerStatsModifierService {
  constructor(private worldZonesService: WorldZonesService) {}

  public computeStats(context: PlayerStatsContext): PlayerComputedStats {
    const player = context.player;
    const baseStrength = this.normalize(player.parameters.strength.current);
    const baseMagic = this.normalize(player.parameters.magic.current);
    const baseLuck = this.normalize(player.parameters.luck.current);

    const appliedDeltas = this.collectDeltas(context);
    const delta = {
      strength: this.sumByCharacteristic(appliedDeltas, "strength"),
      magic: this.sumByCharacteristic(appliedDeltas, "magic"),
      luck: this.sumByCharacteristic(appliedDeltas, "luck"),
    };

    return {
      effective: {
        strength: Math.max(0, baseStrength + delta.strength),
        magic: Math.max(0, baseMagic + delta.magic),
        luck: Math.max(0, baseLuck + delta.luck),
      },
      delta,
      appliedDeltas,
    };
  }

  public computeEffectiveLuck(context: PlayerStatsContext): number {
    return this.computeStats(context).effective.luck;
  }

  private collectDeltas(context: PlayerStatsContext): PlayerCharacteristicDelta[] {
    const deltas: PlayerCharacteristicDelta[] = [];
    this.applyLandmarkAlignmentDelta(context, deltas);
    this.applySanctuaryQuadrantAttunementDelta(context, deltas);
    return deltas;
  }

  private applyLandmarkAlignmentDelta(context: PlayerStatsContext, deltas: PlayerCharacteristicDelta[]): void {
    const alignment = context.player.alignment;
    const landmarkAlignment = context.currentCell?.landmarkAlignmentModifier;
    if (!alignment || !landmarkAlignment) return;
    if (alignment === "neutral" || landmarkAlignment === "neutral") return;

    if (alignment === landmarkAlignment) {
      deltas.push({
        characteristic: "luck",
        amount: 2,
        source: "landmark-alignment",
        reason: "Aligned with landmark ethos",
      });
      return;
    }

    if (this.areOppositeAlignments(alignment, landmarkAlignment)) {
      deltas.push({
        characteristic: "luck",
        amount: -2,
        source: "landmark-alignment",
        reason: "Opposed to landmark ethos",
      });
    }
  }

  private applySanctuaryQuadrantAttunementDelta(
    context: PlayerStatsContext,
    deltas: PlayerCharacteristicDelta[],
  ): void {
    const attunedElement = context.player.attunedElement;
    const worldState = context.worldState;
    if (!attunedElement || !worldState) return;

    const quadrantId = this.worldZonesService.getQuadrantIdByCoordinate(
      context.player.location.x,
      context.player.location.y,
      context.mapSize,
    );

    const influencedElement = this.elementForQuadrant(worldState, quadrantId);
    if (!influencedElement || influencedElement !== attunedElement) return;

    const reason = "Attuned sanctuary influence in current quadrant";
    deltas.push({ characteristic: "strength", amount: 1, source: "sanctuary-quadrant", reason });
    deltas.push({ characteristic: "magic", amount: 1, source: "sanctuary-quadrant", reason });
    deltas.push({ characteristic: "luck", amount: 1, source: "sanctuary-quadrant", reason });
  }

  private elementForQuadrant(worldState: WorldState, quadrantId: QuadrantId): SanctuaryElement | null {
    const influence = worldState.sanctuaryInfluenceByQuadrant ?? {};
    return influence[quadrantId] ?? null;
  }

  private areOppositeAlignments(
    playerAlignment: PlayerAlignment,
    landmarkAlignment: "good" | "neutral" | "evil",
  ): boolean {
    if (playerAlignment === "good" && landmarkAlignment === "evil") return true;
    if (playerAlignment === "evil" && landmarkAlignment === "good") return true;
    return false;
  }

  private sumByCharacteristic(
    deltas: PlayerCharacteristicDelta[],
    characteristic: "strength" | "magic" | "luck",
  ): number {
    return deltas
      .filter((delta) => delta.characteristic === characteristic)
      .reduce((sum, delta) => sum + delta.amount, 0);
  }

  private normalize(value: unknown): number {
    return Math.max(0, Math.floor(Number(value ?? 0)));
  }
}
