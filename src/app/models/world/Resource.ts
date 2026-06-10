export type ResourceLabel = "timber" | "food" | "minerals" | "cloth";

export interface ResourceDefinition {
    label: ResourceLabel;
    iconUrl?: string;
}

export interface ResourceStack {
    label: ResourceLabel;
    quantity: number;
    iconUrl?: string;
}
