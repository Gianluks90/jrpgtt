import { Component, computed, input } from "@angular/core";
import { Player } from "../../../models/Player";
import { BiomeType, MapCell } from "../../../models/MapCell";
import { WorldState } from "../../../models/WorldState";

@Component({
  selector: "app-world-state-panel",
  imports: [],
  templateUrl: "./world-state-panel.html",
  styleUrl: "./world-state-panel.scss",
})
export class WorldStatePanel {
  public worldState = input<WorldState | null>(null);
  public players = input<Player[]>([]);
  public currentUserId = input("");
  public mapCellsById = input<Record<string, MapCell>>({});
  public environmentByCellId = input<Record<string, string[]>>({});
  public showTitle = input(false);
  public title = input("World");
  public mobileSidebarTitle = input(false);

  public biomeOrder: Array<keyof WorldState["placedBiomeCount"]> = [
    "plains",
    "forest",
    "mountain",
    "water",
    "desert",
    "ruins",
  ];

  public myPlayer = computed<Player | null>(() => {
    const uid = this.currentUserId();
    if (!uid) return null;
    return this.players().find((player) => player.id === uid) ?? null;
  });

  public isMyTurn = computed<boolean>(() => {
    const uid = this.currentUserId();
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!uid || !activePlayerId) return false;
    return uid === activePlayerId;
  });

  public activePlayerName = computed<string>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return "-";

    const player = this.players().find((candidate) => candidate.id === activePlayerId);
    return player?.name?.trim() || activePlayerId.slice(0, 6);
  });

  public myLocationBiome = computed<BiomeType | null>(() => {
    const player = this.myPlayer();
    if (!player) return null;

    const cellId = this.cellId(player.location.x, player.location.y);
    return this.mapCellsById()[cellId]?.biome ?? null;
  });

  public myLocationLabel = computed<string>(() => {
    const biome = this.myLocationBiome();
    if (!biome) return "Unknown";

    return this.biomeToLabel(biome);
  });

  public myLocationIsEnvironment = computed<boolean>(() => {
    const player = this.myPlayer();
    if (!player) return false;

    const cellId = this.cellId(player.location.x, player.location.y);
    return (this.environmentByCellId()[cellId]?.length ?? 0) >= 2;
  });

  private cellId(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private biomeToLabel(biome: BiomeType): string {
    if (biome === "plains") return "Plains";
    if (biome === "forest") return "Forest";
    if (biome === "mountain") return "Mountain";
    if (biome === "water") return "Water";
    if (biome === "desert") return "Desert";
    return "Ruins";
  }
}
