import { PlacedEnemyCard } from "@models/exploration/ExplorationCard";

export type CombatPhase = 'setup' | 'resolution' | 'result';
export type CombatOutcome = 'player-win' | 'player-loss' | 'flee' | 'flee-lucky';

export interface CombatRollSnapshot {
    baseStat: number;
    luckRoll: number;
    luckBonus: number;
    elementModifier: number;
    timeModifier: number;
    effectModifier: number;
    total: number;
    critical: boolean;
}

export interface CombatResult {
    outcome: CombatOutcome;
    playerRoll: CombatRollSnapshot;
    enemyRoll: CombatRollSnapshot;
    damage: number;
    autoWin: boolean;
    xpGained?: number;    // base region XP + extraXp, set by orchestrator after win
    goldGained?: number;  // goldBase * level, set by orchestrator after win
}

export interface CombatState {
    combatId: string;
    attackingPlayerId: string;
    cellId: string;
    enemy: PlacedEnemyCard;
    phase: CombatPhase;
    result?: CombatResult;
    startedAtMs: number;
}
