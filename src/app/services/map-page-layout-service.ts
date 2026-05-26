import { Injectable } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { DEFAULT_RESOURCE_INVENTORY_CAPACITY } from "../consts/inventory-config";
import { Player } from "../models/Player";

@Injectable({
  providedIn: "root",
})
export class MapPageLayoutService {
  public async loadMockPlayersForLayout(): Promise<Player[]> {
    try {
      const response = await fetch("/configs/mock/players-setup.mock.json");
      if (!response.ok) {
        return [];
      }

      const raw = (await response.json()) as unknown;
      if (!Array.isArray(raw)) {
        return [];
      }

      return raw
        .slice(0, 3)
        .map((entry, index) => this.toMockPlayer(entry, index))
        .filter((player): player is Player => player !== null);
    } catch {
      return [];
    }
  }

  private toMockPlayer(entry: unknown, index: number): Player | null {
    if (!entry || typeof entry !== "object") return null;

    const candidate = entry as {
      id?: unknown;
      name?: unknown;
      color?: unknown;
      level?: unknown;
      experience?: unknown;
      isReady?: unknown;
      location?: { x?: unknown; y?: unknown };
      parameters?: {
        hp?: { base?: unknown; current?: unknown; max?: unknown };
        strength?: { base?: unknown; current?: unknown; max?: unknown };
        magic?: { base?: unknown; current?: unknown; max?: unknown };
        luck?: { base?: unknown; current?: unknown; max?: unknown };
      };
    };

    const hpBase = this.toNumber(candidate.parameters?.hp?.base, 20);
    const hpCurrent = this.toNumber(candidate.parameters?.hp?.current, hpBase);
    const hpMax = this.toNumber(candidate.parameters?.hp?.max, hpBase);

    return {
      id: typeof candidate.id === "string" ? candidate.id : `mock-player-${index + 1}`,
      name: typeof candidate.name === "string" ? candidate.name : `Mock ${index + 1}`,
      color: typeof candidate.color === "string" ? candidate.color : "#ffffff",
      level: this.toNumber(candidate.level, 1),
      experience: this.toNumber(candidate.experience, 0),
      isReady: typeof candidate.isReady === "boolean" ? candidate.isReady : true,
      location: {
        x: this.toNumber(candidate.location?.x, 0),
        y: this.toNumber(candidate.location?.y, 0),
      },
      parameters: {
        hp: {
          base: hpBase,
          current: hpCurrent,
          max: hpMax,
        },
        strength: {
          base: this.toNumber(candidate.parameters?.strength?.base, 4),
          current: this.toNumber(candidate.parameters?.strength?.current, 4),
          max: this.toNumber(candidate.parameters?.strength?.max, 4),
        },
        magic: {
          base: this.toNumber(candidate.parameters?.magic?.base, 4),
          current: this.toNumber(candidate.parameters?.magic?.current, 4),
          max: this.toNumber(candidate.parameters?.magic?.max, 4),
        },
        luck: {
          base: this.toNumber(candidate.parameters?.luck?.base, 4),
          current: this.toNumber(candidate.parameters?.luck?.current, 4),
          max: this.toNumber(candidate.parameters?.luck?.max, 4),
        },
      },
      inventory: {
        money: 0,
        items: [],
        resources: [{ label: "food", quantity: 3 }],
        resourceCapacity: DEFAULT_RESOURCE_INVENTORY_CAPACITY,
      },
      actionsUsedThisTurn: {},
      statuses: [],
      pendingResourcePickup: null,
      joinedAt: Timestamp.now(),
    };
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return fallback;
  }
}
