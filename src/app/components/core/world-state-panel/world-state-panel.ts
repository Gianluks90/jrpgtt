import { Component, computed, input, output } from "@angular/core";
import { Player } from "@models/player/Player";
import { MapCell } from "@models/world/MapCell";
import { WorldState } from "@models/world/WorldState";
import { TranslationService } from "@services/shared/translation-service";
import { UiTooltip } from "../../ui/tooltip/tooltip";

interface WorldSummaryEntry {
  id: "turn" | "round" | "discovered" | "activeShrines" | "worldEvent" | "activePlayer";
  label: string;
  value: string;
  isActivePlayer: boolean;
  helpDescription: string | null;
  clickable: boolean;
}

@Component({
  selector: "app-world-state-panel",
  imports: [UiTooltip],
  templateUrl: "./world-state-panel.html",
  styleUrl: "./world-state-panel.scss",
})
export class WorldStatePanel {
  constructor(private translationService: TranslationService) {}

  public worldState = input<WorldState | null>(null);
  public players = input<Player[]>([]);
  public mapCellsById = input<Record<string, MapCell>>({});
  public mapSize = input(10);
  public totalSpecialCells = input(4);

  public showTitle = input(false);
  public title = input("World");
  public mobileSidebarTitle = input(false);
  public worldEventHelpRequested = output<void>();

  public activePlayerLabel = computed<string>(() => {
    const activePlayerId = this.worldState()?.activePlayerId;
    if (!activePlayerId) return "-";

    const active = this.players().find((player) => player.id === activePlayerId) ?? null;
    if (active?.name?.trim()) return active.name.trim();
    return activePlayerId.slice(0, 6);
  });

  public currentRound = computed<number>(() => {
    const turn = this.worldState()?.currentTurn ?? 0;
    const playersCount = this.players().length;

    if (turn <= 0 || playersCount <= 0) return 0;
    return Math.ceil(turn / playersCount);
  });

  public discoveredTilesLabel = computed<string>(() => {
    const discovered = Object.keys(this.mapCellsById()).length;
    const size = this.mapSize();
    const total = size > 0 ? size * size : 0;
    if (total <= 0) return `${discovered}/0`;

    const clampedDiscovered = Math.min(discovered, total);
    return `${clampedDiscovered}/${total}`;
  });

  public activeSpecialCellsLabel = computed<string>(() => {
    const specialCells = Object.values(this.mapCellsById()).filter((cell) => cell.isSpecial === true && cell.active === true).length;
    const totalSpecial = Math.max(0, this.totalSpecialCells());
    const clampedSpecial = Math.min(specialCells, totalSpecial);
    return `${clampedSpecial}/${totalSpecial}`;
  });

  public helpTooltipTitle = computed<string>(() => {
    return this.translationService.tOrFallback("map.worldPanel.helpTitle", "Help");
  });

  public worldSummaryEntries = computed<WorldSummaryEntry[]>(() => {
    const turn = this.worldState()?.currentTurn ?? 0;
    const round = this.currentRound();
    const discovered = this.discoveredTilesLabel();
    const activeShrines = this.activeSpecialCellsLabel();
    const turnRoundHelp = this.translationService.tOrFallback(
      "map.worldPanel.help.turnRound",
      "A turn is the action performed by a single player. When all players have taken one turn, the round advances.",
    );
    const discoveredHelp = this.translationService.tOrFallback(
      "map.worldPanel.help.discovered",
      "The map has 100 explorable tiles. Entering an undiscovered tile reveals its biome and any other point of interest on that tile.",
    );
    const activeShrinesHelp = this.translationService.tOrFallback(
      "map.worldPanel.help.activeShrines",
      "There are four shrines linked to four elements: fire, water, wind and earth. Discovering and activating shrines lets you attune to their element and may grant bonuses. Each active shrine in Region I reduces the impact of the World Event when it is triggered.",
    );
    const worldEventHelp = this.translationService.tOrFallback(
      "map.worldPanel.help.worldEvent",
      "Crossing from Region I to Region II alerts the forces of evil, triggering a counter-move that may reshape the map. The World Event targets the most revealed biome; the next biome in rank determines the possible effects. For full details, see the rulebook.",
    );
    const worldEvent = this.worldState()?.worldEvent;
    const worldEventLabel = this.buildWorldEventLabel(worldEvent);
    const activePlayer = this.activePlayerLabel();

    return [
      {
        id: "turn",
        label: this.translationService.tOrFallback("map.worldPanel.turn", "Turn"),
        value: String(turn),
        isActivePlayer: false,
        helpDescription: turnRoundHelp,
        clickable: false,
      },
      {
        id: "round",
        label: this.translationService.tOrFallback("map.worldPanel.round", "Round"),
        value: String(round),
        isActivePlayer: false,
        helpDescription: turnRoundHelp,
        clickable: false,
      },
      {
        id: "discovered",
        label: this.translationService.tOrFallback("map.worldPanel.discovered", "Discovered"),
        value: discovered,
        isActivePlayer: false,
        helpDescription: discoveredHelp,
        clickable: false,
      },
      {
        id: "activeShrines",
        label: this.translationService.tOrFallback("map.worldPanel.activeShrines", "Active shrines"),
        value: activeShrines,
        isActivePlayer: false,
        helpDescription: activeShrinesHelp,
        clickable: false,
      },
      {
        id: "worldEvent",
        label: this.translationService.tOrFallback("map.worldPanel.worldEvent", "World event"),
        value: worldEventLabel,
        isActivePlayer: false,
        helpDescription: worldEventHelp,
        clickable: true,
      },
      {
        id: "activePlayer",
        label: this.translationService.tOrFallback("map.worldPanel.activePlayer", "Active player"),
        value: activePlayer,
        isActivePlayer: true,
        helpDescription: null,
        clickable: false,
      },
    ];
  });

  public onWorldEventEntryClick(): void {
    this.worldEventHelpRequested.emit();
  }

  private buildWorldEventLabel(worldEvent: WorldState["worldEvent"] | undefined): string {
    if (!worldEvent || worldEvent.emitted !== true) {
      return "-";
    }

    if (worldEvent.driverBiome && worldEvent.targetBiome) {
      const driver = this.translationService.tOrFallback(`map.biomes.${worldEvent.driverBiome}`, worldEvent.driverBiome);
      const target = this.translationService.tOrFallback(`map.biomes.${worldEvent.targetBiome}`, worldEvent.targetBiome);
      return `${driver} > ${target}`;
    }

    const title = worldEvent.title?.trim() || "-";
    return this.translationService.tOrFallback(title, title);
  }
}
