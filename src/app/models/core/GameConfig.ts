import { GameplayConfig } from "@models/core/GameplayConfig";
import { MapConfig } from "@models/core/MapConfig";

export interface GameConfig {
    map: MapConfig;
    gameplay: GameplayConfig;
}