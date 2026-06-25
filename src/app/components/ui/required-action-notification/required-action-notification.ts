import { Component, computed, input, output } from "@angular/core";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { TextButton } from "../text-button/text-button";

export interface RequiredActionNotificationPlayer {
  id: string;
  name: string;
  acknowledged: boolean;
}

@Component({
  selector: "app-required-action-notification",
  standalone: true,
  imports: [TranslationPipe, TextButton],
  templateUrl: "./required-action-notification.html",
  styleUrl: "./required-action-notification.scss",
})
export class RequiredActionNotification {
  public static readonly checkIconUrl = "./icons/check_circle_20dp_E3E3E3_FILL0_wght400_GRAD0_opsz20.svg";

  public show = input<boolean>(true);
  public title = input.required<string>();
  public description = input.required<string>();
  public players = input.required<RequiredActionNotificationPlayer[]>();
  public localPlayerId = input.required<string>();
  public ownerPlayerId = input<string | null>(null);
  public allowOwnerOverride = input<boolean>(true);
  public counterActionLabel = input<string | null>(null);

  public acknowledgeRequested = output<string>();
  public forceContinueRequested = output<void>();
  public counterRequested = output<void>();

  public allAcknowledged = computed(() => this.players().length > 0 && this.players().every((player) => player.acknowledged));
  public okIconUrl = RequiredActionNotification.checkIconUrl;

  public canAcknowledge(player: RequiredActionNotificationPlayer): boolean {
    return player.id === this.localPlayerId() && !player.acknowledged;
  }

  public showOwnerContinueButton(): boolean {
    return this.allowOwnerOverride()
      && !!this.ownerPlayerId()
      && this.localPlayerId() === this.ownerPlayerId()
      && !this.allAcknowledged();
  }

  public acknowledge(playerId: string): void {
    this.acknowledgeRequested.emit(playerId);
  }

  public forceContinue(): void {
    this.forceContinueRequested.emit();
  }

  public counter(): void {
    this.counterRequested.emit();
  }

  public canCounter(): boolean {
    return !!this.counterActionLabel()
      && this.players().some((p) => p.id === this.localPlayerId() && !p.acknowledged);
  }
}
