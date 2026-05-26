import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject, signal } from "@angular/core";
import { DialogResponse } from "../../../../models/DialogResponse";
import { ResourceLabel, ResourceStack } from "../../../../models/Resource";
import { RESOURCE_CATALOG } from "../../../../consts/resources-catalog";
import { DialogWrapper } from "../../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../../ui/text-button/text-button";

export interface ResourceInventoryDialogData {
  resources: ResourceStack[];
  maxCapacity: number;
  pendingResource?: ResourceLabel | null;
}

export type ResourceInventoryDialogResult =
  | { type: "close" }
  | { type: "discard"; resourceLabel: ResourceLabel }
  | { type: "swap-and-collect"; resourceLabel: ResourceLabel }
  | { type: "cancel-collect" };

@Component({
  selector: "app-resource-inventory-dialog",
  imports: [DialogWrapper, TextButton],
  templateUrl: "./resource-inventory-dialog.html",
  styleUrl: "./resource-inventory-dialog.scss",
})
export class ResourceInventoryDialog {
  public readonly resourceCatalog = RESOURCE_CATALOG;
  public readonly maxCapacity: number;
  public readonly pendingResource: ResourceLabel | null;
  public readonly resources: ResourceStack[];
  public readonly totalResources: number;
  public readonly selectedDiscardLabel = signal<ResourceLabel | null>(null);

  constructor(
    private dialogRef: DialogRef<DialogResponse<ResourceInventoryDialogResult>>,
    @Inject(DIALOG_DATA) data: ResourceInventoryDialogData,
  ) {
    const resources = Array.isArray(data.resources)
      ? data.resources
        .map((resource) => ({
          ...resource,
          quantity: Math.max(0, Math.floor(Number(resource?.quantity ?? 0))),
        }))
        .filter((resource) => resource.quantity > 0)
      : [];

    this.resources = resources;
    this.maxCapacity = Math.max(1, Math.floor(Number(data.maxCapacity ?? 1)));
    this.pendingResource = data.pendingResource ?? null;
    this.totalResources = resources.reduce((sum, resource) => sum + resource.quantity, 0);

    if (resources.length > 0) {
      this.selectedDiscardLabel.set(resources[0].label);
    }
  }

  public get title(): string {
    return this.pendingResource ? "Inventory full" : "Manage resources";
  }

  public get subtitle(): string {
    if (this.pendingResource) {
      return `No free slot for ${this.pendingLabel}. Discard one resource or cancel pickup.`;
    }

    return "Select one resource stack and discard 1 unit.";
  }

  public get pendingLabel(): string {
    return this.toLabel(this.pendingResource);
  }

  public onSelectResource(label: ResourceLabel): void {
    this.selectedDiscardLabel.set(label);
  }

  public discardSelected(): void {
    const selected = this.selectedDiscardLabel();
    if (!selected) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        type: "discard",
        resourceLabel: selected,
      },
    });
  }

  public swapAndCollect(): void {
    const selected = this.selectedDiscardLabel();
    if (!selected) return;

    this.dialogRef.close({
      result: "confirm",
      data: {
        type: "swap-and-collect",
        resourceLabel: selected,
      },
    });
  }

  public cancelCollect(): void {
    this.dialogRef.close({
      result: "confirm",
      data: {
        type: "cancel-collect",
      },
    });
  }

  public close(): void {
    if (this.pendingResource) {
      this.cancelCollect();
      return;
    }

    this.dialogRef.close({
      result: "cancel",
      data: {
        type: "close",
      },
    });
  }

  public toLabel(resource: ResourceLabel | null | undefined): string {
    if (resource === "food") return "Food";
    if (resource === "timber") return "Timber";
    if (resource === "minerals") return "Minerals";
    if (resource === "cloth") return "Cloth";
    return "Unknown";
  }
}
