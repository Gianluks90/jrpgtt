import { MapCell } from "./_index";

export interface GameMap {
    size: number;
    specialTilesPlaced: number;
    cells: Record<string, MapCell>;
}