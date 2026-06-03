import { Injectable } from "@angular/core";
import { InventoryItemEntry } from "../models/Inventory";
import { PlayerAlignment } from "../models/Player";
import { ItemCatalogService } from "./item-catalog-service";

@Injectable({
  providedIn: "root",
})
export class ItemOwnershipService {
  constructor(
    private itemCatalogService: ItemCatalogService,
  ) {}

  public async loadConfig(): Promise<void> {
    await this.itemCatalogService.loadConfig();
  }

  public enforceAlignmentConstraints(input: {
    items: InventoryItemEntry[];
    alignment: PlayerAlignment | undefined;
  }): {
    keptItems: InventoryItemEntry[];
    droppedItems: InventoryItemEntry[];
  } {
    const effectiveAlignment: PlayerAlignment = input.alignment ?? "neutral";
    const keptItems: InventoryItemEntry[] = [];
    const droppedItems: InventoryItemEntry[] = [];

    input.items.forEach((itemEntry) => {
      const item = this.itemCatalogService.getCachedItemById(itemEntry.itemId);
      if (!item) {
        keptItems.push(itemEntry);
        return;
      }

      const allowedAlignments = item.constraints?.allowedAlignments;
      if (Array.isArray(allowedAlignments) && allowedAlignments.length > 0 && !allowedAlignments.includes(effectiveAlignment)) {
        droppedItems.push(itemEntry);
        return;
      }

      keptItems.push(itemEntry);
    });

    return {
      keptItems,
      droppedItems,
    };
  }
}
