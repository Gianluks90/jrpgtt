import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectorRef, Component, Inject } from "@angular/core";
import { ChaosEffectDialogRow } from "@models/catalog/ChaosEffectsConfig";
import { DialogResponse } from "@models/ui/DialogResponse";
import { TranslationPipe } from "../../../../pipes/translation-pipe";
import { TranslationService } from "@services/shared/translation-service";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface ChaosDialogData {
  spellName: string;
  targetPlayerName: string;
  effectsTable: ChaosEffectDialogRow[];
  onCast: () => Promise<void>;
}

@Component({
  selector: "app-chaos-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./chaos-dialog.html",
  styleUrl: "./chaos-dialog.scss",
})
export class ChaosDialog {
  public readonly title: string;
  public readonly spellName: string;
  public readonly targetPlayerName: string;
  public readonly effectsTable: ChaosEffectDialogRow[];

  public casting = false;
  public cast = false;
  public errorMessage = "";
  private castInFlight = false;

  constructor(
    private dialogRef: DialogRef<DialogResponse>,
    private cdr: ChangeDetectorRef,
    private translationService: TranslationService,
    @Inject(DIALOG_DATA) data: ChaosDialogData,
  ) {
    this.title = this.translationService.tOrFallback("dialogs.chaos.title", "Chaos");
    this.spellName = data.spellName;
    this.targetPlayerName = data.targetPlayerName;
    this.effectsTable = data.effectsTable;
    this.onCast = data.onCast;
  }

  private readonly onCast: () => Promise<void>;

  public get canCast(): boolean {
    return !this.cast && !this.casting;
  }

  public get canCancel(): boolean {
    return !this.cast && !this.casting;
  }

  public castSpell(): void {
    if (!this.canCast) return;
    if (this.castInFlight) return;

    this.castInFlight = true;
    setTimeout(() => {
      void this.executeCastFlow();
    }, 0);
  }

  private async executeCastFlow(): Promise<void> {
    this.errorMessage = "";
    this.casting = true;
    try {
      await this.onCast();
      this.cast = true;
      this.dialogRef.close({ result: "confirm" });
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : this.translationService.tOrFallback("dialogs.chaos.errors.cast", "Error while casting chaos spell.");
    } finally {
      this.casting = false;
      this.castInFlight = false;
      this.cdr.detectChanges();
    }
  }

  public close(): void {
    if (!this.canCancel) return;
    this.dialogRef.close({ result: "cancel" });
  }
}
