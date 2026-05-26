import { ResourceStack } from "./Resource";

export interface Inventory {
    items: string[];
    resources: ResourceStack[];
    money: number;
    resourceCapacity?: number;
}
