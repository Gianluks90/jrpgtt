import { Component, computed, input, output } from "@angular/core";
import { ResourceLabel, ResourceStack } from "@models/world/Resource";
import { RESOURCE_CATALOG } from "../../../consts/catalog/resources-catalog";
import { TranslationService } from "@services/shared/translation-service";

@Component({
  selector: "app-resource-counter",
  templateUrl: "./resource-counter.html",
  styleUrl: "./resource-counter.scss",
  standalone: true,
})
export class ResourceCounter {
  constructor(private translationService: TranslationService) {}

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

  public panelAriaLabel = computed<string>(() => {
    return this.translationService.tOrFallback("map.resources.openAria", "Open resource inventory");
  });

  public panelTitle = computed<string>(() => {
    return this.translationService.tOrFallback(
      "map.resources.title",
      "Resources ({current}/{max})",
      { current: this.currentCount(), max: this.maxCount() },
    );
  });

  public onPanelClicked(): void {
    this.panelClicked.emit();
  }
}
