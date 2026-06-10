import { Injectable } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { take } from "rxjs";
import { RULEBOOK_DIALOG_CONFIG } from "../../consts/ui/dialog-configs";
import { RulebookDialog } from "../../components/dialogs/rulebook-dialog/rulebook-dialog";

@Injectable({
  providedIn: "root",
})
export class RulebookDialogService {
  constructor(private dialog: Dialog) {}

  public open(): void {
    this.dialog.open(RulebookDialog, {
      ...RULEBOOK_DIALOG_CONFIG,
    }).closed.pipe(take(1)).subscribe();
  }
}
