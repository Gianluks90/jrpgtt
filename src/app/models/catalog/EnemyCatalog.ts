import { EnemyCombatStat, EnemyLevelUpMode, EnemyLoot, EnemyTime, ExplorationElement } from "@models/exploration/ExplorationCard";

export interface EnemyCatalogEntry {
    id: string;
    name: string;
    nameKey?: string;
    combatStat: EnemyCombatStat;
    levelUpMode: EnemyLevelUpMode;
    time: EnemyTime;
    element?: ExplorationElement;
    baseStrength: number;
    baseMagic: number;
    baseLuck: number;
    loot?: EnemyLoot;
    effect?: string;
    categories?: string[];
}

export interface EnemiesCatalogConfig {
    enemies: EnemyCatalogEntry[];
}
