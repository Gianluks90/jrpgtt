import { ResourceStack } from "./Resource";

export interface InventoryItemEntry {
    itemId: string;
    currentCharges?: number;
}

export interface Inventory {
    items: InventoryItemEntry[];
    resources: ResourceStack[];
    money: number;
    resourceCapacity?: number;
    itemCapacity?: number;
}
