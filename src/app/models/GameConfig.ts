import { GameplayConfig } from "./GameplayConfig";
import { MapConfig } from "./MapConfig";

export interface GameConfig {
    map: MapConfig;
    gameplay: GameplayConfig;
}