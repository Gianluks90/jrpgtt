import { BiomeType } from "./_index";

export interface WorldState {
    currentTurn: number;
    phase: 'lobby' | 'turn' | 'resolution';
    remainingDeck: BiomeType[];
    discardedDeck: BiomeType[];
}