import { Component, Inject } from "@angular/core";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface PlayerSelectDialogOption {
  id: string;
  name: string;
  color: string;
}

export interface PlayerSelectDialogData {
  spellName: string;
  players: PlayerSelectDialogOption[];
}

export interface PlayerSelectDialogResult {
  playerId: string;
}

@Component({
  selector: "app-player-select-dialog",
  standalone: true,
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./player-select-dialog.html",
  styleUrl: "./player-select-dialog.scss",
})
export class PlayerSelectDialog {
  public selectedId: string | null;

  constructor(
    private dialogRef: DialogRef<DialogResponse<PlayerSelectDialogResult>>,
    @Inject(DIALOG_DATA) public data: PlayerSelectDialogData,
  ) {
    this.selectedId = data.players[0]?.id ?? null;
  }

  public select(id: string): void {
    this.selectedId = id;
  }

  public get canConfirm(): boolean {
    return !!this.selectedId && this.data.players.some((p) => p.id === this.selectedId);
  }

  public confirm(): void {
    if (!this.canConfirm || !this.selectedId) return;
    this.dialogRef.close({ result: "confirm", data: { playerId: this.selectedId } });
  }

  public close(): void {
    this.dialogRef.close({ result: "cancel" });
  }
}
