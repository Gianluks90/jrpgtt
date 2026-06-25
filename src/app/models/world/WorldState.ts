import { BiomeType } from "@models/world/MapCell";
import { SanctuaryElement } from "@models/world/MapCell";
import { LandmarkTarget } from "@models/world/Landmark";
import { QuadrantId } from "@models/world/WorldZone";
import { CombatState } from "@models/exploration/CombatState";
import { ExplorationDeckSlot } from "@models/catalog/ExplorationCardCatalog";

export interface ExplorationSessionState {
    playerId: string;
    cellId: string;
    /** instanceIds of cards already resolved in this session (for multiplayer display + refresh recovery). */
    resolvedInstanceIds: string[];
}

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

export type RequiredActionNotificationType = "sanctuary-activated" | "world-event-activated" | "spell-effect-on-player" | "spell-pending-counter";

export interface LastStatGainState {
    parameter: "strength" | "magic";
    gainedByPlayerId: string;
    gainedByPlayerName: string;
    gainedAtTurn: number;
}

export interface PendingSpellEffectState {
    spellId: string;
    casterId: string;
    casterName: string;
    targetPlayerId: string;
    selectedSpellId?: string;
    selectedKey?: string;
    target?: { x: number; y: number };
    castAtTurn: number;
}

export interface RequiredActionNotificationState {
    type: RequiredActionNotificationType;
    notificationId: string;
    sanctuaryElement?: SanctuaryElement;
    worldEventTitle?: string;
    worldEventPrimaryOutcome?: WorldEventPrimaryOutcome;
    worldEventTargetBiome?: BiomeType;
    worldEventDriverBiome?: BiomeType;
    worldEventTotalMutations?: number;
    spellName?: string;
    spellEffectSummary?: string;
    canTargetCounter?: boolean;
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
    diagonalMovementByPlayer?: Record<string, number>;
    nextDiscardSeq?: number;
    sanctuaryInfluenceByQuadrant?: Partial<Record<QuadrantId, SanctuaryElement>>;
    landmarkTargets?: LandmarkTarget[];
    requiredActionNotification?: RequiredActionNotificationState;
    explorationDeck?: ExplorationDeckSlot[];
    explorationDiscardedDeck?: ExplorationDeckSlot[];
    spellDeck?: string[];
    spellDiscardedDeck?: string[];
    lastStatGain?: LastStatGainState;
    pendingSpellEffect?: PendingSpellEffectState;
    activeCombat?: CombatState;
    activeExplorationSession?: ExplorationSessionState;
}