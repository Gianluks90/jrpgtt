import { BiomeType } from "./MapCell";
import { SanctuaryElement } from "./MapCell";
import { LandmarkTarget } from "./Landmark";
import { QuadrantId } from "./WorldZone";

export type BiomePlacementCount = Record<BiomeType, number>;
export type TimeOfDay = "day" | "night";

export interface PendingTeleportState {
    x: number;
    y: number;
}

export type PendingFastTravelStage = "booked" | "midpoint";

export interface PendingFastTravelState {
    origin: PendingTeleportState;
    destination: PendingTeleportState;
    stage: PendingFastTravelStage;
}

export interface WorldEventState {
    title: string;
    emitted: boolean;
    emittedAtTurn?: number;
    targetBiome?: BiomeType;
    driverBiome?: BiomeType;
    primaryOutcome?: WorldEventPrimaryOutcome;
    activeShrinesInRegionI?: number;
    cellsAffected?: number;
    cellsMutated?: number;
    seed?: number;
    flow?: WorldEventFlowState;
}

export type WorldEventPrimaryOutcome = "negative" | "positive" | "none";

export interface WorldEventFlowState {
    startedAtMs: number;
    announceDurationMs: number;
    propagationDurationMs: number;
    summaryDurationMs: number;
    mutationCellIds: string[];
    pendingMutationsByCellId?: Record<string, {
        biome: BiomeType;
        worldEventOriginalBiome?: BiomeType;
        worldEventBiomeOverride?: BiomeType;
        worldEventConditionIds?: string[];
        worldEventEnemyLevelBonus?: number;
    }>;
    appliedMutationsByCellId?: Record<string, {
        biome: BiomeType;
        worldEventOriginalBiome?: BiomeType;
        worldEventBiomeOverride?: BiomeType;
        worldEventConditionIds?: string[];
        worldEventEnemyLevelBonus?: number;
    }>;
}

export interface FollowerMovementBonusState {
    turn: number;
    amount: number;
}

export type RequiredActionNotificationType = "sanctuary-activated" | "world-event-activated";

export interface RequiredActionNotificationState {
    type: RequiredActionNotificationType;
    notificationId: string;
    sanctuaryElement?: SanctuaryElement;
    worldEventTitle?: string;
    worldEventPrimaryOutcome?: WorldEventPrimaryOutcome;
    worldEventTargetBiome?: BiomeType;
    worldEventDriverBiome?: BiomeType;
    worldEventTotalMutations?: number;
    activatedByPlayerId: string;
    activatedByPlayerName: string;
    ownerPlayerId?: string;
    requiredPlayerIds: string[];
    acknowledgedPlayerIds: string[];
    createdAtMs: number;
    lastActionAtMs?: number;
    allAcknowledgedAtMs?: number;
    forcedByOwnerId?: string;
    forcedAtMs?: number;
}

export interface WorldState {
    currentTurn: number;
    phase: 'lobby' | 'turn' | 'resolution';
    timeOfDay?: TimeOfDay;
    worldEvent?: WorldEventState;
    remainingDeck: BiomeType[];
    discardedDeck: BiomeType[];
    placedBiomeCount: BiomePlacementCount;
    turnOrder?: string[];
    activePlayerId?: string;
    movedThisTurnByPlayer?: Record<string, number>;
    pendingAutoMoveOnTurnStartByPlayer?: Record<string, boolean>;
    pendingFastTravelByPlayer?: Record<string, PendingFastTravelState>;
    skippedTurnsByPlayer?: Record<string, number>;
    pendingTeleportsByPlayer?: Record<string, PendingTeleportState>;
    followerMovementBonusByPlayer?: Record<string, FollowerMovementBonusState>;
    nextDiscardSeq?: number;
    sanctuaryInfluenceByQuadrant?: Partial<Record<QuadrantId, SanctuaryElement>>;
    landmarkTargets?: LandmarkTarget[];
    requiredActionNotification?: RequiredActionNotificationState;
}