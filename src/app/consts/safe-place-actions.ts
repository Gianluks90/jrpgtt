import { TimeOfDay } from "../models/WorldState";

export type SafePlaceLandmarkId = "capital" | "city" | "village" | "camp";

export type SafePlaceActionId =
  | "capital-doctor"
  | "capital-inn"
  | "city-healer"
  | "village-craftsman"
  | "camp-gatherer"
  | "camp-hunter";

export type SafePlaceDoctorActionId = "capital-doctor" | "city-healer";

export const SAFE_PLACE_ACTIONS_BY_LANDMARK: Record<SafePlaceLandmarkId, SafePlaceActionId[]> = {
  capital: ["capital-doctor", "capital-inn"],
  city: ["city-healer"],
  village: ["village-craftsman"],
  camp: ["camp-gatherer", "camp-hunter"],
};

export const SAFE_PLACE_ACTION_LANDMARK: Record<SafePlaceActionId, SafePlaceLandmarkId> = {
  "capital-doctor": "capital",
  "capital-inn": "capital",
  "city-healer": "city",
  "village-craftsman": "village",
  "camp-gatherer": "camp",
  "camp-hunter": "camp",
};

export function isSafePlaceActionId(actionId: string): actionId is SafePlaceActionId {
  return (
    actionId === "capital-doctor"
    || actionId === "capital-inn"
    || actionId === "city-healer"
    || actionId === "village-craftsman"
    || actionId === "camp-gatherer"
    || actionId === "camp-hunter"
  );
}

export function isDoctorActionId(actionId: string): actionId is SafePlaceDoctorActionId {
  return actionId === "capital-doctor" || actionId === "city-healer";
}

export function getDoctorCostPerUnit(actionId: SafePlaceDoctorActionId, timeOfDay: TimeOfDay): number {
  if (actionId === "capital-doctor") {
    return timeOfDay === "night" ? 4 : 3;
  }

  return timeOfDay === "night" ? 3 : 2;
}
