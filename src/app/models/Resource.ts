export type ResourceLabel = "timber" | "food" | "minerals";

export interface ResourceDefinition {
    label: ResourceLabel;
    iconUrl?: string;
}

export interface ResourceStack {
    label: ResourceLabel;
    quantity: number;
    iconUrl?: string;
}
