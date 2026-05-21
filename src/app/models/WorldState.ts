import { BiomeType } from "./MapCell";

export interface WorldState {
    currentTurn: number;
    phase: 'lobby' | 'turn' | 'resolution';
    remainingDeck: BiomeType[];
    discardedDeck: BiomeType[];
}