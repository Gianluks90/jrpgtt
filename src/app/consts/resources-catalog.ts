import { ResourceDefinition, ResourceLabel } from "../models/Resource";

export const RESOURCE_CATALOG: Record<ResourceLabel, ResourceDefinition> = {
    timber: {
        label: "timber",
        iconUrl: "./resource-icons/timber-resource.svg",
    },
    food: {
        label: "food",
        iconUrl: "./resource-icons/food-resource.svg",
    },
    minerals: {
        label: "minerals",
        iconUrl: "./resource-icons/minerals-resource.svg",
    },
};
