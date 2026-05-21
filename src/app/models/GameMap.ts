import { MapCell } from "./MapCell";

export interface GameMap {
    size: number;
    specialTilesPlaced: number;
    cells: Record<string, MapCell>;
}