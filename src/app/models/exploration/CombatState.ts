import { EnemyCombatStat, PlacedEnemyCard } from "@models/exploration/ExplorationCard";
import { SanctuaryElement } from "@models/world/MapCell";
import { TimeOfDay } from "@models/world/WorldState";

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
    xpGained?: number;
    goldGained?: number;
}

export interface PlayerCombatSnapshot {
    name: string;
    level: number;
    strength: number;
    magic: number;
    combatStat: EnemyCombatStat;
    statValue: number;
    luck: number;
    element?: SanctuaryElement;
    hp: number;
    maxHp: number;
    mp?: number;
    maxMp?: number;
}

export interface CombatState {
    combatId: string;
    attackingPlayerId: string;
    cellId: string;
    enemy: PlacedEnemyCard;
    phase: CombatPhase;
    playerSnapshot?: PlayerCombatSnapshot;
    result?: CombatResult;
    startedAtMs: number;
    timeOfDay?: TimeOfDay;
    quadrantElement?: SanctuaryElement;
    mercenaryHired?: boolean;
}
