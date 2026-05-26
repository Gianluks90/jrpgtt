import { Component, computed, input, output } from "@angular/core";
import { ResourceLabel, ResourceStack } from "../../../models/Resource";
import { RESOURCE_CATALOG } from "../../../consts/resources-catalog";

@Component({
  selector: "app-resource-counter",
  templateUrl: "./resource-counter.html",
  styleUrl: "./resource-counter.scss",
  standalone: true,
})
export class ResourceCounter {
  public resources = input<ResourceStack[]>([]);
  public currentCount = input<number>(0);
  public maxCount = input<number>(12);
  public resourceCatalog = RESOURCE_CATALOG;
  public panelClicked = output<void>();

  public counterItems = computed<Array<{ label: ResourceLabel; quantity: number }>>(() => {
    const byLabel = new Map<ResourceLabel, number>();
    this.resources().forEach((resource) => {
      byLabel.set(resource.label, resource.quantity);
    });

    const labels = Object.keys(this.resourceCatalog) as ResourceLabel[];
    return labels.map((label) => {
      return {
        label,
        quantity: byLabel.get(label) ?? 0,
      };
    });
  });

  public onPanelClicked(): void {
    this.panelClicked.emit();
  }
}
