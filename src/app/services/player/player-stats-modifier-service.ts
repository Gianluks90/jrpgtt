import { Injectable } from "@angular/core";
import { MapCell, SanctuaryElement } from "@models/world/MapCell";
import { PlayerFollowerEntry } from "@models/player/Follower";
import { Player, PlayerAlignment } from "@models/player/Player";
import { PlayerCharacteristicDelta, PlayerComputedStats } from "@models/player/PlayerComputedStats";
import { WorldState } from "@models/world/WorldState";
import { QuadrantId } from "@models/world/WorldZone";
import { WorldZonesService } from "@services/map/world-zones-service";
import { StatusCatalogService } from "@services/catalog/status-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { BiomeConditionCatalogService } from "@services/catalog/biome-condition-catalog-service";

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
  constructor(
    private worldZonesService: WorldZonesService,
    private statusCatalogService: StatusCatalogService,
    private followerCatalogService: FollowerCatalogService,
    private biomeConditionCatalogService: BiomeConditionCatalogService,
  ) {}

  public computeStats(context: PlayerStatsContext): PlayerComputedStats {
    const player = context.player;
    const statusContext = this.resolveStatusContext(player);
    const baseStrength = statusContext.primaryStatsOverride ?? this.normalize(player.parameters.strength.current);
    const baseMagic = statusContext.primaryStatsOverride ?? this.normalize(player.parameters.magic.current);
    const baseLuck = statusContext.primaryStatsOverride ?? this.normalize(player.parameters.luck.current);

    const appliedDeltas = this.collectDeltas(context);
    const delta = {
      strength: this.sumByCharacteristic(appliedDeltas, "strength"),
      magic: this.sumByCharacteristic(appliedDeltas, "magic"),
      luck: this.sumByCharacteristic(appliedDeltas, "luck"),
    };

    return {
      effective: {
        strength: statusContext.primaryStatsOverride ?? Math.max(0, baseStrength + delta.strength),
        magic: statusContext.primaryStatsOverride ?? Math.max(0, baseMagic + delta.magic),
        luck: statusContext.primaryStatsOverride ?? Math.max(0, baseLuck + delta.luck),
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
    this.applyBiomeConditionDeltas(context, deltas);
    this.applyStatusDeltas(context, deltas);
    this.applyFollowerDeltas(context, deltas);
    this.applyLandmarkAlignmentDelta(context, deltas);
    this.applySanctuaryQuadrantAttunementDelta(context, deltas);
    return deltas;
  }

  private applyBiomeConditionDeltas(context: PlayerStatsContext, deltas: PlayerCharacteristicDelta[]): void {
    const conditionIds = Array.isArray(context.currentCell?.worldEventConditionIds)
      ? context.currentCell.worldEventConditionIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (conditionIds.length === 0) {
      return;
    }

    conditionIds.forEach((conditionId) => {
      const effect = this.biomeConditionCatalogService.getCachedCondition(conditionId)?.effect;
      if (!effect || effect.type !== "luck-check-multiplier") {
        return;
      }

      const luckDelta = typeof effect.luckDelta === "number" && Number.isFinite(effect.luckDelta)
        ? Math.floor(effect.luckDelta)
        : 0;
      if (luckDelta === 0) {
        return;
      }

      deltas.push({
        characteristic: "luck",
        amount: luckDelta,
        source: "biome-condition",
        reason: `Biome condition (${conditionId})`,
      });
    });
  }

  private applyFollowerDeltas(context: PlayerStatsContext, deltas: PlayerCharacteristicDelta[]): void {
    const followers = this.normalizeFollowers(context.player.followers);
    if (followers.length === 0) {
      return;
    }

    followers.forEach((allyEntry) => {
      const allyDefinition = this.followerCatalogService.getCachedFollowerById(allyEntry.followerId);
      if (!allyDefinition) {
        return;
      }

      const localizedFollowerName = this.followerCatalogService.getLocalizedName(allyDefinition);

      (allyDefinition.parameterModifiers ?? []).forEach((modifier) => {
        if (!this.isScopeActive(modifier.scopes, context.worldState?.timeOfDay)) {
          return;
        }

        deltas.push({
          characteristic: modifier.parameter,
          amount: this.normalizeDelta(modifier.amount),
          source: "status",
          reason: `${localizedFollowerName} modifier`,
        });
      });

      (allyDefinition.statusKeysWhileActive ?? []).forEach((statusKey) => {
        const statModifiers = this.statusCatalogService.getCachedStatus(statusKey)?.effects?.statModifiers;
        if (!statModifiers) {
          return;
        }

        if (this.normalizeDelta(statModifiers.strength) !== 0) {
          deltas.push({
            characteristic: "strength",
            amount: this.normalizeDelta(statModifiers.strength),
            source: "status",
            reason: `${localizedFollowerName} status (${statusKey})`,
          });
        }

        if (this.normalizeDelta(statModifiers.magic) !== 0) {
          deltas.push({
            characteristic: "magic",
            amount: this.normalizeDelta(statModifiers.magic),
            source: "status",
            reason: `${localizedFollowerName} status (${statusKey})`,
          });
        }

        if (this.normalizeDelta(statModifiers.luck) !== 0) {
          deltas.push({
            characteristic: "luck",
            amount: this.normalizeDelta(statModifiers.luck),
            source: "status",
            reason: `${localizedFollowerName} status (${statusKey})`,
          });
        }
      });
    });
  }

  private applyStatusDeltas(context: PlayerStatsContext, deltas: PlayerCharacteristicDelta[]): void {
    const statusContext = this.resolveStatusContext(context.player);
    if (typeof statusContext.primaryStatsOverride === "number") {
      return;
    }

    const modifiers = statusContext.statModifiers;
    if (modifiers.strength !== 0) {
      deltas.push({
        characteristic: "strength",
        amount: modifiers.strength,
        source: "status",
        reason: "Status modifier",
      });
    }

    if (modifiers.magic !== 0) {
      deltas.push({
        characteristic: "magic",
        amount: modifiers.magic,
        source: "status",
        reason: "Status modifier",
      });
    }

    if (modifiers.luck !== 0) {
      deltas.push({
        characteristic: "luck",
        amount: modifiers.luck,
        source: "status",
        reason: "Status modifier",
      });
    }
  }

  private resolveStatusContext(player: Player): {
    primaryStatsOverride: number | null;
    statModifiers: { strength: number; magic: number; luck: number };
  } {
    const statuses = this.normalizeStatuses(player.statuses);
    const hasMinified = statuses.some((status) => status.key === "minified");
    if (hasMinified) {
      return {
        primaryStatsOverride: 1,
        statModifiers: { strength: 0, magic: 0, luck: 0 },
      };
    }

    const modifiers = { strength: 0, magic: 0, luck: 0 };
    for (const status of statuses) {
      const definition = this.statusCatalogService.getCachedStatus(status.key);
      const statModifiers = definition?.effects?.statModifiers;
      if (!statModifiers) continue;

      modifiers.strength += this.normalizeDelta(statModifiers.strength);
      modifiers.magic += this.normalizeDelta(statModifiers.magic);
      modifiers.luck += this.normalizeDelta(statModifiers.luck);
    }

    return {
      primaryStatsOverride: null,
      statModifiers: modifiers,
    };
  }

  private normalizeStatuses(statuses: Player["statuses"]): Array<{ key: string; durationTurns: number }> {
    if (!Array.isArray(statuses)) {
      return [];
    }

    return statuses
      .filter((status) => {
        if (!status || typeof status !== "object") return false;
        if (typeof status.key !== "string" || !status.key.trim()) return false;
        if (typeof status.durationTurns !== "number" || !Number.isFinite(status.durationTurns)) return false;
        return status.durationTurns > 0;
      })
      .map((status) => ({
        key: String(status.key),
        durationTurns: Math.max(1, Math.floor(Number(status.durationTurns))),
      }));
  }

  private normalizeFollowers(followers: Player["followers"]): PlayerFollowerEntry[] {
    if (!Array.isArray(followers)) {
      return [];
    }

    return followers
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (typeof entry.followerId !== "string" || !entry.followerId.trim()) return false;
        if (entry.state === "discarded") return false;
        if (typeof entry.hpCurrent !== "number" || !Number.isFinite(entry.hpCurrent)) return false;
        return Math.floor(entry.hpCurrent) > 0;
      })
      .map((entry) => ({
        followerId: entry.followerId,
        hpCurrent: Math.max(0, Math.floor(Number(entry.hpCurrent))),
        state: entry.state,
      }));
  }

  private isScopeActive(scopes: Array<"always" | "fight-only" | "magic-fight-only" | "day-only" | "night-only">, timeOfDay: WorldState["timeOfDay"]): boolean {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return false;
    }

    if (scopes.includes("always")) {
      return true;
    }

    if (timeOfDay === "day" && scopes.includes("day-only")) {
      return true;
    }

    if (timeOfDay === "night" && scopes.includes("night-only")) {
      return true;
    }

    return false;
  }

  private normalizeDelta(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }

    return Math.floor(value);
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
