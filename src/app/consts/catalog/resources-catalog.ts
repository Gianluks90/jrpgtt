import { ResourceDefinition, ResourceLabel } from "@models/world/Resource";

export const RESOURCE_CATALOG: Record<ResourceLabel, ResourceDefinition> = {
    food: {
        label: "food",
        iconUrl: "./resource-icons/food-resource.svg",
    },
    timber: {
        label: "timber",
        iconUrl: "./resource-icons/timber-resource.svg",
    },
    minerals: {
        label: "minerals",
        iconUrl: "./resource-icons/minerals-resource.svg",
    },
    cloth: {
        label: "cloth",
        iconUrl: "./resource-icons/cloth-resource.svg",
    }
};
