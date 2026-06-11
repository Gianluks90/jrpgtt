import { Injectable } from "@angular/core";
import { Dialog } from "@angular/cdk/dialog";
import { take } from "rxjs";
import { DIALOGS_CONFIG } from "../../consts/ui/dialog-configs";
import { MapSettingsDialog } from "../../components/dialogs/map-settings-dialog/map-settings-dialog";

@Injectable({
  providedIn: "root",
})
export class MapSettingsDialogService {
  constructor(private dialog: Dialog) {}

  public open(): void {
    this.dialog.open(MapSettingsDialog, {
      ...DIALOGS_CONFIG,
      maxWidth: "480px",
    }).closed.pipe(take(1)).subscribe();
  }
}