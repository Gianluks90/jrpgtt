import { MapCell } from "@models/world/MapCell";

export interface GameMap {
    size: number;
    specialTilesPlaced: number;
    cells: Record<string, MapCell>;
}