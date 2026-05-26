import { Component, computed, input, output } from "@angular/core";
import { Player } from "../../../models/Player";
import { PlayerCard } from "../player-card/player-card";

@Component({
  selector: "app-map-players-panel",
  standalone: true,
  imports: [PlayerCard],
  templateUrl: "./map-players-panel.html",
  styleUrl: "./map-players-panel.scss",
})
export class MapPlayersPanel {
  public myPlayer = input<Player | null>(null);
  public mockPlayers = input<Player[]>([]);
  public activePlayerId = input<string | null>(null);
  public pendingLevelUpChoices = input(0);
  public canOpenLevelUpDialog = input(false);

  public openLevelUpRequested = output<void>();

  public hasLevelUpChoices = computed<boolean>(() => {
    return this.pendingLevelUpChoices() > 0;
  });

  public sidebarPlayers = computed<Player[]>(() => {
    const me = this.myPlayer();
    const mocks = this.mockPlayers();
    if (!me) return mocks;
    return [me, ...mocks];
  });

  public mainPlayer = computed<Player | null>(() => {
    const me = this.myPlayer();
    if (me) return me;
    return this.sidebarPlayers()[0] ?? null;
  });

  public otherPlayers = computed<Player[]>(() => {
    const main = this.mainPlayer();
    const all = this.sidebarPlayers();
    if (!main) return all;
    return all.filter((player) => player.id !== main.id);
  });

  public trackPlayer(_index: number, player: Player): string {
    return player.id;
  }

  public onOpenLevelUp(): void {
    if (!this.canOpenLevelUpDialog()) return;
    this.openLevelUpRequested.emit();
  }
}
